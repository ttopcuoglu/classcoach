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

    // MARK: Lesson plan formats

    /// Which format this lesson uses: a format id, "wivoza", or nil for the
    /// teacher's default.
    let templateChoice: String?
    /// The lesson laid out in that format. Decoded leniently — see
    /// `TemplateContent` — so a shape this build does not expect can never
    /// fail the whole lesson, and with it the lesson list.
    let templateContent: TemplateContent?

    // MARK: Plan a Week

    /// What the teacher added under "Anything else" — carried from a week to
    /// the lessons opened from its days.
    let additionalContext: String?
    /// On a week (`planKind == "week"`): the days, their objectives, and the
    /// week filled in. Decoded leniently — see `WeekPlan`.
    let week: WeekPlan?
    /// On a lesson opened from a day of a week: that week.
    let weekPlanId: String?

    // MARK: Coaching Priorities

    /// The one idea connected to a school focus the teacher turned on, or a
    /// record that the focus was considered and left out. Never throws — see
    /// `LessonSchoolFocusIdea` — so an odd shape hides the idea, not the lesson.
    let schoolFocusIdea: LessonSchoolFocusIdea?

    var isWeek: Bool { planKind == "week" }

    /// A lesson a teacher would hand in on their own form: one Planning Coach
    /// built, or a plan they brought to Improve a Lesson.
    var isFormatable: Bool {
        (isFullLesson && mode == "generated")
            || (mode == "feedback" && !(planText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

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
    /// No Make It Yours button: it is "Add to lesson" on the school-focus
    /// idea, and only runs from there.
    case schoolFocus = "school_focus"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .simplify: return "Simplify"
        case .challenge: return "Add Challenge"
        case .participation: return "Increase Participation"
        case .time: return "Adjust Time"
        case .schoolFocus: return "Add the school focus idea"
        }
    }

    /// One line on what it will actually do to the lesson.
    var hint: String {
        switch self {
        case .simplify: return "Clearer directions, smaller steps, more scaffolds — same learning goal"
        case .challenge: return "Deeper reasoning, transfer, application"
        case .participation: return "More students contributing and showing their thinking"
        case .time: return "Rebuilt sequence and timings to fit the length you pick"
        case .schoolFocus: return "The idea connected to your school focus, worked into the lesson"
        }
    }
}

/// Mirrors `SchoolFocusIdea` in web/src/lib/api.ts: the idea for this lesson,
/// or, with `skipped`, a record that the focus was considered and left out —
/// `reason` is the school's own not-fit line it matched, in its own words.
/// Decoding never throws; without a name it is treated as no idea at all.
struct LessonSchoolFocusIdea: Codable {
    let priorityId: String?
    let name: String
    let text: String?
    let skipped: Bool
    let reason: String?
    let dismissed: Bool
    let added: Bool

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        priorityId = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .priorityId) } ?? nil
        name = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .name) } ?? ""
        text = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .text) } ?? nil
        skipped = c.flatMap { try? $0.decodeIfPresent(Bool.self, forKey: .skipped) } ?? false
        reason = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .reason) } ?? nil
        dismissed = c.flatMap { try? $0.decodeIfPresent(Bool.self, forKey: .dismissed) } ?? false
        added = c.flatMap { try? $0.decodeIfPresent(Bool.self, forKey: .added) } ?? false
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

// MARK: - Lesson plan formats

/// Decodes an element when it can and drops it when it cannot, so one odd
/// entry in a list never fails the list.
struct Lenient<Value: Decodable>: Decodable {
    let value: Value?
    init(from decoder: Decoder) throws { value = try? Value(from: decoder) }
}

/// One box of the teacher's (or school's) form, filled in. `kind` stays a
/// string: the server may grow new kinds, and an unknown one must still show.
struct LaidOutSection: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let text: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "other"
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
    }
}

/// A lesson laid out in a format. Never throws: anything unreadable comes back
/// as an empty layout, which the app treats as "not laid out".
struct TemplateContent: Codable {
    let templateId: String?
    let templateName: String?
    let sections: [LaidOutSection]

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        templateId = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .templateId) }
        templateName = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .templateName) }
        sections = c.flatMap { try? $0.decodeIfPresent([Lenient<LaidOutSection>].self, forKey: .sections) }?.compactMap(\.value) ?? []
    }
}

/// A section of a format: the form's own title, and what Wivoza puts there.
/// Mirrors `TemplateSection` in `web/src/lib/api.ts`.
struct TemplateSection: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var kind: String
    var prompt: String?
    /// On a weekly form: "week" (filled once) or "day" (once per day).
    var scope: String?
}

struct LessonTemplate: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let userId: String?
    let name: String
    let cadence: String
    let sections: [TemplateSection]
    let sourceFileName: String?
    let isDefault: Bool
}

struct LessonTemplates: Decodable {
    let personal: [LessonTemplate]
    let school: [LessonTemplate]
    let schoolName: String?
    let canManageSchool: Bool
    let defaultId: String?
}

/// What Wivoza read from an uploaded form — proposed sections, saved nowhere
/// until the teacher checks them.
struct ReadTemplate: Decodable {
    let name: String?
    let cadence: String
    let sections: [TemplateSection]
    let note: String?
    let sourceFileName: String?
}

struct LessonLayoutResult: Decodable {
    let plan: LessonPlan
    let appliedTemplateId: String?
}

// MARK: - Plan a Week

/// One day of a week. Mirrors `WeekDay` in server/src/lib/lessonWeekModel.ts.
struct WeekDay: Codable, Identifiable {
    let label: String
    let minutes: Int
    /// What the teacher said was already fixed on this day: a quiz, a half day.
    let note: String?
    let objective: String
    /// The full lesson opened from this day, once there is one.
    let lessonPlanId: String?

    var id: String { label }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = try c.decode(String.self, forKey: .label)
        minutes = (try? c.decode(Int.self, forKey: .minutes)) ?? 0
        note = try? c.decodeIfPresent(String.self, forKey: .note)
        objective = (try? c.decode(String.self, forKey: .objective)) ?? ""
        lessonPlanId = try? c.decodeIfPresent(String.self, forKey: .lessonPlanId)
    }
}

struct WeekContentDay: Codable {
    let label: String
    let sections: [LaidOutSection]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = try c.decode(String.self, forKey: .label)
        sections = (try? c.decode([Lenient<LaidOutSection>].self, forKey: .sections))?.compactMap(\.value) ?? []
    }
}

/// The week filled in: boxes filled once for the week, then each day's.
struct WeekContent: Codable {
    let templateId: String?
    let templateName: String
    let shared: [LaidOutSection]
    let days: [WeekContentDay]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        templateId = try? c.decodeIfPresent(String.self, forKey: .templateId)
        templateName = (try? c.decode(String.self, forKey: .templateName)) ?? "Wivoza weekly plan"
        shared = (try? c.decode([Lenient<LaidOutSection>].self, forKey: .shared))?.compactMap(\.value) ?? []
        days = (try? c.decode([Lenient<WeekContentDay>].self, forKey: .days))?.compactMap(\.value) ?? []
    }
}

/// A week plan. Never throws: anything unreadable comes back as an empty week,
/// so one odd week can never fail the lesson list it sits in.
struct WeekPlan: Codable {
    let days: [WeekDay]
    let content: WeekContent?

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: CodingKeys.self)
        days = c.flatMap { try? $0.decode([Lenient<WeekDay>].self, forKey: .days) }?.compactMap(\.value) ?? []
        content = c.flatMap { try? $0.decodeIfPresent(WeekContent.self, forKey: .content) } ?? nil
    }
}
