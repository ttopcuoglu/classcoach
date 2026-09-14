import SwiftUI

/// Mirrors `TALK_VOICES` in web/src/lib/api.ts — the voices Coach can speak
/// with in Talk It Through (see server/src/lib/talkVoices.ts).
enum TalkVoice {
    static let defaultId = "thalia"
    static let all: [(id: String, label: String, description: String)] = [
        ("thalia", "Thalia", "Clear, confident, energetic (default)"),
        ("andromeda", "Andromeda", "Casual and expressive"),
        ("helena", "Helena", "Warm, caring, friendly"),
        ("apollo", "Apollo", "Calm and confident"),
        ("arcas", "Arcas", "Smooth and natural"),
        ("aries", "Aries", "Warm and energetic"),
    ]
}

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

    @State private var settingsError: String?
    @State private var updatingSettings = false
    @State private var showClearMemoryConfirm = false
    @State private var joinCode = ""
    @State private var joining = false
    @State private var joinError: String?

    @State private var deletingAccount = false
    @State private var showDeleteAccountConfirm = false
    @State private var deleteAccountError: String?

    private var isDirty: Bool {
        name != (authManager.currentUser?.name ?? "")
            || gradeLevels != (authManager.currentUser?.gradeLevels ?? "")
            || subjects != (authManager.currentUser?.subjects ?? "")
    }

    var body: some View {
        List {
            Section {
                PanelHeader(
                    eyebrow: "Wivoza · Grow",
                    title: "Profile & Settings",
                    subtitle: authManager.currentUser?.plan == "plus"
                        ? "You're on Wivoza Plus."
                        : "Tell us about your classroom so coaching can be more relevant."
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

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
                    Text(saveError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                }
            }

            Section {
                ForEach(ExperienceLevel.all, id: \.id) { option in
                    Button {
                        Task { await updateSettings(ProfileService.SettingsBody(experienceLevel: option.id)) }
                    } label: {
                        HStack {
                            Text(option.label).foregroundStyle(AppTheme.textPrimary)
                            Spacer()
                            if authManager.currentUser?.experienceLevel == option.id {
                                Image(systemName: "checkmark").foregroundStyle(AppTheme.accent)
                            }
                        }
                    }
                    .disabled(updatingSettings)
                }
            } header: {
                Text("Years in the Classroom")
            } footer: {
                Text("Your coach adjusts to where you are — no beginner advice if you don't need it.")
            }

            Section {
                if let memory = authManager.currentUser?.coachMemory, !memory.isEmpty {
                    Text(memory)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                } else {
                    Text("Nothing yet — this builds up as you use Wivoza.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                Toggle("Let Coach remember things between conversations", isOn: Binding(
                    get: { authManager.currentUser?.coachMemoryEnabled ?? true },
                    set: { enabled in
                        Task { await updateSettings(ProfileService.SettingsBody(coachMemoryEnabled: enabled)) }
                    }
                ))
                .disabled(updatingSettings)
                if let memory = authManager.currentUser?.coachMemory, !memory.isEmpty {
                    Button("Clear What Coach Remembers", role: .destructive) {
                        showClearMemoryConfirm = true
                    }
                    .disabled(updatingSettings)
                }
            } header: {
                Text("What Coach Remembers")
            } footer: {
                Text("A short, running note about your recurring strengths and ongoing challenges, built from your Ask, Talk It Through, and Lesson Debrief Reflect conversations. It's never shown to anyone else.")
            }

            Section {
                ForEach(TalkVoice.all, id: \.id) { option in
                    Button {
                        Task { await updateSettings(ProfileService.SettingsBody(talkVoice: option.id)) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label).foregroundStyle(AppTheme.textPrimary)
                                Text(option.description).font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                            Spacer()
                            if (authManager.currentUser?.talkVoice ?? TalkVoice.defaultId) == option.id {
                                Image(systemName: "checkmark").foregroundStyle(AppTheme.accent)
                            }
                        }
                    }
                    .disabled(updatingSettings)
                }
            } header: {
                Text("Coach's Voice")
            } footer: {
                Text("The voice Coach speaks with in Talk It Through.")
            }

            Section {
                if let organization = authManager.currentUser?.organization {
                    LabeledContent("Part of", value: organization.name)
                } else {
                    TextField("School code", text: $joinCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Button {
                        Task { await join() }
                    } label: {
                        if joining { ProgressView() } else { Text("Join School") }
                    }
                    .disabled(joining || joinCode.trimmingCharacters(in: .whitespaces).isEmpty)
                    if let joinError {
                        Text(joinError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                    }
                }
            } header: {
                Text("School")
            } footer: {
                if authManager.currentUser?.organization == nil {
                    Text("If your school or district has a Wivoza agreement, enter its code to join.")
                }
            }

            if let settingsError {
                Section {
                    Text(settingsError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                }
            }

            Section {
                // A new-teacher track — left out for teachers six or more years in.
                if !ExperienceLevel.isExperienced(authManager.currentUser?.experienceLevel) {
                    NavigationLink("Your First 30 Days") { FirstThirtyDaysView() }
                }
                NavigationLink("Cheat Sheet") { CheatSheetView() }
            }

            Section {
                Button("Reset & Clear Data", role: .destructive) {
                    showResetConfirm = true
                }
                .disabled(resetting)

                if let resetError {
                    Text(resetError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
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
                    Text(deleteAccountError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                }
            } footer: {
                Text("Permanently deletes your account and everything in it — profile, conversations, lesson recordings and reports. This can't be undone.")
            }

            Section {
                Link("Terms of Service", destination: URL(string: "https://www.wivoza.com/terms")!)
                Link("Privacy Policy", destination: URL(string: "https://www.wivoza.com/terms")!)
            } header: {
                Text("About")
            } footer: {
                Text("Wivoza \(AppInfo.version)\nA product of \(AppInfo.company)\n\(AppInfo.copyright). All rights reserved.")
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AppTheme.background)
        .tint(AppTheme.forest)
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
        .alert("Clear what Coach remembers?", isPresented: $showClearMemoryConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Clear", role: .destructive) {
                Task { await updateSettings(ProfileService.SettingsBody(clearCoachMemory: true)) }
            }
        } message: {
            Text("Coach will start fresh. This can't be undone.")
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

    private func updateSettings(_ body: ProfileService.SettingsBody) async {
        updatingSettings = true
        settingsError = nil
        do {
            let updated = try await ProfileService.updateSettings(body)
            authManager.setCurrentUser(updated)
        } catch {
            settingsError = error.localizedDescription
        }
        updatingSettings = false
    }

    private func join() async {
        joining = true
        joinError = nil
        do {
            let updated = try await ProfileService.updateSettings(
                ProfileService.SettingsBody(joinCode: joinCode.trimmingCharacters(in: .whitespaces))
            )
            authManager.setCurrentUser(updated)
            joinCode = ""
        } catch {
            joinError = error.localizedDescription
        }
        joining = false
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
