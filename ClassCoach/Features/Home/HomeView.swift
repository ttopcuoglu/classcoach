import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Explore your coaching space")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(AppTheme.textPrimary)
                        .padding(.horizontal)
                        .padding(.top, 8)

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

/// Matches the web home page's feature-card design: a soft icon badge, a
/// small bold eyebrow label, a title, a short description, and a bold
/// "action →" prompt at the bottom, on a white card with a decorative
/// tinted blob in the corner.
struct FeatureCard: View {
    let eyebrow: String
    let title: String
    let description: String
    let actionLabel: String
    let systemImage: String
    let iconTint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(iconTint)
                .frame(width: 52, height: 52)
                .background(iconTint.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))

            Text(eyebrow.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.accent)

            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(AppTheme.textPrimary)

            Text(description)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("\(actionLabel) ↗")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(AppTheme.accent)
                .padding(.top, 2)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack(alignment: .topTrailing) {
                Color.white
                Circle()
                    .fill(iconTint.opacity(0.12))
                    .frame(width: 100, height: 100)
                    .offset(x: 35, y: -35)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Color.black.opacity(0.06)))
    }
}

#Preview {
    HomeView()
}
