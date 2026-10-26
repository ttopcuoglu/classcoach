import Foundation

/// Ported from `web/src/lib/focusMetrics.ts` — shared labels, grouping and
/// series for the My Growth picker and charts.
enum FocusMetrics {
    /// What My Growth actually charts, in order.
    ///
    /// Measured against real lessons rather than chosen by taste, on three
    /// tests: is there a value on most lessons, is it about something the
    /// teacher controls, and does movement mean the same thing every time?
    ///
    /// Four of the seven are about the teacher's own talk, which is the
    /// finding rather than a gap — the microphone sits with the teacher, so
    /// those are the numbers it can hold. Everything cut depended on hearing
    /// students well, which is what a room recording does worst.
    static let trendable: [FocusMetric] = [
        .teacherPace, .talkRatio, .longestMonologue,
        .waitTime2, .followUpQuestionCount, .higherOrderPct, .cfuCount,
    ]

    /// Shown last and never used to claim an improvement: its median across
    /// real lessons is 1 with a range of 0-7, and a model-read count drifts by
    /// about 2 on identical input.
    static let secondary: Set<FocusMetric> = [.cfuCount]

    static func label(_ metric: FocusMetric) -> String {
        switch metric {
        case .teacherPace: return "Your pace"
        case .talkRatio: return "Your share of the talk"
        case .longestMonologue: return "Longest unbroken stretch"
        case .waitTime2: return "Pause after an answer"
        case .followUpQuestionCount: return "Follow-up questions"
        case .higherOrderPct: return "Questions beyond recall"
        case .cfuCount: return "Checks for understanding"
        // Retired from the picker, kept so an account that chose one renders.
        case .avgWaitTime: return "Avg. wait time"
        case .redirectionCount: return "Redirection language"
        case .toneRatio: return "Positive vs. corrective tone"
        case .directiveCount: return "Clear directions given"
        case .nameMentionCount: return "Student names used"
        case .feedbackSpecificity: return "Feedback specificity"
        }
    }

    static let groups: [(category: String, metrics: [FocusMetric])] = [
        ("Talk & Participation", [.teacherPace, .talkRatio, .longestMonologue]),
        ("Questioning & Checking", [.waitTime2, .followUpQuestionCount, .higherOrderPct, .cfuCount]),
    ]

    static func title(_ metric: FocusMetric) -> String {
        switch metric {
        case .teacherPace: return "Your pace (words a minute)"
        case .talkRatio: return "Your share of the talk (%)"
        case .longestMonologue: return "Longest unbroken stretch (min)"
        case .waitTime2: return "Pause after an answer (s)"
        case .followUpQuestionCount: return "Follow-up questions (/10min)"
        case .higherOrderPct: return "Questions beyond recall"
        case .cfuCount: return "Checks for understanding (/10min)"
        case .avgWaitTime: return "Avg. wait time (s)"
        case .redirectionCount: return "Redirection language (/10min)"
        case .toneRatio: return "Positive vs. corrective tone (%)"
        case .directiveCount: return "Clear directions given (/10min)"
        case .nameMentionCount: return "Student names used (/10min)"
        case .feedbackSpecificity: return "Feedback specificity (%)"
        }
    }

    static func unit(_ metric: FocusMetric) -> String {
        switch metric {
        case .talkRatio, .higherOrderPct, .toneRatio, .feedbackSpecificity: return "%"
        case .avgWaitTime, .waitTime2: return "s"
        case .teacherPace: return " wpm"
        case .longestMonologue: return " min"
        default: return "/10m"
        }
    }

    private static func perTenMin(_ count: Double?, durationSec: Double?) -> Double? {
        guard let count, let durationSec, durationSec > 0 else { return nil }
        return ((count / (durationSec / 600)) * 10).rounded() / 10
    }

