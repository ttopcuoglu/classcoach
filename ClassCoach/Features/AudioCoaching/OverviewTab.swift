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
        // Phase boundaries are no longer used to judge coverage — the web report
        // dropped them as unreliable, so the phone matches.
        coverage = ReportConfidence.getCoverage(durationSec: session.durationSec, phases: nil)
        let recordedSec = coverage.recordedSec
        let detail = session.metricsDetail ?? [:]

        cfuMetric = ReportConfidence.getCountMetric(
            count: session.cfuCount, recordedSec: recordedSec,
            minDurationSec: ReportConfidence.minDurationForCFUDetectionSec
        )
        redirectionMetric = ReportConfidence.getCountMetric(count: detail["redirectionCount"].map { Int($0) }, recordedSec: recordedSec)
        directiveMetric = ReportConfidence.getCountMetric(count: detail["directiveCount"].map { Int($0) }, recordedSec: recordedSec)
        nameMentionMetric = ReportConfidence.getCountMetric(count: detail["nameMentionCount"].map { Int($0) }, recordedSec: recordedSec)
        followUpMetric = ReportConfidence.getFollowUpMetric(
            count: detail["followUpQuestionCount"].map { Int($0) },
            studentVoiceSegments: detail["studentVoiceSegments"].map { Int($0) },
            recordedSec: recordedSec
        )

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

/// The Summary tab — mirrors `AudioCoaching.tsx`'s `SummaryTab`: the lesson
/// at a glance, four headline numbers, one strength, one focus, who was
/// heard, and one next step. Everything else lives in Insights.
struct OverviewTab: View {
    let session: AudioSessionWithSegments
    let onSetFocus: (FocusMetric) -> Void
    let onNavigateReflect: () -> Void
    let onNavigateInsights: (InsightsSection) -> Void

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
            if let glance = session.classSummary ?? noticedSummary {
                VStack(alignment: .leading, spacing: 6) {
                    eyebrow("Lesson at a glance", AppTheme.terracotta600)
                    Text(glance).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.goldTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 18))
                .overlay(alignment: .leading) {
                    UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18)
                        .fill(AppTheme.gold)
                        .frame(width: 7)
                }
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                tile("You spoke", percent(session.teacherTalkPct), .terracotta)
                tile("Students spoke", percent(session.studentTalkPct), .gold)
                tile("Questions", ReportConfidence.getCountMetric(count: session.questionCount, recordedSec: m.coverage.recordedSec), .teal)
                tile("Avg. wait", waitMetric, .forest)
            }

            strengthCard
            priorityCard
            whoWasHeardCard
            nextStepCard
        }
    }

    // MARK: Pieces

    private func eyebrow(_ text: String, _ color: Color) -> some View {
        Text(text.uppercased()).font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(color)
    }

    private func tile(_ label: String, _ metric: ReportConfidence.ConfidentMetric, _ accent: ReportAccent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(accent.ink)
            Text(metric.display)
                .font(.heading(.title))
                .foregroundStyle(metric.state.isMissing ? AppTheme.textSecondary : AppTheme.forest)
            if metric.state.isMissing, let reason = metric.reason {
                Text(reason).font(.caption2).foregroundStyle(AppTheme.textSecondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background(accent.tint, in: RoundedRectangle(cornerRadius: 18))
    }

    private func percent(_ value: Double?) -> ReportConfidence.ConfidentMetric {
        guard let value else {
            return ReportConfidence.ConfidentMetric(state: .notMeasurable, display: "—", reason: "Not enough data in this session to compute this.")
        }
        return ReportConfidence.ConfidentMetric(state: .measured, display: "\(ReportConfidence.formatNumber(value))%")
    }

    private var waitMetric: ReportConfidence.ConfidentMetric {
        guard let wait = session.avgWaitTimeSec else {
            return ReportConfidence.ConfidentMetric(state: .notMeasurable, display: "—", reason: "Not enough data in this session to compute this.")
        }
        return ReportConfidence.ConfidentMetric(state: .measured, display: "\(ReportConfidence.formatNumber(wait))s")
    }

    private func tintedCard(_ fill: Color, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: 18))
    }

    private var strengthCard: some View {
        tintedCard(AppTheme.mintTint.opacity(0.7)) {
            eyebrow("A strength to keep", AppTheme.forest)
            if let c = strengthCandidate {
                Text(AudioInsights.formatCandidateHeadline(c)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                if let excerpt = c.excerpt { Text("\u{201C}\(excerpt)\u{201D}").font(.subheadline).foregroundStyle(AppTheme.textSecondary) }
                Text(c.whyItMatters).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                Text("Not enough measured evidence yet for a stand-out strength this session.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                Button("See the full breakdown in Insights →") { onNavigateInsights(.talk) }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
            }
        }
    }

    private var priorityCard: some View {
        tintedCard(AppTheme.goldTint.opacity(0.7)) {
            eyebrow("Coaching priority", AppTheme.terracotta600)
            if let c = priorityCandidate {
                Text(AudioInsights.formatCandidateHeadline(c)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                if let excerpt = c.excerpt { Text("\u{201C}\(excerpt)\u{201D}").font(.subheadline).foregroundStyle(AppTheme.textSecondary) }
                Text(c.whyItMatters).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                if let metric = c.focusMetric {
                    Button("Set as my focus →") { onSetFocus(metric) }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                        .padding(.top, 2)
                }
            } else {
                Text("This recording was \(ReportConfidence.formatDuration(m.coverage.recordedSec)) — coaching-priority signals need more length to surface reliably. Aim for at least \(Int(ReportConfidence.shortSessionThresholdSec / 60)) minutes next time.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private var whoWasHeardCard: some View {
        tintedCard(AppTheme.card) {
            Text("Who was heard?").font(.heading(.headline)).foregroundStyle(AppTheme.forest)
            balanceBar(label: "You", pct: session.teacherTalkPct, color: AppTheme.terracotta)
            balanceBar(label: "Students", pct: session.studentTalkPct, color: AppTheme.gold)
            if let caption = AudioInsights.buildVoiceBalanceCaption(ReportConfidence.judgeTalkBalance(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct)) {
                Text(caption).font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            Button("Explore talk & participation →") { onNavigateInsights(.talk) }
                .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                .padding(.top, 2)
        }
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private var nextStepCard: some View {
        tintedCard(AppTheme.peachTint.opacity(0.6)) {
            eyebrow("One next step", AppTheme.terracotta600)
            Text("Talk this lesson through with your coach, and leave with one thing to try next time.")
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            Button(action: onNavigateReflect) {
                Label("Reflect with Wivoza", systemImage: "bubble.left.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .padding(.top, 4)
        }
    }

    private func balanceBar(label: String, pct: Double?, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.caption.weight(.medium))
                Spacer()
                Text(pct.map { "\(Int($0))%" } ?? "—").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 5).fill(AppTheme.hairline)
                    RoundedRectangle(cornerRadius: 5).fill(color)
                        .frame(width: geo.size.width * CGFloat((pct ?? 0) / 100))
                }
            }
            .frame(height: 10)
        }
    }
}
