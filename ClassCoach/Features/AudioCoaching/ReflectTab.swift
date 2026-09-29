import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `ReflectTab` — "what stood out", the
/// reflect chat, and the "Your reflection" notes card.
struct ReflectTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    /// A "Discuss this with Wivoza Coach" press from Summary or an Insights
    /// page, waiting to be turned into a conversation. Cleared once consumed.
    @Binding var focus: ReflectFocus?
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

    init(
        session: AudioSessionWithSegments,
        locked: Bool,
        focus: Binding<ReflectFocus?> = .constant(nil),
        onUpdate: @escaping (AudioSessionWithSegments) -> Void
    ) {
        self.session = session
        self.locked = locked
        self._focus = focus
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
            Task { await consumeFocus() }
        }
        .onDisappear { stopVoice() }
        // Reflect is rebuilt when the tab changes, so the press that set the
        // focus normally arrives before `onAppear`. This covers a second press
        // while Reflect is already on screen.
        .onChange(of: focus) { _, newValue in
            if newValue != nil { Task { await consumeFocus() } }
        }
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

                        ProgressRing(active: sending, estimatedSeconds: 8, label: "Starting your debrief")
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
                    ProgressRing(active: sending, estimatedSeconds: 8, label: "Wivoza is thinking…", size: 44)
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

    /// Which note is being edited, so losing focus can save it — the
    /// replacement for the "Save notes" button.
    @FocusState private var editingField: String?

    private var reflectionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Your reflection").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                Spacer()
                if started && !locked {
                    Button(summarizing ? "Writing…" : "Finish and write my debrief") {
                        Task { await summarize() }
                    }
                    .font(.caption.weight(.medium)).foregroundStyle(AppTheme.primary)
                    .disabled(summarizing)
                }
            }

            ProgressRing(
                active: summarizing,
                estimatedSeconds: 12,
                label: "Writing your debrief",
                hint: "From everything you and Coach have said."
            )

            labeledField("What went well", text: $strengths)
            labeledField("What you want to work on", text: $growthAreas)
            labeledField("One thing to try next time", text: $nextStep, minHeight: 60)

            DatePicker("Follow-up date", selection: $followUpDate, displayedComponents: .date)
                .font(.subheadline)
                .disabled(locked)
                .onChange(of: followUpDate) { _, _ in
                    if !locked { Task { await saveNotes() } }
                }

            // No "Save notes" and no "Lock report". The debrief is written
            // when the conversation finishes and saved with it; an edit saves
            // itself when the teacher stops typing. Locking made a living
            // document final — no unlock, and it blocked both further
            // conversation and any new debrief — which is the opposite of
            // something you come back to and keep talking about.
            if !locked, saving || savedConfirmed {
                Text(saving
                     ? "Saving…"
                     : "Saved. Come back any time — carry on the conversation and this rewrites itself.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding()
        .background(AppTheme.peachTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 20))
        // Saves when focus leaves a note, since there is no longer a button to
        // press. `.onSubmit` does not fire for a multiline TextEditor, so the
        // focus change is the signal.
        .onChange(of: editingField) { previous, _ in
            if previous != nil, !locked { Task { await saveNotes() } }
        }
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
                .focused($editingField, equals: title)
        }
    }

    // MARK: - Actions

    private var reflectContext: [String] {
        let m = OverviewMetrics(session)
        return AudioInsights.buildReflectContext(session, cfuMetric: m.cfuMetric, redirectionMetric: m.redirectionMetric, directiveMetric: m.directiveMetric, coverage: m.coverage)
    }

    /// Arriving from a "Discuss this with Wivoza Coach" press.
    ///
    /// The teacher asked to talk about a page, so this opens in voice — the
    /// start screen's own Start talking button did that and an arrival from the
    /// report never did, which landed every one of them in typing.
    private func consumeFocus() async {
        guard let pending = focus else { return }
        focus = nil
        guard !locked, !turnCapHit else { return }

        // The label alone ("Clarity & Content in this lesson") carries no data.
        // Handed the page's words AND the raw numbers, Coach will otherwise
        // re-derive its own reading and the teacher hears one thing on the page
        // and the opposite from the coach — so both branches say how to treat
        // it, not just the first-conversation one.
        let measured = pending.detail.map {
            " This is the report's own reading of that section, which the teacher has just finished reading: \"\($0)\" Open about this specifically. Treat it as accurate and build on it — do not re-derive your own reading from the raw numbers and do not contradict it."
        } ?? ""

        if started {
            voiceMode = true
            voicePaused = false
            let before = conversation.count
            await sendMessage(
                overrideText: "Let's discuss this: \(pending.label)",
                extraContext: ["The teacher just switched to a new topic: \(pending.label).\(measured)"]
            )
            // Same guard `handleVoiceTurn` needs: a failed send would
            // otherwise have Coach read its previous reply aloud as though it
            // were an answer to the topic the teacher just chose.
            guard conversation.count > before else {
                voicePaused = true
                return
            }
            await speakLatestReply()
        } else if let detail = pending.detail {
            await startReflect(
                voice: true,
                focus: "\(pending.focus). This is the report's own reading, which the teacher has just finished reading, quoted here: \"\(detail)\". Open about this specifically rather than about the lesson in general. Treat it as accurate and build on it — do not re-derive your own reading from the raw numbers and do not contradict it."
            )
        } else {
            await startReflect(voice: true, focus: pending.focus)
        }
    }

    private func startReflect(voice: Bool, focus openWith: String? = nil) async {
        sending = true
        error = nil
        voiceMode = voice
        voicePaused = false
        do {
            // Prepended as one more plain-fact line ahead of the same context
            // array, so Claude's own opening question leads with it. The route
            // already accepts an arbitrary context, so nothing changes on the
            // server.
            let context = openWith.map { ["Start the conversation by asking about \($0)."] + reflectContext } ?? reflectContext
            let updated = try await AudioCoachingService.sendReflectMessage(
                sessionId: session.id, message: nil, context: context, spoken: voice
            )
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

    /// `overrideText` lets a topic switch send its own turn without going
    /// through the draft field, the same way voice mode submits a transcript.
    private func sendMessage(overrideText: String? = nil, extraContext: [String] = []) async {
        let trimmed = (overrideText ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if overrideText == nil { draft = "" }
        sending = true
        error = nil
        do {
            let updated = try await AudioCoachingService.sendReflectMessage(
                sessionId: session.id, message: trimmed, context: extraContext + reflectContext, spoken: voiceMode
            )
            conversation = updated.reflectConversation ?? []
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
            if overrideText == nil { draft = trimmed }
        }
        sending = false
    }

    /// Finishing a conversation writes the debrief AND saves it.
    ///
    /// It used to only fill the boxes and wait for a "Save notes" press, so a
    /// teacher who talked to Coach in the car and then closed the app lost the
    /// one thing the conversation was for. Re-runnable on purpose: come back,
    /// say one more thing, finish again, and it is rewritten from the whole
    /// conversation.
    private func summarize() async {
        // Wrapping up ends the conversation: Coach stops mid-sentence and the
        // mic stays closed.
        stopVoice()
        summarizing = true
        do {
            let summary = try await AudioCoachingService.summarizeReflectConversation(sessionId: session.id)
            if let s = summary.strengths { strengths = s }
            if let g = summary.growthAreas { growthAreas = g }
            if let n = summary.nextStep { nextStep = n }
            summarizing = false
            await saveNotes()
        } catch {
            self.error = error.localizedDescription
            summarizing = false
        }
    }

    private func saveNotes() async {
        stopVoice()
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

}
