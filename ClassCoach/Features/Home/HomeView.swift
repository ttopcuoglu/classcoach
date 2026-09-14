import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var authManager: AuthManager

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let base = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        // Skip a leading honorific ("Ms. Rivera") so the greeting doesn't
        // address someone by a bare title — same rule as the web home page.
        let honorifics: Set<String> = ["mr", "mrs", "ms", "miss", "dr", "prof", "mx"]
        let first = (authManager.currentUser?.name ?? "")
            .split(separator: " ")
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".")) }
            .first { !$0.isEmpty && !honorifics.contains($0.lowercased()) }
        return first.map { "\(base), \($0)" } ?? base
    }

    private var dateLabel: String {
        Date().formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(dateLabel)
                            .font(.caption2.weight(.bold)).tracking(1.4)
                            .foregroundStyle(AppTheme.gold)
                        (Text(greeting) + Text(".").foregroundColor(AppTheme.gold))
                            .font(.heading(.title))
                            .foregroundStyle(.white)
                        Text("What would help you feel more prepared today?")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
                    .padding(.horizontal)
                    .padding(.top, 8)

                    NavigationLink { AudioCoachingView() } label: {
                        FeatureCard(
                            eyebrow: "Lesson Reflection",
                            title: "Lesson Debrief",
                            description: "Record a class and turn classroom talk into focused, judgment-free feedback.",
                            actionLabel: "Record a lesson",
                            systemImage: "mic.fill",
                            iconTint: AppTheme.accent
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { TalkToMeView() } label: {
                        FeatureCard(
                            eyebrow: "Live Coach",
                            title: "Talk It Through",
                            description: "Think out loud. Your coach listens, asks, and helps you find a next step.",
                            actionLabel: "Start voice coaching",
                            systemImage: "headphones",
                            iconTint: AppTheme.primary
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { AskAndPracticeView() } label: {
                        FeatureCard(
                            eyebrow: "Safe Practice",
                            title: "Ask & Practice",
                            description: "Ask a straight question, or rehearse a difficult classroom moment before it happens.",
                            actionLabel: "Ask or rehearse",
                            systemImage: "bubble.left.and.bubble.right.fill",
                            iconTint: AppTheme.Category.disruption
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    NavigationLink { LessonPlanningView() } label: {
                        FeatureCard(
                            eyebrow: "Before Class",
                            title: "Lesson Planning",
                            description: "Strengthen a lesson you wrote, or generate ideas from a clear objective.",
                            actionLabel: "Plan a lesson",
                            systemImage: "doc.text.fill",
                            iconTint: AppTheme.sage
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .background(AppTheme.background)
            .navigationTitle("Wivoza")
        }
    }
}

/// Matches the web home page's feature cards: a tinted card with a solid
/// icon badge, a small eyebrow, a title, a short description and an
/// "action →" prompt.
struct FeatureCard: View {
    let eyebrow: String
    let title: String
    let description: String
    let actionLabel: String
    let systemImage: String
    let iconTint: Color

    private var cardTint: Color {
        switch iconTint {
        case AppTheme.accent: return AppTheme.peachTint.opacity(0.6)
        case AppTheme.Category.disruption: return AppTheme.goldTint.opacity(0.7)
        default: return AppTheme.mintTint.opacity(0.6)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 50, height: 50)
                .background(iconTint, in: RoundedRectangle(cornerRadius: 15))

            Text(eyebrow.uppercased())
                .font(.caption2.weight(.bold)).tracking(1.1)
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.top, 4)

            Text(title)
                .font(.heading(.title3))
                .foregroundStyle(AppTheme.forest)

            Text(description)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("\(actionLabel) →")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.top, 2)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardTint, in: RoundedRectangle(cornerRadius: 24))
    }
}

#Preview {
    HomeView()
        .environmentObject(AuthManager.shared)
}
