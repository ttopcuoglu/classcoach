import SwiftUI

/// The "02 Email sign-up" screen — pushed from `WelcomeView`'s "Continue
/// with email" / "Log in" actions. Signup asks for the two consent
/// checkboxes separately (mirrors the backend's independent
/// `termsAccepted`/`ageConfirmed` fields exactly, see
/// server/src/routes/auth.ts's `/signup`). "Preferred name" is optional
/// here even though the backend requires a non-empty name — if left
/// blank, `submit()` derives one from the email's local part rather than
/// forcing the field on the user.
struct EmailAuthView: View {
    @EnvironmentObject private var authManager: AuthManager
    let initialMode: String

    @State private var mode: String
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isPasswordVisible = false
    @State private var termsAccepted = false
    @State private var ageConfirmed = false
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    init(initialMode: String) {
        self.initialMode = initialMode
        _mode = State(initialValue: initialMode)
    }

    private var isSignUp: Bool { mode == "signup" }

    private var canSubmit: Bool {
        guard !email.isEmpty, !password.isEmpty else { return false }
        return isSignUp ? (termsAccepted && ageConfirmed) : true
    }

    private var derivedName: String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { return trimmed }
        return String(email.prefix(while: { $0 != "@" })).capitalized
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image("WivozaLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 140)
                    .padding(.top, 12)

                VStack(spacing: 6) {
                    Text(isSignUp ? "Create your account" : "Welcome back")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(AppTheme.textPrimary)
                    Text(isSignUp ? "Make room for your next teaching breakthrough." : "Log in to pick up where you left off.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                }

                if isSubmitting {
                    ProgressView()
                        .padding(.vertical, 40)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        if isSignUp {
                            labeledField("Preferred name (optional)") {
                                TextField("Alex", text: $name)
                                    .textFieldStyle(.roundedBorder)
                            }
                        }

                        labeledField("Email") {
                            TextField("alex@example.com", text: $email)
                                .textFieldStyle(.roundedBorder)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.emailAddress)
                        }

                        labeledField("Password") {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Group {
                                        if isPasswordVisible {
                                            TextField("Password", text: $password)
                                        } else {
                                            SecureField("Password", text: $password)
                                        }
                                    }
                                    Button {
                                        isPasswordVisible.toggle()
                                    } label: {
                                        Image(systemName: isPasswordVisible ? "eye.slash" : "eye")
                                            .foregroundStyle(AppTheme.textSecondary)
                                    }
                                }
                                .padding(10)
                                .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(.systemGray4)))

                                if isSignUp {
                                    Text("Use a strong, unique password.")
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.textSecondary)
                                }
                            }
                        }

                        if isSignUp {
                            VStack(alignment: .leading, spacing: 10) {
                                consentRow(isOn: $termsAccepted) {
                                    (Text("I agree to the ")
                                        + Text("Terms of Service").underline()
                                        + Text("."))
                                }
                                consentRow(isOn: $ageConfirmed) {
                                    Text("I confirm I am 13 or older.")
                                }
                            }
                            .onTapGesture {} // keeps taps from bubbling to the Link below

                            Link(destination: URL(string: "https://www.wivoza.com/terms")!) {
                                Text("Learn how we handle your information in our Privacy Policy.")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.textSecondary)
                                    .underline()
                            }
                        }

                        Button(action: submit) {
                            Text(isSignUp ? "Create account" : "Log in")
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.primary)
                        .disabled(!canSubmit)
                        .padding(.top, 4)

                        Button {
                            withAnimation { mode = isSignUp ? "login" : "signup" }
                        } label: {
                            (Text(isSignUp ? "Already have an account? " : "Need an account? ").foregroundStyle(AppTheme.textSecondary)
                                + Text(isSignUp ? "Log in" : "Sign up").foregroundStyle(AppTheme.primary).fontWeight(.semibold))
                                .font(.subheadline)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(20)
        }
        .background(AppTheme.background)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func labeledField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.textPrimary)
            content()
        }
    }

    @ViewBuilder
    private func consentRow(isOn: Binding<Bool>, @ViewBuilder label: () -> Text) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Button {
                isOn.wrappedValue.toggle()
            } label: {
                Image(systemName: isOn.wrappedValue ? "checkmark.square.fill" : "square")
                    .foregroundStyle(isOn.wrappedValue ? AppTheme.primary : AppTheme.textSecondary)
            }
            label()
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func submit() {
        errorMessage = nil
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                if isSignUp {
                    try await authManager.signUp(email: email, password: password, name: derivedName)
                } else {
                    try await authManager.logIn(email: email, password: password)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    NavigationStack {
        EmailAuthView(initialMode: "signup")
    }
    .environmentObject(AuthManager.shared)
}
