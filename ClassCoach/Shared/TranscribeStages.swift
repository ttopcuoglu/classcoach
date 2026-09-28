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

    /// Same 0.15x factor as the progress curve, so the sentence and the ring
    /// can never disagree.
    static func hint(recordingSec: Double) -> String {
        let estimate = max(20, recordingSec * 0.15)
        if estimate < 60 { return "Usually under a minute for a short clip." }
        let minutes = Int(ceil(estimate / 60))
        let classMinutes = Int((recordingSec / 60).rounded())
        return "A \(classMinutes)-minute recording usually takes around \(minutes) \(minutes == 1 ? "minute" : "minutes")."
    }
}
