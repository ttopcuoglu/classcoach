import Foundation

/// Mirrors `web/src/lib/api.ts`'s Audio Coaching types. `status` drives
/// which screen shows (see server/prisma/schema.prisma / AudioCoaching.tsx):
/// setup/recording/paused → recording UI; transcribing → spinner;
/// tagging → speaker picker; analyzing → the wait while the server reads the
/// transcript; analyzed/locked → the six-tab report.
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
/// One of the lesson's academic terms and how often each side said it —
/// chosen and counted by the server (server/src/lib/keyTerms.ts).
struct AudioKeyTerm: Decodable {
    let term: String
    let teacherCount: Int
    let studentCount: Int
}

struct AudioLessonContent: Decodable {
    let topicTermsFlat: [String]?
    let topicTermsSplit: TeacherStudentTerms?
    let statedObjectiveFound: Bool?
    let statedObjectiveQuote: String?
    let statedObjectiveTimestampSec: Double?
    /// Which detector answered — "phrase" or "model". Absent on reports
    /// analysed before Claude read the transcript for this.
    let statedObjectiveSource: String?
    /// What the lesson covered. Absent on those same older reports.
    let summary: String?
    let connections: [AudioQuote]
    let vocabulary: [AudioQuote]
    let subject: String?
    /// Ways into this topic from the world students live in — ideas for next
    /// time, not a reading of the lesson. Absent on older reports.
    let connectionIdeas: [String]?
    /// Absent on reports analysed before this shipped, and when the lesson
    /// had none.
    let keyTerms: [AudioKeyTerm]?

    struct TeacherStudentTerms: Decodable {
        let teacher: [AudioTopicTerm]
        let student: [AudioTopicTerm]
    }

    private enum CodingKeys: String, CodingKey {
        case topicTerms, statedObjective, summary, connections, vocabulary, subject, connectionIdeas, keyTerms
    }
    private enum ObjectiveKeys: String, CodingKey {
        case found, quote, timestampSec, source
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
            statedObjectiveSource = try? objective.decode(String.self, forKey: .source)
        } else {
            statedObjectiveFound = nil
            statedObjectiveQuote = nil
            statedObjectiveTimestampSec = nil
            statedObjectiveSource = nil
        }
        summary = try? container.decode(String.self, forKey: .summary)
        connections = (try? container.decode([AudioQuote].self, forKey: .connections)) ?? []
        vocabulary = (try? container.decode([AudioQuote].self, forKey: .vocabulary)) ?? []
        subject = try? container.decode(String.self, forKey: .subject)
        connectionIdeas = try? container.decode([String].self, forKey: .connectionIdeas)
        keyTerms = try? container.decode([AudioKeyTerm].self, forKey: .keyTerms)
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
    /// Optional because the server writes null whenever the lesson has no
    /// identifiable school subject — a recording that is an interview, a
    /// rehearsal, or anything the subject read cannot place.
    ///
    /// It was `String`, and that one declaration emptied whole teachers'
    /// session lists. Swift decodes the list as a single array, so a single
    /// row with a null subject fails the decode of all of them; the list came
    /// back empty, which the screen showed as "Sessions you record will show
    /// up here". With the list empty, reconcileLocalAudio then judged every
    /// recording on the phone to be one the server had never heard of and
    /// cancelled its upload — so a typing mistake in a field nothing displays
    /// presented as recordings that would not send. One account had carried
    /// such a row since September and had never once uploaded a lesson.
    ///
    /// Nothing in the app reads this. The web guards it already.
    let subject: String?
    let notes: [AudioContentNote]
    /// Ways into this topic from the world students live in — ideas for next
    /// time, not a reading of the lesson. Absent on older notes.
    let connectionIdeas: [String]?
    /// What trips students up in this topic — subject knowledge, not a reading
    /// of this lesson. Absent on notes written before it existed.
    let misconceptions: [String]?
}

/// Mirrors `web/src/lib/api.ts`'s `AudioRubricLens` — a session's evidence
/// organised under a teaching framework's components. Never a level.
struct AudioRubricEvidence: Decodable {
    let kind: String
    let timestampSec: Double
    let text: String
}

struct AudioRubricComponent: Decodable, Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let domain: String
    let audibility: String
    let summary: String
    let nextStep: String?
    let evidence: [AudioRubricEvidence]
}

