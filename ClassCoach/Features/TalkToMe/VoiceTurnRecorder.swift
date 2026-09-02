import Foundation
import AVFoundation

/// Native equivalent of `web/src/hooks/useVoiceTurn.ts` — records one
/// "turn" of speech and auto-stops on silence, using `AVAudioRecorder`
/// metering instead of web's `AnalyserNode` RMS reading. Conceptually
/// identical turn-taking: a silence timer arms the moment listening
/// starts and resets every time the level crosses the speech threshold,
/// ending the turn on the first uninterrupted silence stretch — whether
/// the teacher never spoke at all or spoke and then paused.
@MainActor
final class VoiceTurnRecorder: NSObject, ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var level: Double = 0 // 0-100, for the UI's level ring
    @Published var fatalError: String?
    @Published private(set) var transcribing = false

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var silenceTimer: Timer?
    private var meterTimer: Timer?
    private var onTurnComplete: ((String) -> Void)?

    /// dB above which the mic is considered to be picking up speech, not
    /// ambient noise — `AVAudioRecorder.averagePower` ranges roughly
    /// -160 (silence) to 0 (max), unlike web's 0-100 RMS scale, so this
    /// threshold was tuned independently rather than copied numerically.
    private let speechThresholdDB: Float = -35
    private let silenceInterval: TimeInterval = 1.4

    func configure(onTurnComplete: @escaping (String) -> Void) {
        self.onTurnComplete = onTurnComplete
    }

    func start() async {
        guard recorder == nil else { return }
        fatalError = nil

        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard granted else {
            fatalError = "Microphone access was denied. Check your device settings and try again."
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            fatalError = "Could not access your microphone. Check your device and try again."
            return
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            let rec = try AVAudioRecorder(url: url, settings: settings)
            rec.delegate = self
            rec.isMeteringEnabled = true
            rec.record()
            recorder = rec
            fileURL = url
        } catch {
            fatalError = "Could not start recording. Please try again."
            return
        }

        listening = true
        scheduleSilenceEnd()
        startMetering()
    }

    func stop() {
        recorder?.stop()
    }

    /// Fully releases the mic — call when leaving Talk It Through entirely,
    /// not between turns (mirrors `useVoiceTurn`'s `close()`).
    func close() {
        stopTurnLoop()
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        listening = false
    }

    private func startMetering() {
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard let recorder else { return }
        recorder.updateMeters()
        let db = recorder.averagePower(forChannel: 0)
        level = Double(max(0, min(100, (db + 60) * (100.0 / 60.0))))
        if db > speechThresholdDB {
            scheduleSilenceEnd()
        }
    }

    private func scheduleSilenceEnd() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.recorder?.stop() }
        }
    }

    private func stopTurnLoop() {
        meterTimer?.invalidate()
        meterTimer = nil
        silenceTimer?.invalidate()
        silenceTimer = nil
        level = 0
    }
}

extension VoiceTurnRecorder: AVAudioRecorderDelegate {
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            self.stopTurnLoop()
            self.listening = false
            self.recorder = nil
            guard let url = self.fileURL else { return }
            self.transcribing = true
            do {
                let transcript = try await TalkToMeService.transcribe(audioFileURL: url)
                self.transcribing = false
                self.onTurnComplete?(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
            } catch {
                // A transcription hiccup for one turn shouldn't end the
                // conversation — treat it the same as "nothing was said."
                self.transcribing = false
                self.onTurnComplete?("")
            }
        }
    }
}
