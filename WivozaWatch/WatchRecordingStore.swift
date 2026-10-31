import Foundation

/// Where a lesson lives on the watch between the first second of recording
/// and the phone confirming it has the file.
///
/// The same rules as the phone's `RecordingStore`, for the same reasons: one
/// recording is one 16 kHz mono WAV file (it needs no index, so a recording
/// the app never got to stop still plays up to where it stopped), it lives in
/// Application Support rather than a purgeable temp folder, and a small file
/// beside it says what it is. A watch that dies, or an app the system kills
/// mid-lesson, therefore leaves something that can still be sent.
enum WatchRecordingStore {
    /// Matches the phone. A recorder still running hours after the class it
    /// was started for is recording people who never agreed to it.
    static let maxRecordingSeconds: TimeInterval = 90 * 60

    private static let audioName = "recording.wav"
    private static let infoName = "transfer.json"

    private static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("WatchRecordings", isDirectory: true)
    }

    static func directory(for recordingId: String) -> URL {
        root.appendingPathComponent(recordingId, isDirectory: true)
    }

    static func audioURL(for recordingId: String) -> URL {
        directory(for: recordingId).appendingPathComponent(audioName)
    }

    static func begin(_ transfer: WatchRecordingTransfer) throws {
        try FileManager.default.createDirectory(at: directory(for: transfer.recordingId), withIntermediateDirectories: true)
        try save(transfer)
    }

    /// Written every few seconds while recording, not only at Stop, so a
    /// recording that never reaches Stop still knows roughly how long it is.
    static func save(_ transfer: WatchRecordingTransfer) throws {
        let url = directory(for: transfer.recordingId).appendingPathComponent(infoName)
        try JSONEncoder().encode(transfer).write(to: url, options: .atomic)
    }

    static func load(recordingId: String) -> WatchRecordingTransfer? {
        let url = directory(for: recordingId).appendingPathComponent(infoName)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WatchRecordingTransfer.self, from: data)
    }

    /// Every recording still on the watch, oldest first so they reach the
    /// phone in the order they were taught.
    static func stored() -> [WatchRecordingTransfer] {
        guard let dirs = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else {
            return []
        }
        return dirs
            .compactMap { load(recordingId: $0.lastPathComponent) }
            .filter { FileManager.default.fileExists(atPath: audioURL(for: $0.recordingId).path) }
            .sorted { $0.startedAt < $1.startedAt }
    }

    static func discard(recordingId: String) {
        try? FileManager.default.removeItem(at: directory(for: recordingId))
    }
}
