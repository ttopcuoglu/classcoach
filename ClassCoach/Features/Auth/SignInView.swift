import SwiftUI

/// Entry point for signed-out users — just wraps `WelcomeView` in a
/// `NavigationStack` so it can push `EmailAuthView`.
struct SignInView: View {
    var body: some View {
        NavigationStack {
            WelcomeView()
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthManager.shared)
}
