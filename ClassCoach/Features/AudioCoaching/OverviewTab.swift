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
        // Feedback is a response to a student, so it can only be read from a
        // recording that caught students — mirrors feedbackMeasurable in
        // web/src/lib/reportConfidence.ts.
        if (detail["studentVoiceSegments"].map { Int($0) } ?? 0) < ReportConfidence.minStudentSegmentsForFeedback {
            feedbackRatio = ReportConfidence.ConfidentMetric(
                state: .limitedEvidence, display: "—",
                reason: "Too little student voice came through to read how you responded to it."
            )
        } else {
            feedbackRatio = ReportConfidence.formatRatio(numerator: specific, denominator: specific + generic)
        }

        let positive = detail["positivePhraseCount"].map { Int($0) } ?? 0
        let corrective = detail["correctivePhraseCount"].map { Int($0) } ?? 0
        toneRatio = ReportConfidence.formatRatio(numerator: positive, denominator: positive + corrective)
    }
}

/// The Summary tab — mirrors `AudioCoaching.tsx`'s `SummaryTab`: the lesson
/// at a glance, four headline numbers, one strength, one focus, and who was
/// heard. Everything else lives in Insights; talking it through is Reflect.
struct OverviewTab: View {
    let session: AudioSessionWithSegments
    /// The written summary is on its way from the server — show the wait
    /// rather than the numbers-only fallback, which would be replaced under
    /// the teacher's eyes a few seconds later.
    var summarizing = false
    /// The transcript is being read for the moment to revisit.
    var readingMoment = false
    let onNavigateInsights: (InsightsSection) -> Void
    let onDiscuss: (ReflectFocus) -> Void

    private var m: OverviewMetrics { OverviewMetrics(session) }

    /// Planning is asked as a question, and the ticks only appear on a yes: a
    /// teacher reading their report should see what to try, not a form.
    @State private var choosingForPlan = false
    @State private var skippedForPlan: Set<String> = []

    /// 100 minus the two talk shares — the quiet, the overlap and anything the
    /// mic could not place. Mirrors the web report's own calculation.
    private var silencePct: Double? {
        guard let teacher = session.teacherTalkPct, let student = session.studentTalkPct else { return nil }
        // One decimal, like the two shares beside it — whole numbers made the
        // three add up to 100.4.
        return max(0, ((100 - teacher - student) * 10).rounded() / 10)
    }

