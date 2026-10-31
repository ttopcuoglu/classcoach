import Foundation
import WatchConnectivity

/// Hands finished lessons to the phone and deletes them only once the phone
/// has them.
///
/// `transferFile` is the right tool because the system owns the transfer: it
/// queues the file, survives this app being suspended or killed, waits out a
/// phone that is out of range, and finishes in the background. Nothing here
/// has to stay awake for a lesson to arrive.
///
/// Queued is not delivered. The file stays on the watch until
/// `didFinish fileTransfer` reports success, and anything still on disk that
/// the system is not already sending is offered again on the next launch.
@MainActor
final class WatchSender: NSObject, ObservableObject {
    static let shared = WatchSender()

    /// Lessons on the watch the phone has not confirmed yet.
    @Published private(set) var pendingCount = 0
    /// False when the Wivoza iPhone app is not on the paired phone, which is
    /// the one case where waiting will never deliver anything.
    @Published private(set) var companionInstalled = true

    /// The recording in progress is on disk too, and must not be sent while
    /// it is still being written.
    var activeRecordingId: String?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        refreshPending()
    }

    /// Called at Stop, once the finished recording is no longer active.
    func sendFinished() {
        refreshPending()
        resendPending()
    }

    /// Offers every stored lesson the system is not already carrying. Safe to
    /// call repeatedly: the phone ignores a recording id it has already
    /// turned into a session.
    func resendPending() {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        companionInstalled = session.isCompanionAppInstalled

        let inFlight = Set(session.outstandingFileTransfers.compactMap {
            WatchRecordingTransfer(metadata: $0.file.metadata)?.recordingId
        })
        for transfer in WatchRecordingStore.stored()
        where transfer.recordingId != activeRecordingId && !inFlight.contains(transfer.recordingId) {
            session.transferFile(WatchRecordingStore.audioURL(for: transfer.recordingId), metadata: transfer.metadata)
        }
    }

    private func refreshPending() {
        pendingCount = WatchRecordingStore.stored().filter { $0.recordingId != activeRecordingId }.count
    }
}

extension WatchSender: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.resendPending() }
    }

    nonisolated func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        let recordingId = WatchRecordingTransfer(metadata: fileTransfer.file.metadata)?.recordingId
        Task { @MainActor in
            // A failed transfer keeps its file; the next launch offers it again.
            if error == nil, let recordingId {
                WatchRecordingStore.discard(recordingId: recordingId)
            }
            self.refreshPending()
        }
    }
}
