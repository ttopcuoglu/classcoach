import Foundation

/// Mirrors the server's `Scenario` shape (see `web/src/lib/api.ts`) —
/// `category`/`gradeBand`/`difficulty` are plain strings server-side, not
/// enums, matched by the same snake_case values used in
/// `server/src/lib/scenarioCategories.ts`.
struct Scenario: Codable, Identifiable {
    let id: String
    let text: String
    let category: String
    let gradeBand: String
    let difficulty: String
    let source: String
    let createdAt: String
    /// Only present on a `/generate` response — true when Claude generation
    /// failed and a curated scenario was served instead.
    let fallback: Bool?
}

/// A follow-up coaching chat turn, appended below a one-shot result. Same
/// shape as `web/src/lib/api.ts`'s `ChatMessage`.
struct ChatMessage: Codable {
    let role: String
    let text: String
    let createdAt: String
}

struct ScenarioAttempt: Codable, Identifiable {
    let id: String
    let scenarioId: String
    let responseText: String
    let feedback: String?
    let modelResponse: String?
    /// Claude's private 1-5 self-assessment, for growth trends only — never
    /// shown to the user as a literal score.
    let rating: Int?
    let saved: Bool
    let createdAt: String
    let scenario: Scenario
    let conversation: [ChatMessage]
}
