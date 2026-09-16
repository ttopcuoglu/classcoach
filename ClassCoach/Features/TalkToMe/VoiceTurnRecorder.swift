import Foundation
import AVFoundation

/// Native equivalent of `web/src/hooks/useVoiceTurn.ts` — records one
/// "turn" of speech and auto-stops on silence. Conceptually identical
/// turn-taking: a silence timer arms the moment listening starts and resets
/// every time the level crosses the speech threshold, ending the turn on the
/// first uninterrupted silence stretch — whether the teacher never spoke at
/// all or spoke and then paused.
///
/// The microphone stays open for the whole conversation, like web's single
/// `getUserMedia` stream whose track is only enabled per turn — audio is only
/// written to a file while a turn is being captured. This used to start and
/// stop an `AVAudioRecorder` every turn, which broke once the screen locked:
/// background audio only keeps the app running while audio is actually
/// playing or recording, so during transcription and Coach's thinking iOS
/// suspended the app, and a backgrounded app isn't allowed to re-open the
/// mic for the next turn ("Could not access your microphone").
@MainActor
final class VoiceTurnRecorder: NSObject, ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var level: Double = 0 // 0-100, for the UI's level ring
    @Published var fatalError: String?
    @Published private(set) var transcribing = false

    private let engine = AVAudioEngine()
    private let capture = TurnCapture()
    private var engineRunning = false
    private var silenceTimer: Timer?
    private var onTurnComplete: ((String) -> Void)?
    private var observers: [NSObjectProtocol] = []

    /// dBFS above which the mic is considered to be picking up speech, not
    /// ambient noise — same scale as `AVAudioRecorder.averagePower`, which
    /// this threshold was originally tuned against.
    private let speechThresholdDB: Float = -35
    private let silenceInterval: TimeInterval = 1.4

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func configure(onTurnComplete: @escaping (String) -> Void) {
        self.onTurnComplete = onTurnComplete
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        // A phone call, Siri, or an alarm stops the engine; a route change
        // (AirPods connecting) or a media-services reset invalidates it.
        // Either way, restart the input if a conversation is still going.
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init)
            Task { @MainActor in self?.handleInterruption(type) }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.restartEngineAfterReset() }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.restartEngineAfterReset() }
        })
    }

    func start() async {
        guard !listening else { return }
        fatalError = nil

        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard granted else {
            fatalError = "Microphone access was denied. Check your device settings and try again."
            return
        }

        // Checked against the engine itself, not engineRunning: an
        // interruption whose "ended" notice never arrives leaves the engine
        // stopped, and every turn would otherwise end in silence.
        if !engine.isRunning {
            do {
                try startEngine()
            } catch {
                fatalError = "Could not access your microphone. Check your device and try again."
                return
            }
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        do {
            try capture.begin(url: url, format: engine.inputNode.outputFormat(forBus: 0))
        } catch {
            fatalError = "Could not start recording. Please try again."
            return
        }

        listening = true
        scheduleSilenceEnd()
    }

    /// Ends the current turn early; the mic itself stays open.
    func stop() {
        finishTurn()
    }

    /// Fully releases the mic — call when leaving Talk It Through or pausing,
    /// not between turns (mirrors `useVoiceTurn`'s `close()`).
    func close() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        _ = capture.end()
        listening = false
        level = 0
        stopEngine()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Engine

    private func startEngine() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)

        let input = engine.inputNode
        input.removeTap(onBus: 0)
        capture.installTap(on: input) { [weak self] db in
            Task { @MainActor in self?.handleLevel(db) }
        }
        engine.prepare()
        try engine.start()
        engineRunning = true
    }

    private func stopEngine() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        engineRunning = false
    }

    private func handleInterruption(_ type: AVAudioSession.InterruptionType?) {
        guard engineRunning else { return }
        switch type {
        case .began:
            // The system has already stopped the engine; a turn cut off
            // mid-capture ends with whatever was said so far.
            if listening { finishTurn() }
        case .ended:
            restartEngineAfterReset()
        default:
            break
        }
    }

    private func restartEngineAfterReset() {
        guard engineRunning else { return }
        stopEngine()
        do {
            try startEngine()
        } catch {
            if listening { _ = capture.end() }
            listening = false
            fatalError = "Could not access your microphone. Check your device and try again."
        }
    }

    // MARK: - Turn

    private func handleLevel(_ db: Float) {
        guard listening else { return }
        level = Double(max(0, min(100, (db + 60) * (100.0 / 60.0))))
        if db > speechThresholdDB {
            scheduleSilenceEnd()
        }
    }

    private func scheduleSilenceEnd() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.finishTurn() }
        }
    }

    private func finishTurn() {
        guard listening else { return }
        silenceTimer?.invalidate()
        silenceTimer = nil
        listening = false
        level = 0
        guard let url = capture.end() else { return }

        transcribing = true
        Task { @MainActor in
            defer { try? FileManager.default.removeItem(at: url) }
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

/// The part of turn capture that runs on the audio tap's thread, kept off
/// the main actor: level metering for every buffer, and writing buffers to
/// the current turn's file only while a turn is open.
private final class TurnCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var url: URL?

    func installTap(on input: AVAudioInputNode, onLevel: @escaping @Sendable (Float) -> Void) {
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            onLevel(Self.rmsDecibels(buffer))
            self.lock.lock()
            defer { self.lock.unlock() }
            try? self.file?.write(from: buffer)
        }
    }

    func begin(url: URL, format: AVAudioFormat) throws {
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        let newFile = try AVAudioFile(
            forWriting: url,
            settings: settings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        )
        lock.lock()
        file = newFile
        self.url = url
        lock.unlock()
    }

    /// Closes the turn's file (releasing it finalizes the AAC container) and
    /// returns its URL, or nil when no turn was open.
    func end() -> URL? {
        lock.lock()
        defer { lock.unlock() }
        let finished = file != nil ? url : nil
        file = nil
        url = nil
        return finished
    }

    private static func rmsDecibels(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return -160 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) {
            sum += channel[i] * channel[i]
        }
        let rms = (sum / Float(buffer.frameLength)).squareRoot()
        return rms > 0 ? 20 * log10(rms) : -160
    }
}
