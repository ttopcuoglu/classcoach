import Foundation

/// Request builders for the "Try It Out" flow — mirrors the matching
/// functions in `web/src/lib/api.ts` against the same endpoints.
enum TryItOutService {
    private struct GenerateScenarioBody: Encodable {
        let focusArea: String?
        let category: String?
        let gradeBand: String?
        let difficulty: String?
        let subject: String?
        let course: String?
        let courseLevel: String?
    }

    static func generateScenario(
        focusArea: String?,
        category: String?,
        gradeBand: String?,
        difficulty: String?,
        subject: String?,
        course: String?,
        courseLevel: String?
    ) async throws -> Scenario {
        try await APIClient.shared.request(
            "/api/scenarios/generate",
            method: "POST",
            body: GenerateScenarioBody(
                focusArea: focusArea, category: category, gradeBand: gradeBand,
                difficulty: difficulty, subject: subject, course: course, courseLevel: courseLevel
            )
        )
    }

    static func getAttempts() async throws -> [ScenarioAttempt] {
        try await APIClient.shared.request("/api/attempts")
    }

    private struct SubmitAttemptBody: Encodable {
        let scenarioId: String
        let responseText: String
    }

    static func submitAttempt(scenarioId: String, responseText: String) async throws -> ScenarioAttempt {
        try await APIClient.shared.request(
            "/api/attempts",
            method: "POST",
            body: SubmitAttemptBody(scenarioId: scenarioId, responseText: responseText)
        )
    }

    private struct ChatBody: Encodable {
        let message: String
    }

    static func sendChat(attemptId: String, message: String) async throws -> ScenarioAttempt {
        try await APIClient.shared.request(
            "/api/attempts/\(attemptId)/chat",
            method: "POST",
            body: ChatBody(message: message)
        )
    }

    private struct SavedBody: Encodable {
        let saved: Bool
    }

    static func setSaved(attemptId: String, saved: Bool) async throws -> ScenarioAttempt {
        try await APIClient.shared.request(
            "/api/attempts/\(attemptId)",
            method: "PATCH",
            body: SavedBody(saved: saved)
        )
    }
}
