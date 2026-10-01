import AVFoundation

/// The one place that puts the audio session into a state where Coach can
/// actually be heard.
///
/// The category is process-wide and whatever set it last wins, which is how a
/// teacher ended up watching Coach "speak" in silence: a Lesson Debrief
/// recording leaves the session on `.record`, a category that permits no
/// output at all, and nothing on the playback side ever set it back. Pausing
/// and resuming rebuilt the session as a side effect — the reason doing it
/// twice seemed to fix it.
@MainActor
enum PlaybackSession {
    /// Makes the session audible, unless something is using the microphone
    /// for something that matters more.
    static func activate() {
        let session = AVAudioSession.sharedInstance()

        // A lesson being recorded outranks anything we would play. Taking the
        // category away here would stop that recording mid-class, so a report
        // that wants to talk while a lesson is being captured stays quiet
        // instead.
        if AudioRecorder.shared.phase == .recording { return }

        do {
            // Talk It Through holds the microphone open between turns, and
            // .playAndRecord already routes to the speaker — leave it be.
            // Otherwise .playback, and .spokenAudio so music ducks rather
            // than stopping, with the screen allowed to lock while Coach
            // talks.
            if session.category != .playAndRecord {
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            }
            try session.setActive(true)
        } catch {
            // Best-effort. Playing through a session that would not configure
            // is better than refusing to play at all.
        }
    }

    /// Hands the session back when we are done talking. Never deactivates one
    /// that someone else is still using.
    static func release() {
        let session = AVAudioSession.sharedInstance()
        guard AudioRecorder.shared.phase != .recording, session.category != .playAndRecord else { return }
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
