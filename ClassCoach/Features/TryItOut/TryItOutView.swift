import SwiftUI

struct TryItOutView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()

                Image(systemName: "figure.2.arms.open")
                    .font(.system(size: 48))
                    .foregroundStyle(AppTheme.primary)

                Text("Try It Out")
                    .font(.title2.bold())
                    .foregroundStyle(AppTheme.textPrimary)

                Text("Practice realistic classroom management scenarios, get feedback on your approach, and build a library of strategies that work for you.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Button {
                    // Scenario generation coming soon
                } label: {
                    Text("New Scenario")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(AppTheme.primary, in: Capsule())
                }
                .padding(.top, 8)

                Spacer()
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(AppTheme.background)
            .navigationTitle("Try It Out")
        }
    }
}

#Preview {
    TryItOutView()
}
