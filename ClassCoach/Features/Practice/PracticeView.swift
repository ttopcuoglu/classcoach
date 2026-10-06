import SwiftUI

/// Mirrors `web/src/pages/Practice.tsx`.
///
/// This was Ask & Practice, two tabs over one shared section and room. Asking
/// is Talk It Through's job now — out loud or typed, both in one place — so
/// what is left here is the thing Talk It Through cannot do: rehearse a moment
/// against a scenario and get coaching on the words you actually used.
///
/// The section stays above the scenario rather than inside it. Left on "Not
/// sure yet" the coach picks, weighted toward what this teacher has practiced
/// least, so it narrows rather than gates.
///
/// The section also decides which rehearsal opens below it (FocusArea.engine).
/// Three sections get a generated classroom moment; Conversation gets a
/// role-play against someone who pushes back, which used to be Communication
/// Coach's "Practice a Conversation" screen. Both end in coaching on the
/// teacher's own words, so one tab holds them and Communication Coach keeps
/// only the tools that end in something you send.
struct PracticeView: View {
    @EnvironmentObject private var authManager: AuthManager
    @State private var focusArea: String?
    /// Seeded from the profile so a teacher who has set a grade band and
    /// subject never types them again.
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

                // Parent and colleague work overlaps Communication Coach on
                // purpose: one rehearsed exchange belongs here, an actual
                // drafted email or a prepared meeting there.
                if let note = findFocusArea(focusArea)?.handoffNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal)
                }

                // No section chosen keeps the scenario engine: the coach
                // picking for you only makes sense where it can pick, and a
                // role-play needs to know who you are facing.
                if findFocusArea(focusArea)?.engine == .conversation {
                    PracticeConversationView()
                } else {
                    TryItOutContent(focusArea: focusArea, room: $room)
                }
            }
            .background(AppTheme.background)
            .navigationTitle("Practice")
            .onAppear { room.seed(from: authManager.currentUser) }
        }
    }
}

#Preview {
    PracticeView()
        .environmentObject(AuthManager.shared)
}
