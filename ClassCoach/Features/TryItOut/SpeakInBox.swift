import AVFoundation
import SwiftUI

/// Dictation for Practice's text boxes — mirrors `web/src/components/SpeakInBox.tsx`.
/// Tap Speak, talk, tap again: the clip goes to the same transcription Talk It
/// Through uses and the words are added to the end of whichever box asked.
/// One recorder serves every box on the screen, so starting in one box stops
/// (and still writes down) the other.
@MainActor
final class BoxDictation: ObservableObject {
    enum Phase: Equatable { case idle, listening, writing }

    @Published private(set) var phase: Phase = .idle
    /// The box being spoken into, or written down for.
    @Published private(set) var target: String?
    @Published var error: String?

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var deliver: ((String) -> Void)?

    func isListening(_ box: String) -> Bool { phase == .listening && target == box }
    func isWriting(_ box: String) -> Bool { phase == .writing && target == box }

    /// Speak into `box`; tapping the box that is listening stops it.
    func toggle(_ box: String, append: @escaping (String) -> Void) {
        if phase == .listening && target == box {
            stop()
            return
        }
        if phase == .listening { stop() }
        Task { await start(box, append: append) }
    }

    private func start(_ box: String, append: @escaping (String) -> Void) async {
        error = nil
        guard await AVAudioApplication.requestRecordPermission() else {
            error = "Microphone access is off. Turn it on in Settings to speak instead of typing."
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("speak-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 16_000,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            guard recorder.record() else { throw CocoaError(.fileWriteUnknown) }
            self.recorder = recorder
            fileURL = url
            deliver = append
            target = box
            phase = .listening
        } catch {
            self.error = "Couldn\u{2019}t start the microphone. Try again, or type instead."
        }
    }

    /// Stops listening and writes the clip down into the box it came from.
    func stop() {
        guard phase == .listening, let recorder, let fileURL, let deliver else { return }
        recorder.stop()
        self.recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        phase = .writing
        let box = target
        Task {
            defer { try? FileManager.default.removeItem(at: fileURL) }
            do {
                let text = try await TalkToMeService.transcribe(audioFileURL: fileURL)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { deliver(text) }
            } catch {
                self.error = "Couldn\u{2019}t write that down. Try again, or type instead."
            }
            // A new box may have started listening while this one was written down.
            if phase == .writing && target == box {
                phase = .idle
                target = nil
            }
        }
    }

    /// Leaving the screen: drop what was being said, nothing is written down.
    func cancel() {
        recorder?.stop()
        recorder = nil
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
        if phase == .listening {
            phase = .idle
            target = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

/// The Speak pill that sits in a text box's bottom-right corner.
struct SpeakInBoxButton: View {
    let listening: Bool
    let writing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if listening {
                    Circle().fill(AppTheme.terracotta).frame(width: 7, height: 7)
                    Text("Listening \u{2014} tap to stop")
                } else if writing {
                    ProgressView().controlSize(.mini)
                    Text("Writing it down\u{2026}")
                } else {
                    Image(systemName: "mic.fill").font(.caption)
                    Text("Speak")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(listening ? AppTheme.terracotta600 : AppTheme.forest)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(listening ? AppTheme.peachTint : AppTheme.mintTint, in: Capsule())
            .overlay(Capsule().strokeBorder(listening ? AppTheme.terracotta : AppTheme.forest.opacity(0.3)))
        }
        .buttonStyle(.plain)
        .disabled(writing)
        .accessibilityLabel(listening ? "Stop speaking" : "Speak instead of typing")
    }
}

extension View {
    /// Puts a Speak button in this multi-line box's bottom-right corner, with
    /// room for it, the terracotta border while listening, and any dictation
    /// error underneath. Apply it after the box's inner padding and before its
    /// background, so the button lands inside the box. Pass its corner radius.
    func speakable(_ box: String, text: Binding<String>, dictation: BoxDictation, cornerRadius: CGFloat = 14) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            self
                .padding(.bottom, 34)
                .overlay(RoundedRectangle(cornerRadius: cornerRadius).strokeBorder(
                    dictation.isListening(box) ? AppTheme.terracotta : .clear, lineWidth: 2
                ))
                .overlay(alignment: .bottomTrailing) {
                    SpeakInBoxButton(listening: dictation.isListening(box), writing: dictation.isWriting(box)) {
                        dictation.toggle(box) { spoken in text.wrappedValue = text.wrappedValue.appendingSpoken(spoken) }
                    }
                    .padding(10)
                }
            if let error = dictation.error, dictation.target == box || dictation.target == nil {
                Text(error).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
        }
    }
}

extension String {
    /// Adds dictated words after what is already typed.
    func appendingSpoken(_ text: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? text : "\(trimmed) \(text)"
    }
}
