import SwiftUI

private let prepareRecipientChips: [(label: String, value: String?)] =
    CommunicationOptions.conversationPersonTypes.map { ($0.label, $0.value) }
private let meetingTypeChips: [(label: String, value: String?)] =
    CommunicationOptions.meetingTypeChoices.map { ($0.label, $0.value) }
private let meetingFormatChips: [(label: String, value: String?)] =
    CommunicationOptions.meetingFormats.map { ($0.label, $0.value) }
private let personFormatChips: [(label: String, value: String?)] =
    CommunicationOptions.personFormats.map { ($0.label, $0.value) }

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
    @State private var meetingType: String?
    @State private var attendees = ""
    // Two things a teacher prepares for, and they ask for different details: a
    // person has a role, a meeting has a kind and a room full of people. One
    // question up front beats one form carrying both sets.
    @State private var isMeeting = false
    // Once a rehearsal starts every reply is a line in it, not a question about
    // the plan — Coach is in character and the teacher is answering a person.
    @State private var rehearsing = false

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
                PanelHeader(eyebrow: "Wivoza · Communication Coach", title: "Prepare for a Conversation", subtitle: "Describe the conversation you have to have, and get talking points, likely reactions, and the words to use — whether or not it is on a calendar.")
                if let plan {
                    resultView(plan)
                } else {
                    form
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600).frame(maxWidth: .infinity, alignment: .center)
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
            // The fork first: it decides which other questions get asked, so
            // describing the situation is easier once the screen has settled
            // into one shape.
            Text("What are you preparing for?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ChipRow(
                items: [("A person", "person"), ("A scheduled meeting", "meeting")],
                selection: isMeeting ? "meeting" : "person"
            ) { picked in
                isMeeting = picked == "meeting"
                // Switching to a person must not leave the other branch's format
                // set and invisible.
                if !isMeeting, meetingFormat == "formal_meeting" { meetingFormat = nil }
            }

            if isMeeting {
                Text("What kind of meeting?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                ChipRow(items: meetingTypeChips, selection: meetingType) { meetingType = $0 }

                labeledInput("Who will attend? (optional)", text: $attendees, placeholder: "e.g. Mom, Dad, the school counselor")
            } else {
                Text("Who is it with?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                ChipRow(items: prepareRecipientChips, selection: recipientType) { recipientType = $0 }
            }

            Text("How will it happen? (optional)").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ChipRow(items: isMeeting ? meetingFormatChips : personFormatChips, selection: meetingFormat) { meetingFormat = $0 }

            // "What happened?" read as past tense on a screen whose job is
            // mostly what has not happened yet.
            labeledField(
                "What is going on?",
                text: $situationText,
                minHeight: 100,
                placeholder: CommunicationOptions.situationPlaceholder(
                    isMeeting: isMeeting,
                    recipientType: recipientType,
                    meetingType: meetingType
                )
            )

            labeledField("What outcome do you want? (optional)", text: $desiredOutcome, minHeight: 60)
            labeledField("What concerns do you have about the conversation? (optional)", text: $concerns, minHeight: 60)
            labeledField("Relevant background or evidence (optional)", text: $background, minHeight: 60)

            ProgressRing(active: submitting, estimatedSeconds: 16, label: "Building your meeting plan", hint: "Twelve sections — usually about twenty seconds.")

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Building plan..." : "Build Conversation Plan")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(!canSubmit)
        }
    }

    private func labeledField(
        _ title: String,
        text: Binding<String>,
        minHeight: CGFloat,
        placeholder: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            ZStack(alignment: .topLeading) {
                // TextEditor has no placeholder of its own, and this one is the
                // only thing on screen showing how much detail is worth giving.
                if let placeholder, text.wrappedValue.isEmpty {
                    Text(placeholder)
                        .font(.body)
                        .foregroundStyle(AppTheme.textSecondary.opacity(0.7))
                        .padding(.horizontal, 13)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
                TextEditor(text: text)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: minHeight)
                    .padding(8)
                    .disabled(submitting)
            }
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
        }
    }

    private func labeledInput(_ title: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            TextField(placeholder, text: text)
                .textFieldStyle(.plain)
                .padding(12)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
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
                .background(AppTheme.terracotta, in: Capsule())
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
        .background((tint == AppTheme.textSecondary ? AppTheme.gold : tint).opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
    }

    private func followUpChat(_ plan: ConversationPlan) -> some View {
        let followUps = plan.conversation.count > 2 ? Array(plan.conversation.dropFirst(2)) : []
        return VStack(alignment: .leading, spacing: 12) {
            // Rehearsing happens here rather than in Practice. Practice writes
            // you a stranger to argue with; this one already knows the
            // boundaries you set and the phrases you ruled out.
            Button {
                Task { await startRehearsal(plan) }
            } label: {
                Text(rehearsing ? "Rehearsing below" : "Rehearse this conversation")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .disabled(chatSending || rehearsing)

            FollowUpChatView(
                messages: followUps,
                draft: $chatDraft,
                sending: chatSending,
                error: chatError,
                placeholder: rehearsing
                    ? "Say your next line, the way you would actually say it..."
                    : "Ask a follow-up, e.g. 'what if they deny it?'..."
            ) {
                Task { await sendChat(plan) }
            }
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
                recipientType: isMeeting ? nil : recipientType,
                meetingType: isMeeting ? meetingType : nil,
                attendees: isMeeting && !attendees.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? attendees.trimmingCharacters(in: .whitespacesAndNewlines)
                    : nil,
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
            plan = try await CommunicationsService.sendConversationPlanChat(
                id: target.id,
                message: trimmed,
                mode: rehearsing ? "rehearse" : nil
            )
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }

    private func startRehearsal(_ target: ConversationPlan) async {
        guard !chatSending else { return }
        rehearsing = true
        chatSending = true
        chatError = nil
        do {
            plan = try await CommunicationsService.sendConversationPlanChat(
                id: target.id,
                message: "Let us rehearse this. Open as the other person, with their first line.",
                mode: "rehearse"
            )
        } catch {
            chatError = error.localizedDescription
            rehearsing = false
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
