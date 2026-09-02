import Foundation

/// Request builders for Lesson Planning — mirrors the matching functions
/// in `web/src/lib/api.ts` against `/api/lesson-plans`.
enum LessonPlanningService {
    static func getLessonPlans(mode: String) async throws -> [LessonPlan] {
        try await APIClient.shared.request("/api/lesson-plans?mode=\(mode)")
    }

    private struct FeedbackBody: Encodable {
        let objective: String
        let unitName: String?
        let essentialQuestion: String?
        let standard: String?
        let subject: String?
        let gradeLevel: String?
        let planText: String
    }

    static func submitFeedback(planText: String) async throws -> LessonPlan {
        try await APIClient.shared.request(
            "/api/lesson-plans/feedback",
            method: "POST",
            body: FeedbackBody(
                objective: "", unitName: nil, essentialQuestion: nil, standard: nil,
                subject: nil, gradeLevel: nil, planText: planText
            )
        )
    }

    private struct GenerateBody: Encodable {
        let objective: String
        let unitName: String?
        let essentialQuestion: String?
        let standard: String?
        let subject: String?
        let gradeLevel: String?
    }

    static func generate(
        objective: String, unitName: String?, essentialQuestion: String?,
        standard: String?, subject: String?, gradeLevel: String?
    ) async throws -> LessonPlan {
        try await APIClient.shared.request(
            "/api/lesson-plans/generate",
            method: "POST",
            body: GenerateBody(
                objective: objective, unitName: unitName, essentialQuestion: essentialQuestion,
                standard: standard, subject: subject, gradeLevel: gradeLevel
            )
        )
    }

    private struct MessageBody: Encodable { let message: String }
    private struct SavedBody: Encodable { let saved: Bool }

    static func sendChat(id: String, message: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/chat", method: "POST", body: MessageBody(message: message))
    }

    static func applyRevision(id: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/apply-revision", method: "POST")
    }

    static func setSaved(id: String, saved: Bool) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)", method: "PATCH", body: SavedBody(saved: saved))
    }
}
