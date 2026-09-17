import Foundation

/// Ported verbatim from `web/src/lib/reportConfidence.ts` — presentation-
/// layer confidence rules for the Audio Coaching report. Pure functions
/// only, no detection logic — just how confidently a number/sentence gets
/// shown. Keeping the exact thresholds/wording in sync with web matters
/// more here than almost anywhere else in the app.
enum ReportConfidence {
    static let shortSessionThresholdSec: Double = 10 * 60
    static let minNForPercent = 10
    static let minDurationForCFUDetectionSec: Double = 3 * 60
    static let minPhaseDurationSec: Double = 30
    static let balancedStudentFloorPct = 15

    enum MetricState: String {
        case measured, confirmedNone, possibleDetection, limitedEvidence, notMeasurable, notAnalyzed, analysisFailed

        var isConfident: Bool { self == .measured || self == .confirmedNone || self == .possibleDetection }
        var isMissing: Bool { self == .limitedEvidence || self == .notMeasurable || self == .notAnalyzed || self == .analysisFailed }
    }

    struct ConfidentMetric {
        let state: MetricState
        let display: String
        var reason: String?
    }

    struct CoverageInfo {
        let recordedSec: Double
        let totalSec: Double
        let isShort: Bool
        let uncapturedPhases: [String]
    }

    static func getCoverage(durationSec: Double?, phases: [AudioPhase]?) -> CoverageInfo {
        let recordedSec = durationSec ?? 0
        let uncaptured = (phases ?? []).filter { $0.endSec - $0.startSec < minPhaseDurationSec }.map(\.label)
        return CoverageInfo(
            recordedSec: recordedSec, totalSec: recordedSec,
            isShort: recordedSec > 0 && recordedSec < shortSessionThresholdSec,
            uncapturedPhases: uncaptured
        )
    }

    static func formatRatio(numerator: Int, denominator: Int) -> ConfidentMetric {
        if denominator <= 0 {
            return ConfidentMetric(state: .notMeasurable, display: "—", reason: "No questions were detected to classify.")
        }
        if denominator < minNForPercent {
            return ConfidentMetric(
                state: .possibleDetection, display: "\(numerator) of \(denominator)",
                reason: "Only \(denominator) to go on — too few to characterize as a pattern."
            )
        }
        return ConfidentMetric(state: .measured, display: "\(Int((Double(numerator) / Double(denominator) * 100).rounded()))%")
    }

    static func getCountMetric(count: Int?, recordedSec: Double, minDurationSec: Double? = nil, minDurationReason: String? = nil) -> ConfidentMetric {
        if let minDurationSec, recordedSec < minDurationSec {
            return ConfidentMetric(
                state: .limitedEvidence, display: "—",
                reason: minDurationReason ?? "Recording too short (under \(Int((minDurationSec / 60).rounded())) min) to reliably detect this."
            )
        }
        guard let count else {
            return ConfidentMetric(state: .notAnalyzed, display: "—", reason: "This session was analyzed before this metric was tracked.")
        }
        if count == 0 { return ConfidentMetric(state: .confirmedNone, display: "0") }
        return ConfidentMetric(state: .measured, display: String(count))
    }

    /// Mirrors `getFollowUpMetric` in reportConfidence.ts — follow-ups are
    /// only detectable after a transcribed student answer, so no captured
    /// student voice means "unknown", not a confident zero.
    static func getFollowUpMetric(count: Int?, studentVoiceSegments: Int?, recordedSec: Double) -> ConfidentMetric {
        if studentVoiceSegments == 0 {
            return ConfidentMetric(
                state: .notMeasurable, display: "—",
                reason: "No student answers were picked up in this recording, so follow-ups to them couldn't be detected."
            )
        }
        return getCountMetric(count: count, recordedSec: recordedSec)
    }

    static let studentTalkCaveat = "Quiet or distant student voices often aren't picked up, so treat student talk here as a minimum."

    static func getPresenceMetric(_ value: Double?) -> ConfidentMetric {
        guard let value else {
            return ConfidentMetric(state: .notMeasurable, display: "—", reason: "Not enough data in this session to compute this.")
        }
        return ConfidentMetric(state: .measured, display: formatNumber(value))
    }

    static func categoryCoverage(_ entries: [MetricState]) -> String {
        let measured = entries.filter(\.isConfident).count
        return "\(measured) of \(entries.count) measured"
    }

