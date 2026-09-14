import Foundation

/// Mirrors the server's `Debrief` shape (see `web/src/lib/api.ts`) — backs
/// both Ask & Practice (`source: "ask_tab"`) and Talk It Through
/// (`source: "talk_to_me"`).
struct Debrief: Codable, Identifiable {
    let id: String
    let incidentText: String
    let category: String?
    let feedback: String?
    let followUp: String?
    let rating: Int?
    let source: String?
    let saved: Bool
    let shareToken: String?
    let createdAt: String
    let conversation: [ChatMessage]
    /// Talk It Through's end-of-conversation summary — nil until the teacher
    /// finishes a session (see `POST /api/debriefs/:id/takeaway`).
    let talkTakeaway: TalkTakeaway?
}

struct TalkTakeaway: Codable {
    let explored: String
    let tryNext: String
    let notice: String
}
