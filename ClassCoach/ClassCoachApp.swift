import SwiftUI
import UIKit
import GoogleSignIn

/// SwiftUI has no hook for `handleEventsForBackgroundURLSession`, and without
/// it a recording that finishes uploading while the app is suspended leaves
/// iOS waiting on us — it relaunches the app in the background purely to be
/// told we are done. See `BackgroundUploader`.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        BackgroundUploader.shared.backgroundEventsCompletionHandler = completionHandler
        BackgroundUploader.shared.reconnect()
    }
}

@main
struct ClassCoachApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(authManager)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
                .task {
                    // Re-adopts any upload the previous process left running,
                    // so its result arrives rather than being lost.
                    BackgroundUploader.shared.reconnect()
                    await authManager.restoreSession()
                }
        }
    }
}
