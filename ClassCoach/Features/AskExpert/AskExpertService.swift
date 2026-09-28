import Foundation

/// Request builders for the "Ask an Expert" flow — mirrors the matching
/// functions in `web/src/lib/api.ts` against `/api/debriefs`.
enum AskExpertService {
    static func getDebriefs() async throws -> [Debrief] {
        try await APIClient.shared.request("/api/debriefs?source=ask_tab")
    }

    private struct SubmitBody: Encodable {
        let incidentText: String
        /// Optional — nil lets the coach work out which of the six areas this is.
        let focusArea: String?
        let gradeBand: String?
        let subject: String?
        let course: String?
        let topic: String?
        let courseLevel: String?
        let classMakeup: [String]
    }

    static func submitDebrief(
        incidentText: String,
        focusArea: String?,
        gradeBand: String?,
        subject: String?,
        course: String?,
        topic: String?,
        courseLevel: String?,
        classMakeup: [String]
    ) async throws -> Debrief {
        try await APIClient.shared.request(
            "/api/debriefs",
            method: "POST",
            body: SubmitBody(
                incidentText: incidentText, focusArea: focusArea,
                gradeBand: gradeBand, subject: subject, course: course, topic: topic, courseLevel: courseLevel, classMakeup: classMakeup
            )
        )
    }

    private struct ChatBody: Encodable {
        let message: String
    }

    static func sendChat(debriefId: String, message: String) async throws -> Debrief {
        try await APIClient.shared.request(
            "/api/debriefs/\(debriefId)/chat",
            method: "POST",
            body: ChatBody(message: message)
        )
    }

    private struct SavedBody: Encodable {
        let saved: Bool
    }

    static func setSaved(debriefId: String, saved: Bool) async throws -> Debrief {
        try await APIClient.shared.request(
            "/api/debriefs/\(debriefId)",
            method: "PATCH",
            body: SavedBody(saved: saved)
        )
    }
}
