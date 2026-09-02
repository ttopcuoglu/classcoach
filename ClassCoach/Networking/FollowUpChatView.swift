import SwiftUI

/// Shared follow-up chat thread — used wherever a one-shot Claude result
/// (attempt feedback, debrief, parent message, conversation prep/plan) can
/// be refined with a conversational back-and-forth. Callers pass the
/// already-trimmed history (typically `conversation.dropFirst(2)`, skipping
/// the seeded submission + first reply — see server/src/lib/coachingChat.ts).
struct FollowUpChatView: View {
    let messages: [ChatMessage]
    @Binding var draft: String
    let sending: Bool
    let error: String?
    let placeholder: String
    let onSend: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(messages.enumerated()), id: \.offset) { _, message in
                Text(message.text)
                    .font(.subheadline)
                    .foregroundStyle(message.role == "user" ? AppTheme.textPrimary : AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
            }

            if let error {
                Text(error).font(.caption).foregroundStyle(.red)
            }

            HStack {
                TextField(placeholder, text: $draft)
                    .textFieldStyle(.roundedBorder)
                    .disabled(sending)
                Button(action: onSend) {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}
