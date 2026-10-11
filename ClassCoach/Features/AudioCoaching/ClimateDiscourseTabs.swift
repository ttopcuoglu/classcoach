import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `ClimateRoutinesTab`.
struct ClimateRoutinesTab: View {
    let session: AudioSessionWithSegments

    private var m: OverviewMetrics { OverviewMetrics(session) }
    private var recordedSec: Double { m.coverage.recordedSec }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            routinesSection
        }
    }

    /// Narrative only — no numbers card.
    ///
    /// These counters match fixed phrases, so on a well-run lesson most of
    /// them are zero: "turn and talk for thirty seconds" is a clear direction
    /// that "clear directions: 0" does not recognise. Leading with numbers
    /// that are artefacts of the detector taught teachers to read their own
    /// lesson as a list of failures.
    private var routinesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let narrative = session.climateNarrative, !narrative.isEmpty {
                CoachNoteView(text: narrative)
            } else {
                Text("This section fills in once the report has been summarised.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func hasHighlight(_ label: String) -> Bool {
        (session.highlights ?? []).contains { $0.label == label }
    }

    private func withDefaultReason(_ metric: ReportConfidence.ConfidentMetric, _ reason: String) -> ReportConfidence.ConfidentMetric {
        var m = metric
        if m.reason == nil, m.state.isMissing { m.reason = reason }
        return m
    }
}

enum DiscoursePart {
    case talk, questions, understanding
}

/// Talk & Participation, plus the two halves of Questioning & Checking —
/// which share the same session metrics. The halves stay separate parts
/// because they are rendered under their own subsection headings.
struct DiscourseDetailsTab: View {
    let session: AudioSessionWithSegments
    let part: DiscoursePart
    @State private var showBreakdown = false

    private var m: OverviewMetrics { OverviewMetrics(session) }
    private var recordedSec: Double { m.coverage.recordedSec }

    /// Counted rows are the labels that held still across repeated runs
    /// (on-topic returned 32, 32, 33, 32, 32 of 59 on the same lesson). The
    /// off-topic turns are shown as quotes with NO count, because that label
    /// is the one that moved — two to six on that same lesson — and it is the
    /// only one making a claim about students. A quote a teacher can check
    /// beats a number they cannot.
    private var focusRows: [StudentTalkFocusRow] {
        guard let f = session.studentTalkFocus else { return [] }
        return [
            StudentTalkFocusRow(kind: "on_topic", label: "About the lesson", value: f.onTopic, color: AppTheme.forest),
            StudentTalkFocusRow(kind: "procedural", label: "About how to do the work", value: f.procedural, color: AppTheme.gold),
            StudentTalkFocusRow(kind: "unclear", label: "Too unclear to make out", value: f.unclear, color: AppTheme.hairline),
        ]
    }

    @ViewBuilder
    private var studentTalkFocusCard: some View {
        if let focus = session.studentTalkFocus, focus.classified > 0 {
            VStack(alignment: .leading, spacing: 10) {
                Text("WHAT STUDENTS TALKED ABOUT")
                    .font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                Text("Of \(focus.classified) audible student turn\(focus.classified == 1 ? "" : "s")\(focus.sampled ? " sampled across the lesson" : ""):")
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(focusRows) { row in
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 3).fill(row.color).frame(width: 12, height: 12)
                        Text(row.label).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        Spacer(minLength: 8)
                        Text("\(row.value)").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    }
                }
                Text(focusCaveat(focus))
                    .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                let other = focus.examples.filter { $0.kind == "off_topic" }
                if !other.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TURNS THAT LOOKED LIKE SOMETHING ELSE")
                            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                        Text("Shown rather than counted, on purpose: judging what counts as off-topic varied between runs, so these are examples to read and not a tally. Off-topic talk can be the task's fault as easily as anyone's, and a tangent is sometimes the best part of a lesson.")
                            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        ForEach(Array(other.enumerated()), id: \.offset) { _, example in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\"\(example.text)\"").font(.footnote).foregroundStyle(AppTheme.textPrimary)
                                Text(ReportConfidence.formatDuration(example.timestampSec))
                                    .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                }