struct AudioRubricNotObservable: Decodable, Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let domain: String
    let reason: String
}

struct AudioRubricLens: Decodable {
    let framework: String
    let frameworkName: String
    let generatedAt: String
    let components: [AudioRubricComponent]
    let notObservable: [AudioRubricNotObservable]
}

/// Mirrors `web/src/lib/api.ts`'s `AudioEscalation` — whether a bid for the
/// room's attention HELD, rather than how many redirections there were.
///
/// A count tells you which group a teacher has, not what they did, which is
/// why `redirectionCount` was retired from My Growth. A run of asks in close
/// succession that climbs toward a consequence is the spiral teachers
/// describe, and it is readable from the teacher's own speech alone.
///
/// EVERY FIELD IS OPTIONAL, including ones the server always writes today.
/// These are stored JSON rather than a versioned contract, the session
/// decodes this with `try?`, and the Hard Look has already taught this
/// lesson once: a single required field that an older row lacked made the
/// whole section vanish silently, leaving a button that did nothing.
struct AudioEscalationCluster: Decodable, Identifiable {
    var id: String { "\(startSec ?? 0)|\(topRung ?? "")" }
    let startSec: Double?
    let endSec: Double?
    let fromRung: String?
    let topRung: String?
    let climbed: Bool?
    /// Null when the transcript's wording was too rough to put in the
    /// teacher's mouth. The moment is still real; only the quote is withheld.
    let quote: String?
}

struct AudioEscalationRepeat: Decodable, Identifiable {
    var id: String { "\(timestampSec ?? 0)" }
    let timestampSec: Double?
    let quote: String?
}

struct AudioEscalation: Decodable {
    /// "found" | "confirmed_none" | "not_measurable". Optional like the rest;
    /// an unrecognised or missing state renders nothing rather than guessing.
    let state: String?
    let reason: String?
    let peakRung: String?
    /// Most severe first. The report shows the first and not the list,
    /// because the hardest run repeats across readings and a marginal one
    /// does not.
    let clusters: [AudioEscalationCluster]?
    let repeatedAsks: [AudioEscalationRepeat]?
    let capturedSharePct: Int?

    /// How much force the teacher had brought to bear, in the same words the
    /// web report uses, so a teacher reading both sees one vocabulary.
    static func rungPhrase(_ rung: String?) -> String? {
        switch rung {
        case "attention": return "asking for the room\u{2019}s attention"
        case "behaviour": return "telling the room what to stop or start"
        case "named": return "naming a student"
        case "consequence": return "naming a consequence"
        case "removal": return "separating a student from the group"
        default: return nil
        }
    }
}

/// Mirrors `web/src/lib/api.ts`'s `AudioHardLook` — the least generous honest
/// reading of the same evidence Rubric Lens organises. Each of the four
/// sections comes back as either a criticism with quotes behind it or an
/// explicit clear, and a clear is a real result rather than a blank.
struct AudioHardLookCritique: Decodable, Identifiable {
    /// The headline, not the section: a section carries several findings now,
    /// and keying on it gave every finding in a section the same id, which
    /// SwiftUI resolves by rendering one of them.
    var id: String { "\(section)|\(headline)" }
    let section: String
    let headline: String
    let critique: String
    /// Optional because these are stored JSON, not a versioned contract, and a
    /// row written before a field existed still has to decode.
    ///
    /// `nextStep` was added when the Hard Look was reworked, and reports
    /// generated before that have critiques without it. Required here, those
    /// rows failed to decode — and because the session decodes hardLook with
    /// `try?`, the failure was silent: the whole Hard Look vanished and the
    /// app offered to build one, while the server kept returning the stored
    /// copy it could not read. A button that did nothing, with nothing on
    /// screen to say why.
    let likelyCost: String?
    let nextStep: String?
    let evidence: [AudioRubricEvidence]?
}

struct AudioHardLookClear: Decodable, Identifiable {
    var id: String { section }
    let section: String
    let reason: String
}

/// What the audible student talk was about — the only signal in this report
/// that can tell a discussion from a room talking over itself, since both
/// produce the same student talk share. Null means not measured, never zero.
struct AudioStudentTurnFocus: Decodable {
    let timestampSec: Double
    let text: String
    let kind: String
}

