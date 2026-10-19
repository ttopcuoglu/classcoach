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
    /// The AI-sharing consent, at the foot of the screen. Signing up through
    /// Apple, Google or email waits for it.
    @State private var aiAccepted = false
    @State private var showingShared = false

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
                            .disabled(!aiAccepted)
                            .opacity(aiAccepted ? 1 : 0.4)

                        GoogleSignInButton(style: .wide, action: signInWithGoogle)
                            .disabled(!aiAccepted)
                            .opacity(aiAccepted ? 1 : 0.4)

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
                        .disabled(!aiAccepted)
                        .opacity(aiAccepted ? 1 : 0.4)

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

                // Short, at the foot: who receives what, with the detail one tap
                // away. Apple rejected the app without a yes before sharing
                // (Guideline 5.1.1(i)/5.1.2(i), 2026-09-08).
                HStack(alignment: .top, spacing: 8) {
                    Button { aiAccepted.toggle() } label: {
                        Image(systemName: aiAccepted ? "checkmark.square.fill" : "square")
                            .foregroundStyle(aiAccepted ? AppTheme.primary : AppTheme.textSecondary)
                    }
                    (Text("I agree my recordings and messages are sent to Anthropic (Claude AI) and Deepgram to run Wivoza. ")
                        + Text("What\u{2019}s shared").foregroundColor(AppTheme.primary).fontWeight(.semibold))
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .onTapGesture { showingShared = true }
                }
                .padding(.horizontal, 28)
                .padding(.top, 8)
                .sheet(isPresented: $showingShared) { AISharedDetails() }

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


/// What "What's shared" opens: who receives a teacher's data and what each
/// gets — the disclosure Apple asks for (Guideline 5.1.1(i)/5.1.2(i)).
struct AISharedDetails: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                row("Anthropic (Claude AI)", "Your messages, responses and lesson transcripts, for coaching feedback and chat.")
                row("Deepgram", "Your lesson recordings and voice, for transcription and voice playback.")
                Text("Audio is never stored: it is sent once for transcription and discarded.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Link("Privacy Policy", destination: URL(string: "https://www.wivoza.com/terms")!)
                    .font(.subheadline.weight(.semibold)).tint(AppTheme.primary)
                Spacer()
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("What\u{2019}s shared")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private func row(_ who: String, _ what: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(who).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
            Text(what).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
