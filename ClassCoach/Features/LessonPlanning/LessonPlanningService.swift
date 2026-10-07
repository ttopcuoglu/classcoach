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

    /// What `/extract-presentation` hands back before the review is asked for.
    struct ExtractedPresentation: Decodable {
        let text: String
        let slideCount: Int
        let fileName: String
    }

    /// Pulls the text and slide count out of a picked .pptx or .pdf. Export
    /// Google Slides or Keynote as PDF first — the server reads those two.
    static func extractPresentation(fileURL: URL) async throws -> ExtractedPresentation {
        let data = try Data(contentsOf: fileURL)
        return try await APIClient.shared.upload(
            "/api/lesson-plans/extract-presentation",
            fileData: data,
            fieldName: "file",
            filename: fileURL.lastPathComponent,
            mimeType: presentationMimeType(for: fileURL.pathExtension)
        )
    }

    private static func presentationMimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "pdf": return "application/pdf"
        default: return "application/octet-stream"
        }
    }

    private struct PresentationReviewBody: Encodable {
        let text: String
        let fileName: String?
        let slideCount: Int?
        let gradeLevel: String?
        let subject: String?
        let objective: String?
    }

    static func submitPresentationReview(
        text: String,
        fileName: String?,
        slideCount: Int?,
        gradeLevel: String? = nil,
        subject: String? = nil,
        objective: String? = nil
    ) async throws -> LessonPlan {
        try await APIClient.shared.request(
            "/api/lesson-plans/presentation-review",
            method: "POST",
            body: PresentationReviewBody(
                text: text, fileName: fileName, slideCount: slideCount,
                gradeLevel: gradeLevel, subject: subject, objective: objective
            )
        )
    }

    /// Delivery coaching is a second, opt-in call — the review is about the
    /// deck, this is about standing up and teaching from it.
    static func presentationFeedback(id: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/presentation-feedback", method: "POST")
    }

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
