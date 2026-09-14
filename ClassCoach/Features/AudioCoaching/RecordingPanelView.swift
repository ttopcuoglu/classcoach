import SwiftUI

/// Native equivalent of `AudioCoaching.tsx`'s `RecordingPanel`. Deliberately
/// rendered directly on the page (not swapped for a child view based on
/// session status) for the same reason as web: unmounting this view mid-
/// capture would tear down the live `AVAudioRecorder`.
struct RecordingPanelView: View {
    let session: AudioSessionWithSegments?
    let onSessionUpdate: (AudioSessionWithSegments, [SpeakerSample]) -> Void
    let onExit: () -> Void

    @StateObject private var recorder = AudioRecorder()
    @State private var localSession: AudioSession?
    @State private var error: String?

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
        .alert("Microphone access needed", isPresented: $recorder.permissionDenied) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Enable microphone access in Settings to record a session.")
        }
    }

    private var statusCaption: some View {
        Group {
            switch recorder.phase {
            case .idle: Text("Ready to record")
            case .recording: Text("Recording")
            case .paused: Text("Paused")
            case .uploading: Text("Transcribing your session...")
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
            Text("This can take a minute for a full class period.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
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
        if localSession == nil {
            do {
                localSession = try await AudioCoachingService.createSession(teacherName: nil)
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        let started = await recorder.start()
        if !started && !recorder.permissionDenied {
            error = "Could not start recording. Please try again."
        }
    }

    private func handleStop() async {
        guard let result = recorder.stop(), let localSession else { return }
        do {
            let speakers = try await AudioCoachingService.transcribe(sessionId: localSession.id, audioFileURL: result.fileURL)
            let updated = try await AudioCoachingService.updateSession(id: localSession.id, status: "tagging", durationSec: result.elapsedSec)
            recorder.reset()
            onSessionUpdate(AudioSessionWithSegments(session: updated, segments: []), speakers)
        } catch {
            self.error = error.localizedDescription
            recorder.reset()
        }
    }
}
