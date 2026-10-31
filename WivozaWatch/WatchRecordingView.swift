import SwiftUI

/// The whole watch app: one screen, one job. Record, pause, stop — and say
/// plainly where the lesson is once it has stopped, because "it went to your
/// phone" is only true once the phone has it.
struct WatchRecordingView: View {
    @ObservedObject private var recorder = WatchRecorder.shared
    @ObservedObject private var sender = WatchSender.shared
    @State private var couldNotStart = false

    /// Wivoza's terracotta and cream, from `AppTheme`.
    private let accent = Color(red: 0xC9 / 255, green: 0x6A / 255, blue: 0x45 / 255)
    private let cream = Color(red: 0xF7 / 255, green: 0xF3 / 255, blue: 0xEA / 255)

    var body: some View {
        VStack(spacing: 8) {
            Text(formatTimerDisplay(recorder.elapsedSec))
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(cream)

            if recorder.phase == .idle {
                Button {
                    Task { couldNotStart = !(await recorder.start()) && !recorder.permissionDenied }
                } label: {
                    Image(systemName: "mic.fill").font(.title2)
                }
                .buttonStyle(.borderedProminent)
                .tint(accent)
                .accessibilityLabel("Start recording")
            } else {
                levelBar
                HStack(spacing: 12) {
                    Button {
                        recorder.phase == .paused ? recorder.resume() : recorder.pause()
                    } label: {
                        Image(systemName: recorder.phase == .paused ? "play.fill" : "pause.fill")
                    }
                    .accessibilityLabel(recorder.phase == .paused ? "Resume" : "Pause")

                    Button {
                        recorder.stop()
                    } label: {
                        Image(systemName: "stop.fill")
                    }
                    .tint(accent)
                    .accessibilityLabel("Stop and send to iPhone")
                }
            }

            status
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 4)
    }

    private var levelBar: some View {
        GeometryReader { geo in
            Capsule().fill(.white.opacity(0.15))
                .overlay(alignment: .leading) {
                    Capsule().fill(accent)
                        .frame(width: geo.size.width * recorder.inputLevel)
                }
        }
        .frame(height: 6)
        .animation(.linear(duration: 0.25), value: recorder.inputLevel)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var status: some View {
        if recorder.permissionDenied {
            Text("Allow the microphone for Wivoza in Settings › Privacy & Security on your watch.")
        } else if couldNotStart {
            Text("Could not start recording. Try again.")
        } else if recorder.phase == .paused {
            Text("Paused")
        } else if recorder.phase == .recording {
            Text("Recording your lesson")
        } else if !sender.companionInstalled {
            Text("Install Wivoza on your iPhone to send lessons.")
        } else if sender.pendingCount > 0 {
            Text(sender.pendingCount == 1
                 ? "Sending 1 lesson to your iPhone…"
                 : "Sending \(sender.pendingCount) lessons to your iPhone…")
        } else {
            Text("Tap to record a lesson. It goes to Lesson Debrief on your iPhone.")
        }
    }
}
