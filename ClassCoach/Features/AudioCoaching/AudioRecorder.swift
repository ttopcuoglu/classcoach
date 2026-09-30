import Foundation
import AVFoundation
import UIKit
import UserNotifications

/// Native equivalent of `AudioCoaching.tsx`'s `RecordingPanel` recorder
/// logic — `AVAudioRecorder.pause()/record()` are the direct analogs of
/// `MediaRecorder.pause()/resume()`. Elapsed-time bookkeeping (accumulate
/// on pause, restart the clock on resume) is replicated exactly so the
/// displayed timer excludes paused time, same as web.
///
/// One recording is one file — see `RecordingStore` for why chunking was
/// tried and reverted. Stop therefore has nothing to do but finalise the file
/// and hand it over.
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
    private var manifest: RecordingStore.Manifest?

    /// 16 kHz mono PCM, not AAC — see RecordingStore's header. AAC cannot be
    /// recovered from a recording the app never got to finish, in any
    /// container, because it needs a packet table written at the end. PCM needs
    /// no index, so an interrupted file still holds everything up to the moment
    /// it stopped. 16 kHz mono is also what speech recognition actually uses;
    /// the 44.1 kHz this replaced was downsampled at the other end anyway.
    ///
    /// AVAudioRecorder takes the container from the file extension, so this
    /// pairs with RecordingStore.fileName being .wav.
    private static let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
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

        do {
            let next = try AVAudioRecorder(url: RecordingStore.audioURL(for: sessionId), settings: Self.settings)
            next.delegate = self
            next.record()
            recorder = next
        } catch {
            manifest = nil
            return false
        }

        accumulatedSec = 0
        runStart = Date()
        phase = .recording
        startTimer()
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
    }

    /// Stops recording and returns the finished file. `AVAudioRecorder.stop()`
    /// writes the index and closes the file, which is the whole of the work —
    /// there is no merge to wait on any more, and so nothing between Stop and
    /// the teacher getting their screen back.
    func stop() -> (elapsedSec: Double, fileURL: URL)? {
        stopTimer()
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
        return (accumulatedSec, RecordingStore.audioURL(for: manifest.sessionId))
    }

    /// The upload has been QUEUED — not accepted, not transcribed. A
    /// background task returns the moment it is handed to the system, so
    /// deleting the audio here would throw the lesson away while it is still
    /// the only copy: a rejected upload or a server restart mid-transcription
    /// would leave the teacher an error message and nothing else.
    ///
    /// The file therefore stays until `AudioCoachingView` sees the server
    /// report a transcript for this session.
    func handOff() {
        reset()
    }

    func reset() {
        stopTimer()
        recorder = nil
        manifest = nil
        accumulatedSec = 0
        runStart = nil
        elapsedSec = 0
        reachedLimit = false
        phase = .idle
    }

    /// Keeps the manifest's duration roughly current, so a recording found
    /// after a crash reports a sane length rather than zero.
    private func persistElapsed() {
        guard var manifest else { return }
        let running = runStart.map { Date().timeIntervalSince($0) } ?? 0
        manifest.accumulatedSec = accumulatedSec + running
        self.manifest = manifest
        try? RecordingStore.save(manifest)
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
