import Foundation
import WatchConnectivity

/// Turns a lesson recorded on the Apple Watch into an ordinary Lesson Debrief
/// session.
///
/// The watch only records; it has no sign-in. So the phone does what
/// `RecordingPanelView.handleRecord` and `handleStop` do for a phone
/// recording — create the session, put the audio where `RecordingStore`
/// keeps it, and call `startTranscription` — just later, once the file
/// arrives. From then on nothing knows or cares which device heard the class.
///
/// Arrival and processing are split on purpose. iOS deletes a received file
/// the moment `didReceive file` returns, and it may deliver it with the app in
/// the background, the phone locked and the session token unreadable. So
/// arrival only moves the file into an inbox — instant, no network — and the
/// inbox is worked through whenever the app can: on arrival, on launch, and
/// on coming to the foreground. A lesson waits in the inbox rather than being
/// lost to a phone that was asleep.
@MainActor
final class WatchRecordingReceiver: NSObject {
    static let shared = WatchRecordingReceiver()

    /// Posted once a watch lesson has become a session and its upload has
    /// been handed to the system, so Lesson Debrief can show the new row.
    static let didStartUpload = Notification.Name("WatchRecordingReceiverDidStartUpload")

    private var processing = false

    /// Recording ids already turned into sessions. The watch re-sends any
    /// file it never heard finish, and without this a dropped confirmation
    /// would become a second copy of the same lesson.
    private static let processedKey = "watchRecordings.processedIds"
    private static let processedLimit = 200

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Sends everything waiting in the inbox. Stops at the first failure and
    /// leaves the rest for next time; nothing here deletes a lesson that has
    /// not yet been handed on.
    func processInbox() async {
        guard !processing else { return }
        processing = true
        defer { processing = false }

        for item in Self.inboxItems() {
            guard AuthManager.shared.token != nil else { return }
            if Self.processedIds().contains(item.transfer.recordingId) {
                try? FileManager.default.removeItem(at: item.directory)
                continue
            }
            do {
                try await deliver(item)
            } catch {
                return
            }
        }
    }

    private func deliver(_ item: InboxItem) async throws {
        let transfer = item.transfer
        let session = try await AudioCoachingService.createSession(teacherName: nil)

        // From here the lesson belongs to RecordingStore, exactly like a
        // phone recording: if the upload below fails, Lesson Debrief finds it
        // there and offers it back, and it is deleted only once the server
        // reports a transcript.
        try FileManager.default.createDirectory(at: RecordingStore.directory(for: session.id), withIntermediateDirectories: true)
        let audioURL = RecordingStore.audioURL(for: session.id)
        try FileManager.default.moveItem(at: item.audioURL, to: audioURL)
        try RecordingStore.save(RecordingStore.Manifest(
            sessionId: session.id,
            startedAt: transfer.startedAt,
            accumulatedSec: transfer.durationSec
        ))
        Self.markProcessed(transfer.recordingId)
        try? FileManager.default.removeItem(at: item.directory)

        try await AudioCoachingService.startTranscription(
            sessionId: session.id,
            audioFileURL: audioURL,
            durationSec: transfer.durationSec,
            levelTrace: transfer.levelTrace.isEmpty ? nil : transfer.levelTrace
        )
        NotificationCenter.default.post(name: Self.didStartUpload, object: nil)
    }

    // MARK: - Inbox

    private struct InboxItem {
        let directory: URL
        let audioURL: URL
        let transfer: WatchRecordingTransfer
    }

    private nonisolated static var inboxRoot: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("WatchInbox", isDirectory: true)
    }

    private nonisolated static let audioName = "recording.wav"
    private nonisolated static let infoName = "transfer.json"

    /// Runs on WatchConnectivity's queue, before iOS deletes the file.
    nonisolated static func accept(fileURL: URL, transfer: WatchRecordingTransfer) throws {
        let dir = inboxRoot.appendingPathComponent(transfer.recordingId, isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: fileURL, to: dir.appendingPathComponent(audioName))
        try JSONEncoder().encode(transfer).write(to: dir.appendingPathComponent(infoName), options: .atomic)
    }

    private static func inboxItems() -> [InboxItem] {
        guard let dirs = try? FileManager.default.contentsOfDirectory(at: inboxRoot, includingPropertiesForKeys: nil) else {
            return []
        }
        return dirs.compactMap { dir in
            let audioURL = dir.appendingPathComponent(audioName)
            guard FileManager.default.fileExists(atPath: audioURL.path),
                  let data = try? Data(contentsOf: dir.appendingPathComponent(infoName)),
                  let transfer = try? JSONDecoder().decode(WatchRecordingTransfer.self, from: data)
            else { return nil }
            return InboxItem(directory: dir, audioURL: audioURL, transfer: transfer)
        }
        .sorted { $0.transfer.startedAt < $1.transfer.startedAt }
    }

    private static func processedIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: processedKey) ?? []
    }

    private static func markProcessed(_ recordingId: String) {
        let ids = (processedIds() + [recordingId]).suffix(processedLimit)
        UserDefaults.standard.set(Array(ids), forKey: processedKey)
    }
}

extension WatchRecordingReceiver: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Re-activate after switching watches, or the new watch's lessons are
    /// never delivered.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard let transfer = WatchRecordingTransfer(metadata: file.metadata) else { return }
        do {
            try Self.accept(fileURL: file.fileURL, transfer: transfer)
        } catch {
            return
        }
        Task { @MainActor in await self.processInbox() }
    }
}
