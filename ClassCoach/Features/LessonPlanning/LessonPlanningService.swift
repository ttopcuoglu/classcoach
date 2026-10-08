import Foundation

/// Request builders for Planning Coach — mirrors the matching functions
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

    /// Build a Lesson. `objective` carries the topic — informal is fine, and
    /// it may be empty when `sourceMaterial` is doing the work instead.
    private struct GenerateBody: Encodable {
        let objective: String
        let unitName: String?
        let essentialQuestion: String?
        let standard: String?
        let subject: String?
        let gradeLevel: String?
        let additionalContext: String?
        let sourceMaterial: String?
        let durationMinutes: Int
        /// "full" or "ideas".
        let kind: String
    }

    static func generate(
        objective: String, unitName: String?, essentialQuestion: String?,
        standard: String?, subject: String?, gradeLevel: String?,
        additionalContext: String? = nil, sourceMaterial: String? = nil,
        durationMinutes: Int = 45, kind: String = "full"
    ) async throws -> LessonPlan {
        try await APIClient.shared.request(
            "/api/lesson-plans/generate",
            method: "POST",
            body: GenerateBody(
                objective: objective, unitName: unitName, essentialQuestion: essentialQuestion,
                standard: standard, subject: subject, gradeLevel: gradeLevel,
                additionalContext: additionalContext, sourceMaterial: sourceMaterial,
                durationMinutes: durationMinutes, kind: kind
            )
        )
    }

    /// What uploaded material appears to be about, so the form can be filled
    /// in for the teacher to check rather than making them retype what their
    /// own worksheet already says. Suggestions only — nothing is saved, and
    /// the server answers with all-nils rather than an error when it cannot
    /// tell, so a failed guess never blocks the form.
    struct InferredContext: Decodable {
        let topic: String?
        let subject: String?
        let gradeLevel: String?
        let followUp: String?
    }

    private struct TextBody: Encodable { let text: String }

    static func inferContext(text: String) async throws -> InferredContext {
        try await APIClient.shared.request(
            "/api/lesson-plans/infer-context",
            method: "POST",
            body: TextBody(text: text)
        )
    }

    /// Starting material for Build a Lesson — slides, a reading, a worksheet,
    /// an activity. Deliberately the same endpoint Assignment Coach uploads
    /// to: one document reader, one set of supported formats, one place where
    /// the OCR fallback lives.
    static func extractMaterial(fileURL: URL) async throws -> String {
        try await AssignmentCoachService.extractText(fileURL: fileURL)
    }

    private struct AdaptBody: Encodable {
        let action: String
        let targetMinutes: Int?
    }

    /// Drafts a revision into the plan's `pendingAdaptation`. Nothing is
    /// replaced until `applyAdaptation` is called.
    static func adapt(id: String, action: LessonAdaptation, targetMinutes: Int? = nil) async throws -> LessonPlan {
        try await APIClient.shared.request(
            "/api/lesson-plans/\(id)/adapt",
            method: "POST",
            body: AdaptBody(action: action.rawValue, targetMinutes: targetMinutes)
        )
    }

    static func applyAdaptation(id: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/apply-adaptation", method: "POST")
    }

    static func discardAdaptation(id: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/discard-adaptation", method: "POST")
    }

    /// Back to the lesson as it was first drafted, however many adaptations
    /// have been applied since.
    static func revert(id: String) async throws -> LessonPlan {
        try await APIClient.shared.request("/api/lesson-plans/\(id)/revert", method: "POST")
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
