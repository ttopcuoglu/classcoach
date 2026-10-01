import SwiftUI

/// Native equivalent of `AudioCoaching.tsx`'s `RecordingPanel`. Deliberately
/// rendered directly on the page (not swapped for a child view based on
/// session status) for the same reason as web: unmounting this view mid-
/// capture would tear down the live `AVAudioRecorder`.
struct RecordingPanelView: View {
    let session: AudioSessionWithSegments?
    let onSessionUpdate: (AudioSessionWithSegments, [SpeakerSample]) -> Void
    /// The recording has been handed to the background uploader. Nothing is
    /// finished yet; the parent returns to the list and watches the row.
    let onUploadStarted: () -> Void
    let onExit: () -> Void

    @StateObject private var recorder = AudioRecorder()
    @State private var localSession: AudioSession?
    @State private var error: String?
    @State private var batteryWarning: String?
    /// Shown once. A teacher who has read it and pressed Record anyway has
    /// made their decision, and repeating it every tap would only train them
    /// to dismiss it.
    @State private var batteryWarningAcknowledged = false

    var body: some View {
        VStack(spacing: 16) {
            if let localSession, recorder.phase == .idle {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(localSession.classSubject ?? localSession.teacherName ?? "Recording")
                            .font(.heading(.headline)).foregroundStyle(.white)
                        Text(formattedDate(localSession.sessionDate))
                            .font(.caption).foregroundStyle(.white.opacity(0.7))
                    }
                    Spacer()
                    Button("Cancel", action: onExit).font(.caption.weight(.medium)).foregroundStyle(.white.opacity(0.7))
                }
            }

