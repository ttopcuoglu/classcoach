import Foundation

/// The contract between the watch and the phone for one recorded lesson.
///
/// Compiled into both targets so the two halves cannot drift: WatchConnectivity
/// metadata is an untyped property-list dictionary, and a key spelled
/// differently on one side would arrive as a lesson with no duration and no
/// envelope rather than as an error anyone sees.
///
/// The watch only records. It does not create a session or talk to the server
/// — it has no sign-in of its own — so the phone creates the session when the
/// file arrives and sends it through the same upload as a phone recording.
struct WatchRecordingTransfer {
    /// Made on the watch, not the server. The watch may send the same file
    /// twice — it re-sends anything it never heard finish — and this is what
    /// lets the phone recognise the second copy instead of creating a second
    /// lesson from it.
    let recordingId: String
    let startedAt: Date
    /// Time actually spent recording, excluding pauses — the same figure the
    /// phone recorder reports, so the server sees one meaning for it.
    let durationSec: Double
    /// One loudness value a second on the same 0...1 scale as `AudioRecorder`,
    /// so a watch lesson and a phone lesson sit on the same axis.
    let levelTrace: [Double]

    private enum Key {
        static let recordingId = "recordingId"
        static let startedAt = "startedAt"
        static let durationSec = "durationSec"
        static let levelTrace = "levelTrace"
    }

    var metadata: [String: Any] {
        [
            Key.recordingId: recordingId,
            Key.startedAt: startedAt.timeIntervalSince1970,
            Key.durationSec: durationSec,
            Key.levelTrace: levelTrace,
        ]
    }

    init(recordingId: String, startedAt: Date, durationSec: Double, levelTrace: [Double]) {
        self.recordingId = recordingId
        self.startedAt = startedAt
        self.durationSec = durationSec
        self.levelTrace = levelTrace
    }

    init?(metadata: [String: Any]?) {
        guard let metadata,
              let recordingId = metadata[Key.recordingId] as? String,
              let startedAt = metadata[Key.startedAt] as? Double,
              let durationSec = metadata[Key.durationSec] as? Double
        else { return nil }
        self.recordingId = recordingId
        self.startedAt = Date(timeIntervalSince1970: startedAt)
        self.durationSec = durationSec
        self.levelTrace = metadata[Key.levelTrace] as? [Double] ?? []
    }
}

extension WatchRecordingTransfer: Codable {}
