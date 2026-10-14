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

    /// One recorder, owned by the app rather than by a view.
    ///
    /// It used to be a @StateObject inside RecordingPanelView, which tied a
    /// live AVAudioRecorder to that view's lifetime: anything that took the
    /// panel out of the view tree — opening another session, the back button
    /// out of Lesson Debrief — destroyed the recording mid-class. Every
    /// mitigation for that was a rule about where the teacher may not go.
    /// Outliving the view is the fix; the rest are belt and braces.
    static let shared = AudioRecorder()

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var elapsedSec: Double = 0
    @Published var permissionDenied = false
    /// Flips once when the recording has run itself out at
    /// `RecordingStore.maxRecordingSeconds`. The view watches this and stops
    /// exactly as if the teacher had pressed Stop, because that is what should
    /// happen to their lesson — it is the recorder that gives up, not the
    /// recording that is thrown away.
    @Published private(set) var reachedLimit = false

    /// What the microphone is picking up right now, 0...1, for a live bar.
    ///
    /// Coverage — the share of a recording that becomes transcribed words —
    /// runs from 13% to 90% across real lessons, and nothing told the teacher
    /// until the report arrived days later. One 23-minute lesson came through
    /// at 15%, its first 8:23 producing no transcript at all, and the report
    /// described the room as calm.
    ///
    /// This measures LOUDNESS, not intelligibility. It catches a phone in a
    /// bag, face-down, under papers or across the room — the level sits at
    /// the floor and stays there. It cannot catch a room of overlapping
    /// voices that is plenty loud and still transcribes to nothing; that
    /// needs speech recognition, not a meter.
    @Published private(set) var inputLevel: Double = 0

    /// The level has sat at the floor long enough to be worth saying so.
    @Published private(set) var warnQuiet = false

    /// Share of the recording with audible sound, 0...100. Nil until there is
    /// a minute behind it, because a share drawn from the first few seconds
    /// is noise.
    @Published private(set) var audibleSharePct: Int?

    /// Floor for "the mic is hearing the room at all", as LINEAR RMS on the
    /// same 0...1 scale the web recorder uses.
    ///
    /// It has to be the same scale on both platforms, because the envelope
    /// these produce is read by the same server code and compared across a
    /// teacher's lessons. iOS used to publish `(dB + 60) / 60` while web
    /// published `rms * 3`; at the same real loudness iOS read about four
    /// times higher, so one teacher's phone lesson and laptop lesson were not
    /// on the same axis at all.
    ///
    /// Deliberately permissive — roughly -44 dBFS, well below
    /// VoiceTurnRecorder's -35, which was tuned for a phone held close during
    /// a voice turn. A teacher across the room reads far below that while
    /// genuinely speaking, and a meter that warned through normal teaching
    /// would train teachers to ignore it. Provisional: no real classroom
    /// envelope exists yet to tune against.
    private static let audibleFloor: Double = 0.02

    /// A minute of unbroken near-silence before saying anything — long enough
    /// to sit through silent reading, a video, or students working.
    ///
    /// Measured in elapsed SECONDS rather than tick counts. The timer asks for
    /// 0.25s but a timer is a request: under load, in the background, or
    /// while the system is busy, ticks are coalesced and dropped. Counting
    /// them would stretch a one-minute warning into several. The web half had
    /// exactly this bug and a hidden tab turned its one-minute warning into
    /// ten; it was found by watching the warning fail to appear.
    private static let quietSecondsBeforeWarning: Double = 60
    private static let secondsForShare: Double = 60

    private var audibleSec: Double = 0
    private var totalSec: Double = 0
    private var quietSec: Double = 0
    private var lastSampleAt: Date?

    /// One averaged level per second of recording, uploaded with the audio.
    ///
    /// NOT audio: speech cannot be reconstructed from a 1Hz amplitude curve,
    /// which is what lets this exist alongside the promise on the recording
    /// screen that audio is never saved. It is the only thing that can tell a
    /// room which settles when asked from one where directions compete with
    /// chatter — the transcript cannot, because diarization resolves
    /// crosstalk away before a word of it is stored.
    ///
    /// Not @Published: it grows every second and nothing on screen draws it,
    /// so publishing it would re-render the panel once a second for nothing.
    private(set) var levelTrace: [Double] = []

    /// Two hours at 1Hz, matching the server's cap.
    private static let maxTraceSeconds = 7200

    private var traceBucketSum: Double = 0
    private var traceBucketCount = 0
    private var traceBucketSec: Double = 0

    private var recorder: AVAudioRecorder?
    private var accumulatedSec: Double = 0
    private var runStart: Date?
    private var timer: Timer?
    private var manifest: RecordingStore.Manifest?
    /// True only when the SYSTEM paused this recording — a call, an alarm,
    /// Siri, another app taking the microphone. A teacher's own Pause must
    /// never be undone by an interruption ending, so the two are kept apart.
    private var pausedByInterruption = false

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

    override init() {
        super.init()
        // Without this the recorder was never told it had been interrupted:
        // iOS stops it, the app keeps its timer running and still says
        // "recording", and the file quietly ends early. Registered once rather
        // than per recording, because the handler does nothing unless a
        // recording is in progress.
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            MainActor.assumeIsolated { self?.handleInterruption(note) }
        }

        // An interruption does not always announce its end — a call taken
        // from the lock screen, or one long enough that the system hands the
        // microphone to someone else, can leave the recorder paused with no
        // .ended ever arriving. Coming back to the app is the other reliable
        // moment to try again.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeIfInterrupted() }
        }
    }

    private func handleInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }

        switch type {
        case .began:
            // iOS has already stopped the recorder. pause() does the rest of
            // the bookkeeping — accumulate the elapsed run, stop the clock so
            // it cannot overcount, and persist the manifest.
            guard phase == .recording else { return }
            pausedByInterruption = true
            pause()

        case .ended:
            // The flag stays set until a resume actually succeeds, so that
            // coming back to the app can still pick up a recording every
            // retry below failed to restart.
            guard pausedByInterruption else { return }
            let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
            // Deliberately NOT gated on .shouldResume. iOS sets that for an
            // alarm or Siri but generally not for a phone call, and obeying it
            // meant a teacher who took a call left the rest of the lesson
            // unrecorded with the phone face-down in their pocket. For a
            // classroom recording, carrying on is what was wanted; if the
            // system really will not give the microphone back, record() fails
            // and we stay paused, which is where we already were.
            _ = options
            retryResume()

        @unknown default:
            return
        }
    }

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
            // Metering is off by default and averagePower() returns 0 without
            // it, which would read as a permanently loud room.
            next.isMeteringEnabled = true
            next.record()
            recorder = next
        } catch {
            manifest = nil
            return false
        }

        accumulatedSec = 0
        runStart = Date()
        resetCaptureTally()
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

    /// Last resort, for a teardown that should never happen.
    ///
    /// The panel is built never to unmount mid-capture and the list now refuses
    /// to open anything while the mic is live, but if this object is ever
    /// destroyed while recording, stopping here writes the WAV index so the
    /// lesson is recoverable rather than a half-written file, and clearing the
    /// active marker lets reconcileLocalAudio see it and offer it back. Doing
    /// neither is what stranded a recording with no way to reach it.
    /// Only ever clears ITS OWN marker: SwiftUI may build a replacement
    /// @StateObject before destroying the one it replaces, and an unconditional
    /// endActive() here would wipe the marker belonging to a recording that had
    /// just started.
    deinit {
        guard let sessionId = manifest?.sessionId else { return }
        recorder?.stop()
        if RecordingStore.activeSessionId == sessionId {
            RecordingStore.endActive()
        }
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
        // A teacher pressing Resume themselves settles it — nothing should
        // resume this recording again on their behalf afterwards.
        pausedByInterruption = false
        recorder?.record()
        runStart = Date()
        phase = .recording
        startTimer()
    }

    /// Stops recording and returns the finished file. `AVAudioRecorder.stop()`
    /// writes the index and closes the file, which is the whole of the work —
    /// there is no merge to wait on any more, and so nothing between Stop and
    /// the teacher getting their screen back.
    /// Returns the session id as well: the recorder outlives the view now, so
    /// the view's own copy can be nil when a teacher comes back to a recording
    /// already in progress. The manifest is the one source that is never wrong.
    func stop() -> (elapsedSec: Double, fileURL: URL, sessionId: String)? {
        RecordingStore.endActive()
        pausedByInterruption = false
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
        return (accumulatedSec, RecordingStore.audioURL(for: manifest.sessionId), manifest.sessionId)
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
        RecordingStore.endActive()
        pausedByInterruption = false
        stopTimer()
        recorder = nil
        manifest = nil
        accumulatedSec = 0
        runStart = nil
        elapsedSec = 0
        reachedLimit = false
        // Deliberately NOT cleared in stop(): the uploading phase is where
        // the thin-capture notice is shown, and it needs the share that was
        // just measured.
        resetCaptureTally()
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
        sampleInputLevel()
        if !reachedLimit, elapsedSec >= RecordingStore.maxRecordingSeconds {
            reachedLimit = true
            notifyLimitReached()
        }
    }

    /// Rides the timer that already runs at 4Hz rather than adding a second
    /// one, and reads AVAudioRecorder's own meter rather than tapping the
    /// stream — the recorder is already the thing holding the microphone.
    private func sampleInputLevel() {
        guard let recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        let db = recorder.averagePower(forChannel: 0)
        // dBFS back to linear RMS, then the same x3 the web recorder applies,
        // so both platforms put the same sound at the same number.
        let rms = pow(10.0, Double(db) / 20.0)
        inputLevel = min(1, max(0, rms * 3))

        // Real elapsed time since the previous sample, capped so a long
        // interruption (a phone call, the app suspended) does not land as one
        // enormous silent block.
        let now = Date()
        let dt = min(lastSampleAt.map { now.timeIntervalSince($0) } ?? 0, 5)
        lastSampleAt = now

        totalSec += dt
        if inputLevel >= Self.audibleFloor {
            audibleSec += dt
            quietSec = 0
        } else {
            quietSec += dt
        }
        // One value a second, averaged over however many samples the timer
        // actually delivered in that second. Averaging rather than sampling
        // means a coalesced timer yields a coarser envelope, not a wrong one.
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

        warnQuiet = quietSec >= Self.quietSecondsBeforeWarning
        audibleSharePct = totalSec >= Self.secondsForShare
            ? Int((audibleSec / totalSec * 100).rounded())
            : nil
    }

    private func resetCaptureTally() {
        audibleSec = 0
        totalSec = 0
        quietSec = 0
        lastSampleAt = nil
        // Deliberately NOT cleared in stop(): the upload reads this after
        // stopping, the same reason audibleSharePct survives.
        levelTrace = []
        traceBucketSum = 0
        traceBucketCount = 0
        traceBucketSec = 0
        inputLevel = 0
        warnQuiet = false
        audibleSharePct = nil
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

    /// Keeps trying to pick the recording back up, because one attempt is not
    /// enough in practice. The microphone can still be held for a second or
    /// two after a call ends, and a long call can end with the system never
    /// sending the .ended notification at all. Backs off over about twelve
    /// seconds and only tells the teacher once it has genuinely given up.
    private func retryResume() {
        if resumeAfterInterruption() { return }
        Task { @MainActor [weak self] in
            for delay in [0.7, 1.5, 3.0, 7.0] {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                guard let self, self.pausedByInterruption, self.phase == .paused else { return }
                if self.resumeAfterInterruption() { return }
            }
            self?.warnCouldNotResume()
        }
    }

    /// The safety net for an interruption that never announces its end: coming
    /// back to the app. A teacher who takes a call and then looks at their
    /// phone should find the lesson still recording, not a Resume button they
    /// have to know to press.
    private func resumeIfInterrupted() {
        guard pausedByInterruption, phase == .paused else { return }
        _ = resumeAfterInterruption()
    }

    /// Puts the recording back after the system took the microphone. Returns
    /// false when it could not, which leaves the recorder paused rather than
    /// claiming to record something it is not.
    @discardableResult
    private func resumeAfterInterruption() -> Bool {
        guard phase == .paused, let recorder else { return false }
        try? AVAudioSession.sharedInstance().setCategory(.record, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        guard recorder.record() else { return false }
        pausedByInterruption = false
        runStart = Date()
        phase = .recording
        startTimer()
        return true
    }

    /// The one case where silence would cost a teacher the rest of their
    /// lesson: the recording is paused, the phone is in a pocket, and nothing
    /// on screen is going to be read. Uses the permission already asked for at
    /// the start of the recording.
    private func warnCouldNotResume() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .authorized else { return }
            let content = UNMutableNotificationContent()
            content.title = "Recording paused"
            content.body = "Something interrupted your recording and it could not start again. Open Lesson Debrief to carry on or to save what was captured."
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


func formatTimerDisplay(_ sec: Double) -> String {
    let m = Int(sec) / 60
    let s = Int(sec) % 60
    return "\(m):\(String(format: "%02d", s))"
}

// The recorder has always set itself as the delegate and implemented none of
// it, so an encoder failure mid-lesson was invisible: the clock ran on and the
// screen still said "recording".
extension AudioRecorder: AVAudioRecorderDelegate {
    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor [weak self] in
            guard let self, self.phase == .recording else { return }
            print("[audio] encoder failed mid-recording: \(error?.localizedDescription ?? "unknown")")
            // Stop the clock so it stops claiming time that is not in the file.
            // Paused rather than stopped: Stop is the teacher's, and it sends
            // what was captured.
            self.pause()
        }
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        guard !flag else { return }
        print("[audio] recording did not finish cleanly")
    }
}
