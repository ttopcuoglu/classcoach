import SwiftUI

private struct MessagesTool: Identifiable {
    let id = UUID()
    let label: String
    let description: String
    let systemImage: String
}

private let tools: [MessagesTool] = [
    MessagesTool(label: "Write a Message", description: "Create a professional message or response.", systemImage: "envelope.fill"),
    MessagesTool(label: "Prepare for a Meeting", description: "Build an agenda, talking points, and a plan for an upcoming meeting.", systemImage: "checklist"),
    MessagesTool(label: "Practice a Conversation", description: "Role-play with a parent, student, colleague, or administrator.", systemImage: "person.2.fill"),
    MessagesTool(label: "Review My Communication", description: "Get feedback on something already written.", systemImage: "bubble.left.and.text.bubble.right.fill"),
]

/// Badge, icon and card tint per tool, cycling the report palette like the
/// web Communication Coach page.
private let toolStyles: [(badge: Color, icon: Color, tint: Color)] = [
    (AppTheme.terracotta, .white, AppTheme.peachTint.opacity(0.6)),
    (AppTheme.gold, AppTheme.forest, AppTheme.goldTint.opacity(0.7)),
    (AppTheme.teal, .white, AppTheme.mintTint.opacity(0.6)),
    (AppTheme.forest, AppTheme.gold, AppTheme.mintTint.opacity(0.45)),
]

struct MessagesHubView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PanelHeader(
                    eyebrow: "Wivoza · Plan",
                    title: "Communication Coach",
                    subtitle: "Prepare, write, practice, and improve important communication."
                )
                .padding(.bottom, 4)

                ForEach(Array(tools.enumerated()), id: \.element.id) { index, tool in
                    let style = toolStyles[index % toolStyles.count]
                    NavigationLink {
                        destination(for: tool)
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: tool.systemImage)
                                .font(.title3)
                                .foregroundStyle(style.icon)
                                .frame(width: 46, height: 46)
                                .background(style.badge, in: RoundedRectangle(cornerRadius: 14))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(tool.label).font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                                Text(tool.description).font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                            Spacer()
                            Image(systemName: "arrow.right").font(.caption.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                        }
                        .padding(16)
                        .background(style.tint, in: RoundedRectangle(cornerRadius: 20))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Communication Coach")
    }

    @ViewBuilder
    private func destination(for tool: MessagesTool) -> some View {
        switch tool.label {
        case "Write a Message": WriteMessageView()
        case "Prepare for a Meeting": PrepareConversationView()
        case "Practice a Conversation": PracticeConversationView()
        default: ReviewCommunicationView()
        }
    }
}

#Preview {
    MessagesHubView()
}