            Text("RECORD A LESSON")
                .font(.caption2.weight(.bold)).tracking(1.4)
                .foregroundStyle(AppTheme.gold)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 10) {
                if recorder.phase == .recording {
                    HStack(spacing: 6) {
                        Circle().fill(AppTheme.terracotta).frame(width: 8, height: 8)
                        Text("RECORDING").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.gold)
                    }
                } else if recorder.phase == .paused {
                    HStack(spacing: 6) {
                        Circle().fill(AppTheme.gold).frame(width: 8, height: 8)
                        Text("PAUSED").font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.7))
                    }
                }

                Text(formatTimerDisplay(recorder.elapsedSec))
                    .font(.system(size: 48, weight: .bold, design: .monospaced))
                    .foregroundStyle(AppTheme.cream)

                statusCaption
                buttonRow
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)

            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.peachTint)
            }

            Text("Audio is never saved — it's sent once for transcription and discarded immediately. Only the text transcript is kept.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(20)
        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
        .onAppear { localSession = session?.session }
        // The recording ran itself out. Finish it exactly as a Stop would, so
        // the teacher still gets the lesson rather than being told off for
        // forgetting.
        .onChange(of: recorder.reachedLimit) { _, hit in
            if hit { Task { await handleStop() } }
        }
        .alert("Microphone access needed", isPresented: $recorder.permissionDenied) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Enable microphone access in Settings to record a session.")
        }
        .alert("Low battery", isPresented: Binding(
            get: { batteryWarning != nil },
            set: { if !$0 { batteryWarning = nil } }
        )) {
            Button("Record anyway") {
                batteryWarning = nil
                batteryWarningAcknowledged = true
                Task { await handleRecord() }
            }
            Button("Not now", role: .cancel) { batteryWarning = nil }
        } message: {
            Text(batteryWarning ?? "")
        }
    }

    private var statusCaption: some View {
        Group {
            switch recorder.phase {
            case .idle: Text("Ready to record")
            case .recording: Text("Recording")
            case .paused: Text("Paused")
            // The ring below carries this label, so the caption steps back.
            case .uploading: Text("Almost there")
            }
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white.opacity(0.7))
        .textCase(.uppercase)
    }

    @ViewBuilder
    private var buttonRow: some View {
        switch recorder.phase {
        case .idle:
            Button {
                Task { await handleRecord() }
            } label: {
                Label("Record", systemImage: "mic.fill")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 30)
                    .padding(.vertical, 16)
                    .background(AppTheme.terracotta, in: Capsule())
            }
        case .recording:
            HStack(spacing: 12) {
                Button("Pause") { recorder.pause() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.cream)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .overlay(Capsule().strokeBorder(AppTheme.cream.opacity(0.4)))
                stopButton
            }
        case .paused:
            HStack(spacing: 12) {
                Button("Resume") { recorder.resume() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
                stopButton
            }
        case .uploading:
            // Web shows a ring with a percentage here and iOS showed two lines
            // of text, so the same wait felt stalled on one platform and busy on
            // the other. Deepgram's batch endpoint reports no completion
            // fraction, so this is the same honest estimate web uses: scaled by
            // how long the recording actually was, because a full class period
            // genuinely takes longer to transcribe than a five-minute clip.
            ProgressRing(
                active: true,
                estimatedSeconds: TranscribeStages.estimatedSeconds(recordingSec: recorder.elapsedSec),
                label: "Transcribing your session",
                stages: TranscribeStages.all,
                hint: TranscribeStages.hint(recordingSec: recorder.elapsedSec),
                tint: AppTheme.gold,
                size: 88
            )
        }
    }

    private var stopButton: some View {
        Button {
            Task { await handleStop() }
        } label: {
            Text("Stop")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 20).padding(.vertical, 10)
                .background(AppTheme.cream, in: Capsule())
        }
    }

    private func handleRecord() async {
        error = nil
        // A class period is fifty minutes with the screen awake. Chunking means
        // a dead phone now costs the last few minutes rather than the lesson,
        // but not starting on 12% is better than recovering from it.
        if let warning = BatteryCheck.warning(), !batteryWarningAcknowledged {
            batteryWarning = warning
            return
        }
        // A session is only reusable while it has no audio of its own yet.
        // `recorder.start` goes through `RecordingStore.begin`, which resets the
        // manifest and truncates the file at that session's path — so recording
        // into an id that already holds a lesson destroys it outright. The panel
        // keeps `localSession` across a Cancel and can be handed one by the
        // list, so "already set" was never the same as "safe to record into".
        let reusable = localSession.map { !RecordingStore.hasRecording(sessionId: $0.id) } ?? false
        if !reusable {
            do {
                localSession = try await AudioCoachingService.createSession(teacherName: nil)
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        guard let localSession else { return }
        let started = await recorder.start(sessionId: localSession.id)
        if !started && !recorder.permissionDenied {
            error = "Could not start recording. Please try again."
        }
    }

    private func handleStop() async {
        guard let result = recorder.stop(), let localSession else {
            // The recording is not gone: the file stays on disk and Lesson
            // Debrief offers it back the next time it opens.
            error = "Could not finish the recording. It is saved — reopen Lesson Debrief to try again."
            return
        }
        do {
            // Handed to the system, not awaited: iOS finishes the transfer with
            // the app suspended or the phone locked, and the server transcribes
            // without us. The teacher goes back to the list, where the row
            // reports progress.
            try await AudioCoachingService.startTranscription(
                sessionId: localSession.id,
                audioFileURL: result.fileURL,
                durationSec: result.elapsedSec
            )
            // The file stays until the server reports a transcript for this
            // session. Queued is not the same as safe.
            recorder.handOff()
            // The panel is not torn down between recordings — isRecordingPhase
            // is true whenever there is no active session — so this @State
            // survives, and without clearing it the next Record reused this
            // session instead of creating one. Two lessons then shared a row,
            // and if this one had since been deleted the next recording
            // uploaded to a session the server no longer had.
            self.localSession = nil
            onUploadStarted()
        } catch {
            self.error = error.localizedDescription
            recorder.reset()
        }
    }
}
