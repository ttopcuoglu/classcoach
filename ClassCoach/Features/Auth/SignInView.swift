import SwiftUI
import GoogleSignIn
import GoogleSignInSwift

struct SignInView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var errorMessage: String?
    @State private var isSigningIn = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 14) {
                Image("WivozaLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 260)
                Text("Classroom management coaching, wherever you are.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            if isSigningIn {
                ProgressView()
            } else {
                GoogleSignInButton(action: signIn)
                    .frame(maxWidth: 280)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
        }
        .padding()
        .background(AppTheme.background)
    }

    private func signIn() {
        guard let presentingViewController = UIApplication.shared.rootViewController else { return }
        errorMessage = nil
        isSigningIn = true
        Task {
            defer { isSigningIn = false }
            do {
                let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)
                guard let idToken = result.user.idToken?.tokenString else {
                    errorMessage = "Google didn't return a sign-in token. Please try again."
                    return
                }
                try await authManager.signInWithGoogle(idToken: idToken)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private extension UIApplication {
    var rootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?.rootViewController
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthManager.shared)
}