    static func formatDuration(_ sec: Double) -> String {
        let m = Int(sec / 60)
        let s = Int(sec.truncatingRemainder(dividingBy: 60))
        return "\(m):\(String(format: "%02d", s))"
    }

    static func formatNumber(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }

    static func buildEvidenceQualityLine(coverage: CoverageInfo, metrics: [ConfidentMetric]) -> (text: String, warn: Bool) {
        let total = metrics.count
        let measured = metrics.filter(\.state.isConfident).count
        let warn = coverage.isShort || (total > 0 && Double(measured) / Double(total) < 0.6)
        var parts = ["Recorded \(formatDuration(coverage.recordedSec))"]
        if coverage.isShort {
            parts.append("under \(Int((shortSessionThresholdSec / 60).rounded())) min — treat metrics as indicative, not conclusive")
        }
        parts.append("\(measured) of \(total) metrics measured confidently")
        if !coverage.uncapturedPhases.isEmpty {
            parts.append("not clearly captured: \(coverage.uncapturedPhases.joined(separator: ", "))")
        }
        return (parts.joined(separator: " · "), warn)
    }

    enum TalkBalance {
        case teacherHeavy(teacherPct: Double, studentPct: Double?)
        case studentHeavy(teacherPct: Double, studentPct: Double)
        case balanced(teacherPct: Double, studentPct: Double)
        case studentUnmeasured(teacherPct: Double)
        case studentZero(teacherPct: Double)
        case studentThin(teacherPct: Double, studentPct: Double)
    }

    static func judgeTalkBalance(teacherPct: Double?, studentPct: Double?) -> TalkBalance? {
        guard let teacherPct else { return nil }
        if teacherPct >= 65 { return .teacherHeavy(teacherPct: teacherPct, studentPct: studentPct) }
        if teacherPct <= 40, let studentPct, studentPct > teacherPct {
            return .studentHeavy(teacherPct: teacherPct, studentPct: studentPct)
        }
        guard let studentPct else { return .studentUnmeasured(teacherPct: teacherPct) }
        if studentPct == 0 { return .studentZero(teacherPct: teacherPct) }
        if studentPct < Double(balancedStudentFloorPct) { return .studentThin(teacherPct: teacherPct, studentPct: studentPct) }
        return .balanced(teacherPct: teacherPct, studentPct: studentPct)
    }
}

// MARK: - Deterministic insight templates (ported from AudioCoaching.tsx)

enum AudioInsights {
    typealias Confidence = ReportConfidence
    typealias Metric = ReportConfidence.ConfidentMetric

    static func buildVoiceBalanceCaption(_ judgment: Confidence.TalkBalance?) -> String? {
        guard let judgment else { return nil }
        switch judgment {
        case .balanced(let t, let s):
            return "Talk time was fairly balanced today — you at \(Int(t))%, students at \(Int(s))%."
        case .teacherHeavy(let t, _):
            return "You did most of the talking today (\(Int(t))%) — look for a moment to hand the floor to students."
        case .studentHeavy(_, let s):
            return "Students had a strong share of the talk time today (\(Int(s))%) — that's a lot of real student voice in the room."
        case .studentZero(let t):
            return "You talked about \(Int(t))% of the time; no student talk was separately detected this session."
        case .studentUnmeasured(let t):
            return "You talked about \(Int(t))% of the time — student talk wasn't separately measured this session."
        case .studentThin(let t, let s):
            return "You talked \(Int(t))% of the time, students only \(Int(s))% — worth watching next session."
        }
    }

    static func buildTalkInsight(_ session: AudioSessionWithSegments) -> String? {
        buildVoiceBalanceCaption(Confidence.judgeTalkBalance(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct))
            .map { "\($0) \(Confidence.studentTalkCaveat)" }
    }

    static func buildQuestioningInsight(_ session: AudioSessionWithSegments, higherOrderRatio: Metric?) -> String? {
        guard let higherOrderRatio, !higherOrderRatio.state.isMissing else { return nil }
        if higherOrderRatio.state == .possibleDetection {
            let n = session.questionCount ?? 0
            return "Only \(n) question\(n == 1 ? "" : "s") came through today — too few to say whether they leaned recall or higher-order."
        }
        if let pct = session.higherOrderPct, pct >= 40 {
            return "A good chunk of today's questions pushed for real thinking (\(Int(pct))% higher-order) — that's the harder kind of question to ask on the fly."
        }
        return "Most of today's questions were quick recall checks — a natural spot to slip in one 'why' or 'how' next time."
    }

