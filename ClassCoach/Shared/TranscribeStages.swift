import Foundation

/// The iOS twin of `web/src/lib/transcribeStages.ts` — see that file for why
/// these exist and why they are keyed to the estimate rather than to any real
/// signal. Keep the two in step: a teacher who records on the phone and reads
/// the report on the web should not be told two different stories about the
/// same wait.
enum TranscribeStages {
    static let all: [(from: Double, text: String)] = [
        (0, "Sending your audio"),
        (15, "Transcribing what was said"),
        (45, "Separating the voices in the room"),
        (65, "Counting questions, wait time and talk share"),
        (85, "Reading the lesson for what it covered"),
    ]

    /// How long the wait after Stop actually is.
    ///
    /// The old 0.15x came from a constant nobody had measured. Timed against a
    /// real call, Deepgram runs at about 0.005x — a fifty-minute class
    /// transcribes in seconds, not eight minutes. What remains is merging the
    /// chunks and getting roughly 12 MB onto the network, so the estimate
    /// scales with the upload, not with how long the lesson was.
    static let secondsPerRecordedMinute: Double = 1.5

    static func estimatedSeconds(recordingSec: Double) -> Double {
        max(8, recordingSec / 60 * secondsPerRecordedMinute)
    }

    static func hint(recordingSec: Double) -> String {
        let estimate = estimatedSeconds(recordingSec: recordingSec)
        if estimate < 90 { return "This usually takes a few seconds." }
        return "About a minute for a full class period."
    }
}
