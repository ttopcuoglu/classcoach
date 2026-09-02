import SwiftUI

private let starterQuestions = [
    "How do I handle a student who constantly interrupts?",
    "What's a good way to set expectations on day one?",
    "A student refuses to put their phone away — what now?",
    "How do I de-escalate two students arguing in class?",
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
    @State private var incidentText = ""
    @State private var debrief: Debrief?
    @State private var submitting = false
    @State private var error: String?

    @State private var allDebriefs: [Debrief] = []
    @State private var historyLoading = true

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var savedDebriefs: [Debrief] { allDebriefs.filter(\.saved) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                card

                savedSection
            }
            .padding()
        }
        .background(AppTheme.background)
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
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    private var askForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Describe something that happened, or ask a classroom management question — you'll get practical coaching either way.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(starterQuestions, id: \.self) { starter in
                        Button {
                            Task { await submit(starter) }
                        } label: {
                            Text(starter)
                                .font(.caption)
                                .foregroundStyle(AppTheme.textPrimary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .frame(maxWidth: 220, alignment: .leading)
                                .background(AppTheme.background, in: Capsule())
                        }
                        .disabled(submitting)
                    }
                }
            }

            Text("What's going on?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)

            TextEditor(text: $incidentText)
                .frame(minHeight: 120)
                .padding(8)
                .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 10))
                .disabled(submitting)

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Getting feedback..." : "Get Feedback")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
                    .opacity(incidentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(submitting || incidentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    @ViewBuilder
    private func answerView(_ debrief: Debrief) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let category = debrief.category {
                    Text(categoryLabel(category))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(AppTheme.primary.opacity(0.1), in: Capsule())
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
                .background(AppTheme.primary, in: Capsule())
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
                .foregroundStyle(AppTheme.textSecondary)

            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedDebriefs.isEmpty {
                Text("Answers you save will show up here.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
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

    private func submit(_ override: String? = nil) async {
        let text = (override ?? incidentText).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !submitting else { return }
        submitting = true
        error = nil
        do {
            let result = try await AskExpertService.submitDebrief(incidentText: text)
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
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    AskExpertView()
}