    static func buildCfuInsight(_ cfuMetric: Metric) -> String? {
        if cfuMetric.state == .measured {
            return "You checked for understanding today — a good habit for catching confusion before it compounds."
        }
        if cfuMetric.state == .confirmedNone {
            return "None of the common spoken check-for-understanding phrases came through this session — even a quick thumbs-up check can catch confusion early."
        }
        return nil
    }

    static func buildRoutinesInsight(_ directiveMetric: Metric, hasRepeatedInstructionHighlight: Bool) -> String? {
        if directiveMetric.state == .measured {
            let base = "You gave clear, direct instructions \(directiveMetric.display) today — that kind of clarity helps routines run themselves."
            return hasRepeatedInstructionHighlight
                ? "\(base) A couple needed repeating, though — worth double-checking they land the first time."
                : base
        }
        if directiveMetric.state == .confirmedNone {
            return "No task-instruction language was picked up today — if you gave directions, they may just have been phrased differently than what's detected here."
        }
        return nil
    }

    static func buildClimateInsight(_ redirectionMetric: Metric, positiveCount: Int?, correctiveCount: Int?) -> String? {
        if redirectionMetric.state == .confirmedNone {
            return "None of the common redirection phrases came through this session."
        }
        if redirectionMetric.state == .measured {
            var sentence = "You used redirection language \(redirectionMetric.display) today."
            if let positive = positiveCount, let corrective = correctiveCount {
                let total = positive + corrective
                if total >= Confidence.minNForPercent {
                    if positive > corrective * 2 {
                        sentence += " Positive language clearly outweighed corrective — that sets a warm tone alongside the redirects."
                    } else if corrective > positive {
                        sentence += " Corrective language outweighed positive today — a few more specific call-outs of what's going right could balance that."
                    }
                } else if total > 0 {
                    sentence += " Only a few tone-language moments came through today — too few to say whether positive or corrective language dominated."
                }
            }
            return sentence
        }
        return nil
    }

    static func buildWivozaNoticedSummary(_ sentences: [String?]) -> String? {
        let joined = sentences.compactMap { $0 }
        return joined.isEmpty ? nil : joined.joined(separator: " ")
    }

    struct NoticeCandidate {
        let id: String
        let observation: String
        let whyItMatters: String
        let timestampSec: Double?
        let excerpt: String?
        let durationSec: Double?
        let weight: Int
        let focusMetric: FocusMetric?
    }

    private static let candidateOrder = [
        "highlight-followup", "highlight-redirection", "highlight-repeated", "highlight-monologue",
        "talk-balance", "questioning", "wait-time", "cfu", "feedback",
    ]

    static func pickTop(_ candidates: [NoticeCandidate]) -> NoticeCandidate? {
        candidates.sorted {
            if $0.weight != $1.weight { return $0.weight > $1.weight }
            let ai = candidateOrder.firstIndex(of: $0.id) ?? Int.max
            let bi = candidateOrder.firstIndex(of: $1.id) ?? Int.max
            return ai < bi
        }.first
    }

    private static func highlightCandidates(
        _ highlights: [AudioHighlight]?, label: String, id: String, weight: Int, whyItMatters: String
    ) -> [NoticeCandidate] {
        (highlights ?? []).filter { $0.label == label }.map {
            NoticeCandidate(
                id: id, observation: $0.label, whyItMatters: whyItMatters, timestampSec: $0.timestampSec,
                excerpt: $0.excerpt, durationSec: $0.durationSec, weight: weight, focusMetric: nil
            )
        }
    }

    /// Mirrors `MIN_WAIT_TIME_SAMPLES` in web/src/lib/reportConfidence.ts —
    /// fewer usable question → student-response intervals than this, or a
    /// session analyzed before the count existed, never makes wait time a
    /// Strength or Priority.
    static let minWaitTimeSamples = 3.0

    static func hasEnoughWaitTimeSamples(_ session: AudioSessionWithSegments) -> Bool {
        guard let count = session.metricsDetail?["waitTimeSampleCount"] else { return false }
        return count >= minWaitTimeSamples
    }

