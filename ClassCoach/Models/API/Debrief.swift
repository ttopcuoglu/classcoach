import Foundation

/// Mirrors the server's `Debrief` shape (see `web/src/lib/api.ts`) — backs
/// the "Ask an Expert" flow (`source: "ask_tab"`). Talk to Me
/// (`source: "talk_to_me"`, audio-based) isn't built on iOS yet.
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
}
