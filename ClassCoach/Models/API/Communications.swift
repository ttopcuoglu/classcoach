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
