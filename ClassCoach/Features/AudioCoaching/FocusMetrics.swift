import Foundation

/// Ported from `web/src/lib/focusMetrics.ts` — shared labels/grouping for
/// the My Growth focus-metric picker.
enum FocusMetrics {
    static func label(_ metric: FocusMetric) -> String {
        switch metric {
        case .talkRatio: return "Talk ratio"
        case .higherOrderPct: return "Higher-order questions"
        case .avgWaitTime: return "Avg. wait time"
        case .cfuCount: return "Checks for understanding"
        case .followUpQuestionCount: return "Follow-up questions"
        case .redirectionCount: return "Redirection language"
        case .toneRatio: return "Positive vs. corrective tone"
        case .directiveCount: return "Clear directions given"
        case .nameMentionCount: return "Student names used"
        case .feedbackSpecificity: return "Feedback specificity"
        }
    }

    static let groups: [(category: String, metrics: [FocusMetric])] = [
        ("Talk & Participation", [.talkRatio]),
        ("Questioning & Thinking", [.higherOrderPct, .avgWaitTime, .followUpQuestionCount]),
        ("Checking Understanding", [.cfuCount, .feedbackSpecificity]),
        ("Climate & Tone", [.redirectionCount, .toneRatio, .nameMentionCount]),
        ("Routines", [.directiveCount]),
    ]

    static func title(_ metric: FocusMetric) -> String {
        switch metric {
        case .talkRatio: return "Talk Ratio (%)"
        case .higherOrderPct: return "Question Quality (%)"
        case .avgWaitTime: return "Avg. Wait Time (s)"
        case .cfuCount: return "Checks for Understanding (/10min)"
        case .followUpQuestionCount: return "Follow-up Questions (/10min)"
        case .redirectionCount: return "Redirection Language (/10min)"
        case .toneRatio: return "Positive vs. Corrective Tone (%)"
        case .directiveCount: return "Clear Directions Given (/10min)"
        case .nameMentionCount: return "Student Names Used (/10min)"
        case .feedbackSpecificity: return "Feedback Specificity (%)"
        }
    }

    static func unit(_ metric: FocusMetric) -> String {
        switch metric {
        case .talkRatio, .higherOrderPct, .toneRatio, .feedbackSpecificity: return "%"
        case .avgWaitTime: return "s"
        default: return "/10m"
        }
    }

    private static func perTenMin(_ count: Double?, durationSec: Double?) -> Double? {
        guard let count, let durationSec, durationSec > 0 else { return nil }
        return ((count / (durationSec / 600)) * 10).rounded() / 10
    }

    /// Returns 1 or 2 named series (Talk Ratio has "You"/"Students").
    static func series(_ metric: FocusMetric, sessions: [AudioSession]) -> [(label: String, values: [Double?])] {
        switch metric {
        case .talkRatio:
            return [
                ("You", sessions.map(\.teacherTalkPct)),
                ("Students", sessions.map(\.studentTalkPct)),
            ]
        case .higherOrderPct:
            return [("Higher-order", sessions.map { ($0.questionCount ?? 0) >= ReportConfidence.minNForPercent ? $0.higherOrderPct : nil })]
        case .avgWaitTime:
            return [("Wait time", sessions.map(\.avgWaitTimeSec))]
        case .cfuCount:
            return [("CFUs", sessions.map {
                $0.durationSec ?? 0 >= ReportConfidence.minDurationForCFUDetectionSec ? perTenMin($0.cfuCount.map(Double.init), durationSec: $0.durationSec) : nil
            })]
        case .followUpQuestionCount:
            return [("Follow-ups", sessions.map { perTenMin($0.metricsDetail?["followUpQuestionCount"], durationSec: $0.durationSec) })]
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
