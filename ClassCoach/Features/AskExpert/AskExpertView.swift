import SwiftUI

private let starterQuestions = [
    "How do I handle a student who constantly interrupts?",
    "What's a good way to set expectations on day one?",
    "A student refuses to put their phone away — what now?",
    "How do I de-escalate two students arguing in class?",
]

/// For teachers six or more years in: refinement, not survival. Same list as
/// `EXPERIENCED_STARTERS` in web/src/pages/Ask.tsx.
private let experiencedStarterQuestions = [
    "My discussions are fine — how do I get students building on each other, not just answering me?",
    "How do I push my strongest students without leaving others behind?",
    "My routines work, but they've gone stale. How do I refresh them mid-year?",
    "How can I tell whether my questions are really making students think?",
]

/// Thin wrapper for standalone tab use — see `TryItOutView`'s matching
/// comment for why `AskExpertContent` is separated out.
struct AskExpertView: View {
    var body: some View {
        NavigationStack {
            AskExpertContent()
                .navigationTitle("Ask an Expert")
        }
    }
}

struct AskExpertContent: View {
    /// One of the six focus areas, from the Ask & Practice shell. Nil is the
    /// normal case: the coach works out which area the question belongs to, so
    /// a teacher never has to classify their own problem first. Here the area
    /// only changes which starter questions are on offer.
    var focusArea: String? = nil
    var onPickArea: ((String?) -> Void)? = nil

    @EnvironmentObject private var authManager: AuthManager
    @State private var incidentText = ""
    @State private var debrief: Debrief?
    @State private var submitting = false
    @State private var error: String?
    // Defaulted from the profile, overridable per question — content and
    // delivery questions are unanswerable without them.
    @State private var room = TeachingContextValue()
    @State private var showContext = false

    @State private var allDebriefs: [Debrief] = []
    @State private var historyLoading = true

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var savedDebriefs: [Debrief] { allDebriefs.filter(\.saved) }
    private var area: FocusArea? { findFocusArea(focusArea) }

