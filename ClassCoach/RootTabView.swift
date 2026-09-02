import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isRestoringSession {
                ProgressView()
            } else if authManager.currentUser != nil {
                // Order mirrors the Home dashboard's 4 feature cards exactly
                // (Home, then the cards in their on-screen order) — Try It
                // Out and Ask an Expert no longer get their own tabs since
                // their content lives inside the combined Ask & Practice
                // tab now (see AskAndPracticeView).
                TabView {
                    HomeView()
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    TalkToMeView()
                        .tabItem {
                            Label("Live Coach", systemImage: "waveform.circle.fill")
                        }

                    AudioCoachingView()
                        .tabItem {
                            Label("Record a Lesson", systemImage: "waveform")
                        }

                    AskAndPracticeView()
                        .tabItem {
                            Label("Ask an Expert", systemImage: "bubble.left.and.bubble.right.fill")
                        }

                    LessonPlanningView()
                        .tabItem {
                            Label("Plan a Lesson", systemImage: "doc.text.fill")
                        }

                    MessagesHubView()
                        .tabItem {
                            Label("Messages", systemImage: "envelope.fill")
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
