import SwiftUI

/// Mirrors `web/src/pages/CoachChat.tsx` — the Ask & Practice shell.
///
/// The section is the main choice on this screen, so it lives here, above the
/// Ask/Practice switch, and both tabs read it. One row of chips rather than the
/// card deck this started as — four options with a sentence each put the picker
/// between a teacher and the box where they type.
///
/// It stays optional on Ask: a teacher who writes "my class talks over
/// directions" should never have to classify it first, and the coach infers the
/// section from the text.
struct AskAndPracticeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var tab = "ask"
    @State private var focusArea: String?
    /// The room lives here for the same reason the section does: a teacher who
    /// sets their grade band on Ask and switches to Practice is still in the
    /// same room, and a copy per tab meant setting it twice.
    @State private var room = TeachingContextValue()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("WHAT'S THIS ABOUT?")
                    .font(.caption2.weight(.bold)).tracking(0.8)
                    .foregroundStyle(AppTheme.terracotta600)
                    .padding(.horizontal)
                    .padding(.top, 12)
                ChipRow(
                    items: [("Not sure yet", nil)] + focusAreas.map { ($0.label, Optional($0.value)) },
                    selection: focusArea
                ) { focusArea = $0 }

                if let blurb = findFocusArea(focusArea)?.blurb {
                    Text(blurb)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.horizontal)
                }

                ChipRow(items: [("Ask", "ask"), ("Practice", "practice")], selection: tab) {
                    tab = $0 ?? "ask"
                }
                .padding(.horizontal)

                // Parent and colleague work overlaps Communication Coach on
                // purpose: a quick question or one rehearsed exchange belongs
                // here, an actual drafted email or a prepared meeting there.
                if let note = findFocusArea(focusArea)?.handoffNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal)
                }

                if tab == "practice" {
                    TryItOutContent(focusArea: focusArea, room: $room)
                } else {
                    AskExpertContent(focusArea: focusArea, room: $room)
                }
            }
            .background(AppTheme.background)
            .navigationTitle("Ask & Practice")
            .onAppear { room.seed(from: authManager.currentUser) }
        }
    }
}

#Preview {
    AskAndPracticeView()
        .environmentObject(AuthManager.shared)
}