    private var talkInsight: String? { AudioInsights.buildTalkInsight(session) }
    private var questioningInsight: String? { AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio) }
    private var cfuInsight: String? { AudioInsights.buildCfuInsight(m.cfuMetric) }
    private var noticedSummary: String? { AudioInsights.buildWivozaNoticedSummary([talkInsight, questioningInsight, cfuInsight]) }

    private var strengthCandidate: AudioInsights.NoticeCandidate? {
        AudioInsights.pickTop(AudioInsights.buildStrengthCandidates(session, cfuMetric: m.cfuMetric, feedbackRatio: m.feedbackRatio, higherOrderRatio: m.higherOrderRatio))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if summarizing && session.classSummary == nil {
                ProgressRing(
                    active: true,
                    estimatedSeconds: 18,
                    label: "Putting together a summary of this lesson",
                    hint: "Reading the whole transcript, not just the start."
                )
                .frame(maxWidth: .infinity)
            } else if let glance = session.classSummary ?? noticedSummary {
                VStack(alignment: .leading, spacing: 6) {
                    eyebrow("Lesson at a glance", AppTheme.terracotta600)
                    // Three paragraphs now — content, strengths, then what to
                    // weigh. Any newline starts a new one, not only a blank
                    // line: a summary whose paragraphs came back separated by
                    // single newlines used to run together into a wall.
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(
                            glance.components(separatedBy: .newlines)
                                .map { $0.trimmingCharacters(in: .whitespaces) }
                                .filter { !$0.isEmpty },
                            id: \.self
                        ) { para in
                            Text(para)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
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
                // Shares of the recording, not of the talking: without silence
                // beside them, 22.6% and 7.9% read as a missing 70%.
                tile("Silence / other", percent(silencePct), .teal)
                tile("Questions", ReportConfidence.getCountMetric(count: session.questionCount, recordedSec: m.coverage.recordedSec), .teal)
                tile("Avg. wait", waitMetric, .forest)
            }

            strengthCard
            priorityCard
            whoWasHeardCard
            tryNextTimeCard

            // Reading the summary and wanting to talk about it is the same
            // impulse, so the way to do that sits at the end of the reading
            // rather than under each card.
            DiscussFooter { onDiscuss(.forSummary(session)) }
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

    /// The moment comes from a read of the transcript, not from ranking the
    /// report's counts — that ranking put "longest monologue" on almost every
    /// lesson. Mirrors `MomentToRevisitCard` in AudioCoaching.tsx, including
    /// the three answers that decline to name one and say why.
    @ViewBuilder private var priorityCard: some View {
        if let moment = session.momentToRevisit {
            tintedCard(AppTheme.goldTint.opacity(0.7)) {
                eyebrow("A moment to revisit", AppTheme.terracotta600)
                if moment.status == "found", let headline = moment.headline {
                    Text(headline).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let quote = moment.quote {
                        Text("\u{201C}\(quote)\u{201D}\(moment.timestampSec.map { " · \(ReportConfidence.formatDuration($0))" } ?? "")")
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let why = moment.whyItMatters {
                        Text(why).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    // What to do about it is the first line of "Try next
                    // time", below — one list of next steps, not one here and
                    // more scattered through Insights.
                } else {
                    Text(momentWithoutOne(moment.status))
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        } else if readingMoment {
            tintedCard(AppTheme.goldTint.opacity(0.7)) {
                eyebrow("A moment to revisit", AppTheme.terracotta600)
                Text("Reading the lesson for the moment most worth a second look…")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
        // Not read and not being read — an older report whose request failed,
        // or a locked one. Nothing beats a placeholder that never resolves.
    }

    private func momentWithoutOne(_ status: String) -> String {
        switch status {
        case "thin":
            return "Not enough of this lesson came through clearly to pick one moment honestly. A recording with the phone nearer to where you teach gives this more to go on."
        case "not_a_lesson":
            return "This recording doesn\u{2019}t read as a class being taught, so there is no moment to pick out."
        default:
            return "Nothing in this lesson stood out as needing a second look."
        }
    }

    private struct NextTimeItem: Identifiable {
        let id: String
        let from: String
        let text: String
        /// How the item is introduced once it leaves the report: a content
        /// note is an observation, and a plan needs telling what to do with it.
        var lead: String? = nil
    }

    /// Everything the report suggests, in one list — mirrors
    /// `buildNextTimeItems` in AudioCoaching.tsx. "Worth double-checking"
    /// notes are left out: a caution about possible content errors is not
    /// something to build a lesson on.
    private var nextTimeItems: [NextTimeItem] {
        var items: [NextTimeItem] = []
        func add(_ id: String, _ from: String, _ text: String?, lead: String? = nil) {
            guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
            items.append(NextTimeItem(id: id, from: from, text: text, lead: lead))
        }
        let moment = session.momentToRevisit
        add("moment", "Moment to revisit", moment?.status == "found" ? moment?.tryNext : nil)
        add("talk", "Talk & Participation", session.nextSteps?.talk)
        add("questions", "Questioning & Checking", session.nextSteps?.questions)
        let notes = session.contentNotes?.notes ?? []
        add("content-further", "Take further · Clarity & Content",
            notes.first { $0.label == "Where it could go further" }?.text, lead: "Take this further")
        add("climate", "Climate & Routines", session.nextSteps?.climate)
        add("content-worked", "Keep doing · Clarity & Content",
            notes.first { $0.label == "What worked" }?.text, lead: "Keep doing this")
        return items
    }

    private func planningPrefill(_ chosen: [NextTimeItem]) -> PlanningPrefill {
        let lines = chosen.map { "- \($0.lead.map { "\($0): " } ?? "")\($0.text)" }
        return PlanningPrefill(
            subject: session.classSubject ?? session.lessonContent?.subject,
            gradeLevel: session.gradeLevel,
            additionalContext: (["From the debrief of my last lesson with this class, build these into the plan:"] + lines).joined(separator: "\n"),
            source: "\(session.displayTitle), \(formattedDate(session.sessionDate))"
        )
    }

    @ViewBuilder private var tryNextTimeCard: some View {
        let items = nextTimeItems
        if !items.isEmpty {
            let chosen = items.filter { !skippedForPlan.contains($0.id) }
            tintedCard(AppTheme.card) {
                Text("Try next time").font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                Text("What this report suggests, from every section, in one list")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                ForEach(items) { item in
                    Button {
                        guard choosingForPlan else { return }
                        if skippedForPlan.contains(item.id) { skippedForPlan.remove(item.id) } else { skippedForPlan.insert(item.id) }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            if choosingForPlan {
                                Image(systemName: skippedForPlan.contains(item.id) ? "square" : "checkmark.square.fill")
                                    .foregroundStyle(AppTheme.forest)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.from.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                                Text(item.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                }
                Divider().padding(.vertical, 6)
                if !choosingForPlan {
                    Text("Would you like to plan your next class with this in mind?")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Yes, choose what to include") { choosingForPlan = true }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        .padding(.top, 2)
                } else {
                    NavigationLink {
                        LessonPlanningView(prefill: planningPrefill(chosen))
                    } label: {
                        Text(chosen.count == items.count ? "Plan the next lesson with all of these →" : "Plan the next lesson with \(chosen.count) of these →")
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                    .disabled(chosen.isEmpty)
                    Button("Not now") { choosingForPlan = false }
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 2)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
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