/// One thing to do next lesson per Insights section, written with the class
/// summary. A section with nothing worth suggesting is nil.
struct AudioNextSteps: Decodable {
    let talk: String?
    let questions: String?
    let climate: String?
}

/// The one moment most worth a second look, chosen by a read of the transcript
/// (server/src/lib/momentToRevisit.ts). Only "found" carries a moment; "thin",
/// "not_a_lesson" and "clear" are the read saying it has none to give.
struct AudioMomentToRevisit: Decodable {
    let status: String
    let headline: String?
    /// The transcript's own words, never a paraphrase.
    let quote: String?
    let timestampSec: Double?
    let whyItMatters: String?
    let tryNext: String?
}

struct AudioStudentTalkFocus: Decodable {
    let classified: Int
    let sampled: Bool
    let onTopic: Int
    let procedural: Int
    let offTopic: Int
    let unclear: Int
    let examples: [AudioStudentTurnFocus]
}

struct AudioHardLook: Decodable {
    let generatedAt: String
    let critiques: [AudioHardLookCritique]
    let cleared: [AudioHardLookClear]
}

/// What the teacher said and did, read from the transcript — mirrors
/// `AudioTeachingMoves` in web/src/lib/api.ts. Only the parts the Summary
/// page reads are decoded; every field is optional and decoded with `try?`,
/// so a shape this app does not know yet hides a card instead of the lesson.
struct AudioTeachingMoves: Decodable {
    struct Quoted: Decodable {
        let quote: String
        let timestampSec: Double
    }
    struct QuestionKind: Decodable {
        let timestampSec: Double
        let kind: String
    }
    struct Direction: Decodable {
        let timestampSec: Double
        let parts: [String]
    }
    struct Redirection: Decodable {
        let timestampSec: Double
        let clarity: String
    }
    struct Participation: Decodable {
        let invitations: [Quoted]
    }
    struct ArcStage: Decodable {
        let role: String
        let title: String
        let startSec: Double
        let endSec: Double
    }
    /// The Summary headline: the one pattern across the sections (server
    /// lib/summaryHeadline.ts). `section` is where it points the next step.
    struct Headline: Decodable {
        let text: String
        let section: String?
    }

    let questionKinds: [QuestionKind]?
    let directions: [Direction]?
    let explanations: [Quoted]?
    let invitations: [Quoted]?
    let redirections: [Redirection]?
    let participation: Participation?
    let arc: [ArcStage]?
    let headline: Headline?

    private enum CodingKeys: String, CodingKey {
        case questionKinds, directions, explanations, invitations, redirections, participation, arc, headline
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        questionKinds = try? c.decodeIfPresent([QuestionKind].self, forKey: .questionKinds)
        directions = try? c.decodeIfPresent([Direction].self, forKey: .directions)
        explanations = try? c.decodeIfPresent([Quoted].self, forKey: .explanations)
        invitations = try? c.decodeIfPresent([Quoted].self, forKey: .invitations)
        redirections = try? c.decodeIfPresent([Redirection].self, forKey: .redirections)
        participation = try? c.decodeIfPresent(Participation.self, forKey: .participation)
        arc = try? c.decodeIfPresent([ArcStage].self, forKey: .arc)
        headline = try? c.decodeIfPresent(Headline.self, forKey: .headline)
    }
}

/// The one focus for next lesson the teacher picked from Try next time.
struct AudioLessonFocus: Decodable {
    struct Next: Decodable {
        let itemId: String
    }
    let next: Next?
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
    /// Set when the server took the audio. Absent on sessions recorded before
    /// transcription became a background job, and while an upload is still in
    /// flight — a row with no start time simply shows no percentage.
    let transcribeStartedAt: String?
    let failureReason: String?
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
    let teachingMoves: AudioTeachingMoves?
    /// `var` so a pick on Summary shows at once, before the save returns.
    var lessonFocus: AudioLessonFocus?

