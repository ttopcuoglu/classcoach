import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isRestoringSession {
                ProgressView()
            } else if authManager.currentUser != nil {
                // Same names and order as the web app's menu, with Lesson
                // Debrief first. Home's feature cards follow the same order.
                //
                // Two tabs fewer than there were tools: rehearsing a scenario and
                // rehearsing a conversation are both Practice (see PracticeView),
                // and reviewing an assignment is a chip inside Lesson Planning
                // (see LessonPlanningView). Both were merges of the same job, not
                // of two different ones.
                TabView {
                    HomeView()
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    AudioCoachingView()
                        .tabItem {
                            Label("Lesson Debrief", systemImage: "mic.fill")
                        }

                    TalkToMeView()
                        .tabItem {
                            Label("Talk It Through", systemImage: "waveform.circle.fill")
                        }

                    PracticeView()
                        .tabItem {
                            Label("Practice", systemImage: "bubble.left.and.bubble.right.fill")
                        }

                    // These always sit under More, which supplies its own
                    // navigation bar — wrapping them in another stack drew a
                    // second back button on every pushed screen.
                    LessonPlanningView()
                        .tabItem {
                            Label("Lesson Planning", systemImage: "doc.text.fill")
                        }

                    MessagesHubView()
                        .tabItem {
                            Label("Communication Coach", systemImage: "envelope.fill")
                        }

                    ProfileView()
                        .tabItem {
                            Label("Profile", systemImage: "person.crop.circle")
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
