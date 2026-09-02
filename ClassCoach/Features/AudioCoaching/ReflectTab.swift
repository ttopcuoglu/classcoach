import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `ReflectTab` — "what stood out", the
/// reflect chat, and the "Your reflection" notes card.
struct ReflectTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    let onUpdate: (AudioSessionWithSegments) -> Void

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
    }

    private var standoutSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("WHAT STOOD OUT THIS SESSION").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
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
                    .padding(10)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
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
                        Button("Start reflecting") { Task { await startReflect() } }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 20).padding(.vertical, 10)
                            .background(AppTheme.primary, in: Capsule())
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
                            .foregroundStyle(message.role == "user" ? Color.white : AppTheme.textPrimary)
                            .padding(10)
                            .background(message.role == "user" ? AppTheme.primary : AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                            .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
                    }
                    if sending {
                        Text("Thinking...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    }
                }

                if let error {
                    Text(error).font(.caption).foregroundStyle(.red)
                }

                if locked {
                    Text("This report is locked — the conversation is read-only.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                } else if turnCapHit {
                    Text("You've reached today's reflection limit for this session.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                } else {
                    HStack {
                        TextField("Say what's on your mind...", text: $draft)
                            .textFieldStyle(.roundedBorder)
                            .disabled(sending)
                        Button("Send") { Task { await sendMessage() } }
                            .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
        .padding()
        .background(AppTheme.background)
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.textSecondary.opacity(0.2)))
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
                    .background(AppTheme.textPrimary, in: Capsule())
                    .disabled(locking)
                }
            }
        }
        .padding()
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func labeledField(_ title: String, text: Binding<String>, minHeight: CGFloat = 40) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            TextEditor(text: text)
                .frame(minHeight: minHeight)
                .padding(6)
                .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 8))
                .disabled(locked)
        }
    }

    // MARK: - Actions

    private var reflectContext: [String] {
        let m = OverviewMetrics(session)
        return AudioInsights.buildReflectContext(session, cfuMetric: m.cfuMetric, redirectionMetric: m.redirectionMetric, directiveMetric: m.directiveMetric, coverage: m.coverage)
    }

    private func startReflect() async {
        sending = true
        error = nil
        do {
            let updated = try await AudioCoachingService.sendReflectMessage(sessionId: session.id, message: nil, context: reflectContext)
            conversation = updated.reflectConversation ?? []
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
        }
        sending = false
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
