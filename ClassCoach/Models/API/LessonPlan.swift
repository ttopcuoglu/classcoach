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
    /// Presentation review only — nil on a generated or feedback plan. All
    /// optional so an older server response still decodes.
    let fileName: String?
    let slideCount: Int?
    let presentationReview: LessonPlanPresentationReview?
    let deliveryCoaching: LessonPlanDeliveryCoaching?
}

/// What the review says about an uploaded deck. Mirrors
/// `LessonPlanPresentationReview` in `web/src/lib/api.ts`.
struct LessonPlanPresentationReview: Codable {
    let gradeLevelFit: String?
    let visuals: String?
    let ideas: String?
    let length: String?
    let implementation: String?

    /// The sections in the order the web renders them, skipping the empty ones
    /// so a thin review does not show five blank headings.
    var sections: [(title: String, body: String)] {
        [
            ("Grade-level fit", gradeLevelFit),
            ("Visuals", visuals),
            ("Ideas", ideas),
            ("Length", length),
            ("Implementation", implementation),
        ].compactMap { title, body in
            guard let body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return (title, body)
        }
    }
}

/// Asked for separately, after the review — how to actually deliver the deck.
struct LessonPlanDeliveryCoaching: Codable {
    let openingHook: String?
    let pacing: String?
    let engagementCheckpoints: String?
    let explainingTheHardPart: String?
    let closing: String?

    var sections: [(title: String, body: String)] {
        [
            ("Opening hook", openingHook),
            ("Pacing", pacing),
            ("Engagement checkpoints", engagementCheckpoints),
            ("Explaining the hard part", explainingTheHardPart),
            ("Closing", closing),
        ].compactMap { title, body in
            guard let body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return (title, body)
        }
    }
}
