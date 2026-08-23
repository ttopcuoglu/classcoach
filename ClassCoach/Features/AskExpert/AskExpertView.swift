import SwiftUI

struct AskExpertView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()

                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(AppTheme.Category.transitions)

                Text("Ask an Expert")
                    .font(.title2.bold())
                    .foregroundStyle(AppTheme.textPrimary)

                Text("Ask an open-ended classroom management question and get a clear, actionable answer — plus a place to save the ones worth remembering.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer()
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(AppTheme.background)
            .navigationTitle("Ask an Expert")
        }
    }
}

#Preview {
    AskExpertView()
}