    static func buildStrengthCandidates(
        _ session: AudioSessionWithSegments, cfuMetric: Metric, feedbackRatio: Metric, higherOrderRatio: Metric?
    ) -> [NoticeCandidate] {
        var candidates: [NoticeCandidate] = []
        candidates += highlightCandidates(
            session.highlights, label: "Follow-up / probing question", id: "highlight-followup", weight: 3,
            whyItMatters: "Following up on a student answer pushes their thinking further instead of stopping at the first response."
        )
        if case .studentHeavy(_, let s) = Confidence.judgeTalkBalance(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct) {
            candidates.append(NoticeCandidate(
                id: "talk-balance", observation: "Students had \(Int(s))% of the talk time today",
                whyItMatters: "That's a lot of real student voice in the room — a strong sign of student-centered discussion.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .talkRatio
            ))
        }
        if let higherOrderRatio, higherOrderRatio.state == .measured, let pct = session.higherOrderPct, pct >= 40 {
            candidates.append(NoticeCandidate(
                id: "questioning", observation: "\(Int(pct))% of your questions were higher-order",
                whyItMatters: "That's the harder kind of question to ask on the fly — it pushes for real thinking, not just recall.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .higherOrderPct
            ))
        }
        if hasEnoughWaitTimeSamples(session), let wait = session.avgWaitTimeSec, wait >= 3 {
            candidates.append(NoticeCandidate(
                id: "wait-time", observation: "Your average wait time was \(Confidence.formatNumber(wait))s",
                whyItMatters: "Giving students real time to think before answering leads to deeper, more complete responses.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .avgWaitTime
            ))
        }
        if cfuMetric.state == .measured {
            candidates.append(NoticeCandidate(
                id: "cfu", observation: "You checked for understanding today",
                whyItMatters: "Catching confusion before it compounds is one of the highest-leverage coaching moves.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .cfuCount
            ))
        }
        if feedbackRatio.state == .measured, feedbackRatio.display.hasSuffix("%"),
           let pct = Int(feedbackRatio.display.dropLast()), pct >= 50 {
            candidates.append(NoticeCandidate(
                id: "feedback", observation: "\(feedbackRatio.display) of your feedback was specific",
                whyItMatters: "Specific feedback gives students something concrete to act on, not just praise or correction.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: nil
            ))
        }
        return candidates
    }

    static func buildPriorityCandidates(
        _ session: AudioSessionWithSegments, cfuMetric: Metric, feedbackRatio: Metric, higherOrderRatio: Metric?
    ) -> [NoticeCandidate] {
        var candidates: [NoticeCandidate] = []
        candidates += highlightCandidates(
            session.highlights, label: "Redirection cluster", id: "highlight-redirection", weight: 3,
            whyItMatters: "A cluster of redirections close together can be a sign the room needs a different routine or transition in that moment."
        )
        candidates += highlightCandidates(
            session.highlights, label: "Repeated instruction", id: "highlight-repeated", weight: 3,
            whyItMatters: "When directions need repeating, it's worth double-checking they land clearly the first time."
        )
        candidates += highlightCandidates(
            session.highlights, label: "Longest uninterrupted teacher monologue", id: "highlight-monologue", weight: 2,
            whyItMatters: "A long stretch without a break in teacher talk is a natural spot to build in a check-in or a question."
        )
        if case .teacherHeavy(let t, _) = Confidence.judgeTalkBalance(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct) {
            candidates.append(NoticeCandidate(
                id: "talk-balance", observation: "You had \(Int(t))% of the talk the recording picked up today",
                whyItMatters: "Look for a moment to hand the floor to students — even a short turn-and-talk shifts the balance.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 2, focusMetric: .talkRatio
            ))
        }
        if let higherOrderRatio, higherOrderRatio.state == .measured, let pct = session.higherOrderPct, pct < 40 {
            candidates.append(NoticeCandidate(
                id: "questioning", observation: "Most of today's questions were quick recall checks (\(Int(pct))% higher-order)",
                whyItMatters: "A natural spot to slip in one 'why' or 'how' question next time.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .higherOrderPct
            ))
        }
        if hasEnoughWaitTimeSamples(session), let wait = session.avgWaitTimeSec, wait < 3 {
            candidates.append(NoticeCandidate(
                id: "wait-time", observation: "Your average wait time was \(Confidence.formatNumber(wait))s",
                whyItMatters: "A few extra seconds of silence after a question gives more students time to formulate an answer.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .avgWaitTime
            ))
        }
        // Only spoken check phrases are detectable, so a zero from a short
        // clip is too thin to headline as the one thing to work on.
        if cfuMetric.state == .confirmedNone, (session.durationSec ?? 0) >= Confidence.shortSessionThresholdSec {
            candidates.append(NoticeCandidate(
                id: "cfu", observation: "None of the common spoken check-for-understanding phrases came through this session",
                whyItMatters: "Even a quick thumbs-up check can catch confusion early, before it compounds.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: .cfuCount
            ))
        }
        if feedbackRatio.state == .measured, feedbackRatio.display.hasSuffix("%"),
           let pct = Int(feedbackRatio.display.dropLast()), pct < 50 {
            candidates.append(NoticeCandidate(
                id: "feedback", observation: "Only \(feedbackRatio.display) of your feedback was specific",
                whyItMatters: "Specific feedback gives students something concrete to act on, not just praise or correction.",
                timestampSec: nil, excerpt: nil, durationSec: nil, weight: 1, focusMetric: nil
            ))
        }
        return candidates
    }

