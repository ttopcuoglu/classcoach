import Foundation

/// Mirrors `web/src/lib/communicationOptions.ts` — plain (label, value)
/// lists matching the server's string-based "enums" exactly, same pattern
/// as `Categories.swift`.
enum CommunicationOptions {
    static let recipientTypes: [(label: String, value: String)] = [
        ("Parent or caregiver", "parent_caregiver"),
        ("Student", "student"),
        ("Colleague", "colleague"),
        ("Administrator", "administrator"),
    ]

    static let messagePurposes: [(label: String, value: String)] = [
        ("Academic concern", "academic_concern"),
        ("Behavior concern", "behavior_concern"),
        ("Attendance concern", "attendance_concern"),
        ("Positive update", "positive_update"),
        ("Meeting request", "meeting_request"),
        ("Follow-up", "follow_up"),
        ("General information", "general_information"),
        ("Other", "other"),
    ]

    static let messageTones: [(label: String, value: String)] = [
        ("Warm and supportive", "warm"),
        ("Professional and neutral", "professional"),
        ("Firm and direct", "firm"),
        ("Urgent", "urgent"),
    ]

    static let messageFormats: [(label: String, value: String)] = [
        ("Email", "email"),
        ("Text message", "text"),
        ("Announcement", "announcement"),
        ("Phone-call follow-up", "phone_call_followup"),
    ]

    static let startingActions: [(label: String, value: String)] = [
        ("Start a new message", "new"),
        ("Respond to a message", "respond"),
        ("Improve my draft", "improve"),
    ]

    static let challengeTypes: [(label: String, value: String)] = [
        ("Angry or accusatory person", "angry_accusatory"),
        ("Grade dispute", "grade_dispute"),
        ("Behavior concern", "behavior_concern"),
        ("Attendance concern", "attendance_concern"),
        ("Unmotivated student", "unmotivated_student"),
        ("Boundary-setting", "boundary_setting"),
        ("Disagreement with a colleague", "disagreement_colleague"),
        ("Formal meeting", "formal_meeting"),
        ("Other / custom scenario", "other_custom"),
    ]

    static let conversationDifficulties: [(label: String, value: String)] = [
        ("Supportive", "supportive"),
        ("Concerned", "concerned"),
        ("Resistant", "resistant"),
        ("Highly escalated", "highly_escalated"),
    ]

    static let meetingFormats: [(label: String, value: String)] = [
        ("In person", "in_person"),
        ("Phone", "phone"),
        ("Video", "video"),
        ("Formal meeting", "formal_meeting"),
    ]

    /// How a one-to-one happens. No "Formal meeting" — that is the other branch
    /// of Prepare, and offering it to someone who said "a person" is offering
    /// them the button they did not press.
    static let personFormats: [(label: String, value: String)] =
        meetingFormats.filter { $0.value != "formal_meeting" }

    /// Preparing for a real conversation, where who it is may not fit four boxes.
    /// Deliberately not in recipientTypes: Practice shares that list and its
    /// generator has to write a specific person.
    static let conversationPersonTypes: [(label: String, value: String)] =
        recipientTypes + [("Someone else", "other")]

    static let meetingTypes: [(label: String, value: String)] = [
        ("Parent or family conference", "parent_family"),
        ("Student conference", "student"),
        ("IEP or 504 meeting", "iep_504"),
        ("Team or department meeting", "team_department"),
        ("Meeting with an administrator", "administrator"),
        ("Post-observation meeting", "post_observation"),
        ("Difficult colleague conversation", "difficult_colleague"),
        ("Other", "other"),
    ]

    /// What the meeting picker offers. "Difficult colleague conversation" is not
    /// a meeting, it is a person — Prepare asks that on the other branch. It
    /// stays in meetingTypes so plans already saved under it keep their label.
    static let meetingTypeChoices: [(label: String, value: String)] =
        meetingTypes.filter { $0.value != "difficult_colleague" }

    static func meetingTypeLabel(_ value: String?) -> String? {
        guard let value else { return nil }
        return meetingTypes.first { $0.value == value }?.label ?? value
    }