    /// ISO-8601, with or without fractional seconds depending on the driver.
    var transcribeStartedAtDate: Date? {
        guard let transcribeStartedAt else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: transcribeStartedAt) ?? ISO8601DateFormatter().date(from: transcribeStartedAt)
    }
    let rubricLens: AudioRubricLens?
    /// Null unless the teacher has asked for it — never generated with the report.
    let hardLook: AudioHardLook?
    /// Absent on every report analyzed before this existed; re-analyzing
    /// fills it. Nil is never "no escalation" — see AudioEscalation's states.
    let escalation: AudioEscalation?
    /// Null unless the lesson had enough audible student turns to characterise.
    let studentTalkFocus: AudioStudentTalkFocus?
    /// Null until the lesson has been read for it — the Summary tab asks.
    let momentToRevisit: AudioMomentToRevisit?
    /// Null on reports summarised before this existed.
    let nextSteps: AudioNextSteps?
    /// A plain-language "Lesson at a glance" paragraph, generated after analysis.
    let classSummary: String?
    /// Narrative for the Checks & Feedback section, written in the same model
    /// call as `classSummary`. Absent on reports made before it existed.
    let checksNarrative: String?
    /// Narrative for Climate & Routines, from the same call.
    let climateNarrative: String?
    /// Content Specialist Notes — one expert narrative for Clarity & Content.
    let contentNarrative: String?
    let talkNarrative: String?
    let questionsNarrative: String?
    let strengths: String?
    let growthAreas: String?
    let nextStep: String?
    let followUpDate: String?
    let createdAt: String
    let updatedAt: String

    private enum CodingKeys: String, CodingKey {
        case id, teacherName, classSubject, period, gradeLevel, sessionDate, consentConfirmed, status,
             durationSec, transcribeStartedAt, failureReason,
             teacherTalkPct, studentTalkPct, questionCount, higherOrderPct, avgWaitTimeSec,
             cfuCount, metricsDetail, highlights, phases, questionLog, reflectConversation, lessonContent,
             contentNotes, teachingMoves, lessonFocus, rubricLens, hardLook, escalation, studentTalkFocus, momentToRevisit, nextSteps, classSummary, checksNarrative, climateNarrative, contentNarrative, talkNarrative, questionsNarrative, strengths, growthAreas, nextStep, followUpDate, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        teacherName = try container.decodeIfPresent(String.self, forKey: .teacherName)
        classSubject = try container.decodeIfPresent(String.self, forKey: .classSubject)
        period = try container.decodeIfPresent(String.self, forKey: .period)
        gradeLevel = try container.decodeIfPresent(String.self, forKey: .gradeLevel)
        sessionDate = try container.decode(String.self, forKey: .sessionDate)
        consentConfirmed = try container.decode(Bool.self, forKey: .consentConfirmed)
        status = try container.decode(String.self, forKey: .status)
        durationSec = try container.decodeIfPresent(Double.self, forKey: .durationSec)
        transcribeStartedAt = try container.decodeIfPresent(String.self, forKey: .transcribeStartedAt)
        failureReason = try container.decodeIfPresent(String.self, forKey: .failureReason)
        teacherTalkPct = try container.decodeIfPresent(Double.self, forKey: .teacherTalkPct)
        studentTalkPct = try container.decodeIfPresent(Double.self, forKey: .studentTalkPct)
        questionCount = try container.decodeIfPresent(Int.self, forKey: .questionCount)
        higherOrderPct = try container.decodeIfPresent(Double.self, forKey: .higherOrderPct)
        avgWaitTimeSec = try container.decodeIfPresent(Double.self, forKey: .avgWaitTimeSec)
        cfuCount = try container.decodeIfPresent(Int.self, forKey: .cfuCount)
        // The server's metricsDetail is `Record<string, number | null>` —
        // e.g. positiveToCorrectiveRatio is null whenever there's no
        // positive/corrective language to compute a ratio from, a normal,
        // common case (see server/src/lib/audioAnalysis.ts). Decoding
        // straight to [String: Double] throws on the first null value,
        // which silently dropped that session — and every other session in
        // the same list response — from the UI with no visible error.
        // Decoding as [String: Double?] and dropping null entries matches
        // how every call site already treats a missing key.
        let rawMetrics = try container.decodeIfPresent([String: Double?].self, forKey: .metricsDetail)
        metricsDetail = rawMetrics?.compactMapValues { $0 }
        highlights = try container.decodeIfPresent([AudioHighlight].self, forKey: .highlights)
        phases = try container.decodeIfPresent([AudioPhase].self, forKey: .phases)
        questionLog = try container.decodeIfPresent([AudioQuestionLogEntry].self, forKey: .questionLog)
        reflectConversation = try container.decodeIfPresent([AudioReflectMessage].self, forKey: .reflectConversation)
        lessonContent = try container.decodeIfPresent(AudioLessonContent.self, forKey: .lessonContent)
        contentNotes = try container.decodeIfPresent(AudioContentNotes.self, forKey: .contentNotes)
        teachingMoves = try? container.decodeIfPresent(AudioTeachingMoves.self, forKey: .teachingMoves)
        lessonFocus = try? container.decodeIfPresent(AudioLessonFocus.self, forKey: .lessonFocus)
        // try? so an unexpected shape hides the lens instead of dropping the whole session.
        rubricLens = try? container.decodeIfPresent(AudioRubricLens.self, forKey: .rubricLens)
        hardLook = try? container.decodeIfPresent(AudioHardLook.self, forKey: .hardLook)
        escalation = try? container.decodeIfPresent(AudioEscalation.self, forKey: .escalation)
        studentTalkFocus = try? container.decodeIfPresent(AudioStudentTalkFocus.self, forKey: .studentTalkFocus)
        momentToRevisit = try? container.decodeIfPresent(AudioMomentToRevisit.self, forKey: .momentToRevisit)
        nextSteps = try? container.decodeIfPresent(AudioNextSteps.self, forKey: .nextSteps)
        classSummary = try? container.decodeIfPresent(String.self, forKey: .classSummary)
        checksNarrative = try? container.decodeIfPresent(String.self, forKey: .checksNarrative)
        climateNarrative = try? container.decodeIfPresent(String.self, forKey: .climateNarrative)
        contentNarrative = try? container.decodeIfPresent(String.self, forKey: .contentNarrative)
        talkNarrative = try? container.decodeIfPresent(String.self, forKey: .talkNarrative)
        questionsNarrative = try? container.decodeIfPresent(String.self, forKey: .questionsNarrative)
        strengths = try container.decodeIfPresent(String.self, forKey: .strengths)
        growthAreas = try container.decodeIfPresent(String.self, forKey: .growthAreas)
        nextStep = try container.decodeIfPresent(String.self, forKey: .nextStep)
        followUpDate = try container.decodeIfPresent(String.self, forKey: .followUpDate)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        updatedAt = try container.decode(String.self, forKey: .updatedAt)
    }
}

