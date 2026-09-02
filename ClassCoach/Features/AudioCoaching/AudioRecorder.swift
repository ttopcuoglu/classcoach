import Foundation
import AVFoundation

/// Native equivalent of `AudioCoaching.tsx`'s `RecordingPanel` recorder
/// logic — `AVAudioRecorder.pause()/record()` are the direct analogs of
/// `MediaRecorder.pause()/resume()`. Elapsed-time bookkeeping (accumulate
/// on pause, restart the clock on resume) is replicated exactly so the
/// displayed timer excludes paused time, same as web.
@MainActor
final class AudioRecorder: NSObject, ObservableObject {
    enum Phase { case idle, recording, paused, uploading }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var elapsedSec: Double = 0
    @Published var permissionDenied = false

    private var recorder: AVAudioRecorder?
    private var accumulatedSec: Double = 0
    private var runStart: Date?
    private var timer: Timer?
    private(set) var fileURL: URL?

    func start() async -> Bool {
        let granted = await requestPermission()
        guard granted else {
            permissionDenied = true
            return false
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
        } catch {
            return false
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]

        do {
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.delegate = self
            recorder.record()
            self.recorder = recorder
            self.fileURL = url
        } catch {
            return false
        }

        accumulatedSec = 0
        runStart = Date()
        phase = .recording
        startTimer()
        return true
    }

    func pause() {
        recorder?.pause()
        if let runStart {
            accumulatedSec += Date().timeIntervalSince(runStart)
        }
        runStart = nil
        phase = .paused
        stopTimer()
    }

    func resume() {
        recorder?.record()
        runStart = Date()
        phase = .recording
        startTimer()
    }

    /// Stops recording and returns the final elapsed seconds and file URL.
    func stop() -> (elapsedSec: Double, fileURL: URL)? {
        stopTimer()
        if let runStart {
            accumulatedSec += Date().timeIntervalSince(runStart)
        }
        runStart = nil
        recorder?.stop()
        try? AVAudioSession.sharedInstance().setActive(false)
        guard let fileURL else { return nil }
        let final = accumulatedSec
        phase = .uploading
        return (final, fileURL)
    }

    func reset() {
        stopTimer()
        recorder = nil
        fileURL = nil
        accumulatedSec = 0
        runStart = nil
        elapsedSec = 0
        phase = .idle
    }

    private func startTimer() {
        stopTimer()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        let running = runStart.map { Date().timeIntervalSince($0) } ?? 0
        elapsedSec = accumulatedSec + running
    }

    private func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}

extension AudioRecorder: AVAudioRecorderDelegate {}

func formatTimerDisplay(_ sec: Double) -> String {
    let m = Int(sec) / 60
    let s = Int(sec) % 60
    return "\(m):\(String(format: "%02d", s))"
}
