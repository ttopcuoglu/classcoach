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

/// Coach's check-in on a step planned in Talk It Through — mirrors the
/// server's `CoachFollowUp` (see server/src/routes/followUps.ts).
struct CoachFollowUp: Codable, Identifiable {
    let id: String
    let plan: String
    let checkInQuestion: String
    let dueAt: String
    let status: String
    let createdAt: String
    let sourceDebriefId: String

    /// "from yesterday", "from Friday", or "from Sep 3" — same wording as web.
    var ageLabel: String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: createdAt) ?? ISO8601DateFormatter().date(from: createdAt) else { return "" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "from earlier today" }
        if calendar.isDateInYesterday(date) { return "from yesterday" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: Date())).day ?? 0
        if days < 7 { return "from \(date.formatted(.dateTime.weekday(.wide)))" }
        return "from \(date.formatted(.dateTime.month(.abbreviated).day()))"
    }
}
