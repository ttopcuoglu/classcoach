import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var name = ""
    @State private var gradeLevels = ""
    @State private var subjects = ""
    @State private var loaded = false

    @State private var saving = false
    @State private var saveError: String?
    @State private var saveConfirmed = false

    @State private var resetting = false
    @State private var showResetConfirm = false
    @State private var resetError: String?

    @State private var deletingAccount = false
    @State private var showDeleteAccountConfirm = false
    @State private var deleteAccountError: String?

    private var isDirty: Bool {
        name != (authManager.currentUser?.name ?? "")
            || gradeLevels != (authManager.currentUser?.gradeLevels ?? "")
            || subjects != (authManager.currentUser?.subjects ?? "")
    }

    var body: some View {
        NavigationStack {
            List {
                Section("About You") {
                    LabeledContent("Email", value: authManager.currentUser?.email ?? "—")
                    TextField("Name", text: $name)
                    TextField("Grade Level(s), e.g. 6, 7, 8", text: $gradeLevels)
                    TextField("Subject(s), e.g. Math, Science", text: $subjects)
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving {
                            ProgressView()
                        } else {
                            Text(saveConfirmed ? "Saved" : "Save Changes")
                        }
                    }
                    .disabled(saving || !isDirty)

                    if let saveError {
                        Text(saveError).font(.footnote).foregroundStyle(.red)
                    }
                }

                Section {
                    NavigationLink("Your First 30 Days") { FirstThirtyDaysView() }
                    NavigationLink("Cheat Sheet") { CheatSheetView() }
                }

                Section {
                    Button("Reset & Clear Data", role: .destructive) {
                        showResetConfirm = true
                    }
                    .disabled(resetting)

                    if let resetError {
                        Text(resetError).font(.footnote).foregroundStyle(.red)
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        authManager.signOut()
                    }
                }

                Section {
                    Button("Delete Account", role: .destructive) {
                        showDeleteAccountConfirm = true
                    }
                    .disabled(deletingAccount)

                    if let deleteAccountError {
                        Text(deleteAccountError).font(.footnote).foregroundStyle(.red)
                    }
                } footer: {
                    Text("Permanently deletes your account and everything in it — profile, conversations, lesson recordings and reports. This can't be undone.")
                }
            }
            .navigationTitle("Profile")
            .task { await load() }
            .alert("Reset & Clear Data?", isPresented: $showResetConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    Task { await reset() }
                }
            } message: {
                Text("This deletes your saved scenarios, attempts, and Q&A history, and clears your profile fields. This can't be undone.")
            }
            .alert("Delete your account?", isPresented: $showDeleteAccountConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete Account", role: .destructive) {
                    Task { await deleteAccount() }
                }
            } message: {
                Text("This permanently deletes your account and everything in it — profile, conversations, lesson recordings, and reports. This can't be undone.")
            }
        }
    }

    private func load() async {
        guard !loaded else { return }
        if let user = authManager.currentUser {
            applyToFields(user)
        }
        if let user = try? await ProfileService.getProfile() {
            authManager.setCurrentUser(user)
            applyToFields(user)
        }
        loaded = true
    }

    private func applyToFields(_ user: User) {
        name = user.name ?? ""
        gradeLevels = user.gradeLevels ?? ""
        subjects = user.subjects ?? ""
    }

    private func save() async {
        saving = true
        saveError = nil
        saveConfirmed = false
        do {
            let updated = try await ProfileService.updateProfile(name: name, gradeLevels: gradeLevels, subjects: subjects)
            authManager.setCurrentUser(updated)
            applyToFields(updated)
            saveConfirmed = true
        } catch {
            saveError = error.localizedDescription
        }
        saving = false
    }

    private func reset() async {
        resetting = true
        resetError = nil
        do {
            try await ProfileService.resetData()
            if let user = try? await ProfileService.getProfile() {
                authManager.setCurrentUser(user)
                applyToFields(user)
            }
        } catch {
            resetError = error.localizedDescription
        }
        resetting = false
    }

    private func deleteAccount() async {
        deletingAccount = true
        deleteAccountError = nil
        do {
            try await ProfileService.deleteAccount()
            authManager.signOut()
        } catch {
            deleteAccountError = error.localizedDescription
        }
        deletingAccount = false
    }
}

#Preview {
    ProfileView()
        .environmentObject(AuthManager.shared)
}
