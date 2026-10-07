import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isRestoringSession {
                ProgressView()
            } else if authManager.currentUser != nil {
                // Four slots, the same four the web's phone bar settled on:
                // Home, Coaching, Plan, You.
                //
                // There were seven tabs. A phone's TabView shows four and sweeps
                // the rest into a system "More" list, so Lesson Planning,
                // Communication Coach and Profile were all buried in it — and
                // Home had been growing extra cards to compensate for tools
                // nobody could find. Grouping is what fixes that; deleting more
                // Home cards was only ever treating the symptom.
                //
                // Coaching and Plan are sections, not pages: each is a tab whose
                // root lists its tools (see SectionHubs). Profile is "You",
                // where every app puts it.
                TabView {
                    HomeView()
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    CoachingHubView()
                        .tabItem {
                            Label("Coaching", systemImage: "mic.fill")
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
