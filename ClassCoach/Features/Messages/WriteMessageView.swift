import SwiftUI
import UIKit

private let anyRecipient: [(label: String, value: String?)] =
    [("Any recipient", nil)] + CommunicationOptions.recipientTypes.map { ($0.label, $0.value) }
private let anyPurpose: [(label: String, value: String?)] =
    [("Any purpose", nil)] + CommunicationOptions.messagePurposes.map { ($0.label, $0.value) }
private let anyFormat: [(label: String, value: String?)] =
    [("Any format", nil)] + CommunicationOptions.messageFormats.map { ($0.label, $0.value) }
private let toneChips: [(label: String, value: String?)] =
    CommunicationOptions.messageTones.map { ($0.label, $0.value) }
private let startingActionChips: [(label: String, value: String?)] =
    CommunicationOptions.startingActions.map { ($0.label, $0.value) }

private func labelFor(_ value: String?, in options: [(label: String, value: String)]) -> String? {
    guard let value else { return nil }
    return options.first { $0.value == value }?.label
}

struct WriteMessageView: View {
    @State private var startingAction = "new"
    @State private var incidentSummary = ""
    @State private var receivedMessage = ""
    @State private var contextNotes = ""
    @State private var existingDraft = ""
    @State private var recipientType: String?
    @State private var purpose: String?
    @State private var format: String?
    @State private var tone = "warm"

    @State private var drafting = false
    @State private var error: String?
    @State private var current: ParentMessage?
    @State private var copied = false

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var inputText: String {
        switch startingAction {
        case "respond": return receivedMessage
        case "improve": return existingDraft
        default: return incidentSummary
        }
    }
    private var canDraft: Bool { !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !drafting }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let current {
                    resultView(current)
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
        .navigationTitle("Write a Message")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            ChipRow(items: startingActionChips, selection: startingAction) { startingAction = $0 ?? "new" }

            ChipRow(items: anyRecipient, selection: recipientType) { recipientType = $0 }
            ChipRow(items: anyPurpose, selection: purpose) { purpose = $0 }
            ChipRow(items: anyFormat, selection: format) { format = $0 }
            ChipRow(items: toneChips, selection: tone) { tone = $0 ?? "warm" }

            switch startingAction {
            case "respond":
                labeledField("The message you received", text: $receivedMessage)
                labeledField("Important facts or context (optional)", text: $contextNotes, minHeight: 60)
            case "improve":
                labeledField("Your existing draft", text: $existingDraft)
            default:
                labeledField("Briefly describe what happened and what you need to communicate", text: $incidentSummary)
            }

            Button {
                Task { await draft() }
            } label: {
                Text(drafting ? "Drafting..." : "Generate Message")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(!canDraft)
        }
    }

    private func labeledField(_ title: String, text: Binding<String>, minHeight: CGFloat = 100) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            TextEditor(text: text)
                .frame(minHeight: minHeight)
                .padding(8)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                .disabled(drafting)
        }
    }

    @ViewBuilder
    private func resultView(_ message: ParentMessage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if let label = labelFor(message.recipientType, in: CommunicationOptions.recipientTypes) {
                    Text(label)
                }
                if let label = labelFor(message.purpose, in: CommunicationOptions.messagePurposes) {
                    Text("· \(label)")
                }
                Text("· \(labelFor(message.tone, in: CommunicationOptions.messageTones) ?? message.tone)")
                if let label = labelFor(message.format, in: CommunicationOptions.messageFormats) {
                    Text("· \(label)")
                }
            }
            .font(.caption)
            .foregroundStyle(AppTheme.textSecondary)

            VStack(alignment: .leading, spacing: 10) {
                Text(message.draftText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                HStack {
                    Button {
                        Task { await toggleSaved(message) }
                    } label: {
                        Label(message.saved ? "Saved" : "Save for later", systemImage: message.saved ? "star.fill" : "star")
                            .font(.subheadline.weight(.medium))
                    }
                    .foregroundStyle(message.saved ? AppTheme.accent : AppTheme.textSecondary)
                    Spacer()
                    Button(copied ? "Copied" : "Copy") {
                        UIPasteboard.general.string = message.draftText
                        copied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                    }
                    .font(.subheadline.weight(.semibold))
                }
            }
            .padding(12)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))

            followUpChat(message)

            Button("Start a New Message") { startOver() }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(AppTheme.primary, in: Capsule())
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private func followUpChat(_ message: ParentMessage) -> some View {
        let followUps = message.conversation.count > 2 ? Array(message.conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps,
            draft: $chatDraft,
            sending: chatSending,
            error: chatError,
            placeholder: "Ask for a revision, e.g. 'make it warmer'..."
        ) {
            Task { await sendChat(message) }
        }
    }

    // MARK: - Actions

    private func draft() async {
        drafting = true
        error = nil
        do {
            current = try await CommunicationsService.draftParentMessage(
                startingAction: startingAction,
                incidentSummary: startingAction == "new" ? incidentSummary.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                receivedMessage: startingAction == "respond" ? receivedMessage.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                contextNotes: startingAction == "respond" ? contextNotes.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                existingDraft: startingAction == "improve" ? existingDraft.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                recipientType: recipientType,
                purpose: purpose,
                format: format,
                tone: tone
            )
            chatDraft = ""
            chatError = nil
        } catch {
            self.error = error.localizedDescription
        }
        drafting = false
    }

    private func sendChat(_ target: ParentMessage) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            current = try await CommunicationsService.sendParentMessageChat(id: target.id, message: trimmed)
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }

    private func toggleSaved(_ target: ParentMessage) async {
        do {
            current = try await CommunicationsService.setParentMessageSaved(id: target.id, saved: !target.saved)
        } catch {
            // Leave state unchanged on failure — user can retry the tap.
        }
    }

    private func startOver() {
        current = nil
        incidentSummary = ""
        receivedMessage = ""
        contextNotes = ""
        existingDraft = ""
        error = nil
        chatDraft = ""
        chatError = nil
    }
}

#Preview {
    NavigationStack { WriteMessageView() }
}
