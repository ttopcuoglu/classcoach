import SwiftUI
import GoogleSignIn

@main
struct ClassCoachApp: App {
    @StateObject private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(authManager)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
                .task {
                    await authManager.restoreSession()
                }
        }
    }
}
