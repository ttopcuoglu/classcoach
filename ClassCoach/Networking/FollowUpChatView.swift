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
    /// Shows a Speak button inside the box; spoken words are added to the draft.
    var speakable = false
    let onSend: () -> Void
    @StateObject private var dictation = BoxDictation()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(messages.enumerated()), id: \.offset) { _, message in
                Text(message.text)
                    .font(.subheadline)
                    .foregroundStyle(message.role == "user" ? AppTheme.cream : AppTheme.textPrimary)
                    .padding(12)
                    .background(message.role == "user" ? AppTheme.forest : AppTheme.mintTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
                    .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
            }

            ProgressRing(active: sending, estimatedSeconds: 8, label: "Wivoza is thinking…", size: 44)

            if let error {
                Text(error).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
            if speakable, let dictationError = dictation.error {
                Text(dictationError).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }

            HStack {
                if speakable {
                    TextField(placeholder, text: $draft)
                        .padding(.vertical, 8)
                        .padding(.leading, 10)
                        .padding(.trailing, dictation.isListening("chat") ? 190 : dictation.isWriting("chat") ? 150 : 92)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(
                            dictation.isListening("chat") ? AppTheme.terracotta : AppTheme.hairline,
                            lineWidth: dictation.isListening("chat") ? 2 : 1
                        ))
                        .overlay(alignment: .trailing) {
                            SpeakInBoxButton(listening: dictation.isListening("chat"), writing: dictation.isWriting("chat")) {
                                dictation.toggle("chat") { spoken in draft = draft.appendingSpoken(spoken) }
                            }
                            .padding(.trailing, 4)
                        }
                        .disabled(sending)
                } else {
                    TextField(placeholder, text: $draft)
                        .textFieldStyle(.roundedBorder)
                        .disabled(sending)
                }
                Button(action: {
                    dictation.cancel()
                    onSend()
                }) {
                    Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(AppTheme.terracotta)
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .onDisappear { dictation.cancel() }
    }
}