struct TranscriptSegment: Decodable, Identifiable {
    let id: String
    let speakerLabel: String
    let rawSpeakerTag: String
    let startSec: Double
    let endSec: Double
    let text: String
}

/// Worked out by the server from the loudness envelope, for recordings that
/// carried one. `seconds` is one character per second of the lesson: w words,
/// q quiet, s sound with no words, - no reading.
struct SoundTimeline: Decodable {
    struct Run: Decodable {
        let startSec: Double
        let endSec: Double
    }
    let seconds: String
    let wordsSec: Double
    let soundSec: Double
    let quietSec: Double
    let soundRuns: [Run]
}

struct AudioSessionWithSegments: Decodable, Identifiable {
    var id: String { session.id }
    var session: AudioSession
    let segments: [TranscriptSegment]
    var soundTimeline: SoundTimeline? = nil

    // Flattened accessors so call sites can read `withSegments.teacherTalkPct`
    // the same way the web app reads straight off the session object.
    var status: String { session.status }
    var checksNarrative: String? { session.checksNarrative }
    var climateNarrative: String? { session.climateNarrative }
    var contentNarrative: String? { session.contentNarrative }
    var talkNarrative: String? { session.talkNarrative }
    var questionsNarrative: String? { session.questionsNarrative }
    var classSubject: String? { session.classSubject }
    var teacherName: String? { session.teacherName }
    var period: String? { session.period }
    var gradeLevel: String? { session.gradeLevel }
    var sessionDate: String { session.sessionDate }
    var durationSec: Double? { session.durationSec }
    var failureReason: String? { session.failureReason }
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
    /// Forwarded so the report header names the lesson the same way the
    /// list does — see AudioSession.displayTitle.
    var displayTitle: String { session.displayTitle }
    var contentNotes: AudioContentNotes? { session.contentNotes }
    var teachingMoves: AudioTeachingMoves? { session.teachingMoves }
    var lessonFocus: AudioLessonFocus? { session.lessonFocus }
    var rubricLens: AudioRubricLens? { session.rubricLens }
    var hardLook: AudioHardLook? { session.hardLook }
    var escalation: AudioEscalation? { session.escalation }
    var studentTalkFocus: AudioStudentTalkFocus? { session.studentTalkFocus }
    var momentToRevisit: AudioMomentToRevisit? { session.momentToRevisit }
    var nextSteps: AudioNextSteps? { session.nextSteps }
    var classSummary: String? { session.classSummary }
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
        soundTimeline = try? container.decode(SoundTimeline.self, forKey: DynamicKey(stringValue: "soundTimeline")!)
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        init?(stringValue: String) { self.stringValue = stringValue }
        var intValue: Int? { nil }
        init?(intValue: Int) { nil }
    }
}

