import SwiftUI

/// Precomputes every derived stat/insight the Overview tab (and a couple of
/// others) needs from the raw session, mirroring the metric-building calls
/// scattered through `ReportPanel`/`OverviewTab` in AudioCoaching.tsx.
struct OverviewMetrics {
    let coverage: ReportConfidence.CoverageInfo
    let cfuMetric: ReportConfidence.ConfidentMetric
    let redirectionMetric: ReportConfidence.ConfidentMetric
    let directiveMetric: ReportConfidence.ConfidentMetric
    let nameMentionMetric: ReportConfidence.ConfidentMetric
    let followUpMetric: ReportConfidence.ConfidentMetric
    let higherOrderRatio: ReportConfidence.ConfidentMetric?
    let feedbackRatio: ReportConfidence.ConfidentMetric
    let toneRatio: ReportConfidence.ConfidentMetric

    init(_ session: AudioSessionWithSegments) {
        coverage = ReportConfidence.getCoverage(durationSec: session.durationSec, phases: session.phases)
        let recordedSec = coverage.recordedSec
        let detail = session.metricsDetail ?? [:]

        cfuMetric = ReportConfidence.getCountMetric(
            count: session.cfuCount, recordedSec: recordedSec,
            minDurationSec: ReportConfidence.minDurationForCFUDetectionSec
        )
        redirectionMetric = ReportConfidence.getCountMetric(count: detail["redirectionCount"].map { Int($0) }, recordedSec: recordedSec)
        directiveMetric = ReportConfidence.getCountMetric(count: detail["directiveCount"].map { Int($0) }, recordedSec: recordedSec)
        nameMentionMetric = ReportConfidence.getCountMetric(count: detail["nameMentionCount"].map { Int($0) }, recordedSec: recordedSec)
        followUpMetric = ReportConfidence.getCountMetric(count: detail["followUpQuestionCount"].map { Int($0) }, recordedSec: recordedSec)

        if let q = session.questionCount, q > 0 {
            let higherOrder = detail["higherOrderQuestionCount"].map { Int($0) } ?? 0
            higherOrderRatio = ReportConfidence.formatRatio(numerator: higherOrder, denominator: q)
        } else {
            higherOrderRatio = ReportConfidence.formatRatio(numerator: 0, denominator: 0)
        }

        let specific = detail["specificFeedbackCount"].map { Int($0) } ?? 0
        let generic = detail["genericFeedbackCount"].map { Int($0) } ?? 0
        feedbackRatio = ReportConfidence.formatRatio(numerator: specific, denominator: specific + generic)

        let positive = detail["positivePhraseCount"].map { Int($0) } ?? 0
        let corrective = detail["correctivePhraseCount"].map { Int($0) } ?? 0
        toneRatio = ReportConfidence.formatRatio(numerator: positive, denominator: positive + corrective)
    }
}

struct OverviewTab: View {
    let session: AudioSessionWithSegments
    let onSetFocus: (FocusMetric) -> Void
    let onNavigateReflect: () -> Void
    let onNavigateDiscourse: () -> Void

    private var m: OverviewMetrics { OverviewMetrics(session) }