                let rest = focus.examples.filter { $0.kind != "off_topic" }
                if !rest.isEmpty {
                    DisclosureGroup("Show examples of the rest") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(rest.enumerated()), id: \.offset) { _, example in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\"\(example.text)\"").font(.footnote).foregroundStyle(AppTheme.textPrimary)
                                    Text("\(ReportConfidence.formatDuration(example.timestampSec)) · \(focusRows.first { $0.kind == example.kind }?.label ?? example.kind)")
                                        .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                                }
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.top, 6)
                    }
                    .font(.subheadline.weight(.medium))
                    .tint(AppTheme.forest)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AppTheme.hairline))
        }
    }

    private func focusCaveat(_ focus: AudioStudentTalkFocus) -> String {
        var text = "This is the only thing here that can tell a discussion from a room talking over itself — the talk-time split reads the same either way. It isn't a score, and there's no correct number."
        if focus.unclear > 0 {
            text += " The \(focus.unclear) unclear turn\(focus.unclear == 1 ? " is" : "s are") the microphone, not the students: it sits with you and hears the room poorly, so a distant voice often arrives garbled. Audio from a video played in class can land here too."
        }
        return text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch part {
            case .talk:
                PacingTimelineView(segments: session.segments, durationSec: session.durationSec)
                studentTalkFocusCard
                talkSection
            case .questions:
                if let count = session.questionCount, count > 0 {
                    Text("You asked \(count) question\(count == 1 ? "" : "s") this session.").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                } else {
                    Text("No question data for this session.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
                questioningSection
                questionLogSection
            case .understanding:
                cfuSection
            }
        }
    }

    private var talkSection: some View {
        let silencePct: Double? = {
            guard let t = session.teacherTalkPct, let s = session.studentTalkPct else { return nil }
            return max(0, 100 - t - s)
        }()
        return VStack(alignment: .leading, spacing: 10) {
            // Narrative first, and the written one when the report has it —
            // the rule-assembled fallback can only restate the percentages.
            CoachNoteView(text: session.talkNarrative ?? AudioInsights.buildTalkInsight(session))
            CategorySectionView(title: "Talk distribution", coverage: ReportConfidence.categoryCoverage([
                ReportConfidence.getPresenceMetric(session.teacherTalkPct).state, ReportConfidence.getPresenceMetric(session.studentTalkPct).state,
            ])) {
                StatView(label: "Your talk time", metric: percentMetric(session.teacherTalkPct))
                StatView(label: "Student talk time", metric: percentMetric(session.studentTalkPct))
                StatView(label: "Silence / other", metric: percentMetric(silencePct))
                StatView(label: "Student voice segments", metric: ReportConfidence.getCountMetric(count: session.metricsDetail?["studentVoiceSegments"].map { Int($0) }, recordedSec: recordedSec))
            }
        }
    }

    private var questioningSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            CoachNoteView(text: session.questionsNarrative
                ?? AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio))
            CategorySectionView(title: "The numbers", coverage: ReportConfidence.categoryCoverage([
                (m.higherOrderRatio ?? m.cfuMetric).state, m.followUpMetric.state, ReportConfidence.getPresenceMetric(session.avgWaitTimeSec).state,
            ])) {
                StatView(label: "Questions you asked", metric: ReportConfidence.getCountMetric(count: session.questionCount, recordedSec: recordedSec))
                StatView(label: "Higher-order questions", metric: higherOrderCountMetric)
                // A lesson can be built on reasoning without a single
                // higher-order question in it — a task can ask for more
                // thinking than anything said out loud did.
                StatView(label: "Thinking tasks", metric: thinkingTaskMetric)
                StatView(label: "Your follow-up questions", metric: m.followUpMetric)
                StatView(label: "Your avg. wait time", metric: waitTimeMetric)
            }
            QuestioningMixView(session: session)
        }
    }

    private var higherOrderCountMetric: ReportConfidence.ConfidentMetric {
        guard let count = session.metricsDetail?["higherOrderQuestionCount"] else {
            return ReportConfidence.ConfidentMetric(state: .notAnalyzed, display: "—", reason: "This session was analyzed before questions were classified.")
        }
        return ReportConfidence.ConfidentMetric(state: count > 0 ? .measured : .confirmedNone, display: "\(Int(count))")
    }

    private var thinkingTaskMetric: ReportConfidence.ConfidentMetric {
        guard let count = session.metricsDetail?["thinkingTaskCount"] else {
            return ReportConfidence.ConfidentMetric(state: .notAnalyzed, display: "—", reason: "This session was analyzed before thinking tasks were read from the transcript.")
        }
        return ReportConfidence.ConfidentMetric(state: count > 0 ? .measured : .confirmedNone, display: "\(Int(count))")
    }

    private var waitTimeMetric: ReportConfidence.ConfidentMetric {
        guard let wait = session.avgWaitTimeSec else {
            // "Not enough data" is true but unhelpful: on a room mic the pause
            // is usually missing because the answer was never captured, not
            // because the teacher never waited.
            if (session.questionCount ?? 0) > 0 {
                return ReportConfidence.ConfidentMetric(
                    state: .notMeasurable, display: "—",
                    reason: "None of your questions was followed by an audible student answer, so there was no pause to time."
                )
            }
            return ReportConfidence.ConfidentMetric(state: .notMeasurable, display: "—", reason: "Not enough data in this session to compute this.")
        }
        return ReportConfidence.ConfidentMetric(state: .measured, display: "\(ReportConfidence.formatNumber(wait))s")
    }

    private func percentMetric(_ value: Double?) -> ReportConfidence.ConfidentMetric {
        guard let value else {
            return ReportConfidence.ConfidentMetric(state: .notMeasurable, display: "—", reason: "Not enough data in this session to compute this.")
        }
        return ReportConfidence.ConfidentMetric(state: .measured, display: "\(Int(value))%")
    }

    private var cfuSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            // No numbers card: "3 verbal checks" and "6 of 11" count fixed
            // phrases, and a check made by reading over shoulders leaves no
            // trace — so leading with them put a detector's blind spots at the
            // top of a teacher's own lesson. The narrative says when the checks
            // happened and what the feedback did with a student's answer.
            if let narrative = session.checksNarrative, !narrative.isEmpty {
                CoachNoteView(text: narrative)
            } else {
                Text("This section fills in once the report has been summarised.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func phasesSection(_ phases: [AudioPhase]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("SESSION PHASES").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            ForEach(Array(phases.enumerated()), id: \.offset) { _, phase in
                HStack {
                    Text(phase.label).font(.subheadline.weight(.medium)).frame(width: 100, alignment: .leading)
                    Text("\(ReportConfidence.formatDuration(phase.startSec)) – \(ReportConfidence.formatDuration(phase.endSec))")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
            }
            Text("These boundaries are an automated estimate — treat them as a starting point.")
                .font(.caption2).foregroundStyle(AppTheme.textSecondary)
        }
    }

    @ViewBuilder
    private var questionLogSection: some View {
        if let log = session.questionLog {
            VStack(alignment: .leading, spacing: 8) {
                Button(showBreakdown ? "Hide breakdown" : "Show full question-by-question breakdown") {
                    withAnimation { showBreakdown.toggle() }
                }
                .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.primary)

                if showBreakdown {
                    if log.isEmpty {
                        Text("No individual questions were detected this session.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    } else {
                        ForEach(Array(log.enumerated()), id: \.offset) { _, entry in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(ReportConfidence.formatDuration(entry.timestampSec)).font(.caption).foregroundStyle(AppTheme.textSecondary)
                                    Text(entry.type == "higher_order" ? "Higher-order" : "Recall")
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 6).padding(.vertical, 2)
                                        .background((entry.type == "higher_order" ? AppTheme.primary : AppTheme.textSecondary).opacity(0.12), in: Capsule())
                                    Text(entry.waitTimeSec.map { "\(ReportConfidence.formatNumber($0))s wait" } ?? "wait not measured")
                                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                                }
                                Text("\"\(entry.text)\"").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                ForEach(Array(entry.followUps.enumerated()), id: \.offset) { _, followUp in
                                    Text("\"\(followUp.text)\" · \(ReportConfidence.formatDuration(followUp.timestampSec))")
                                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                                        .padding(.leading, 10)
                                        .overlay(Rectangle().frame(width: 1).foregroundStyle(AppTheme.textSecondary.opacity(0.3)), alignment: .leading)
                                }
                            }
                            .padding(10)
                            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
        } else {
            Text("Not available for this session — analyzed before per-question detail was tracked.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }
}

private struct QuestioningMixView: View {
    let session: AudioSessionWithSegments

    var body: some View {
        let recall = session.metricsDetail?["recallQuestionCount"].map { Int($0) } ?? 0
        let higherOrder = session.metricsDetail?["higherOrderQuestionCount"].map { Int($0) } ?? 0
        let total = recall + higherOrder
        VStack(alignment: .leading, spacing: 6) {
            Text("QUESTIONING MIX").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            if total == 0 {
                Text("Question-type mix unavailable this session.").font(.caption).foregroundStyle(AppTheme.textSecondary)
            } else {
                mixBar(label: "Recall", count: recall, total: total, color: AppTheme.gold)
                mixBar(label: "Higher-order", count: higherOrder, total: total, color: AppTheme.terracotta)
            }
        }
    }

    private func mixBar(label: String, count: Int, total: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label).font(.caption)
                Spacer()
                Text("\(count) of \(total)").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(AppTheme.background)
                    RoundedRectangle(cornerRadius: 3).fill(color).frame(width: geo.size.width * CGFloat(count) / CGFloat(max(total, 1)))
                }
            }
            .frame(height: 8)
        }
    }
}