    static func formatHighlightHeadline(label: String, timestampSec: Double, durationSec: Double?) -> String {
        if let durationSec {
            return "\(label): \(Int(durationSec.rounded()))s — occurred at \(ReportConfidence.formatDuration(timestampSec))"
        }
        return "\(label) · \(ReportConfidence.formatDuration(timestampSec))"
    }

    static func formatCandidateHeadline(_ candidate: NoticeCandidate) -> String {
        if let duration = candidate.durationSec, let ts = candidate.timestampSec {
            return "\(candidate.observation): \(Int(duration.rounded()))s — occurred at \(ReportConfidence.formatDuration(ts))"
        }
        if let ts = candidate.timestampSec {
            return "\(candidate.observation) · \(ReportConfidence.formatDuration(ts))"
        }
        return candidate.observation
    }

    /// Context lines seeded into every Reflect chat turn — capped at 8,
    /// same as `buildReflectContext` in AudioCoaching.tsx.
    static func buildReflectContext(
        _ session: AudioSessionWithSegments, cfuMetric: Metric, redirectionMetric: Metric, directiveMetric: Metric, coverage: Confidence.CoverageInfo
    ) -> [String] {
        var context: [String] = []
        if coverage.isShort {
            context.append("This was a short recording (\(ReportConfidence.formatDuration(coverage.recordedSec))) — a snapshot, not the whole lesson.")
        }
        for h in session.highlights ?? [] {
            let durationPart = h.durationSec != nil ? " (lasted \(Int(h.durationSec!.rounded()))s)" : ""
            context.append("At \(ReportConfidence.formatDuration(h.timestampSec))\(durationPart), \"\(h.label)\": \"\(h.excerpt)\"")
        }
        if cfuMetric.state == .confirmedNone {
            context.append("None of the common spoken check-for-understanding phrases (like \"thumbs up\" or \"turn and talk\") were heard this session. Only those spoken phrases are detected, so a silent, written, or differently worded check would not show up — don't treat this as proof no check happened.")
        }
        if redirectionMetric.state == .confirmedNone {
            context.append("None of the common spoken redirection phrases (like \"eyes on me\") were heard this session. Nonverbal or differently worded redirection would not show up.")
        }
        if directiveMetric.state == .confirmedNone {
            context.append("None of the common task-instruction phrases (like \"open your\" or \"turn to page\") were heard this session. Directions phrased differently would not show up.")
        }
        return Array(context.prefix(8))
    }

    static let reflectTurnCap = 8

    static func buildTrendInsight(_ sessions: [AudioSession]) -> String? {
        guard sessions.count >= 3 else { return nil }
        // Mirrors web: a lower teacher share alone can just mean more silence
        // or uncaptured audio, so only credit student voice when students'
        // own share actually rose.
        let withTalk = sessions.filter { $0.teacherTalkPct != nil && $0.studentTalkPct != nil }
        if withTalk.count >= 3 {
            let teacherDelta = withTalk.last!.teacherTalkPct! - withTalk.first!.teacherTalkPct!
            let studentDelta = withTalk.last!.studentTalkPct! - withTalk.first!.studentTalkPct!
            if teacherDelta <= -8 && studentDelta >= 5 {
                return "Your talk time is down \(Int(abs(teacherDelta).rounded())) points since your first tracked session, and students' is up \(Int(studentDelta.rounded())) — more room for student voice."
            }
        }
        let withQuestions = sessions.filter { ($0.questionCount ?? 0) >= ReportConfidence.minNForPercent && $0.higherOrderPct != nil }
        if withQuestions.count >= 3 {
            let delta = withQuestions.last!.higherOrderPct! - withQuestions.first!.higherOrderPct!
            if delta >= 10 {
                return "Your higher-order questions are up \(Int(delta.rounded())) points since your first tracked session — nice trend."
            }
        }
        return nil
    }
}