    private var talkInsight: String? { AudioInsights.buildTalkInsight(session) }
    private var questioningInsight: String? { AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio) }
    private var cfuInsight: String? { AudioInsights.buildCfuInsight(m.cfuMetric) }
    private var noticedSummary: String? { AudioInsights.buildWivozaNoticedSummary([talkInsight, questioningInsight, cfuInsight]) }

    private var strengthCandidate: AudioInsights.NoticeCandidate? {
        AudioInsights.pickTop(AudioInsights.buildStrengthCandidates(session, cfuMetric: m.cfuMetric, feedbackRatio: m.feedbackRatio, higherOrderRatio: m.higherOrderRatio))
    }
    private var priorityCandidate: AudioInsights.NoticeCandidate? {
        AudioInsights.pickTop(AudioInsights.buildPriorityCandidates(session, cfuMetric: m.cfuMetric, feedbackRatio: m.feedbackRatio, higherOrderRatio: m.higherOrderRatio))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            snapshotHeader

            let evidence = ReportConfidence.buildEvidenceQualityLine(
                coverage: m.coverage,
                metrics: [m.cfuMetric, m.redirectionMetric, m.directiveMetric, m.nameMentionMetric, m.followUpMetric,
                          m.higherOrderRatio, m.feedbackRatio, ReportConfidence.getPresenceMetric(session.teacherTalkPct),
                          ReportConfidence.getPresenceMetric(session.avgWaitTimeSec)].compactMap { $0 }
            )
            evidenceQualityLine(evidence)

            if let noticedSummary {
                card(title: "What Wivoza noticed", tint: AppTheme.textSecondary) {
                    Text(noticedSummary).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
            }

            strengthCard
            priorityCard
            voiceBalanceCard
            tryThisNext
        }
    }

    private var snapshotHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(session.classSubject ?? "New Recording")\(session.period.map { " · \($0)" } ?? "")")
                .font(.title3.bold()).foregroundStyle(AppTheme.textPrimary)
            Text([session.teacherName, formattedDate(session.sessionDate), session.gradeLevel,
                  session.durationSec.map { ReportConfidence.formatDuration($0) }]
                .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func evidenceQualityLine(_ evidence: (text: String, warn: Bool)) -> some View {
        Group {
            if evidence.warn {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Text(evidence.text).font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
                }
                .padding(10)
                .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
            } else {
                Text(evidence.text.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func card(title: String, tint: Color, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(.caption.weight(.bold)).foregroundStyle(tint)
            content()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private var strengthCard: some View {
        card(title: "Strength", tint: AppTheme.primary) {
            if let c = strengthCandidate {
                VStack(alignment: .leading, spacing: 3) {
                    Text(AudioInsights.formatCandidateHeadline(c)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    if let excerpt = c.excerpt { Text("\"\(excerpt)\"").font(.subheadline).foregroundStyle(AppTheme.textSecondary) }
                    Text(c.whyItMatters).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Not enough measured evidence yet for a stand-out strength this session.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    Button("See the full breakdown in Discourse Details →", action: onNavigateDiscourse)
                        .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.primary)
                }
            }
        }
    }

    private var priorityCard: some View {
        card(title: "Coaching priority", tint: AppTheme.accent) {
            if let c = priorityCandidate {
                VStack(alignment: .leading, spacing: 3) {
                    Text(AudioInsights.formatCandidateHeadline(c)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    if let excerpt = c.excerpt { Text("\"\(excerpt)\"").font(.subheadline).foregroundStyle(AppTheme.textSecondary) }
                    Text(c.whyItMatters).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
            } else {
                Text("This recording was \(ReportConfidence.formatDuration(m.coverage.recordedSec)) — coaching-priority signals need more length to surface reliably. Aim for at least \(Int(ReportConfidence.shortSessionThresholdSec / 60)) minutes next time.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private var voiceBalanceCard: some View {
        card(title: "Classroom voice balance", tint: AppTheme.textSecondary) {
            VStack(alignment: .leading, spacing: 8) {
                balanceBar(label: "You", pct: session.teacherTalkPct, color: AppTheme.primary)
                balanceBar(label: "Students", pct: session.studentTalkPct, color: AppTheme.primary.opacity(0.45))
                if let caption = AudioInsights.buildVoiceBalanceCaption(ReportConfidence.judgeTalkBalance(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct)) {
                    Text(caption).font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
    }

    private func balanceBar(label: String, pct: Double?, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label).font(.caption.weight(.medium))
                Spacer()
                Text(pct.map { "\(Int($0))%" } ?? "—").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(AppTheme.background)
                    RoundedRectangle(cornerRadius: 4).fill(color)
                        .frame(width: geo.size.width * CGFloat((pct ?? 0) / 100))
                }
            }
            .frame(height: 10)
        }
    }

    private var tryThisNext: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TRY THIS NEXT").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            HStack(spacing: 8) {
                if let metric = priorityCandidate?.focusMetric {
                    chip("Set as my focus →") { onSetFocus(metric) }
                }
                chip("Reflect on this →", action: onNavigateReflect)
            }
        }
    }

    private func chip(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.primary)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(AppTheme.primary.opacity(0.1), in: Capsule())
        }
    }
}
