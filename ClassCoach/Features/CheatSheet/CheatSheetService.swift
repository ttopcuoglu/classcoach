import Foundation

/// Mirrors `web/src/pages/CheatSheet.tsx`'s two fetches — unlike
/// `AskExpertService.getDebriefs()` (scoped to `source=ask_tab`), this
/// pulls *all* saved debriefs regardless of source, since a saved Talk It
/// Through reflection is just as good cheat-sheet material as a saved Ask
/// answer.
enum CheatSheetService {
    static func getSavedAttempts() async throws -> [ScenarioAttempt] {
        try await APIClient.shared.request("/api/attempts?saved=true")
    }

    static func getSavedDebriefs() async throws -> [Debrief] {
        try await APIClient.shared.request("/api/debriefs?saved=true")
    }
}
