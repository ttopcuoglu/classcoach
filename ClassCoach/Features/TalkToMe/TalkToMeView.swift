import SwiftUI

private enum Phase {
    case idle, listening, thinking, speaking, error
}

private let examplePrompts = [
    "My class talks over directions.",
    "I want to reflect on today's lesson.",
    "A parent email is stressing me out.",
    "I'm feeling overwhelmed this week.",
]

/// For teachers six or more years in — same list as `EXPERIENCED_PROMPTS` in
/// web/src/pages/TalkToMe.tsx.
private let experiencedPrompts = [
    "I want to think through why a strong lesson fell flat.",
    "My discussions could go deeper.",
    "I'm mentoring a newer teacher and want to help well.",
    "I want to try something new this unit.",
]

/// Answers to Coach's check-in question — same list as `CHECK_IN_PROMPTS` in
/// web/src/pages/TalkToMe.tsx.
private let checkInPrompts = [
    "It went well.",
    "It went okay, but not quite how I planned.",
    "It didn't work.",
    "I haven't had a chance to try it yet.",
]

/// Mirrors `web/src/pages/TalkToMe.tsx` — a voice conversation with Coach:
/// record a turn → transcribe → stream Coach's reply, speaking each sentence
/// as it arrives → listen again, until the teacher pauses or finishes. A
/// finished conversation gets a takeaway, can be saved, and can be picked up
/// again later from "Past conversations".
struct TalkToMeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var recorder = VoiceTurnRecorder()
    @StateObject private var player = SpeechPlayer()

    @State private var phase: Phase = .idle
    @State private var debrief: Debrief?
    @State private var userTranscript: String?
    /// Coach's reply as it streams in, before the saved conversation returns.
    @State private var streamingReply: String?
    @State private var errorMessage: String?
    @State private var muted = false
    @State private var conversationFull = false

    @State private var showTypeInput = false
    @State private var typedDraft = ""
    @FocusState private var typeFieldFocused: Bool

    @State private var savedTalks: [Debrief] = []
    @State private var expandedTalkId: String?

    @State private var finishing = false
    @State private var takeawayLoading = false
    @State private var takeawayError: String?

    // Guards against the turn loop resuming after Pause: every async step
    // (record -> transcribe -> reply -> speak) ends by listening again, and
    // one of those steps may already be in flight when Pause is tapped.
    // Without this flag the in-flight step would switch the mic back on.
    @State private var sessionActive = false

    /// The check-in this conversation answers, when opened from Home's card.
    /// Sent with the first turn only; cleared when starting a new conversation.
    @State private var activeFollowUp: CoachFollowUp?
    /// The teacher tapped "Don't check in on this" on the current takeaway.
    @State private var checkInOff = false
    @State private var checkInNote: String?

    init(followUp: CoachFollowUp? = nil) {
        _activeFollowUp = State(initialValue: followUp)
    }

    private var voice: String? { authManager.currentUser?.talkVoice }

    private var userTurns: Int {
        debrief?.conversation.filter { $0.role == "user" }.count ?? 0
    }

    private var atCap: Bool {
        conversationFull || userTurns >= TalkToMeService.turnCap
    }

    private var coachReplyText: String? {
        streamingReply ?? debrief?.conversation.last { $0.role == "assistant" }?.text
    }

    private var onStartScreen: Bool {
        debrief == nil && phase == .idle && !showTypeInput && userTranscript == nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    if finishing {
                        takeawayView
                    } else {
                        VStack(spacing: 14) {
                            orb
                            statusLabel
                        }
                        .padding(.vertical, 22)
                        .frame(maxWidth: .infinity)
                        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 28))
                        .padding(.horizontal)

                        if onStartScreen {
                            startScreen
                        } else {
                            conversationCards
                        }

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.terracotta600)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }

                        if showTypeInput {
                            typeInput
                        } else {
                            controls
                        }

                        if onStartScreen && !savedTalks.isEmpty {
                            pastConversations
                        }
                    }

                    Text("Your voice is never saved — only the conversation text.")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 8)
                }
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity)
            }
            .background(AppTheme.background)
            .navigationTitle("Talk It Through")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") {
                        handleStop()
                        dismiss()
                    }
                }
            }
            .onAppear {
                recorder.configure(onTurnComplete: { text in Task { await handleTurnComplete(text) } })
            }
            .task { await loadSavedTalks() }
            .onDisappear {
                sessionActive = false
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

    // MARK: - Orb & status

    private var visualState: (color: Color, icon: String) {
        switch phase {
        case .error: return (AppTheme.terracotta, "exclamationmark.triangle.fill")
        case .idle: return (AppTheme.cream.opacity(0.8), "mic.fill")
        // One colour across listening, thinking and speaking, as on web — the
        // conversation, not the machinery, should hold the eye.
        case .thinking: return (AppTheme.gold, "ellipsis")
        case .speaking: return (AppTheme.gold, "waveform")
        case .listening: return (AppTheme.gold, "mic.fill")
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
                .fill(visualState.color.opacity(0.14))
                .overlay(Circle().strokeBorder(visualState.color.opacity(0.6), lineWidth: 1.5))
                .frame(width: 112, height: 112)
            Image(systemName: visualState.icon)
                .font(.system(size: 36))
                .foregroundStyle(visualState.color)
                .symbolEffect(.pulse, isActive: phase == .thinking || phase == .speaking)
        }
        .frame(height: 170)
    }

    private var statusLabel: some View {
        HStack(spacing: 6) {
            Circle().fill(visualState.color).frame(width: 6, height: 6)
            Text(statusText)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(phase == .error ? AppTheme.peachTint : AppTheme.cream.opacity(0.75))
        .accessibilityElement(children: .combine)
    }

    private var statusText: String {
        if recorder.transcribing { return "One moment" }
        switch phase {
        case .listening: return "I'm listening"
        case .thinking: return "One moment"
        case .speaking: return "Coach is speaking"
        case .idle: return debrief == nil ? "Ready when you are" : "Paused"
        case .error: return "Something went wrong"
        }
    }

    // MARK: - Start screen

    private var startPrompts: [String] {
        if activeFollowUp != nil { return checkInPrompts }
        return ExperienceLevel.isExperienced(authManager.currentUser?.experienceLevel) ? experiencedPrompts : examplePrompts
    }

    private var startScreen: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(activeFollowUp != nil ? "COACH IS CHECKING IN" : "A MOMENT FOR YOUR TEACHING")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.accent)
                Text(activeFollowUp?.checkInQuestion ?? "What's on your mind today?")
                    .font(.heading(.title2))
                    .foregroundStyle(AppTheme.forest)
                Text(activeFollowUp != nil
                     ? "Say how it went — good, bad, or not yet. Coach will take it from there."
                     : "Talk through a challenge, find the right words, or reflect on your day.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }

            if let activeFollowUp {
                VStack(alignment: .leading, spacing: 4) {
                    Text("WHAT YOU PLANNED TO TRY")
                        .font(.caption2.weight(.bold)).tracking(0.8)
                        .foregroundStyle(AppTheme.terracotta600)
                    Text(activeFollowUp.plan)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(AppTheme.goldTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
            }

            VStack(spacing: 8) {
                ForEach(startPrompts, id: \.self) { prompt in
                    Button {
                        submit(prompt, typed: true)
                    } label: {
                        HStack {
                            Text("\u{201C}\(prompt)\u{201D}")
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.textPrimary)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            Image(systemName: "arrow.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppTheme.accent)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.black.opacity(0.06)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Conversation

    private var conversationCards: some View {
        VStack(spacing: 10) {
            if let userTranscript {
                messageCard(label: "YOU", text: userTranscript, labelColor: AppTheme.textSecondary, fill: Color.white)
            }
            if let coachReplyText, !coachReplyText.isEmpty {
                messageCard(label: "COACH", text: coachReplyText, labelColor: AppTheme.accent, fill: AppTheme.surface)
            }
        }
        .padding(.horizontal)
    }

    private func messageCard(label: String, text: String, labelColor: Color, fill: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption2.weight(.bold)).foregroundStyle(labelColor)
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(fill, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.black.opacity(0.05)))
    }

    private var controls: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                if !atCap {
                    if phase == .idle || phase == .error {
                        pillButton(
                            phase == .error ? "Try Again" : (debrief == nil ? "Start Talking" : "Resume"),
                            systemImage: "mic.fill",
                            filled: AppTheme.accent
                        ) { beginListening() }
                    } else {
                        pillButton("Pause mic", filled: AppTheme.primary) { handleStop() }
                    }
                }

                pillButton(muted ? "Unmute coach" : "Mute coach", outlined: muted ? AppTheme.terracotta : AppTheme.textSecondary) {
                    muted.toggle()
                    if muted { player.stop() }
                }
            }

            HStack(spacing: 10) {
                if !atCap {
                    pillButton("Type instead", outlined: AppTheme.textSecondary) { openTypeInput() }
                }
                if debrief != nil {
                    pillButton("Finish session", outlined: AppTheme.textSecondary) {
                        Task { await finishSession() }
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private var typeInput: some View {
        HStack(spacing: 8) {
            TextField("Type what's on your mind…", text: $typedDraft, axis: .vertical)
                .lineLimit(1...4)
                .focused($typeFieldFocused)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color.black.opacity(0.08)))
            Button("Send") {
                let text = typedDraft
                typedDraft = ""
                submit(text, typed: true)
            }
            .font(.subheadline.weight(.semibold))
            .disabled(typedDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Cancel") {
                showTypeInput = false
                typeFieldFocused = false
            }
            .font(.subheadline)
            .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(.horizontal)
    }

    private func pillButton(
        _ title: String,
        systemImage: String? = nil,
        filled: Color? = nil,
        outlined: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Group {
                if let systemImage {
                    Label(title, systemImage: systemImage)
                } else {
                    Text(title)
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(filled != nil ? .white : (outlined ?? AppTheme.textSecondary))
            .padding(.horizontal, 18).padding(.vertical, 11)
            .background {
                if let filled {
                    Capsule().fill(filled)
                } else {
                    Capsule().strokeBorder((outlined ?? AppTheme.textSecondary).opacity(0.45))
                }
            }
        }
    }

    // MARK: - Past conversations

    private var pastConversations: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PAST CONVERSATIONS")
                .font(.caption2.weight(.bold))
                .foregroundStyle(AppTheme.textSecondary)
            ForEach(savedTalks) { talk in
                pastConversationCard(talk)
            }
        }
        .padding(.horizontal)
    }

    private func pastConversationCard(_ talk: Debrief) -> some View {
        let full = talk.conversation.filter { $0.role == "user" }.count >= TalkToMeService.turnCap
        let expanded = expandedTalkId == talk.id
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Button {
                    expandedTalkId = expanded ? nil : talk.id
                } label: {
                    Text(talk.incidentText)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                if full {
                    Text("Full").font(.caption.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                } else {
                    Button {
                        continuePast(talk)
                    } label: {
                        Label("Continue", systemImage: "mic.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(AppTheme.accent, in: Capsule())
                    }
                }
            }

            if expanded {
                if let takeaway = talk.talkTakeaway {
                    takeawaySection("WHAT WE EXPLORED", takeaway.explored, AppTheme.primary)
                    takeawaySection("WHAT I'LL TRY", takeaway.tryNext, AppTheme.accent)
                    takeawaySection("WHAT I'LL NOTICE", takeaway.notice, AppTheme.textSecondary)
                } else {
                    Text("No takeaway was saved for this conversation.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.black.opacity(0.06)))
    }

    // MARK: - Takeaway

    private var takeawayView: some View {
        VStack(alignment: .leading, spacing: 16) {
            if takeawayLoading {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Wrapping up…").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
            } else if let takeawayError {
                VStack(spacing: 12) {
                    Text(takeawayError).font(.subheadline).foregroundStyle(AppTheme.terracotta600).multilineTextAlignment(.center)
                    pillButton("Try Again", filled: AppTheme.accent) { Task { await finishSession() } }
                    pillButton("Back to the conversation", outlined: AppTheme.textSecondary) {
                        finishing = false
                        self.takeawayError = nil
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            } else if let debrief, let takeaway = debrief.talkTakeaway {
                HStack(alignment: .top) {
                    Text("Here's your takeaway")
                        .font(.heading(.title2))
                        .foregroundStyle(AppTheme.forest)
                    Spacer()
                    Button {
                        Task { await toggleSaved() }
                    } label: {
                        Label(debrief.saved ? "Saved" : "Save", systemImage: debrief.saved ? "star.fill" : "star")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(debrief.saved ? AppTheme.accent : AppTheme.textSecondary)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .overlay(Capsule().strokeBorder(debrief.saved ? AppTheme.accent : AppTheme.textSecondary.opacity(0.4)))
                    }
                }

                takeawaySection("WHAT WE EXPLORED", takeaway.explored, AppTheme.forest, fill: AppTheme.mintTint.opacity(0.7))
                takeawaySection("WHAT I'LL TRY", takeaway.tryNext, AppTheme.terracotta600, fill: AppTheme.goldTint.opacity(0.7))
                takeawaySection("WHAT I'LL NOTICE", takeaway.notice, AppTheme.terracotta600, fill: AppTheme.peachTint.opacity(0.55))

                checkInFooter(debriefId: debrief.id)

                VStack(spacing: 10) {
                    if !atCap {
                        pillButton("Continue This Conversation", filled: AppTheme.accent) {
                            finishing = false
                            beginListening()
                        }
                    }
                    pillButton("Start a New Talk It Through", outlined: AppTheme.textSecondary) {
                        startOver()
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
            }
        }
        .padding(.horizontal)
    }

    /// "Coach will check in…" with the opt-out, plus the superadmin test switch.
    private func checkInFooter(debriefId: String) -> some View {
        VStack(spacing: 8) {
            if checkInOff {
                Text("Okay — no check-in for this one.")
            } else {
                Text("Coach will check in with you about this in a few days.")
                Button("Don't check in on this") {
                    Task { await turnCheckInOff(debriefId: debriefId) }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.terracotta600)

                if authManager.currentUser?.role == "superadmin" {
                    Button("Admin test: make this check-in due now") {
                        Task { await makeCheckInDueNow() }
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(AppTheme.terracotta600)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .overlay(Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(AppTheme.terracotta.opacity(0.5)))
                }
            }
            if let checkInNote {
                Text(checkInNote).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .font(.caption)
        .foregroundStyle(AppTheme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    private func takeawaySection(_ label: String, _ text: String, _ color: Color, fill: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption2.weight(.bold)).foregroundStyle(color)
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(fill == nil ? 0 : 14)
        .background(fill ?? .clear, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Turn loop

    private func beginListening() {
        guard !atCap else { return }
        sessionActive = true
        errorMessage = nil
        showTypeInput = false
        phase = .listening
        Task { await recorder.start() }
    }

    private func handleStop() {
        sessionActive = false
        recorder.close()
        player.stop()
        phase = .idle
    }

    private func openTypeInput() {
        handleStop()
        showTypeInput = true
        typeFieldFocused = true
    }

    /// Only resumes listening if Pause wasn't tapped while this turn's
    /// record -> transcribe -> reply -> speak chain was already in flight.
    private func resumeListeningIfActive() {
        guard sessionActive else {
            if phase != .error { phase = .idle }
            return
        }
        beginListening()
    }

    private func handleTurnComplete(_ text: String) async {
        guard !text.isEmpty else {
            resumeListeningIfActive()
            return
        }
        await reply(to: text)
    }

    /// A tapped example prompt or a typed message takes exactly the same path
    /// as a spoken turn, minus the microphone.
    private func submit(_ text: String, typed: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if typed {
            recorder.close()
            sessionActive = false
            showTypeInput = false
            typeFieldFocused = false
        }
        Task { await reply(to: trimmed) }
    }

    private func reply(to text: String) async {
        userTranscript = text
        streamingReply = nil
        errorMessage = nil
        phase = .thinking
        player.stop()
        let spokenVoice = voice
        do {
            let result = try await TalkToMeService.streamReply(
                debriefId: debrief?.id,
                message: text,
                followUpId: activeFollowUp?.id
            ) { sentence in
                streamingReply = streamingReply.map { "\($0) \(sentence)" } ?? sentence
                phase = .speaking
                if !muted { player.enqueue(sentence, voice: spokenVoice) }
            }
            debrief = result
            streamingReply = nil
            if !muted { await player.waitUntilDone() }
            resumeListeningIfActive()
        } catch {
            streamingReply = nil
            if case APIError.server(let status, _) = error, status == 409 {
                conversationFull = true
                sessionActive = false
            }
            errorMessage = error.localizedDescription
            phase = .error
        }
    }

    // MARK: - Finishing, saving, continuing

    private func finishSession() async {
        guard let current = debrief else { return }
        sessionActive = false
        recorder.close()
        player.stop()
        showTypeInput = false
        phase = .idle
        finishing = true
        takeawayError = nil
        takeawayLoading = true
        do {
            debrief = try await TalkToMeService.generateTakeaway(debriefId: current.id)
        } catch {
            takeawayError = error.localizedDescription
        }
        takeawayLoading = false
    }

    private func toggleSaved() async {
        guard let current = debrief else { return }
        do {
            debrief = try await TalkToMeService.setSaved(debriefId: current.id, saved: !current.saved)
            await loadSavedTalks()
        } catch {
            takeawayError = error.localizedDescription
        }
    }

    private func turnCheckInOff(debriefId: String) async {
        checkInOff = true
        do {
            try await TalkToMeService.dismissFollowUp(forDebrief: debriefId)
        } catch {
            checkInOff = false
        }
    }

    private func makeCheckInDueNow() async {
        checkInNote = nil
        do {
            let count = try await TalkToMeService.makeFollowUpsDueNow()
            checkInNote = count == 0
                ? "No check-in was scheduled for this session."
                : "Done — the check-in is waiting on Home."
        } catch {
            checkInNote = error.localizedDescription
        }
    }

    private func continuePast(_ talk: Debrief) {
        checkInOff = false
        checkInNote = nil
        debrief = talk
        userTranscript = talk.conversation.last { $0.role == "user" }?.text
        streamingReply = nil
        conversationFull = false
        finishing = false
        beginListening()
    }

    private func startOver() {
        handleStop()
        debrief = nil
        userTranscript = nil
        streamingReply = nil
        conversationFull = false
        errorMessage = nil
        finishing = false
        takeawayError = nil
        activeFollowUp = nil
        checkInOff = false
        checkInNote = nil
        Task { await loadSavedTalks() }
    }

    private func loadSavedTalks() async {
        if let talks = try? await TalkToMeService.savedConversations() {
            savedTalks = talks
        }
    }
}

#Preview {
    TalkToMeView()
        .environmentObject(AuthManager.shared)
}