    /// The example in "What is going on?" follows what the teacher just picked.
    /// A co-teacher example under "Parent or family conference" is noise, and a
    /// blank box is worse — the placeholder is the only thing on the screen
    /// showing how much detail is worth giving.
    private static let personExamples: [String: String] = [
        "parent_caregiver": "A parent emailed saying I am picking on their son. I have to answer today and I do not want to make it worse...",
        "student": "He has stopped handing anything in and shrugs when I ask why. I want to get somewhere without it becoming a lecture...",
        "colleague": "My co-teacher keeps correcting me in front of the class, and it is getting worse...",
        "administrator": "I need to tell my principal the new schedule is not working for my inclusion students, and I expect pushback...",
        "other": "Who it is with, what has been happening, and what makes it hard to say...",
    ]

    private static let meetingExamples: [String: String] = [
        "parent_family": "Conference is Thursday. Her grade has dropped since October and I do not think the family knows yet...",
        "student": "I want to sit down with him about the missing work before it turns into a failing quarter...",
        "iep_504": "His plan says extended time, he is still not finishing, and I think the accommodations need revisiting...",
        "team_department": "I want to raise that our common assessment does not match what we are actually teaching, without it sounding like a complaint...",
        "administrator": "I am asking for a different duty assignment, and I know the answer is probably no...",
        "post_observation": "The group work stretch went badly while she was in the room, and I want to talk about what she saw...",
        "other": "What the meeting is about, and what makes it hard...",
    ]

    static func situationPlaceholder(isMeeting: Bool, recipientType: String?, meetingType: String?) -> String {
        if isMeeting, let meetingType, let example = meetingExamples[meetingType] { return example }
        if !isMeeting, let recipientType, let example = personExamples[recipientType] { return example }
        // Nothing chosen yet, so the example cannot name anyone without guessing.
        return isMeeting
            ? "What the meeting is about, and what makes it hard..."
            : "Who it is with, what has been happening, and what makes it hard to say..."
    }

    static let reviewModes: [(label: String, value: String)] = [
        ("Give feedback only", "feedback_only"),
        ("Rewrite my response", "rewrite_only"),
        ("Both", "both"),
    ]
}

struct ParentMessage: Codable, Identifiable {
    let id: String
    let startingAction: String?
    let incidentSummary: String?
    let receivedMessage: String?
    let existingDraft: String?
    let recipientType: String?
    let purpose: String?
    let format: String?
    let tone: String
    let draftText: String
    let title: String?
    let saved: Bool
    let createdAt: String
    let conversation: [ChatMessage]
}

struct CoachingReportDimension: Codable {
    let rating: String
    let feedback: String
}

struct CoachingReport: Codable {
    let clarity: CoachingReportDimension
    let empathy: CoachingReportDimension
    let evidence: CoachingReportDimension
    let boundaries: CoachingReportDimension
    let collaboration: CoachingReportDimension
    let resolution: CoachingReportDimension
    let didWell: String
    let priority: String
    let strongerPhrase: String
    let modelResponse: String
    let nextStep: String
}

struct ConversationPrep: Codable, Identifiable {
    let id: String
    let category: String?
    let personType: String?
    let difficulty: String?
    let reviewMode: String?
    let source: String
    let gradeBand: String?
    let situationText: String
    let responseText: String
    let feedback: String?
    let modelResponse: String?
    let rating: Int?
    let coachingReport: CoachingReport?
    let title: String?
    let saved: Bool
    let createdAt: String
    let conversation: [ChatMessage]
}

struct ConversationPlanContent: Codable {
    let opening: String
    let mainConcern: String
    let facts: String
    let questions: String
    let reactions: String
    let recommendedResponses: String
    let phrasesToAvoid: String
    let boundaries: String
    let closing: String
    let modelResponse: String
    let nextSteps: String
    let adminInvolvement: String
}

struct ConversationPlan: Codable, Identifiable {
    let id: String
    let recipientType: String?
    let situationText: String
    let desiredOutcome: String?
    let concerns: String?
    let background: String?
    let meetingFormat: String?
    let planContent: ConversationPlanContent?
    let title: String?
    let saved: Bool
    let createdAt: String
    let conversation: [ChatMessage]
}
