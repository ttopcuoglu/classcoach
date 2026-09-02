import Foundation

/// Mirrors the server's `LessonPlan` shape (see `web/src/lib/api.ts`) —
/// `mode` is `"feedback"` (teacher's own plan + coaching) or `"generated"`
/// (a sample plan from just an objective).
struct LessonPlan: Codable, Identifiable {
    let id: String
    let mode: String
    let objective: String?
    let unitName: String?
    let essentialQuestion: String?
    let standard: String?
    let subject: String?
    let gradeLevel: String?
    let planText: String?
    let feedback: String?
    let rating: Int?
    let doNow: String?
    let agenda: String?
    let closure: String?
    let hots: String?
    let homework: String?
    let saved: Bool
    let shareToken: String?
    let createdAt: String
    let conversation: [ChatMessage]
    let suggestedRevision: String?
}
