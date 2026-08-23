import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PlaceholderCard(
                        title: "Daily Tip",
                        subtitle: "A short, practical classroom management tip will appear here each day.",
                        systemImage: "lightbulb.fill",
                        tint: AppTheme.accent
                    )

                    PlaceholderCard(
                        title: "Try It Out",
                        subtitle: "Jump into a scenario and practice how you'd respond.",
                        systemImage: "figure.2.arms.open",
                        tint: AppTheme.primary
                    )

                    PlaceholderCard(
                        title: "Ask an Expert",
                        subtitle: "Get a clear, actionable answer to a classroom management question.",
                        systemImage: "bubble.left.and.bubble.right.fill",
                        tint: AppTheme.Category.transitions
                    )

                    PlaceholderCard(
                        title: "Recent Activity",
                        subtitle: "A snapshot of scenarios you've practiced and questions you've asked will show up here.",
                        systemImage: "clock.arrow.circlepath",
                        tint: AppTheme.sage
                    )
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("ClassCoach")
        }
    }
}

/// Shared placeholder card used across tabs until each feature is fully built out.
struct PlaceholderCard: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var tint: Color = AppTheme.primary

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: systemImage)
                .font(.title2)
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(AppTheme.textPrimary)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }

            Spacer(minLength: 0)
        }
        .padding()
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    HomeView()
}
