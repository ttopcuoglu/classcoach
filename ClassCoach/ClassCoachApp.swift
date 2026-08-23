import SwiftUI
import SwiftData

@main
struct ClassCoachApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(for: [
            Scenario.self,
            ScenarioAttempt.self,
            QAExchange.self,
            UserProfile.self
        ])
    }
}
