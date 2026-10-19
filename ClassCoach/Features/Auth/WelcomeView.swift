import SwiftUI
import AuthenticationServices
import GoogleSignIn
import GoogleSignInSwift

/// The app's first screen — matches the "01 Welcome" design: a headline,
/// a short pitch, a two-bubble illustration, and three sign-in options
/// (Apple, Google, email) plus a log-in link and legal footer. Email/
/// password exists alongside Google and Apple to satisfy Apple Guideline
/// 4.8 (a third-party login needs a privacy-respecting alternative).
struct WelcomeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                Image("WivozaLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 180)
                    .padding(.top, 24)

                VStack(spacing: 14) {
                    Text("Your teaching.\nYour growth.")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(AppTheme.primary)
                        .multilineTextAlignment(.center)

                    Text("AI coaching for reflection, lesson planning, and everyday teaching challenges.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)

                    AuthIllustration()
                        .padding(.top, 4)
                }

                if isSubmitting {
                    ProgressView()
                        .padding(.vertical, 20)
                } else {
                    VStack(spacing: 12) {
                        SignInWithAppleButton(.continue, onRequest: configureAppleRequest, onCompletion: handleAppleCompletion)
                            .signInWithAppleButtonStyle(.black)
                            .frame(height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                        GoogleSignInButton(style: .wide, action: signInWithGoogle)

                        NavigationLink {
                            EmailAuthView(initialMode: "signup")
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "envelope.fill")
                                Text("Continue with email")
                                    .fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.primary)

                        NavigationLink {
                            EmailAuthView(initialMode: "login")
                        } label: {
                            (Text("Already have an account? ").foregroundStyle(AppTheme.textSecondary)
                                + Text("Log in").foregroundStyle(AppTheme.primary).fontWeight(.semibold))
                                .font(.subheadline)
                        }
                        .padding(.top, 4)
                    }
                    .padding(.horizontal, 24)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.terracotta600)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        Link("Terms of Service", destination: URL(string: "https://www.wivoza.com/terms")!)
                        Text("·").foregroundStyle(AppTheme.textSecondary)
                        Link("Privacy Policy", destination: URL(string: "https://www.wivoza.com/terms")!)
                    }
                    Text(AppInfo.copyright)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                .font(.caption)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
        }
        .background(AppTheme.background)
    }

    private func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
    }

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        errorMessage = nil
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Apple didn't return a sign-in token. Please try again."
                return
            }
            isSubmitting = true
            Task {
                defer { isSubmitting = false }
                do {
                    try await authManager.signInWithApple(identityToken: identityToken)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        case .failure(let error):
            let nsError = error as NSError
            // Code 1001 is the user tapping Cancel — not a real error, stay silent.
            if nsError.domain == ASAuthorizationError.errorDomain, nsError.code == ASAuthorizationError.canceled.rawValue {
                return
            }
            errorMessage = error.localizedDescription
        }
    }

    private func signInWithGoogle() {
        guard let presentingViewController = UIApplication.shared.rootViewController else { return }
        errorMessage = nil
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
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

extension UIApplication {
    var rootViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?.rootViewController
    }
}

#Preview {
    NavigationStack {
        WelcomeView()
    }
    .environmentObject(AuthManager.shared)
}


/// The AI-sharing consent, asked once per account on this phone right after
/// sign-in and before anything is sent to either provider. Apple rejected the
/// app without a yes before sharing (Guideline 5.1.1(i)/5.1.2(i),
/// 2026-09-08); signing in sends nothing to Anthropic or Deepgram, so asking
/// here still asks first. The wording is the one the approved build carried.
struct AIConsentView: View {
    let onAgree: () -> Void
    let onDecline: () -> Void
    @State private var accepted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Text("Before you start").font(.heading(.title)).foregroundStyle(AppTheme.forest)
            HStack(alignment: .top, spacing: 10) {
                Button { accepted.toggle() } label: {
                    Image(systemName: accepted ? "checkmark.square.fill" : "square")
                        .font(.title3)
                        .foregroundStyle(accepted ? AppTheme.primary : AppTheme.textSecondary)
                }
                Text("I agree that responses, recordings, and messages I submit are sent to Anthropic's Claude AI (for coaching feedback and chat) and Deepgram (for transcription and voice playback), as described in our [Privacy Policy](https://www.wivoza.com/terms).")
                    .font(.body)
                    .foregroundStyle(AppTheme.textPrimary)
                    .tint(AppTheme.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(action: onAgree) {
                Text("Continue").fontWeight(.semibold).frame(maxWidth: .infinity).frame(height: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.primary)
            .disabled(!accepted)
            Button("Not now \u{2014} sign out", action: onDecline)
                .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(28)
        .background(AppTheme.background.ignoresSafeArea())
    }
}
