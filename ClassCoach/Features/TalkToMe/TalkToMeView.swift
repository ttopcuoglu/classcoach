import SwiftUI

private enum Phase {
    case idle, listening, thinking, speaking, error
}

/// Mirrors `web/src/pages/TalkToMe.tsx` — an always-listening voice
/// conversation: record a turn → transcribe → send to the coach → speak
/// the reply → listen again, looping until the teacher stops.
struct TalkToMeView: View {
    @StateObject private var recorder = VoiceTurnRecorder()
    @StateObject private var player = SpeechPlayer()

    @State private var phase: Phase = .idle
    @State private var debrief: Debrief?
    @State private var errorMessage: String?
    @State private var muted = false
    @State private var started = false

    private var lastAssistantMessage: String? {
        debrief?.conversation.last { $0.role == "assistant" }?.text
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                orb

                statusPill

                if let lastAssistantMessage {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("COACH").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.accent)
                        Text(lastAssistantMessage).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal)
                }

                if let errorMessage {
                    Text(errorMessage).font(.subheadline).foregroundStyle(.red).padding(.horizontal)
                }

                controls

                Spacer()

                Text("Your voice is never saved — only the conversation text.")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textSecondary)
                    .padding(.bottom, 8)
            }
            .frame(maxWidth: .infinity)
            .background(AppTheme.background)
            .navigationTitle("Talk It Through")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                recorder.configure(onTurnComplete: { text in Task { await handleTurnComplete(text) } })
                if !started {
                    started = true
                    beginListening()
                }
            }
            .onDisappear {
                recorder.close()
                player.stop()
                phase = .idle
            }
            .onChange(of: recorder.fatalError) { _, newValue in
                if let newValue {
                    errorMessage = newValue
                    phase = .error
                }
            }
        }
    }

    private var visualState: (color: Color, icon: String) {
        switch phase {
        case .error: return (.red, "exclamationmark.triangle.fill")
        case .idle: return (AppTheme.textSecondary, "mic.fill")
        case .thinking: return (AppTheme.accent, "brain")
        case .speaking: return (AppTheme.primary, "waveform")
        case .listening: return (AppTheme.primary, "mic.fill")
        }
    }

    private var orb: some View {
        ZStack {
            Circle()
                .fill(visualState.color.opacity(0.15))
                .frame(width: 150, height: 150)
            if phase == .listening {
                Circle()
                    .strokeBorder(visualState.color.opacity(0.4), lineWidth: 2)
                    .frame(width: 115 + recorder.level, height: 115 + recorder.level)
                    .animation(.easeOut(duration: 0.15), value: recorder.level)
            }
            Circle()
                .fill(AppTheme.surface)
                .overlay(Circle().strokeBorder(visualState.color, lineWidth: 2))
                .frame(width: 112, height: 112)
            Image(systemName: visualState.icon)
                .font(.system(size: 36))
                .foregroundStyle(visualState.color)
                .symbolEffect(.pulse, isActive: phase == .thinking || phase == .speaking)
        }
        .frame(height: 170)
    }

    private var statusPill: some View {
        Text(statusLabel)
            .font(.caption.weight(.semibold))
            .foregroundStyle(visualState.color)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(visualState.color.opacity(0.12), in: Capsule())
    }

    private var statusLabel: String {
        switch phase {
        case .listening: return recorder.level > 8 ? "Listening…" : "I'm listening — go ahead"
        case .thinking: return "Coach is thinking…"
        case .speaking: return "Coach is speaking"
        case .idle: return "Paused"
        case .error: return "Something went wrong"
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            if phase == .idle || phase == .error {
                Button {
                    beginListening()
                } label: {
                    Label(phase == .error ? "Try Again" : "Start Talking", systemImage: "mic.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .background(AppTheme.accent, in: Capsule())
                }
            } else {
                Button {
                    handleStop()
                } label: {
                    Text("Stop")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22).padding(.vertical, 12)
                        .background(AppTheme.primary, in: Capsule())
                }
            }

            Button {
                muted.toggle()
            } label: {
                Text(muted ? "Unmute" : "Mute")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(muted ? .red : AppTheme.textSecondary)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .overlay(Capsule().strokeBorder(muted ? .red : AppTheme.textSecondary.opacity(0.4)))
            }
        }
    }

    // MARK: - Turn loop

    private func beginListening() {
        errorMessage = nil
        phase = .listening
        Task { await recorder.start() }
    }

    private func handleStop() {
        recorder.close()
        player.stop()
        phase = .idle
    }

    private func handleTurnComplete(_ text: String) async {
        guard !text.isEmpty else {
            beginListening()
            return
        }
        phase = .thinking
        do {
            let result: Debrief
            if let current = debrief {
                result = try await TalkToMeService.sendChat(debriefId: current.id, message: text)
            } else {
                result = try await TalkToMeService.startTalkToMe(message: text)
            }
            debrief = result
            let reply = result.conversation.last?.text ?? ""
            await speak(reply)
        } catch {
            errorMessage = error.localizedDescription
            phase = .error
        }
    }

    private func speak(_ text: String) async {
        phase = .speaking
        guard !muted, !text.isEmpty else {
            beginListening()
            return
        }
        let sentences = splitIntoSentences(text)
        guard !sentences.isEmpty else {
            beginListening()
            return
        }
        await player.playQueue(sentences)
        beginListening()
    }
}

#Preview {
    TalkToMeView()
}
