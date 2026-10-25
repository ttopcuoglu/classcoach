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

    private struct SlidesFileBody: Encodable { let format: String; let model: JSONValue }
    private struct GeneratedDeck: Decodable { let model: JSONValue }

    /// Rebuilds the reviewed deck with every recommendation applied, then
    /// renders it to a real .pptx. Two steps, like the web: Claude lays the
    /// deck out, then the server turns that layout into a file. Deliberately
    /// reuses Assignment Coach's `export-file` renderer rather than adding a
    /// second one — it already takes `{ format, model }` and knows how to
    /// write a deck.
    static func improvedSlides(id: String) async throws -> URL {
        let deck: GeneratedDeck = try await APIClient.shared.request(
            "/api/lesson-plans/\(id)/presentation-generate",
            method: "POST"
        )
        let data = try await APIClient.shared.postForData(
            "/api/assignment-coach/export-file",
            body: SlidesFileBody(format: "pptx", model: deck.model)
        )
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("wivoza-slides.pptx")
        try data.write(to: url, options: .atomic)
        return url
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

/// Lesson plan formats — a teacher's own, and their school's. Mirrors the
/// `/api/lesson-templates` functions and `layoutLessonPlan` in
/// `web/src/lib/api.ts`.
enum LessonFormatService {
    static func list() async throws -> LessonTemplates {
        try await APIClient.shared.request("/api/lesson-templates")
    }

    /// Has Wivoza read the sections of an uploaded form. Saves nothing: the
    /// teacher checks what came back, then `create` saves it.
    static func read(fileURL: URL) async throws -> ReadTemplate {
        let data = try Data(contentsOf: fileURL)
        return try await APIClient.shared.upload(
            "/api/lesson-templates/read",
            fileData: data,
            fieldName: "file",
            filename: fileURL.lastPathComponent,
            mimeType: APIClient.mimeType(forExtension: fileURL.pathExtension)
        )
    }

    private struct CreateBody: Encodable {
        let scope: String
        let name: String
        let cadence: String
        let sections: [TemplateSection]
        let sourceFileName: String?
    }

    /// `scope` is "personal" for everyone; "school" only for a school's Wivoza
    /// admins, which the server enforces.
    static func create(scope: String, name: String, cadence: String, sections: [TemplateSection], sourceFileName: String?) async throws -> LessonTemplate {
        try await APIClient.shared.request(
            "/api/lesson-templates",
            method: "POST",
            body: CreateBody(scope: scope, name: name, cadence: cadence, sections: sections, sourceFileName: sourceFileName)
        )
    }

    /// Only the fields given are changed — nil ones are left out of the body.
    private struct UpdateBody: Encodable {
        let name: String?
        let cadence: String?
        let sections: [TemplateSection]?
        let isDefault: Bool?
    }

    static func update(id: String, name: String? = nil, cadence: String? = nil, sections: [TemplateSection]? = nil, isDefault: Bool? = nil) async throws -> LessonTemplate {
        try await APIClient.shared.request(
            "/api/lesson-templates/\(id)",
            method: "PATCH",
            body: UpdateBody(name: name, cadence: cadence, sections: sections, isDefault: isDefault)
        )
    }

    static func delete(id: String) async throws {
        try await APIClient.shared.send("/api/lesson-templates/\(id)", method: "DELETE")
    }

    private struct LayoutBody: Encodable { let choice: String? }

    /// The lesson laid out in its format. Pass `choice` (a format id or
    /// "wivoza") to change the format; leave it nil to get the current layout,
    /// which costs nothing when nothing has changed.
    static func layout(id: String, choice: String? = nil) async throws -> LessonLayoutResult {
        try await APIClient.shared.request(
            "/api/lesson-plans/\(id)/layout",
            method: "POST",
            body: LayoutBody(choice: choice)
        )
    }
}
