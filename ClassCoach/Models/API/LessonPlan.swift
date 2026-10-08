import Foundation

/// Mirrors the server's `LessonPlan` shape (see `web/src/lib/api.ts`) —
/// `mode` is `"feedback"` (teacher's own plan + coaching), `"generated"`
/// (Planning Coach built it) or `"presentation"` (a review of uploaded
/// slides).
///
/// Everything Planning Coach added is optional, and so is everything that
/// came before it: a sample plan generated before Planning Coach existed has
/// `planKind == nil` and fills `doNow`/`agenda`/`closure`/`hots`/`homework`
/// instead, and those plans are still in teachers' histories. Both shapes
/// decode, and the view picks by what is actually present.
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
    /// Optional because the server leaves it null on a generated plan — only
    /// the feedback and slide-review modes seed a conversation. Decoding this
    /// as a plain array made every generated plan fail to decode, which is
    /// what "the data couldn't be read" meant on the Build a Lesson tab.
    let conversation: [ChatMessage]?
    let suggestedRevision: String?
    /// Presentation review only — nil on a generated or feedback plan. All
    /// optional so an older server response still decodes.
    let fileName: String?
    let slideCount: Int?
    let presentationReview: LessonPlanPresentationReview?
    let deliveryCoaching: LessonPlanDeliveryCoaching?

    // MARK: Planning Coach

    /// `"full"` or `"ideas"` on a generated plan; nil on everything older.
    let planKind: String?
    let durationMinutes: Int?
    let approach: String?
    let successCriteria: String?
    let materials: String?
    let sequence: [LessonStep]?
    let checks: [LessonCheck]?
    let misconceptions: [LessonMisconception]?
    let exitTicket: LessonExitTicket?
    let quickIdeas: [QuickIdea]?
    /// A revision Coach has drafted and the teacher has not applied.
    let pendingAdaptation: PendingAdaptation?
    /// Every version an applied adaptation replaced, oldest first — index 0 is
    /// the original, which is what makes "go back to it" honest.
    let versionHistory: [LessonVersion]?

    /// A lesson Planning Coach built, as opposed to teaching ideas or one of
    /// the older five-slot samples.
    var isFullLesson: Bool { !(sequence ?? []).isEmpty }
    var isQuickIdeas: Bool { !(quickIdeas ?? []).isEmpty }

    /// What the lesson actually runs to, said honestly: the steps' own
    /// minutes, and what was asked for when the two drifted apart.
    var minutesLabel: String? {
        let total = (sequence ?? []).reduce(0) { $0 + ($1.minutes ?? 0) }
        guard total > 0 else { return durationMinutes.map { "\($0) min" } }
        if let asked = durationMinutes, asked != total { return "\(total) min of \(asked) planned" }
        return "\(total) min"
    }

    /// What an Adjust Time revision is working from, so "Shorten to 30
    /// minutes" is only offered when there is something to shorten.
    var currentMinutes: Int? {
        let total = (sequence ?? []).reduce(0) { $0 + ($1.minutes ?? 0) }
        return total > 0 ? total : durationMinutes
    }
}

/// One part of the lesson, in teaching order.
struct LessonStep: Codable, Identifiable {
    let minutes: Int?
    let title: String
    let teacher: String?
    let students: String?

    var id: String { "\(title)-\(minutes ?? 0)" }
}

/// A moment to find out whether students are getting the learning goal.
struct LessonCheck: Codable, Identifiable {
    let when: String?
    let check: String
    let lookFor: String?

    var id: String { check }
}

/// Likely for this content at this grade — never a claim about this teacher's
/// own students. See MISCONCEPTION_RULE in server/src/lib/lessonPlanModel.ts.
struct LessonMisconception: Codable, Identifiable {
    let belief: String
    let surface: String?
    let response: String?

    var id: String { belief }
}

struct LessonExitTicket: Codable {
    let task: String
    let expected: String?
    let signals: String?
    let nextStep: String?

    /// The answer key, in the order the web shows it, skipping what is empty.
    var detail: [(title: String, body: String)] {
        [
            ("Expected answer", expected),
            ("What different responses show", signals),
            ("Suggested next step", nextStep),
        ].compactMap { title, body in
            guard let body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return (title, body)
        }
    }
}

struct QuickIdea: Codable, Identifiable {
    let title: String
    let how: String

    var id: String { title }
}

/// The four adaptations, as the server names them.
enum LessonAdaptation: String, CaseIterable, Identifiable {
    case simplify
    case challenge
    case participation
    case time

    var id: String { rawValue }

    var label: String {
        switch self {
        case .simplify: return "Simplify"
        case .challenge: return "Add Challenge"
        case .participation: return "Increase Participation"
        case .time: return "Adjust Time"
        }
    }

    /// One line on what it will actually do to the lesson.
    var hint: String {
        switch self {
        case .simplify: return "Clearer directions, smaller steps, more scaffolds — same learning goal"
        case .challenge: return "Deeper reasoning, transfer, application"
        case .participation: return "More students contributing and showing their thinking"
        case .time: return "Rebuilt sequence and timings to fit the length you pick"
        }
    }
}

/// A drafted revision, read before it replaces anything. `sections` carries
/// the rewritten lesson — the structured fields for a lesson Planning Coach
/// built, or `planText` for one the teacher brought themselves.
struct PendingAdaptation: Codable {
    let action: String
    let label: String
    let summary: String?
    let minutes: Int?
    let sections: LessonSections
}

struct LessonSections: Codable {
    let objective: String?
    let successCriteria: String?
    let materials: String?
    let approach: String?
    let sequence: [LessonStep]?
    let checks: [LessonCheck]?
    let misconceptions: [LessonMisconception]?
    let exitTicket: LessonExitTicket?
    let planText: String?
}

struct LessonVersion: Codable {
    let label: String?
    let savedAt: String?
    let durationMinutes: Int?
}

/// What the review says about uploaded slides. Mirrors
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
