import Foundation

/// Request builders for Assignment Coach — mirrors the matching functions in
/// `web/src/lib/api.ts` against `/api/assignment-coach`.
enum AssignmentCoachService {
    private static let base = "/api/assignment-coach"

    static func getSessions() async throws -> [AssignmentCoachSession] {
        try await APIClient.shared.request(base)
    }

    private struct StartBody: Encodable {
        let mode: String
        let aiUseLevel: String?
        let letWivozaChooseAiUseLevel: Bool?
        let originalText: String
        let extraNote: String?
    }

    /// Grade, subject, type and time are detected from the text itself in the
    /// same call that produces the review / redesign; `aiUseLevel` is the one
    /// real input, since it's a policy choice rather than a fact to infer.
    static func start(
        mode: String, aiUseLevel: String?, letWivozaChoose: Bool, originalText: String, extraNote: String?
    ) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request(
            base,
            method: "POST",
            body: StartBody(
                mode: mode,
                aiUseLevel: aiUseLevel,
                letWivozaChooseAiUseLevel: letWivozaChoose ? true : nil,
                originalText: originalText,
                extraNote: extraNote
            )
        )
    }

    private struct AnswerBody: Encodable { let answer: String }
    private struct MessageBody: Encodable { let message: String }

    /// Answers the one optional clarifying question — never blocks the review.
    static func refine(id: String, answer: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)/refine", method: "POST", body: AnswerBody(answer: answer))
    }

    static func sendChat(id: String, message: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)/chat", method: "POST", body: MessageBody(message: message))
    }

    /// The older three-part coaching review, for sessions that predate the snapshot.
    static func review(id: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)/review", method: "POST")
    }

    static func revise(id: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)/revise", method: "POST")
    }

    /// Regenerates the redesign for an AI-use session.
    static func regenerateRedesign(id: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)/ai-resistant", method: "POST")
    }

    private struct UpdateBody: Encodable {
        var saved: Bool?
        var liveAssignmentText: String?
        var assignmentType: String?
        var gradeLevel: String?
        var subject: String?
        var estimatedTime: String?
    }

    static func setSaved(id: String, saved: Bool) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)", method: "PATCH", body: UpdateBody(saved: saved))
    }

    static func setLiveText(id: String, text: String) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request("\(base)/\(id)", method: "PATCH", body: UpdateBody(liveAssignmentText: text))
    }

    static func saveDetails(
        id: String, assignmentType: String?, gradeLevel: String?, subject: String?, estimatedTime: String?
    ) async throws -> AssignmentCoachSession {
        try await APIClient.shared.request(
            "\(base)/\(id)",
            method: "PATCH",
            body: UpdateBody(
                assignmentType: assignmentType, gradeLevel: gradeLevel,
                subject: subject, estimatedTime: estimatedTime
            )
        )
    }

    static func delete(id: String) async throws {
        struct EmptyResponse: Decodable {}
        let _: EmptyResponse = try await APIClient.shared.request("\(base)/\(id)", method: "DELETE")
    }

    private struct ExtractResponse: Decodable { let text: String }

    /// Pulls the text out of a picked .docx / .pdf / .pptx / .txt / image.
    static func extractText(fileURL: URL) async throws -> String {
        let data = try Data(contentsOf: fileURL)
        let result: ExtractResponse = try await APIClient.shared.upload(
            "\(base)/extract-text",
            fileData: data,
            fieldName: "file",
            filename: fileURL.lastPathComponent,
            mimeType: mimeType(for: fileURL.pathExtension)
        )
        return result.text
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "pdf": return "application/pdf"
        case "txt": return "text/plain"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }

    // MARK: Export

    enum ExportFormat: String, CaseIterable, Identifiable {
        case docx, pdf, pptx
        var id: String { rawValue }
        var label: String {
            switch self {
            case .docx: return "Word"
            case .pdf: return "PDF"
            case .pptx: return "PowerPoint"
            }
        }
        /// Slides are laid out as a deck; Word and PDF as a document.
        var previewKind: String { self == .pptx ? "slides" : "document" }
        var fileName: String { self == .pptx ? "wivoza-slides.pptx" : "wivoza-assignment.\(rawValue)" }
    }

    private struct PreviewBody: Encodable { let kind: String; let text: String }
    private struct PreviewResponse: Decodable { let model: JSONValue }
    private struct FileBody: Encodable { let format: String; let model: JSONValue }

    /// Two steps, like the web: Claude lays the text out as a document or deck
    /// (`export-preview`), then the server renders that layout to a real file
    /// (`export-file`). Returns a temporary file ready for the share sheet.
    static func exportFile(id: String, text: String, format: ExportFormat) async throws -> URL {
        let preview: PreviewResponse = try await APIClient.shared.request(
            "\(base)/\(id)/export-preview",
            method: "POST",
            body: PreviewBody(kind: format.previewKind, text: text)
        )
        let data = try await APIClient.shared.postForData(
            "\(base)/export-file",
            body: FileBody(format: format.rawValue, model: preview.model)
        )
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(format.fileName)
        try data.write(to: url, options: .atomic)
        return url
    }
}
