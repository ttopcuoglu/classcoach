import Foundation

/// Request builders for the "Messages" hub (Write a Message, Prepare/
/// Practice/Review a Conversation) — mirrors the matching functions in
/// `web/src/lib/api.ts` against `/api/parent-messages`, `/api/conversation-
/// prep`, and `/api/conversation-plans`.
enum CommunicationsService {
    // MARK: - Parent Message ("Write a Message")

    private struct DraftMessageBody: Encodable {
        let startingAction: String
        let incidentSummary: String?
        let receivedMessage: String?
        let contextNotes: String?
        let existingDraft: String?
        let recipientType: String?
        let purpose: String?
        let format: String?
        let tone: String
    }

    static func draftParentMessage(
        startingAction: String,
        incidentSummary: String? = nil,
        receivedMessage: String? = nil,
        contextNotes: String? = nil,
        existingDraft: String? = nil,
        recipientType: String?,
        purpose: String?,
        format: String?,
        tone: String
    ) async throws -> ParentMessage {
        try await APIClient.shared.request(
            "/api/parent-messages",
            method: "POST",
            body: DraftMessageBody(
                startingAction: startingAction, incidentSummary: incidentSummary,
                receivedMessage: receivedMessage, contextNotes: contextNotes, existingDraft: existingDraft,
                recipientType: recipientType, purpose: purpose, format: format, tone: tone
            )
        )
    }

    private struct MessageBody: Encodable { let message: String }
    private struct SavedBody: Encodable { let saved: Bool }

    static func sendParentMessageChat(id: String, message: String) async throws -> ParentMessage {
        try await APIClient.shared.request("/api/parent-messages/\(id)/chat", method: "POST", body: MessageBody(message: message))
    }

    static func setParentMessageSaved(id: String, saved: Bool) async throws -> ParentMessage {
        try await APIClient.shared.request("/api/parent-messages/\(id)", method: "PATCH", body: SavedBody(saved: saved))
    }

    // MARK: - Conversation Prep (Practice / Review)

    private struct GenerateScenarioBody: Encodable {
        let category: String
        let gradeBand: String?
        let personType: String?
        let difficulty: String?
    }

    private struct GeneratedScenario: Decodable {
        let situationText: String
    }

    static func generateConversationScenario(
        category: String, gradeBand: String?, personType: String?, difficulty: String?
    ) async throws -> String {
        let result: GeneratedScenario = try await APIClient.shared.request(
            "/api/conversation-prep/generate-scenario",
            method: "POST",
            body: GenerateScenarioBody(category: category, gradeBand: gradeBand, personType: personType, difficulty: difficulty)
        )
        return result.situationText
    }

    private struct SubmitPrepBody: Encodable {
        let situationText: String
        let responseText: String
        let source: String
        let category: String?
        let gradeBand: String?
        let personType: String?
        let difficulty: String?
        let reviewMode: String?
    }

    static func submitConversationPrep(
        situationText: String,
        responseText: String,
        source: String,
        category: String? = nil,
        gradeBand: String? = nil,
        personType: String? = nil,
        difficulty: String? = nil,
        reviewMode: String? = nil
    ) async throws -> ConversationPrep {
        try await APIClient.shared.request(
            "/api/conversation-prep",
            method: "POST",
            body: SubmitPrepBody(
                situationText: situationText, responseText: responseText, source: source, category: category,
                gradeBand: gradeBand, personType: personType, difficulty: difficulty, reviewMode: reviewMode
            )
        )
    }

    static func sendConversationPrepChat(id: String, message: String) async throws -> ConversationPrep {
        try await APIClient.shared.request("/api/conversation-prep/\(id)/chat", method: "POST", body: MessageBody(message: message))
    }

    static func setConversationPrepSaved(id: String, saved: Bool) async throws -> ConversationPrep {
        try await APIClient.shared.request("/api/conversation-prep/\(id)", method: "PATCH", body: SavedBody(saved: saved))
    }

    // MARK: - Conversation Plan ("Prepare for a Conversation")

    private struct SubmitPlanBody: Encodable {
        let situationText: String
        let recipientType: String?
        let desiredOutcome: String?
        let concerns: String?
        let background: String?
        let meetingFormat: String?
    }

    static func submitConversationPlan(
        situationText: String,
        recipientType: String?,
        desiredOutcome: String?,
        concerns: String?,
        background: String?,
        meetingFormat: String?
    ) async throws -> ConversationPlan {
        try await APIClient.shared.request(
            "/api/conversation-plans",
            method: "POST",
            body: SubmitPlanBody(
                situationText: situationText, recipientType: recipientType, desiredOutcome: desiredOutcome,
                concerns: concerns, background: background, meetingFormat: meetingFormat
            )
        )
    }

    static func sendConversationPlanChat(id: String, message: String) async throws -> ConversationPlan {
        try await APIClient.shared.request("/api/conversation-plans/\(id)/chat", method: "POST", body: MessageBody(message: message))
    }

    static func setConversationPlanSaved(id: String, saved: Bool) async throws -> ConversationPlan {
        try await APIClient.shared.request("/api/conversation-plans/\(id)", method: "PATCH", body: SavedBody(saved: saved))
    }
}
