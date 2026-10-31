import SwiftUI

@main
struct WivozaWatchApp: App {
    init() {
        // Activating at launch is what re-offers any lesson a previous run
        // never heard reach the phone.
        WatchSender.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchRecordingView()
        }
    }
}
