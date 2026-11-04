import SwiftUI

/// The whole watch app: one screen, one job. Record, pause, stop — and say
/// plainly where the lesson is once it has stopped, because "it went to your
/// phone" is only true once the phone has it.
struct WatchRecordingView: View {
    @ObservedObject private var recorder = WatchRecorder.shared
    @ObservedObject private var sender = WatchSender.shared
    @State private var couldNotStart = false
    /// The watch has no sign-in, so it cannot read the account's
    /// `recordingNoticeAt` — it shows its own short version once per watch.
    /// The server still stores a watch lesson's consent as false until the
    /// teacher has been through the full notice on the phone or the web.
    @AppStorage("recordingNoticeSeen") private var noticeSeen = false
    @State private var showNotice = false

    /// Wivoza's terracotta and cream, from `AppTheme`.
    private let accent = Color(red: 0xC9 / 255, green: 0x6A / 255, blue: 0x45 / 255)
    private let cream = Color(red: 0xF7 / 255, green: 0xF3 / 255, blue: 0xEA / 255)

    var body: some View {
        if showNotice {
            notice
        } else {
            recordingScreen
        }
    }

    /// The phone's "Before your first recording", cut to what fits a wrist.
    private var notice: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Before your first recording")
                    .font(.headline).foregroundStyle(cream)
                Text("Tell your students once that you record your own teaching, just for you.")
                    .font(.footnote)
                Text("If your school has a recording policy, follow it.")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("Got it") {
                    noticeSeen = true
                    showNotice = false
                    startRecording()
                }
                .buttonStyle(.borderedProminent)
                .tint(accent)
                .padding(.top, 4)
            }
        }
    }

    private func startRecording() {
        Task { couldNotStart = !(await recorder.start()) && !recorder.permissionDenied }
    }

    private var recordingScreen: some View {
        VStack(spacing: 8) {
            Text(formatTimerDisplay(recorder.elapsedSec))
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(cream)

            if recorder.phase == .idle {
                Button {
                    if noticeSeen { startRecording() } else { showNotice = true }
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
