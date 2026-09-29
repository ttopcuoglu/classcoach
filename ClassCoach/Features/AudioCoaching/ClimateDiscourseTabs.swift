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

/// The first three Insights sections — Talk & Participation, Questions &
/// Thinking, and Checks & Feedback — which share the same session metrics.
struct DiscourseDetailsTab: View {
    let session: AudioSessionWithSegments
    let part: DiscoursePart
    @State private var showBreakdown = false

    private var m: OverviewMetrics { OverviewMetrics(session) }
    private var recordedSec: Double { m.coverage.recordedSec }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch part {
            case .talk:
                PacingTimelineView(segments: session.segments, durationSec: session.durationSec)
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
            CategorySectionView(title: "Talk distribution", coverage: ReportConfidence.categoryCoverage([
                ReportConfidence.getPresenceMetric(session.teacherTalkPct).state, ReportConfidence.getPresenceMetric(session.studentTalkPct).state,
            ])) {
                StatView(label: "Your talk time", metric: percentMetric(session.teacherTalkPct))
                StatView(label: "Student talk time", metric: percentMetric(session.studentTalkPct))
                StatView(label: "Silence / other", metric: percentMetric(silencePct))
                StatView(label: "Student voice segments", metric: ReportConfidence.getCountMetric(count: session.metricsDetail?["studentVoiceSegments"].map { Int($0) }, recordedSec: recordedSec))
            }
            CoachNoteView(text: AudioInsights.buildTalkInsight(session))
        }
    }

    private var questioningSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            CategorySectionView(title: "The numbers", coverage: ReportConfidence.categoryCoverage([
                (m.higherOrderRatio ?? m.cfuMetric).state, m.followUpMetric.state, ReportConfidence.getPresenceMetric(session.avgWaitTimeSec).state,
            ])) {
                StatView(label: "Questions you asked", metric: ReportConfidence.getCountMetric(count: session.questionCount, recordedSec: recordedSec))
                StatView(label: "Your follow-up questions", metric: m.followUpMetric)
                StatView(label: "Your avg. wait time", metric: waitTimeMetric)
            }
            CoachNoteView(text: AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio))
            QuestioningMixView(session: session)
        }
    }

    private var waitTimeMetric: ReportConfidence.ConfidentMetric {
        guard let wait = session.avgWaitTimeSec else {
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
