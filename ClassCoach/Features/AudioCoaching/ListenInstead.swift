import AVFoundation
import SwiftUI

/// "Listen instead" — the report read aloud by the phone.
///
/// The use case is the drive home: a teacher who will not sit and read a page
/// of narrative at 3:40pm will listen to it on the way. It uses
/// `AVSpeechSynthesizer` rather than a cloud voice deliberately. A better
/// voice costs roughly twelve cents a lesson and produces a stored audio file
/// containing an account of a class; system speech costs nothing, stores
/// nothing, and answers the only question that matters first — whether anyone
/// presses play and finishes it. If they do, the voice is the easy part to
/// upgrade.
///
/// It reads the narratives already written for the report. Nothing here is
/// generated, so pressing play costs a teacher no waiting and Wivoza no money.
@MainActor
final class LessonSpeaker: NSObject, ObservableObject {
    @Published private(set) var isSpeaking = false

    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// The best installed English voice. iOS ships a compact one and offers
    /// better "enhanced" and "premium" downloads in Settings; if a teacher has
    /// one, use it, because the difference over four minutes is the difference
    /// between listening and giving up.
    private var preferredVoice: AVSpeechSynthesisVoice? {
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        return english.first { $0.quality == .premium }
            ?? english.first { $0.quality == .enhanced }
            ?? AVSpeechSynthesisVoice(language: "en-US")
    }

    func toggle(paragraphs: [String]) {
        if synthesizer.isSpeaking {
            stop()
            return
        }
        guard !paragraphs.isEmpty else { return }

        // .spokenAudio ducks music rather than stopping it, and .playback
        // keeps speaking with the screen locked — which is the whole point,
        // since the phone will be in a pocket or a cradle. Shared with Coach's
        // own voice so neither one can leave the session unplayable for the
        // other, or take it from a lesson being recorded.
        PlaybackSession.activate()

        for paragraph in paragraphs {
            let utterance = AVSpeechUtterance(string: paragraph)
            utterance.voice = preferredVoice
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            // A beat between paragraphs, so a listener can tell one section
            // ended and another began without a heading to look at.
            utterance.postUtteranceDelay = 0.6
            synthesizer.speak(utterance)
        }
        isSpeaking = true
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
        PlaybackSession.release()
    }
}

extension LessonSpeaker: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            if !synthesizer.isSpeaking { self.isSpeaking = false }
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.isSpeaking = false }
    }
}

/// What gets read, in the order a teacher would want it: what the lesson was,
/// then each section's reading. The per-section numbers are deliberately left
/// out — a percentage is unlistenable, and the narratives already carry the
/// ones that matter in sentences.
enum LessonScript {
    /// Roughly how fast system speech reads at the default rate.
    private static let wordsPerMinute = 150.0

    static func paragraphs(for session: AudioSessionWithSegments) -> [String] {
        [
            session.classSummary,
            session.talkNarrative,
            session.questionsNarrative,
            session.checksNarrative,
            session.climateNarrative,
        ]
        .compactMap { $0 }
        .flatMap { $0.components(separatedBy: "\n\n") }
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    }

    /// Shown on the button. The question a teacher asks before pressing play is
    /// "do I have time for this?", so it is answered before they ask.
    static func estimatedMinutes(_ paragraphs: [String]) -> Int {
        let words = paragraphs.reduce(0) { $0 + $1.split(separator: " ").count }
        return max(1, Int((Double(words) / wordsPerMinute).rounded()))
    }
}

struct ListenInsteadButton: View {
    let session: AudioSessionWithSegments
    @StateObject private var speaker = LessonSpeaker()

    private var paragraphs: [String] { LessonScript.paragraphs(for: session) }

    var body: some View {
        if !paragraphs.isEmpty {
            Button {
                speaker.toggle(paragraphs: paragraphs)
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: speaker.isSpeaking ? "stop.fill" : "play.fill")
                        .font(.subheadline.weight(.semibold))
                    Text(speaker.isSpeaking
                         ? "Stop"
                         : "Listen instead · \(LessonScript.estimatedMinutes(paragraphs)) min")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                }
                .foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 18).padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(speaker.isSpeaking ? "Stop reading the report" : "Listen to the report instead of reading it")
            .onDisappear { speaker.stop() }
        }
    }
}
