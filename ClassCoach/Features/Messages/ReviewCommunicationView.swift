import SwiftUI

private let reviewModeChips: [(label: String, value: String?)] =
    CommunicationOptions.reviewModes.map { ($0.label, $0.value) }

struct ReviewCommunicationView: View {
    @State private var situationText = ""
    @State private var responseText = ""
    @State private var reviewMode = "both"
    @State private var submitting = false
    @State private var error: String?
    @State private var prep: ConversationPrep?

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var canSubmit: Bool {
        !situationText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let prep {
                    resultView(prep)
                } else {
                    form
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Review My Communication")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Message or communication you received").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                TextEditor(text: $situationText)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                    .disabled(submitting)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Your planned response").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                TextEditor(text: $responseText)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                    .disabled(submitting)
            }

            Text("Review option").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ChipRow(items: reviewModeChips, selection: reviewMode) { reviewMode = $0 ?? "both" }

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Reviewing..." : "Review My Communication")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(!canSubmit)
        }
    }

    @ViewBuilder
    private func resultView(_ prep: ConversationPrep) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("MESSAGE RECEIVED").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                Text(prep.situationText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                Text("YOUR PLANNED RESPONSE").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary).padding(.top, 4)
                Text(prep.responseText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            }

            if let feedback = prep.feedback {
                labeledBlock("COACHING", feedback, AppTheme.accent)
            }
            if let modelResponse = prep.modelResponse {
                labeledBlock("REVISED RESPONSE", modelResponse, AppTheme.primary)
            }

            followUpChat(prep)

            HStack {
                Button {
                    Task { await toggleSaved(prep) }
                } label: {
                    Label(prep.saved ? "Saved" : "Save for later", systemImage: prep.saved ? "star.fill" : "star")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(prep.saved ? AppTheme.accent : AppTheme.textSecondary)
                Spacer()
                Button("Start Over") { startOver() }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
        }
    }

    private func labeledBlock(_ title: String, _ text: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption2.weight(.bold)).foregroundStyle(tint)
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
    }

    private func followUpChat(_ prep: ConversationPrep) -> some View {
        let followUps = prep.conversation.count > 2 ? Array(prep.conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps,
            draft: $chatDraft,
            sending: chatSending,
            error: chatError,
            placeholder: "Ask a follow-up, e.g. 'why does this sound defensive?'..."
        ) {
            Task { await sendChat(prep) }
        }
    }

    // MARK: - Actions

    private func submit() async {
        guard canSubmit else { return }
        submitting = true
        error = nil
        do {
            prep = try await CommunicationsService.submitConversationPrep(
                situationText: situationText.trimmingCharacters(in: .whitespacesAndNewlines),
                responseText: responseText.trimmingCharacters(in: .whitespacesAndNewlines),
                source: "review",
                reviewMode: reviewMode
            )
            chatDraft = ""
            chatError = nil
        } catch {
            self.error = error.localizedDescription
        }
        submitting = false
    }

    private func sendChat(_ target: ConversationPrep) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            prep = try await CommunicationsService.sendConversationPrepChat(id: target.id, message: trimmed)
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }

    private func toggleSaved(_ target: ConversationPrep) async {
        do {
            prep = try await CommunicationsService.setConversationPrepSaved(id: target.id, saved: !target.saved)
        } catch {
            // Leave state unchanged on failure — user can retry the tap.
        }
    }

    private func startOver() {
        prep = nil
        situationText = ""
        responseText = ""
        error = nil
        chatDraft = ""
        chatError = nil
    }
}

#Preview {
    NavigationStack { ReviewCommunicationView() }
}
