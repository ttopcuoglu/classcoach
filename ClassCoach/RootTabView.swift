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
                // Try It Out and Ask an Expert live inside the combined
                // Ask & Practice tab (see AskAndPracticeView).
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

                    AskAndPracticeView()
                        .tabItem {
                            Label("Ask & Practice", systemImage: "bubble.left.and.bubble.right.fill")
                        }

                    // These always sit under More, which supplies its own
                    // navigation bar — wrapping them in another stack drew a
                    // second back button on every pushed screen.
                    LessonPlanningView()
                        .tabItem {
                            Label("Lesson Planning", systemImage: "doc.text.fill")
                        }

                    AssignmentCoachView()
                        .tabItem {
                            Label("Assignment Coach", systemImage: "checklist")
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