    private var starters: [String] {
        if let area { return area.askStarters }
        return ExperienceLevel.isExperienced(authManager.currentUser?.experienceLevel) ? experiencedStarterQuestions : starterQuestions
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if debrief == nil {
                    PanelHeader(
                        eyebrow: "Ask your coach",
                        title: "What's going on?",
                        subtitle: area.map {
                            "Describe something that happened, or ask a question about \($0.label.lowercased()) — you'll get practical coaching either way."
                        } ?? "Describe something that happened, or ask a question about any part of the job — you'll get practical coaching either way."
                    )
                }

                card

                savedSection
            }
            .padding()
        }
        .background(AppTheme.background)
        .onAppear(perform: seedTeachingContext)
        .task { await loadHistory() }
    }

    // MARK: - Main card

    @ViewBuilder
    private var card: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let debrief {
                answerView(debrief)
            } else {
                askForm
            }

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.terracotta600)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(AppTheme.hairline))
    }

    private var askForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("In your own words")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)

            TextEditor(text: $incidentText)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 120)
                .padding(8)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                .disabled(submitting)

            teachingContextRow

            ProgressRing(active: submitting, estimatedSeconds: 9, label: "Reading what you wrote", hint: "Usually about ten seconds.")

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Getting feedback..." : "Get Feedback")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(incidentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AppTheme.textSecondary.opacity(0.35) : AppTheme.terracotta, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(submitting || incidentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            Text("OR START WITH ONE OF THESE")
                .font(.caption2.weight(.bold)).tracking(0.8)
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.top, 4)
            // The six areas sit with the examples rather than above the text
            // box: on Ask the coach infers the area, so this is a way to browse,
            // not a step to complete.
            ChipRow(items: focusAreaChips(anyLabel: "All"), selection: focusArea) { onPickArea?($0) }
            ForEach(Array(starters.enumerated()), id: \.offset) { index, starter in
                Button {
                    Task { await submit(starter) }
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Text(starter)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(AppTheme.forest)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.terracotta)
                            .padding(.top, 3)
                    }
                    .padding(12)
                    .background([AppTheme.peachTint, AppTheme.goldTint, AppTheme.mintTint][index % 3], in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(submitting)
            }
        }
    }

    /// Always visible: what room this is isn't optional context, it's what
    /// separates coaching about a 4th grade math lesson from coaching about an
    /// AP Calculus section. It used to sit behind a "Change" fold.
    private var teachingContextRow: some View {
        TeachingContextFields(value: $room)
    }

    @ViewBuilder
    private func answerView(_ debrief: Debrief) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                // Which of the six this was coached as — the teacher's pick, or
                // the coach's read when they didn't pick one.
                if let areaLabel = focusAreaLabel(debrief.focusArea ?? focusAreaForCategory(debrief.category)?.value) {
                    Text(areaLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.cream)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(AppTheme.primary, in: Capsule())
                }
                if let course = debrief.course ?? debrief.subject {
                    Text([course, debrief.courseLevel].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.textSecondary)
                }
                if let category = debrief.category {
                    Text(categoryLabel(category))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(AppTheme.mintTint, in: Capsule())
                }
                Text("WHAT HAPPENED")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(AppTheme.textSecondary)
                Text(debrief.incidentText)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
            }

            if let feedback = debrief.feedback {
                labeledBlock(title: "COACHING", text: feedback, tint: AppTheme.accent)
            }
            if let followUp = debrief.followUp {
                labeledBlock(title: "FOLLOWING UP", text: followUp, tint: AppTheme.primary)
            }

            followUpChat(debrief)

            HStack {
                Button {
                    Task { await toggleSaved(debrief) }
                } label: {
                    Label(debrief.saved ? "Saved" : "Save for later", systemImage: debrief.saved ? "star.fill" : "star")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(debrief.saved ? AppTheme.accent : AppTheme.textSecondary)

                Spacer()

                Button("Ask Something Else") {
                    askAnother()
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(AppTheme.terracotta, in: Capsule())
            }
        }
    }

    private func labeledBlock(title: String, text: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.weight(.bold))
                .foregroundStyle(tint)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 10))
    }

    private func followUpChat(_ debrief: Debrief) -> some View {
        let followUps = debrief.conversation.count > 2 ? Array(debrief.conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps,
            draft: $chatDraft,
            sending: chatSending,
            error: chatError,
            placeholder: "Ask a follow-up about this feedback..."
        ) {
            Task { await sendChat(debrief) }
        }
    }

    // MARK: - Saved section

    private var savedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("SAVED")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.terracotta600)

            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedDebriefs.isEmpty {
                Text("Answers you save will show up here.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            } else {
                ForEach(savedDebriefs) { saved in
                    SavedDebriefRow(debrief: saved)
                }
            }
        }
    }

    // MARK: - Actions

    private func loadHistory() async {
        do {
            allDebriefs = try await AskExpertService.getDebriefs()
        } catch {
            // Best-effort — an empty saved list is a fine fallback.
        }
        historyLoading = false
    }

    /// Same profile-to-grade-band rules as web/src/pages/Ask.tsx.
    private func seedTeachingContext() {
        guard let user = authManager.currentUser else { return }
        room.gradeBand = bandFromProfile(user.gradeLevels)
        if room.subject == nil, let mapped = subjectFromProfile(user.subjects) {
            room.subject = mapped
            // A profile subject that isn't one of the six lands in "Other".
            room.usingOtherSubject = !subjects.contains(mapped)
        }
    }

    private func submit(_ override: String? = nil) async {
        let text = (override ?? incidentText).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !submitting else { return }
        submitting = true
        error = nil
        do {
            let result = try await AskExpertService.submitDebrief(
                incidentText: text, focusArea: focusArea, gradeBand: room.gradeBand,
                subject: room.subject, course: room.course, courseLevel: room.courseLevel
            )
            debrief = result
            allDebriefs.insert(result, at: 0)
        } catch {
            self.error = "Could not get coaching feedback. Please try again."
        }
        submitting = false
    }

    private func askAnother() {
        debrief = nil
        incidentText = ""
        error = nil
        chatDraft = ""
        chatError = nil
    }

    private func toggleSaved(_ target: Debrief) async {
        let nextSaved = !target.saved
        do {
            let updated = try await AskExpertService.setSaved(debriefId: target.id, saved: nextSaved)
            debrief = updated
            if let index = allDebriefs.firstIndex(where: { $0.id == target.id }) {
                allDebriefs[index] = updated
            }
        } catch {
            // Leave state unchanged on failure — user can retry the tap.
        }
    }

    private func sendChat(_ target: Debrief) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            debrief = try await AskExpertService.sendChat(debriefId: target.id, message: trimmed)
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }
}

private struct SavedDebriefRow: View {
    let debrief: Debrief
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let category = debrief.category {
                            Text(categoryLabel(category))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(AppTheme.primary)
                        }
                        Text(debrief.incidentText)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    Text(expanded ? "Hide" : "Show")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    if let feedback = debrief.feedback {
                        Text("COACHING").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.accent)
                        Text(feedback).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                    if let followUp = debrief.followUp {
                        Text("FOLLOWING UP").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                        Text(followUp).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

#Preview {
    AskExpertView()
        .environmentObject(AuthManager.shared)
}
