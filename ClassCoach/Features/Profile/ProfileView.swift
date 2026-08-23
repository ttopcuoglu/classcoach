import SwiftUI

struct ProfileView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("About You") {
                    LabeledContent("Name", value: "—")
                    LabeledContent("Grade Level(s)", value: "—")
                    LabeledContent("Subject(s)", value: "—")
                }

                Section("Preferences") {
                    LabeledContent("Notifications", value: "—")
                }

                Section {
                    Button("Reset & Clear Data", role: .destructive) {
                        // Data reset coming soon
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    ProfileView()
}
