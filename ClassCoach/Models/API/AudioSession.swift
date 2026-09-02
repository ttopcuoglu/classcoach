import Foundation

/// Mirrors `web/src/lib/api.ts`'s Audio Coaching types. `status` drives
/// which screen shows (see server/prisma/schema.prisma / AudioCoaching.tsx):
/// setup/recording/paused → recording UI; transcribing → spinner;
/// tagging → speaker picker; analyzed/locked → the six-tab report.
struct AudioHighlight: Decodable {
    let label: String
    let timestampSec: Double
    let excerpt: String
    let durationSec: Double?
}

struct AudioPhase: Decodable {
    let label: String
    let startSec: Double
    let endSec: Double
}

struct AudioQuote: Decodable {
    let quote: String
    let timestampSec: Double
}

struct AudioFollowUp: Decodable {
    let timestampSec: Double
    let text: String
}

struct AudioQuestionLogEntry: Decodable {
    let timestampSec: Double
    let type: String // "recall" | "higher_order"
    let waitTimeSec: Double?
    let text: String
    let followUps: [AudioFollowUp]
}

struct AudioReflectMessage: Decodable {
    let role: String
    let text: String
    let createdAt: String
}

struct AudioTopicTerm: Decodable {
    let term: String
    let count: Int
}

/// `topicTerms` can be the legacy flat `[String]` shape or the newer
/// teacher/student split — both decoded, caller picks whichever is non-nil.
struct AudioLessonContent: Decodable {
    let topicTermsFlat: [String]?
    let topicTermsSplit: TeacherStudentTerms?
    let statedObjectiveFound: Bool?
    let statedObjectiveQuote: String?
    let statedObjectiveTimestampSec: Double?
    let connections: [AudioQuote]
    let vocabulary: [AudioQuote]
    let subject: String?

    struct TeacherStudentTerms: Decodable {
        let teacher: [AudioTopicTerm]
        let student: [AudioTopicTerm]
    }

    private enum CodingKeys: String, CodingKey {
        case topicTerms, statedObjective, connections, vocabulary, subject
    }
    private enum ObjectiveKeys: String, CodingKey {
        case found, quote, timestampSec
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let flat = try? container.decode([String].self, forKey: .topicTerms) {
            topicTermsFlat = flat
            topicTermsSplit = nil
        } else {
            topicTermsFlat = nil
            topicTermsSplit = try? container.decode(TeacherStudentTerms.self, forKey: .topicTerms)
        }
        if let objective = try? container.nestedContainer(keyedBy: ObjectiveKeys.self, forKey: .statedObjective) {
            statedObjectiveFound = try? objective.decode(Bool.self, forKey: .found)
            statedObjectiveQuote = try? objective.decode(String.self, forKey: .quote)
            statedObjectiveTimestampSec = try? objective.decode(Double.self, forKey: .timestampSec)
        } else {
            statedObjectiveFound = nil
            statedObjectiveQuote = nil
            statedObjectiveTimestampSec = nil
        }
        connections = (try? container.decode([AudioQuote].self, forKey: .connections)) ?? []
        vocabulary = (try? container.decode([AudioQuote].self, forKey: .vocabulary)) ?? []
        subject = try? container.decode(String.self, forKey: .subject)
    }
}

struct AudioContentNote: Decodable, Identifiable {
    let id: String
    let label: String
    let text: String
    let timestampSec: Double
    let excerpt: String
}

struct AudioContentNotes: Decodable {
    let subject: String
    let notes: [AudioContentNote]
}

struct AudioSession: Decodable, Identifiable {
    let id: String
    let teacherName: String?
    let classSubject: String?
    let period: String?
    let gradeLevel: String?
    let sessionDate: String
    let consentConfirmed: Bool
    let status: String
    let durationSec: Double?
    let teacherTalkPct: Double?
    let studentTalkPct: Double?
    let questionCount: Int?
    let higherOrderPct: Double?
    let avgWaitTimeSec: Double?
    let cfuCount: Int?
    let metricsDetail: [String: Double]?
    let highlights: [AudioHighlight]?
    let phases: [AudioPhase]?
    let questionLog: [AudioQuestionLogEntry]?
    let reflectConversation: [AudioReflectMessage]?
    let lessonContent: AudioLessonContent?
    let contentNotes: AudioContentNotes?
    let strengths: String?
    let growthAreas: String?
    let nextStep: String?
    let followUpDate: String?
    let createdAt: String
    let updatedAt: String
}

struct TranscriptSegment: Decodable, Identifiable {
    let id: String
    let speakerLabel: String
    let rawSpeakerTag: String
    let startSec: Double
    let endSec: Double
    let text: String
}

struct AudioSessionWithSegments: Decodable, Identifiable {
    var id: String { session.id }
    let session: AudioSession
    let segments: [TranscriptSegment]

    // Flattened accessors so call sites can read `withSegments.teacherTalkPct`
    // the same way the web app reads straight off the session object.
    var status: String { session.status }
    var classSubject: String? { session.classSubject }
    var teacherName: String? { session.teacherName }
    var period: String? { session.period }
    var gradeLevel: String? { session.gradeLevel }
    var sessionDate: String { session.sessionDate }
    var durationSec: Double? { session.durationSec }
    var teacherTalkPct: Double? { session.teacherTalkPct }
    var studentTalkPct: Double? { session.studentTalkPct }
    var questionCount: Int? { session.questionCount }
    var higherOrderPct: Double? { session.higherOrderPct }
    var avgWaitTimeSec: Double? { session.avgWaitTimeSec }
    var cfuCount: Int? { session.cfuCount }
    var metricsDetail: [String: Double]? { session.metricsDetail }
    var highlights: [AudioHighlight]? { session.highlights }
    var phases: [AudioPhase]? { session.phases }
    var questionLog: [AudioQuestionLogEntry]? { session.questionLog }
    var reflectConversation: [AudioReflectMessage]? { session.reflectConversation }
    var lessonContent: AudioLessonContent? { session.lessonContent }
    var contentNotes: AudioContentNotes? { session.contentNotes }
    var strengths: String? { session.strengths }
    var growthAreas: String? { session.growthAreas }
    var nextStep: String? { session.nextStep }
    var followUpDate: String? { session.followUpDate }

    init(session: AudioSession, segments: [TranscriptSegment]) {
        self.session = session
        self.segments = segments
    }

    init(from decoder: Decoder) throws {
        session = try AudioSession(from: decoder)
        let container = try decoder.container(keyedBy: DynamicKey.self)
        segments = (try? container.decode([TranscriptSegment].self, forKey: DynamicKey(stringValue: "segments")!)) ?? []
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        init?(stringValue: String) { self.stringValue = stringValue }
        var intValue: Int? { nil }
        init?(intValue: Int) { nil }
    }
}

struct SpeakerSample: Decodable {
    let rawSpeakerTag: String
    let sample: String
}

/// Matches `web/src/lib/api.ts`'s `FocusMetric` union exactly.
enum FocusMetric: String, Codable, CaseIterable {
    case talkRatio, higherOrderPct, avgWaitTime, cfuCount, followUpQuestionCount
    case redirectionCount, toneRatio, directiveCount, nameMentionCount, feedbackSpecificity
}
