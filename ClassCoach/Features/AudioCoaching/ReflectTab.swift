import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `ReflectTab` — "what stood out", the
/// reflect chat, and the "Your reflection" notes card.
struct ReflectTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    let onUpdate: (AudioSessionWithSegments) -> Void

    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var recorder = VoiceTurnRecorder()
    @StateObject private var player = SpeechPlayer()
    /// Voice mode: each spoken turn is sent, Coach's reply is read aloud, and
    /// the mic reopens — the same loop Talk It Through uses.
    @State private var voiceMode = false
    @State private var voicePaused = false
    @State private var muted = false
    @State private var speaking = false

    @State private var conversation: [AudioReflectMessage]
    @State private var draft = ""
    @State private var sending = false
    @State private var error: String?

    @State private var strengths: String
    @State private var growthAreas: String
    @State private var nextStep: String
    @State private var followUpDate: Date
    @State private var saving = false
    @State private var savedConfirmed = false
    @State private var summarizing = false
    @State private var locking = false

    init(session: AudioSessionWithSegments, locked: Bool, onUpdate: @escaping (AudioSessionWithSegments) -> Void) {
        self.session = session
        self.locked = locked
        self.onUpdate = onUpdate
        _conversation = State(initialValue: session.reflectConversation ?? [])
        _strengths = State(initialValue: session.strengths ?? "")
        _growthAreas = State(initialValue: session.growthAreas ?? "")
        _nextStep = State(initialValue: session.nextStep ?? "")
        _followUpDate = State(initialValue: ISO8601DateFormatter().date(from: session.followUpDate ?? "") ?? Date())
    }

    private var userTurnCount: Int { conversation.filter { $0.role == "user" }.count }
    private var turnCapHit: Bool { userTurnCount >= AudioInsights.reflectTurnCap }
    private var started: Bool { !conversation.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            standoutSection
            chatSection
            reflectionCard
        }
        .onAppear {
            recorder.configure(onTurnComplete: { text in Task { await handleVoiceTurn(text) } })
        }
        .onDisappear { stopVoice() }
        .onChange(of: recorder.fatalError) { _, newValue in
            if let newValue {
                error = newValue
                stopVoice()
            }
        }
    }

    private var standoutSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("WHAT STOOD OUT THIS SESSION").font(.caption.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
            let highlights = session.highlights ?? []
            if highlights.isEmpty {
                Text("Nothing stood out enough this session to flag here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(Array(highlights.enumerated()), id: \.offset) { _, h in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(AudioInsights.formatHighlightHeadline(label: h.label, timestampSec: h.timestampSec, durationSec: h.durationSec))
                            .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                        Text("\"\(h.excerpt)\"").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.goldTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }

    private var chatSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !started {
                VStack(spacing: 10) {
                    Text("Talk through this session with your coach — one question at a time, at your pace.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                    if !locked {
                        HStack(spacing: 10) {
                            Button {
                                Task { await startReflect(voice: true) }
                            } label: {
                                Label("Start talking", systemImage: "mic.fill")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                                    .padding(.horizontal, 18).padding(.vertical, 10)
                                    .background(AppTheme.terracotta, in: Capsule())
                            }
                            Button {
                                Task { await startReflect(voice: false) }
                            } label: {
                                Text("Type instead")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                                    .padding(.horizontal, 18).padding(.vertical, 10)
                                    .overlay(Capsule().strokeBorder(AppTheme.textSecondary.opacity(0.4)))
                            }
                        }
                        .disabled(sending)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(conversation.enumerated()), id: \.offset) { _, message in
                        Text(message.text)
                            .font(.subheadline)
                            .foregroundStyle(message.role == "user" ? AppTheme.cream : AppTheme.textPrimary)
                            .padding(12)
                            .background(message.role == "user" ? AppTheme.forest : AppTheme.mintTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                            .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
                    }
                    if sending {
                        Text("One moment…").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    }
                }

                if let error {
                    Text(error).font(.caption).foregroundStyle(AppTheme.terracotta600)
                }

                if locked {
                    Text("This report is locked — the conversation is read-only.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                } else if turnCapHit {
                    Text("You've reached today's reflection limit for this session.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                } else if voiceMode {
                    voiceControls
                } else {
                    HStack {
                        TextField("Say what's on your mind...", text: $draft)
                            .textFieldStyle(.roundedBorder)
                            .disabled(sending)
                        Button("Send") { Task { await sendMessage() } }
                            .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    Button {
                        voiceMode = true
                        voicePaused = false
                        listen()
                    } label: {
                        Label("Talk instead", systemImage: "mic.fill")
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                    }
                }
            }
        }
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AppTheme.hairline))
    }

    // MARK: - Voice

    private var voiceStatus: String {
        if voicePaused { return "Paused" }
        if recorder.transcribing || sending { return "One moment" }
        if speaking { return "Coach is speaking" }
        if recorder.listening { return "I'm listening" }
        return "Ready"
    }

    private var voiceControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(recorder.listening ? AppTheme.terracotta : AppTheme.textSecondary)
                    .frame(width: 8, height: 8)
                    .scaleEffect(recorder.listening ? 1 + recorder.level / 200 : 1)
                    .animation(.easeOut(duration: 0.15), value: recorder.level)
                Text(voiceStatus).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
            HStack(spacing: 8) {
                voiceButton(voicePaused ? "Resume" : "Pause mic", filled: true) {
                    if voicePaused {
                        voicePaused = false
                        listen()
                    } else {
                        voicePaused = true
                        recorder.close()
                        player.stop()
                        speaking = false
                    }
                }
                voiceButton(muted ? "Unmute coach" : "Mute coach") {
                    muted.toggle()
                    if muted {
                        player.stop()
                        speaking = false
                    }
                }
                voiceButton("Type instead") { stopVoice() }
            }
        }
    }

    private func voiceButton(_ title: String, filled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(filled ? .white : AppTheme.textSecondary)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background {
                    if filled {
                        Capsule().fill(AppTheme.forest)
                    } else {
                        Capsule().strokeBorder(AppTheme.textSecondary.opacity(0.4))
                    }
                }
        }
    }

    private func listen() {
        guard voiceMode, !voicePaused, !locked, !turnCapHit else { return }
        Task { await recorder.start() }
    }

    private func stopVoice() {
        voiceMode = false
        voicePaused = false
        speaking = false
        recorder.close()
        player.stop()
    }

    private func handleVoiceTurn(_ text: String) async {
        guard voiceMode, !voicePaused else { return }
        guard !text.isEmpty else {
            listen()
            return
        }
        let before = conversation.count
        draft = text
        await sendMessage()
        guard conversation.count > before else {
            // The send failed (the error is already showing) — don't re-read
            // the previous reply as if it were new.
            voicePaused = true
            return
        }
        await speakLatestReply()
    }

    /// Reads Coach's latest reply aloud, then reopens the mic.
    private func speakLatestReply() async {
        guard voiceMode, !voicePaused else { return }
        if !muted, let reply = conversation.last(where: { $0.role == "assistant" })?.text {
            speaking = true
            let voice = authManager.currentUser?.talkVoice
            for sentence in splitIntoSentences(reply) {
                player.enqueue(sentence, voice: voice)
            }
            await player.waitUntilDone()
            speaking = false
        }
        listen()
    }

    private var reflectionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your reflection").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                Spacer()
                if started && !locked {
                    Button(summarizing ? "Summarizing..." : "Fill in from our conversation") {
                        Task { await summarize() }
                    }
                    .font(.caption.weight(.medium)).foregroundStyle(AppTheme.primary)
                    .disabled(summarizing)
                }
            }

            labeledField("What went well", text: $strengths)
            labeledField("What you want to work on", text: $growthAreas)
            labeledField("One thing to try next time", text: $nextStep, minHeight: 60)

            DatePicker("Follow-up date", selection: $followUpDate, displayedComponents: .date)
                .font(.subheadline)
                .disabled(locked)

            if !locked {
                HStack {
                    Button(saving ? "Saving..." : (savedConfirmed ? "Saved." : "Save notes")) {
                        Task { await saveNotes() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .disabled(saving)
                    Spacer()
                    Button(locking ? "Locking..." : "Lock report") {
                        Task { await lock() }
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(AppTheme.forest, in: Capsule())
                    .disabled(locking)
                }
            }
        }
        .padding()
        .background(AppTheme.peachTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 20))
    }

    private func labeledField(_ title: String, text: Binding<String>, minHeight: CGFloat = 40) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            TextEditor(text: text)
                .scrollContentBackground(.hidden)
                .frame(minHeight: minHeight)
                .padding(6)
                .scrollContentBackground(.hidden)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 12))
                .disabled(locked)
        }
    }

    // MARK: - Actions

    private var reflectContext: [String] {
        let m = OverviewMetrics(session)
        return AudioInsights.buildReflectContext(session, cfuMetric: m.cfuMetric, redirectionMetric: m.redirectionMetric, directiveMetric: m.directiveMetric, coverage: m.coverage)
    }

    private func startReflect(voice: Bool) async {
        sending = true
        error = nil
        voiceMode = voice
        voicePaused = false
        do {
            let updated = try await AudioCoachingService.sendReflectMessage(sessionId: session.id, message: nil, context: reflectContext)
            conversation = updated.reflectConversation ?? []
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
            sending = false
            if voice { await speakLatestReply() }
        } catch {
            self.error = error.localizedDescription
            sending = false
            stopVoice()
        }
    }

    private func sendMessage() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        sending = true
        error = nil
        do {
            let updated = try await AudioCoachingService.sendReflectMessage(sessionId: session.id, message: trimmed, context: reflectContext)
            conversation = updated.reflectConversation ?? []
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
            draft = trimmed
        }
        sending = false
    }

    private func summarize() async {
        summarizing = true
        do {
            let summary = try await AudioCoachingService.summarizeReflectConversation(sessionId: session.id)
            if let s = summary.strengths { strengths = s }
            if let g = summary.growthAreas { growthAreas = g }
            if let n = summary.nextStep { nextStep = n }
        } catch {
            self.error = error.localizedDescription
        }
        summarizing = false
    }

    private func saveNotes() async {
        saving = true
        savedConfirmed = false
        do {
            let iso = ISO8601DateFormatter().string(from: followUpDate)
            let updated = try await AudioCoachingService.updateSession(
                id: session.id, strengths: strengths, growthAreas: growthAreas, nextStep: nextStep, followUpDate: iso
            )
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
            savedConfirmed = true
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }

    private func lock() async {
        locking = true
        await saveNotes()
        do {
            let updated = try await AudioCoachingService.updateSession(id: session.id, status: "locked")
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
        }
        locking = false
    }
}