    /// Each counted question's kind, the way Questioning & Checking sorts
    /// them — nil when the lesson has no question log at all.
    static func questionMix(_ session: AudioSession) -> [QuestionMix]? {
        guard session.questionLog != nil else { return nil }
        return QuestionMix.classify(AudioSessionWithSegments(session: session, segments: [])).map(\.mix)
    }

    /// One named series, or two where a single number would mislead.
    static func series(_ metric: FocusMetric, sessions: [AudioSession]) -> [(label: String, values: [Double?])] {
        switch metric {
        case .teacherPace:
            return [("Words a minute", sessions.map { $0.metricsDetail?["teacherWordsPerMinute"] })]
        case .talkRatio:
            // The teacher's own share only. The student share is the least
            // reliable number in this report — diarization folds student
            // speech into teacher segments — so trending it would draw a line
            // through measurement noise.
            return [("You", sessions.map(\.teacherTalkPct))]
        case .longestMonologue:
            return [("Minutes", sessions.map { session in
                guard let sec = session.metricsDetail?["longestTeacherMonologueSec"] else { return nil }
                return ((sec / 60) * 10).rounded() / 10
            })]
        case .waitTime2:
            // Below the sample floor the average is a reading of one or two
            // exchanges, which the rest of the report refuses to call a habit.
            return [("Seconds", sessions.map { session in
                guard (session.metricsDetail?["waitTime2SampleCount"] ?? 0) >= AudioInsights.minWaitTimeSamples else { return nil }
                return session.metricsDetail?["waitTime2Sec"]
            })]
        case .followUpQuestionCount:
            return [("Follow-ups", sessions.map { perTenMin($0.metricsDetail?["followUpQuestionCount"], durationSec: $0.durationSec) })]
        case .higherOrderPct:
            // Count AND total rather than a share: a share reads 100% when one
            // question was asked and it happened to be a good one, and 0% when
            // forty-three recall questions were asked and nothing else. The gap
            // between the two lines is the recall questions. Sorted by
            // QuestionMix.classify, so each point is the "X of Y questions went
            // beyond recall" that lesson's own page shows. The stored focus
            // value stays higherOrderPct, so saved focuses are untouched.
            let mixes = sessions.map(questionMix)
            return [
                ("Beyond recall", mixes.map { $0.map { Double($0.filter { $0 != .recall }.count) } }),
                ("All questions", mixes.map { $0.map { Double($0.count) } }),
            ]
        case .cfuCount:
            return [("Checks", sessions.map {
                $0.durationSec ?? 0 >= ReportConfidence.minDurationForCFUDetectionSec
                    ? perTenMin($0.cfuCount.map(Double.init), durationSec: $0.durationSec) : nil
            })]
        // --- retired: still rendered if an account's stored focus is one ---
        case .avgWaitTime:
            return [("Wait time", sessions.map(\.avgWaitTimeSec))]
        case .redirectionCount:
            return [("Redirections", sessions.map { perTenMin($0.metricsDetail?["redirectionCount"], durationSec: $0.durationSec) })]
        case .toneRatio:
            return [("Share positive", sessions.map { session in
                guard let positive = session.metricsDetail?["positivePhraseCount"], let corrective = session.metricsDetail?["correctivePhraseCount"],
                      positive + corrective > 0 else { return nil }
                return ((positive / (positive + corrective)) * 100).rounded()
            })]
        case .directiveCount:
            return [("Directions", sessions.map { perTenMin($0.metricsDetail?["directiveCount"], durationSec: $0.durationSec) })]
        case .nameMentionCount:
            return [("Names used", sessions.map { perTenMin($0.metricsDetail?["nameMentionCount"], durationSec: $0.durationSec) })]
        case .feedbackSpecificity:
            return [("Share specific", sessions.map { session in
                guard let specific = session.metricsDetail?["specificFeedbackCount"], let generic = session.metricsDetail?["genericFeedbackCount"],
                      specific + generic > 0 else { return nil }
                return ((specific / (specific + generic)) * 100).rounded()
            })]
        }
    }
}