/// One voice diarization found, as the "Which voice is the teacher?" cards
/// show it. The server sends them most-talk-first and carries how much each
/// voice spoke: a card showing only a speaker number and one line of text
/// gave a teacher no way to tell the voice that talked all lesson from the
/// one that said nine things, and tagging the wrong one swaps every talk
/// number in the report. Optional so a response from a server that predates
/// those counts still decodes.
struct SpeakerSample: Decodable {
    let rawSpeakerTag: String
    let sample: String
    let totalSec: Double?
    let utteranceCount: Int?

    private enum CodingKeys: String, CodingKey {
        case rawSpeakerTag, sample, totalSec, utteranceCount
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rawSpeakerTag = try container.decode(String.self, forKey: .rawSpeakerTag)
        sample = (try? container.decode(String.self, forKey: .sample)) ?? ""
        totalSec = try? container.decodeIfPresent(Double.self, forKey: .totalSec)
        utteranceCount = try? container.decodeIfPresent(Int.self, forKey: .utteranceCount)
    }
}

/// Matches `web/src/lib/api.ts`'s `FocusMetric` union exactly.
/// A teacher's chosen My Growth focus, persisted on the account.
///
/// Retired members are kept rather than deleted: the column holds whatever was
/// chosen when it was chosen, and a value this enum no longer admits would
/// fail to decode on a real account. What changed is which ones My Growth
/// offers and charts — see FocusMetrics.trendable.
enum FocusMetric: String, Codable, CaseIterable {
    case talkRatio, higherOrderPct, avgWaitTime, cfuCount, followUpQuestionCount
    case redirectionCount, toneRatio, directiveCount, nameMentionCount, feedbackSpecificity
    // Added with the trend redesign.
    case teacherPace, waitTime2, longestMonologue
}

extension AudioSession {
    /// What to call this recording in a list.
    ///
    /// "Untitled lesson" was accurate and useless: every card said it, so the
    /// list told a teacher nothing about which class was which. Analysis
    /// already works out what the lesson covered — `lessonContent.summary`,
    /// written by the model read that runs on every recording — so the title
    /// is the lesson's own subject matter, at no extra cost and for recordings
    /// already made. Falls back to the room the teacher labelled, then the
    /// period, and only then to having nothing to say.
    var displayTitle: String {
        if let line = AudioSession.titleSentence(lessonContent?.summary) { return line }
        if let classSubject, !classSubject.isEmpty { return classSubject }
        // Recordings analysed before the lesson summary shipped (2026-09-28)
        // have no summary to title from, but most of them did detect a
        // subject — "Science" beats "Untitled lesson" for telling two old
        // recordings apart.
        if let detected = lessonContent?.subject, !detected.isEmpty { return detected }
        if let period, !period.isEmpty { return period }
        return "Untitled lesson"
    }

    /// One sentence, not the two the summary may run to — this is a card
    /// title, and the report shows the summary in full anyway.
    static func titleSentence(_ text: String?, limit: Int = 90) -> String? {
        guard let text else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // A sentence end only counts if a space or the end follows it, and not
        // in the first few words — otherwise "Mr." or "e.g." ends the title.
        let chars = Array(trimmed)
        var cut: Int?
        for i in 20..<min(chars.count, limit) where ".!?".contains(chars[i]) {
            if i + 1 >= chars.count || chars[i + 1] == " " { cut = i; break }
        }
        var out = cut.map { String(chars[0...$0]) } ?? trimmed
        if out.count > limit {
            let clipped = String(out.prefix(limit))
            out = (clipped.lastIndex(of: " ").map { String(clipped[..<$0]) } ?? clipped) + "…"
        }
        out = out.trimmingCharacters(in: CharacterSet(charactersIn: " ."))
        return out.isEmpty ? nil : out
    }
}