/// What the audible student talk was about.
///
/// Every other number on this page is a duration, and a duration cannot tell
/// a discussion from a room talking over itself — both produce a high student
/// share and many short turns, and the recording cannot separate them, since
/// diarization assigns each slice of time to one speaker and simultaneous
/// speech arrives as tidy alternating turns. This is the one thing on the page
/// that speaks to the difference, so it sits above the percentages.
///
/// Counts rather than percentages, deliberately: "54% on topic" is a score,
/// and there is no correct figure here.
private struct StudentTalkFocusRow: Identifiable {
    var id: String { kind }
    let kind: String
    let label: String
    let value: Int
    let color: Color
}

private struct PacingTimelineView: View {
    let segments: [TranscriptSegment]
    let durationSec: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PACING & RHYTHM").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            if let durationSec, durationSec > 0, !segments.isEmpty {
                let bins = 24
                let binDuration = durationSec / Double(bins)
                HStack(spacing: 1) {
                    ForEach(0..<bins, id: \.self) { i in
                        let binStart = Double(i) * binDuration
                        let binEnd = binStart + binDuration
                        Rectangle().fill(binColor(binStart: binStart, binEnd: binEnd))
                    }
                }
                .frame(height: 20)
                HStack {
                    Text("0:00")
                    Spacer()
                    Text(ReportConfidence.formatDuration(durationSec))
                }
                .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                HStack(spacing: 12) {
                    legend("Teacher", AppTheme.terracotta)
                    legend("Student", AppTheme.gold)
                    legend("Unavailable", AppTheme.textSecondary.opacity(0.3))
                }
                .font(.caption2)
            } else {
                Text("Pacing timeline unavailable this session.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 20)
                    .background(AppTheme.textSecondary.opacity(0.1))
            }
        }
    }

    private func legend(_ label: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func binColor(binStart: Double, binEnd: Double) -> Color {
        let overlapping = segments.filter { $0.startSec < binEnd && $0.endSec > binStart }
        guard !overlapping.isEmpty else { return AppTheme.textSecondary.opacity(0.15) }
        let teacherDuration = overlapping.filter { $0.speakerLabel == "Teacher" }
            .reduce(0.0) { $0 + (min($1.endSec, binEnd) - max($1.startSec, binStart)) }
        let studentDuration = overlapping.filter { $0.speakerLabel != "Teacher" }
            .reduce(0.0) { $0 + (min($1.endSec, binEnd) - max($1.startSec, binStart)) }
        return teacherDuration >= studentDuration ? AppTheme.terracotta : AppTheme.gold
    }
}
