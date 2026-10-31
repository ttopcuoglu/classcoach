import Foundation
import AVFoundation

/// Records a lesson from the watch's microphone.
///
/// A deliberately smaller sibling of the phone's `AudioRecorder`: same file
/// format, same pause-excluding clock, same 1 Hz loudness envelope on the same
/// scale, same 90-minute ceiling. What it does not do is upload — the watch
/// only records, and `WatchSender` hands the file to the phone, which does
/// everything else exactly as it would for a lesson recorded on itself.
///
/// No transcription happens here. There is no long-form speech recognition on
/// watchOS, it would cost the battery a class period needs, and the coaching
/// report reads the audio's pacing and loudness as well as its words.
@MainActor
final class WatchRecorder: NSObject, ObservableObject {
    enum Phase { case idle, recording, paused }

    static let shared = WatchRecorder()

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var elapsedSec: Double = 0
    @Published private(set) var inputLevel: Double = 0
    @Published var permissionDenied = false

    /// Identical to `AudioRecorder.settings`; see `RecordingStore` for why
    /// this is PCM and not AAC.
    private static let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
    ]

    /// Two hours at 1 Hz, matching the server's cap.
    private static let maxTraceSeconds = 7200
    /// How often the elapsed time is written beside the audio, so a recording
    /// that never reaches Stop still arrives with a sensible duration.
    private static let persistEverySec: Double = 10

    private var recorder: AVAudioRecorder?
    private var transfer: WatchRecordingTransfer?
    private var accumulatedSec: Double = 0
    private var runStart: Date?
    private var timer: Timer?
    private var lastSampleAt: Date?
    private var lastPersistAt: Double = 0
    private var levelTrace: [Double] = []
    private var traceBucketSum: Double = 0
    private var traceBucketCount = 0
    private var traceBucketSec: Double = 0
    /// True only when the SYSTEM paused the recording, so an interruption
    /// ending never undoes the teacher's own Pause.
    private var pausedByInterruption = false

    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            MainActor.assumeIsolated { self?.handleInterruption(note) }
        }
    }

    func start() async -> Bool {
        guard phase == .idle else { return false }
        guard await AVAudioApplication.requestRecordPermission() else {
            permissionDenied = true
            return false
        }
        permissionDenied = false

        let transfer = WatchRecordingTransfer(
            recordingId: UUID().uuidString,
            startedAt: Date(),
            durationSec: 0,
            levelTrace: []
        )
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            try WatchRecordingStore.begin(transfer)
            let recorder = try AVAudioRecorder(
                url: WatchRecordingStore.audioURL(for: transfer.recordingId),
                settings: Self.settings
            )
            recorder.isMeteringEnabled = true
            guard recorder.record() else {
                WatchRecordingStore.discard(recordingId: transfer.recordingId)
                return false
            }
            self.recorder = recorder
        } catch {
            WatchRecordingStore.discard(recordingId: transfer.recordingId)
            return false
        }

        self.transfer = transfer
        WatchSender.shared.activeRecordingId = transfer.recordingId
        resetTally()
        runStart = Date()
        phase = .recording
        startTimer()
        return true
    }

    func pause() {
        guard phase == .recording else { return }
        recorder?.pause()
        bankRunningTime()
        phase = .paused
        persist()
    }

    func resume() {
        guard phase == .paused, let recorder, recorder.record() else { return }
        pausedByInterruption = false
        runStart = Date()
        lastSampleAt = nil
        phase = .recording
    }

    /// Finalises the file and hands it to the phone. Nothing is waited on:
    /// the transfer belongs to the system from here.
    func stop() {
        guard phase != .idle else { return }
        stopTimer()
        bankRunningTime()
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        persist()

        transfer = nil
        pausedByInterruption = false
        phase = .idle
        elapsedSec = 0
        inputLevel = 0
        WatchSender.shared.activeRecordingId = nil
        WatchSender.shared.sendFinished()
    }

    // MARK: - Clock and meter

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func bankRunningTime() {
        if let runStart {
            accumulatedSec += Date().timeIntervalSince(runStart)
        }
        runStart = nil
        elapsedSec = accumulatedSec
    }

    private func tick() {
        let running = runStart.map { Date().timeIntervalSince($0) } ?? 0
        elapsedSec = accumulatedSec + running
        sampleInputLevel()
        if elapsedSec - lastPersistAt >= Self.persistEverySec {
            persist()
        }
        // The recorder gives up, not the recording: Stop sends it as usual.
        if elapsedSec >= WatchRecordingStore.maxRecordingSeconds {
            stop()
        }
    }

    /// Same arithmetic as `AudioRecorder.sampleInputLevel`, so both devices
    /// put the same sound at the same number.
    private func sampleInputLevel() {
        guard let recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        let rms = pow(10.0, Double(recorder.averagePower(forChannel: 0)) / 20.0)
        inputLevel = min(1, max(0, rms * 3))

        let now = Date()
        let dt = min(lastSampleAt.map { now.timeIntervalSince($0) } ?? 0, 5)
        lastSampleAt = now

        traceBucketSum += inputLevel
        traceBucketCount += 1
        traceBucketSec += dt
        while traceBucketSec >= 1 {
            if levelTrace.count < Self.maxTraceSeconds {
                levelTrace.append(traceBucketCount > 0 ? traceBucketSum / Double(traceBucketCount) : 0)
            }
            traceBucketSum = 0
            traceBucketCount = 0
            traceBucketSec -= 1
        }
    }

    private func persist() {
        guard let transfer else { return }
        let updated = WatchRecordingTransfer(
            recordingId: transfer.recordingId,
            startedAt: transfer.startedAt,
            durationSec: elapsedSec,
            levelTrace: levelTrace
        )
        try? WatchRecordingStore.save(updated)
        self.transfer = updated
        lastPersistAt = elapsedSec
    }

    private func resetTally() {
        accumulatedSec = 0
        elapsedSec = 0
        lastSampleAt = nil
        lastPersistAt = 0
        levelTrace = []
        traceBucketSum = 0
        traceBucketCount = 0
        traceBucketSec = 0
        pausedByInterruption = false
    }

    // MARK: - Interruptions

    /// A call on the watch, Siri, or another app taking the microphone stops
    /// the recorder without asking. Treat it as a pause, and pick up again
    /// when the system says it is over — but only if the teacher had not
    /// paused it themselves.
    private func handleInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began where phase == .recording:
            pause()
            pausedByInterruption = true
        case .ended where pausedByInterruption:
            try? AVAudioSession.sharedInstance().setActive(true)
            resume()
        default:
            break
        }
    }
}

func formatTimerDisplay(_ sec: Double) -> String {
    let total = Int(sec)
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
