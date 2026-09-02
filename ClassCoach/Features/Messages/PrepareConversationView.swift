import SwiftUI

private let prepareRecipientChips: [(label: String, value: String?)] =
    CommunicationOptions.recipientTypes.map { ($0.label, $0.value) }
private let meetingFormatChips: [(label: String, value: String?)] =
    CommunicationOptions.meetingFormats.map { ($0.label, $0.value) }

private let planSectionsBeforeModel: [(key: KeyPath<ConversationPlanContent, String>, label: String)] = [
    (\.opening, "Suggested opening"),
    (\.mainConcern, "Main concern"),
    (\.facts, "Important facts to present"),
    (\.questions, "Questions to ask"),
    (\.reactions, "Possible reactions"),
    (\.recommendedResponses, "Recommended responses"),
    (\.phrasesToAvoid, "Phrases to avoid"),
    (\.boundaries, "Boundaries to maintain"),
    (\.closing, "Suggested closing"),
]

private let planSectionsAfterModel: [(key: KeyPath<ConversationPlanContent, String>, label: String)] = [
    (\.nextSteps, "Next steps"),
    (\.adminInvolvement, "When to involve an administrator"),
]

struct PrepareConversationView: View {
    @State private var recipientType: String?
    @State private var situationText = ""
    @State private var desiredOutcome = ""
    @State private var concerns = ""
    @State private var background = ""
    @State private var meetingFormat: String?

    @State private var submitting = false
    @State private var error: String?
    @State private var plan: ConversationPlan?

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var canSubmit: Bool { !situationText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let plan {
                    resultView(plan)
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
        .navigationTitle("Prepare for a Conversation")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Who are you speaking with?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ChipRow(items: prepareRecipientChips, selection: recipientType) { recipientType = $0 }

            labeledField("What happened?", text: $situationText, minHeight: 80)
            labeledField("What outcome do you want? (optional)", text: $desiredOutcome, minHeight: 60)
            labeledField("What concerns do you have about the conversation? (optional)", text: $concerns, minHeight: 60)
            labeledField("Relevant background or evidence (optional)", text: $background, minHeight: 60)

            Text("Meeting format").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ChipRow(items: meetingFormatChips, selection: meetingFormat) { meetingFormat = $0 }

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Building plan..." : "Build Conversation Plan")
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

    private func labeledField(_ title: String, text: Binding<String>, minHeight: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            TextEditor(text: text)
                .frame(minHeight: minHeight)
                .padding(8)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                .disabled(submitting)
        }
    }

    @ViewBuilder
    private func resultView(_ plan: ConversationPlan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text(plan.situationText).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Button {
                    Task { await toggleSaved(plan) }
                } label: {
                    Label(plan.saved ? "Saved" : "Save", systemImage: plan.saved ? "star.fill" : "star")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(plan.saved ? AppTheme.accent : AppTheme.textSecondary)
            }

            if let content = plan.planContent {
                ForEach(planSectionsBeforeModel, id: \.label) { section in
                    let value = content[keyPath: section.key]
                    if !value.isEmpty {
                        labeledBlock(section.label.uppercased(), value, AppTheme.textSecondary)
                    }
                }
                if !content.modelResponse.isEmpty {
                    labeledBlock("A MODEL RESPONSE", content.modelResponse, AppTheme.primary)
                }
                ForEach(planSectionsAfterModel, id: \.label) { section in
                    let value = content[keyPath: section.key]
                    if !value.isEmpty {
                        labeledBlock(section.label.uppercased(), value, AppTheme.textSecondary)
                    }
                }
            }

            followUpChat(plan)

            Button("New Plan") { newPlan() }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(AppTheme.primary, in: Capsule())
                .frame(maxWidth: .infinity, alignment: .trailing)
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

    private func followUpChat(_ plan: ConversationPlan) -> some View {
        let followUps = plan.conversation.count > 2 ? Array(plan.conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps,
            draft: $chatDraft,
            sending: chatSending,
            error: chatError,
            placeholder: "Ask a follow-up, e.g. 'what if they deny it?'..."
        ) {
            Task { await sendChat(plan) }
        }
    }

    // MARK: - Actions

    private func submit() async {
        guard canSubmit else { return }
        submitting = true
        error = nil
        do {
            plan = try await CommunicationsService.submitConversationPlan(
                situationText: situationText.trimmingCharacters(in: .whitespacesAndNewlines),
                recipientType: recipientType,
                desiredOutcome: desiredOutcome.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : desiredOutcome,
                concerns: concerns.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : concerns,
                background: background.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : background,
                meetingFormat: meetingFormat
            )
            chatDraft = ""
            chatError = nil
        } catch {
            self.error = error.localizedDescription
        }
        submitting = false
    }

    private func sendChat(_ target: ConversationPlan) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            plan = try await CommunicationsService.sendConversationPlanChat(id: target.id, message: trimmed)
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }

    private func toggleSaved(_ target: ConversationPlan) async {
        do {
            plan = try await CommunicationsService.setConversationPlanSaved(id: target.id, saved: !target.saved)
        } catch {
            // Leave state unchanged on failure — user can retry the tap.
        }
    }

    private func newPlan() {
        plan = nil
        situationText = ""
        desiredOutcome = ""
        concerns = ""
        background = ""
        error = nil
        chatDraft = ""
        chatError = nil
    }
}

#Preview {
    NavigationStack { PrepareConversationView() }
}
