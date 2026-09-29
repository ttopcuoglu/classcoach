import Foundation
import AVFoundation
import UserNotifications

/// Native equivalent of `AudioCoaching.tsx`'s `RecordingPanel` recorder
/// logic — `AVAudioRecorder.pause()/record()` are the direct analogs of
/// `MediaRecorder.pause()/resume()`. Elapsed-time bookkeeping (accumulate
/// on pause, restart the clock on resume) is replicated exactly so the
/// displayed timer excludes paused time, same as web.
///
/// Recording is chunked — see `RecordingStore` for why. The clock is not:
/// rolling to a new file leaves `runStart` and `accumulatedSec` alone, so the
/// timer a teacher watches never notices.
@MainActor
final class AudioRecorder: NSObject, ObservableObject {
    enum Phase { case idle, recording, paused, uploading }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var elapsedSec: Double = 0
    @Published var permissionDenied = false
    /// Flips once when the recording has run itself out at
    /// `RecordingStore.maxRecordingSeconds`. The view watches this and stops
    /// exactly as if the teacher had pressed Stop, because that is what should
    /// happen to their lesson — it is the recorder that gives up, not the
    /// recording that is thrown away.
    @Published private(set) var reachedLimit = false

    private var recorder: AVAudioRecorder?
    private var accumulatedSec: Double = 0
    private var runStart: Date?
    private var timer: Timer?
    private var rollTimer: Timer?
    private var manifest: RecordingStore.Manifest?

    private static let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
    ]

    func start(sessionId: String) async -> Bool {
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

        do {
            manifest = try RecordingStore.begin(sessionId: sessionId)
        } catch {
            return false
        }

        accumulatedSec = 0
        runStart = Date()
        guard startNextChunk() else {
            manifest = nil
            return false
        }
        phase = .recording
        startTimer()
        startRollTimer()
        // Asked now, while the teacher is holding the phone and has just
        // chosen to record. Asking when the limit fires — ninety minutes
        // later, with the phone in a drawer — puts the one prompt iOS ever
        // gives in front of nobody, and a reflexive "Don't Allow" then costs
        // the notification permanently.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        return true
    }

    func pause() {
        recorder?.pause()
        stopRollTimer()
        if let runStart {
            accumulatedSec += Date().timeIntervalSince(runStart)
        }
        runStart = nil
        phase = .paused
        stopTimer()
        persistElapsed()
    }

    func resume() {
        recorder?.record()
        runStart = Date()
        phase = .recording
        startTimer()
        startRollTimer()
    }

    /// Stops recording and returns the final elapsed seconds and a single
    /// merged file — the shape everything downstream already expects.
    func stop() async -> (elapsedSec: Double, fileURL: URL)? {
        stopTimer()
        stopRollTimer()
        if let runStart {
            accumulatedSec += Date().timeIntervalSince(runStart)
        }
        runStart = nil
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false)

        guard var manifest else { return nil }
        manifest.accumulatedSec = accumulatedSec
        try? RecordingStore.save(manifest)
        self.manifest = manifest

        phase = .uploading
        guard let merged = try? await RecordingStore.merge(manifest) else { return nil }
        return (accumulatedSec, merged)
    }

    /// Called once the recording is safely handed over. Deleting the chunks is
    /// the last step on purpose: until the upload has been accepted they are
    /// the only copy.
    func finish() {
        if let sessionId = manifest?.sessionId {
            RecordingStore.discard(sessionId: sessionId)
        }
        reset()
    }

    func reset() {
        stopTimer()
        stopRollTimer()
        recorder = nil
        manifest = nil
        accumulatedSec = 0
        runStart = nil
        elapsedSec = 0
        reachedLimit = false
        phase = .idle
    }

    // MARK: - Chunks

    /// Finalises the current file and opens the next. The gap is a few tens of
    /// milliseconds every five minutes, which can clip a word; avoiding even
    /// that means driving `AVAudioEngine` and writing files by hand, which is
    /// a great deal more code and more ways to get audio wrong.
    private func roll() {
        recorder?.stop()
        persistElapsed()
        _ = startNextChunk()
    }

    private func startNextChunk() -> Bool {
        guard var manifest else { return false }
        let url = RecordingStore.chunkURL(sessionId: manifest.sessionId, index: manifest.chunkNames.count)
        do {
            let next = try AVAudioRecorder(url: url, settings: Self.settings)
            next.delegate = self
            next.record()
            recorder = next
        } catch {
            return false
        }
        manifest.chunkNames.append(url.lastPathComponent)
        self.manifest = manifest
        try? RecordingStore.save(manifest)
        return true
    }

    /// Keeps the manifest's duration roughly current, so a recording recovered
    /// after a crash reports a sane length rather than zero.
    private func persistElapsed() {
        guard var manifest else { return }
        let running = runStart.map { Date().timeIntervalSince($0) } ?? 0
        manifest.accumulatedSec = accumulatedSec + running
        self.manifest = manifest
        try? RecordingStore.save(manifest)
    }

    private func startRollTimer() {
        stopRollTimer()
        rollTimer = Timer.scheduledTimer(withTimeInterval: RecordingStore.chunkSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.roll() }
        }
    }

    private func stopRollTimer() {
        rollTimer?.invalidate()
        rollTimer = nil
    }

    // MARK: - Clock

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
        // Checked here rather than on the five-minute roll, or a recording
        // could run five minutes past its own limit.
        if !reachedLimit, elapsedSec >= RecordingStore.maxRecordingSeconds {
            reachedLimit = true
            notifyLimitReached()
        }
    }

    /// The whole point is a teacher who is not looking at their phone, so this
    /// has to be a notification rather than anything on screen. Permission was
    /// asked for at the start of the recording; here we only post. Best-effort:
    /// the recording still ends itself if permission was refused.
    private func notifyLimitReached() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            let content = UNMutableNotificationContent()
            content.title = "Recording stopped"
            let minutes = Int(RecordingStore.maxRecordingSeconds / 60)
            content.body = "Lesson Debrief stopped after \(minutes) minutes and saved your recording."
            content.sound = .default
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
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
