import SwiftUI

private struct MessagesTool: Identifiable {
    let id = UUID()
    let label: String
    let description: String
    let systemImage: String
}

private let tools: [MessagesTool] = [
    MessagesTool(label: "Write a Message", description: "Create a professional message or response.", systemImage: "envelope.fill"),
    MessagesTool(label: "Prepare for a Conversation", description: "Build talking points for a real situation.", systemImage: "checklist"),
    MessagesTool(label: "Practice a Conversation", description: "Role-play with a parent, student, colleague, or administrator.", systemImage: "person.2.fill"),
    MessagesTool(label: "Review My Communication", description: "Get feedback on something already written.", systemImage: "bubble.left.and.text.bubble.right.fill"),
]

struct MessagesHubView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Write, prepare, practice, or review — pick what you need right now.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)

                    ForEach(tools) { tool in
                        NavigationLink {
                            destination(for: tool)
                        } label: {
                            HStack(spacing: 14) {
                                Image(systemName: tool.systemImage)
                                    .font(.title2)
                                    .foregroundStyle(AppTheme.primary)
                                    .frame(width: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tool.label).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                                    Text(tool.description).font(.caption).foregroundStyle(AppTheme.textSecondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                            .padding()
                            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Messages")
        }
    }

    @ViewBuilder
    private func destination(for tool: MessagesTool) -> some View {
        switch tool.label {
        case "Write a Message": WriteMessageView()
        case "Prepare for a Conversation": PrepareConversationView()
        case "Practice a Conversation": PracticeConversationView()
        default: ReviewCommunicationView()
        }
    }
}

#Preview {
    MessagesHubView()
}
