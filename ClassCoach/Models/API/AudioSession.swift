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

    struct TeacherStudentTerms: Decodable {
        let teacher: [AudioTopicTerm]
        let student: [AudioTopicTerm]
    }

    private enum CodingKeys: String, CodingKey {
        case topicTerms, statedObjective, summary, connections, vocabulary, subject, connectionIdeas
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

    /// ISO-8601, with or without fractional seconds depending on the driver.
    var transcribeStartedAtDate: Date? {
        guard let transcribeStartedAt else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: transcribeStartedAt) ?? ISO8601DateFormatter().date(from: transcribeStartedAt)
    }
    let rubricLens: AudioRubricLens?
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
             contentNotes, rubricLens, classSummary, checksNarrative, climateNarrative, contentNarrative, talkNarrative, questionsNarrative, strengths, growthAreas, nextStep, followUpDate, createdAt, updatedAt
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
        // try? so an unexpected shape hides the lens instead of dropping the whole session.
        rubricLens = try? container.decodeIfPresent(AudioRubricLens.self, forKey: .rubricLens)
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

struct AudioSessionWithSegments: Decodable, Identifiable {
    var id: String { session.id }
    let session: AudioSession
    let segments: [TranscriptSegment]

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
    var rubricLens: AudioRubricLens? { session.rubricLens }
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
enum FocusMetric: String, Codable, CaseIterable {
    case talkRatio, higherOrderPct, avgWaitTime, cfuCount, followUpQuestionCount
    case redirectionCount, toneRatio, directiveCount, nameMentionCount, feedbackSpecificity
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
