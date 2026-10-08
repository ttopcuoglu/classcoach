import SwiftUI

/// The two nav sections — Grow and Plan — as tabs whose root is a list of the
/// tools inside them.
///
/// Why these exist: a phone's TabView shows four items and sweeps the rest into
/// a system "More" list. There were seven tabs, so Planning Coach,
/// Communication Coach and Profile were all buried in it — and Home had grown
/// extra cards to compensate for tools nobody could find. The web settled on
/// slots, Home / Talk / Grow / Plan / You, and that fits.
///
/// The web's phone bar makes Grow and Plan menus rather than pages: tapping
/// one opens a short list of its tools. This is the same information
/// architecture in the idiom that suits iOS — a section is a tab, and its tools
/// push from a list. Labels and subtitles are the web's, verbatim.

private let hubStyles: [(badge: Color, icon: Color, tint: Color)] = [
    (AppTheme.terracotta, .white, AppTheme.peachTint.opacity(0.6)),
    (AppTheme.gold, AppTheme.forest, AppTheme.goldTint.opacity(0.7)),
    (AppTheme.teal, .white, AppTheme.mintTint.opacity(0.6)),
]

/// One row, styled like Communication Coach's hub so the two read as the same
/// kind of screen.
private struct HubRow: View {
    let index: Int
    let label: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        let style = hubStyles[index % hubStyles.count]
        return HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(style.icon)
                .frame(width: 46, height: 46)
                .background(style.badge, in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 3) {
                Text(label).font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                Text(subtitle).font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            Spacer()
            Image(systemName: "arrow.right").font(.caption.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
        }
        .padding(16)
        .background(style.tint, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct GrowHubView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    PanelHeader(
                        eyebrow: "Wivoza · Grow",
                        title: "Grow",
                        subtitle: "Reflect on a lesson you taught, or rehearse a moment before it happens."
                    )
                    .padding(.bottom, 4)

                    NavigationLink { AudioCoachingView() } label: {
                        HubRow(index: 0, label: "Lesson Debrief", subtitle: "recorded-lesson report", systemImage: "mic.fill")
                    }
                    .buttonStyle(.plain)

                    NavigationLink { PracticeView() } label: {
                        HubRow(index: 1, label: "Practice", subtitle: "rehearse a moment", systemImage: "bubble.left.and.bubble.right.fill")
                    }
                    .buttonStyle(.plain)
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Grow")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct PlanHubView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    PanelHeader(
                        eyebrow: "Wivoza · Plan",
                        title: "Plan",
                        subtitle: "Build or sharpen what you are about to teach, and what you are about to send."
                    )
                    .padding(.bottom, 4)

                    // These two own no NavigationStack of their own — they used
                    // to rely on the system More list supplying one, so this
                    // stack is now what they push inside.
                    NavigationLink { LessonPlanningView() } label: {
                        HubRow(
                            index: 0,
                            label: "Planning Coach",
                            subtitle: "lessons, slides & assignments",
                            systemImage: "doc.text.fill"
                        )
                    }
                    .buttonStyle(.plain)

                    NavigationLink { MessagesHubView() } label: {
                        HubRow(
                            index: 1,
                            label: "Communication Coach",
                            subtitle: "write, prepare & review",
                            systemImage: "envelope.fill"
                        )
                    }
                    .buttonStyle(.plain)
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Plan")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview("Grow") { GrowHubView().environmentObject(AuthManager.shared) }
#Preview("Plan") { PlanHubView().environmentObject(AuthManager.shared) }
