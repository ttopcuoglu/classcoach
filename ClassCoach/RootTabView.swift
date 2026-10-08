import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isRestoringSession {
                ProgressView()
            } else if authManager.currentUser != nil {
                // Five slots, the same five the web's bar settled on: Home,
                // Talk, Grow, Plan, You. Five is also the most a phone's
                // TabView shows before it sweeps the rest into "More".
                //
                // There were seven tabs. A phone's TabView shows four and sweeps
                // the rest into a system "More" list, so Planning Coach,
                // Communication Coach and Profile were all buried in it — and
                // Home had been growing extra cards to compensate for tools
                // nobody could find. Grouping is what fixes that; deleting more
                // Home cards was only ever treating the symptom.
                //
                // Grow and Plan are sections, not pages: each is a tab whose
                // root lists its tools (see SectionHubs). Not "Coaching" —
                // every tool here is coaching, including both of Plan's, which
                // are named Coach. Profile is "You", where every app puts it.
                TabView {
                    HomeView()
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    // Talk It Through is its own slot, not a row inside Grow.
                    // It is the only catch-all: any problem, no format, nothing
                    // to set up first. The others need a teacher to already know
                    // what they want, so burying the "I just need to think out
                    // loud" door behind a group label works against the thing
                    // they reach for when they are stuck at 3:40.
                    TalkToMeView()
                        .tabItem {
                            Label("Talk", systemImage: "waveform.circle.fill")
                        }

                    GrowHubView()
                        .tabItem {
                            Label("Grow", systemImage: "mic.fill")
                        }

                    PlanHubView()
                        .tabItem {
                            Label("Plan", systemImage: "doc.text.fill")
                        }

                    // ProfileView owns no NavigationStack — it used to get one
                    // from the system More list, which no longer exists here.
                    NavigationStack { ProfileView() }
                        .tabItem {
                            Label("You", systemImage: "person.crop.circle")
                        }
                }
                .tint(AppTheme.primary)
            } else {
                SignInView()
            }
        }
    }
}

#Preview {
    RootTabView()
        .environmentObject(AuthManager.shared)
}
