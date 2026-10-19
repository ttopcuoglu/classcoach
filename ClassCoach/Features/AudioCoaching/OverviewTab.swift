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

/// One of the report's suggestions, from whichever section made it — mirrors
/// `NextTimeItem` in web/src/lib/reportHighlights.ts.
struct NextTimeItem: Identifiable, Equatable {
    let id: String
    let from: String
    let text: String
    /// How the item is introduced once it leaves the report: a content note
    /// is an observation, and a plan needs telling what to do with it.
    var lead: String? = nil

    /// "Take further · Clarity & Content" → "Clarity & Content".
    var section: String { from.components(separatedBy: " · ").last ?? from }
    /// "Keep doing" is something to keep, not a change to aim at.
    var focusable: Bool { id != "content-worked" }
    var insightsSection: InsightsSection? {
        switch id {
        case "talk": return .talk
        case "questions": return .questions
        case "content-further", "content-worked": return .content
        case "climate": return .routines
        default: return nil
        }
    }

    /// Everything the report suggests, in one list — mirrors
    /// `buildNextTimeItems`. "Worth double-checking" notes are left out: a
    /// caution about possible content errors is not something to build a
    /// lesson on.
    static func items(for session: AudioSessionWithSegments) -> [NextTimeItem] {
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
}

/// Each counted question in one of three kinds — mirrors `classifyQuestions`
/// in AudioCoaching.tsx, so Summary and the web count the same questions the
/// same way: the finer read where it found the question, else the recall /
/// higher-order split (higher-order without a finer kind reads as explain).
enum QuestionMix: String, CaseIterable {
    case recall, explain, reasoning

    var color: Color {
        switch self {
        case .recall: return Color(hex: 0xCFC6B4)
        case .explain: return Color(hex: 0x7FAE93)
        case .reasoning: return Color(hex: 0x2E5E46)
        }
    }

    static func classify(_ session: AudioSessionWithSegments) -> [(entry: AudioQuestionLogEntry, mix: QuestionMix)] {
        let kinds = session.teachingMoves?.questionKinds ?? []
        return (session.questionLog ?? []).map { q in
            let kind = kinds.first { abs($0.timestampSec - q.timestampSec) <= 4 }?.kind
            let mix: QuestionMix
            switch kind {
            case "recall": mix = .recall
            case "explain": mix = .explain
            case "justify", "compare", "evaluate": mix = .reasoning
            case .some: mix = .recall
            case .none: mix = q.type == "higher_order" ? .explain : .recall
            }
            return (q, mix)
        }
    }
}

/// The Summary tab — mirrors `SummaryTab` in AudioCoaching.tsx: the headline,
/// your one focus for next lesson, one card per Insights section, keep doing,
/// and Try next time. Everything else lives in Insights; talking it through
/// is Reflect.
struct OverviewTab: View {
    let session: AudioSessionWithSegments
    /// The written summary is on its way from the server — show the wait
    /// rather than the numbers-only fallback, which would be replaced under
    /// the teacher's eyes a few seconds later.
    var summarizing = false
    var readingMoment = false
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onNavigateInsights: (InsightsSection) -> Void

    private var m: OverviewMetrics { OverviewMetrics(session) }

    /// Planning is asked as a question, and the ticks only appear on a yes: a
    /// teacher reading their report should see what to try, not a form.
    @State private var choosingForPlan = false
    @State private var skippedForPlan: Set<String> = []

    private var talkInsight: String? { AudioInsights.buildTalkInsight(session) }
    private var questioningInsight: String? { AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio) }
    private var cfuInsight: String? { AudioInsights.buildCfuInsight(m.cfuMetric) }
    private var noticedSummary: String? { AudioInsights.buildWivozaNoticedSummary([talkInsight, questioningInsight, cfuInsight]) }

    private var detail: [String: Double] { session.metricsDetail ?? [:] }
    private var heard: Int? { detail["answersHeardCount"].map { Int($0) } }
    private var followed: Int? { detail["answersFollowedUpCount"].map { Int($0) } }

    // MARK: One focus

    /// Which Try next time item each headline section suggests.
    private static let headlineItem = ["talk": "talk", "questions": "questions", "content": "content-further", "routines": "climate"]

    private var items: [NextTimeItem] { NextTimeItem.items(for: session) }
    private var headlineSection: String? { session.teachingMoves?.headline?.section }
    /// The section the headline's pattern points to; else questioning, talk,
    /// climate in that order.
    private var suggested: NextTimeItem? {
        let all = items
        if let s = headlineSection, let id = Self.headlineItem[s], let item = all.first(where: { $0.id == id }) { return item }
        for id in ["questions", "talk", "climate"] {
            if let item = all.first(where: { $0.id == id }) { return item }
        }
        return nil
    }
    private var chosen: NextTimeItem? {
        guard let id = session.lessonFocus?.next?.itemId else { return nil }
        return items.first { $0.id == id && $0.focusable }
    }
    private var focus: NextTimeItem? { chosen ?? suggested }

    /// Saved with the lesson; shown at once, and put back if the save fails.
    private func chooseFocus(_ itemId: String?) {
        let before = session
        var updated = session
        updated.session.lessonFocus = itemId.map { AudioLessonFocus(itemId: $0) }
        onUpdate(updated)
        Task {
            do { try await AudioCoachingService.setLessonFocus(sessionId: session.id, itemId: itemId) } catch { onUpdate(before) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            headlineCard
            focusCard
            sectionCards
            keepDoingCard
            tryNextTimeCard
        }
    }

    // MARK: Headline

    @ViewBuilder private var headlineCard: some View {
        // The lesson summary, whole — what the lesson was about, what went
        // well, what might be worth a look. The short pattern headline is not
        // shown; it still picks the suggested focus.
        if let text = session.classSummary {
            noteCard(text)
        } else if summarizing {
            ProgressRing(
                active: true,
                estimatedSeconds: 18,
                label: "Putting together a summary of this lesson",
                hint: "Reading the whole transcript, not just the start."
            )
            .frame(maxWidth: .infinity)
        } else if let text = noticedSummary {
            noteCard(text)
        }
    }

    @State private var noteOpen = false

    /// Wivo's note: the "W" mark beside the summary's first paragraph — what
    /// the lesson was about — with the other two behind "Read more".
    private func noteCard(_ text: String) -> some View {
        let paras = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return HStack(alignment: .top, spacing: 12) {
            Text("W")
                .font(.heading(.subheadline)).foregroundStyle(AppTheme.gold)
                .frame(width: 30, height: 30)
                .background(AppTheme.forest, in: Circle())
            VStack(alignment: .leading, spacing: 8) {
                ForEach(noteOpen ? paras : Array(paras.prefix(1)), id: \.self) { para in
                    Text(para).font(.body).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if paras.count > 1 {
                    Button(noteOpen ? "Show less" : "Read more") { withAnimation { noteOpen.toggle() } }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.mintTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 22))
    }

    // MARK: Focus card

    @ViewBuilder private var focusCard: some View {
        if let focus {
            let withGoal = focus.id == "questions" && (heard ?? 0) >= 3 && (followed ?? Int.max) < (heard ?? 0)
            VStack(alignment: .leading, spacing: 10) {
                Text("YOUR ONE FOCUS FOR NEXT LESSON")
                    .font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(Color(hex: 0x8E3F22))
                Text(focus.text).font(.body).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if withGoal, let heard, let followed {
                    let target = min(heard, followed + 2)
                    VStack(alignment: .leading, spacing: 6) {
                        FlowLayout(spacing: 5) {
                            ForEach(0..<heard, id: \.self) { i in
                                let filled = i < followed
                                let goal = !filled && i < target
                                Circle()
                                    .fill(filled ? AppTheme.terracotta : AppTheme.card)
                                    .overlay(Circle().strokeBorder(
                                        filled || goal ? AppTheme.terracotta : Color(hex: 0xD8B9A4),
                                        style: StrokeStyle(lineWidth: 2, dash: goal ? [3, 2] : [])
                                    ))
                                    .frame(width: 18, height: 18)
                            }
                        }
                        Text("\(followed) of \(heard) followed up today → aim for \(target)")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Aim: \(target) of \(heard) answers followed up, \(followed) today")
                }
                if let section = focus.insightsSection {
                    Button("From \(focus.section) →") { onNavigateInsights(section) }
                        .font(.subheadline).foregroundStyle(Color(hex: 0x6E4A3A))
                } else {
                    Text("From \(focus.section)").font(.subheadline).foregroundStyle(Color(hex: 0x6E4A3A))
                }
                HStack(spacing: 4) {
                    Text(chosen != nil ? "Your choice ·"
                         : headlineSection.flatMap { Self.headlineItem[$0] } == suggested?.id ? "Suggested: where today\u{2019}s pattern points ·"
                         : "Suggested ·")
                    // With no suggestion to go back to, the way out is to clear it.
                    if let chosen, suggested?.id != chosen.id {
                        Button(suggested == nil ? "Clear my focus" : "Back to the suggestion") { chooseFocus(nil) }.fontWeight(.semibold)
                    } else {
                        Text("pick another from Try next time below")
                    }
                }
                .font(.caption).foregroundStyle(Color(hex: 0x6E4A3A))
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.peachTint, in: RoundedRectangle(cornerRadius: 22))
            .background(AppTheme.gold, in: RoundedRectangle(cornerRadius: 22).offset(x: 5, y: 5))
            .padding(.trailing, 5).padding(.bottom, 5)
        }
    }

    // MARK: Section cards

    private struct Slice: Identifiable {
        let id: Int
        let weight: Double
        let color: Color
        var hatched = false
    }

    private var hatch: [Slice] { [Slice(id: 0, weight: 1, color: .clear, hatched: true)] }

    /// The recording's split as the Talk section states it: you, students,
    /// and the rest as sound-with-no-words and quiet where the envelope
    /// measured them, else one "no reading" slice. Mirrors `recordingShares`.
    private var talkSlices: [Slice] {
        guard let teacher = session.teacherTalkPct else { return hatch }
        let students = session.studentTalkPct ?? 0
        let rest = max(0, 100 - teacher - students)
        var slices = [Slice(id: 0, weight: teacher, color: Color(hex: 0x2F855A)),
                      Slice(id: 1, weight: students, color: Color(hex: 0x8B7BC2))]
        if let quiet = detail["quietSec"], let unresolved = detail["unresolvedSec"], quiet + unresolved > 0 {
            slices.append(Slice(id: 2, weight: rest * unresolved / (quiet + unresolved), color: Color(hex: 0xD08A2A)))
            slices.append(Slice(id: 3, weight: rest * quiet / (quiet + unresolved), color: Color(hex: 0x3F8FD8)))
        } else {
            slices.append(Slice(id: 2, weight: rest, color: .clear, hatched: true))
        }
        return slices.filter { $0.weight >= 0.5 }
    }

    private func bar(_ slices: [Slice]) -> some View {
        GeometryReader { geo in
            let total = max(0.0001, slices.reduce(0) { $0 + $1.weight })
            let gaps = CGFloat(max(0, slices.count - 1)) * 3
            HStack(spacing: 3) {
                ForEach(slices) { slice in
                    let width = max(2, (geo.size.width - gaps) * CGFloat(slice.weight / total))
                    if slice.hatched {
                        RoundedRectangle(cornerRadius: 3)
                            .strokeBorder(Color(hex: 0x9C9486), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                            .frame(width: width)
                    } else {
                        RoundedRectangle(cornerRadius: 3).fill(slice.color).frame(width: width)
                    }
                }
            }
        }
        .frame(height: 12)
    }

    private func sectionCard(_ section: InsightsSection, stat: String, statNote: String?, slices: [Slice], take: String?) -> some View {
        Button { onNavigateInsights(section) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Text("\(section.number)")
                        .font(.heading(.subheadline)).foregroundStyle(section.accent.onBand)
                        .frame(width: 32, height: 32)
                        .background(section.accent.band, in: RoundedRectangle(cornerRadius: 10))
                    Text(section.title).font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                }
                (Text(stat).font(.heading(.title)).foregroundColor(AppTheme.forest)
                    + Text(statNote.map { "  \($0)" } ?? "").font(.subheadline).foregroundColor(AppTheme.textSecondary))
                    .fixedSize(horizontal: false, vertical: true)
                bar(slices)
                if let take {
                    Text(take).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("Open \(section.title) →").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
            }
            .multilineTextAlignment(.leading)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22))
        }
        .buttonStyle(.plain)
    }

    private static let arcRoleLabel = ["opened": "opened with", "built": "built", "applied": "applied to", "practiced": "practiced", "closed": "closed with"]

    @ViewBuilder private var sectionCards: some View {
        let moves = session.teachingMoves
        let invitations = (moves?.participation?.invitations ?? moves?.invitations ?? []).count
        let questions = QuestionMix.classify(session)
        let count = { (k: QuestionMix) in questions.filter { $0.mix == k }.count }
        let arc = moves?.arc ?? []
        let explanations = moves?.explanations?.count ?? 0
        let keyTerms = session.lessonContent?.keyTerms ?? []
        let directions = (moves?.directions ?? []).sorted { $0.timestampSec < $1.timestampSec }
        let complete = directions.filter { $0.parts.count == 4 }.count
        let redirections = moves?.redirections ?? []
        let actionable = redirections.filter { $0.clarity == "actionable" }.count
        let arcColors = [Color(hex: 0xCFC6B4), Color(hex: 0x7FAE93), Color(hex: 0x1F3A2E), Color(hex: 0x2E5E46)]

        sectionCard(
            .talk,
            stat: session.teacherTalkPct.map { "\(Int($0.rounded()))%" } ?? "—",
            statNote: session.teacherTalkPct != nil ? "of the recording was your voice" : nil,
            slices: talkSlices,
            take: invitations > 0 ? "You opened the floor \(invitations) time\(invitations == 1 ? "" : "s")." : nil
        )
        sectionCard(
            .questions,
            stat: questions.isEmpty ? "—" : "\(count(.explain) + count(.reasoning)) of \(questions.count)",
            statNote: questions.isEmpty ? nil : "questions went beyond recall",
            slices: questions.isEmpty ? hatch : QuestionMix.allCases.enumerated().compactMap { i, k in
                count(k) > 0 ? Slice(id: i, weight: Double(count(k)), color: k.color) : nil
            },
            take: (heard ?? 0) >= 3 && followed != nil ? "You followed up on \(followed!) of \(heard!) answers the recording could hear." : nil
        )
        sectionCard(
            .content,
            stat: arc.isEmpty ? "—" : "\(arc.count)",
            statNote: arc.isEmpty ? nil : "stages: " + arc.map { Self.arcRoleLabel[$0.role] ?? $0.role }.joined(separator: " → "),
            slices: arc.isEmpty ? hatch : arc.enumerated().map { i, stage in
                Slice(id: i, weight: max(1, stage.endSec - stage.startSec), color: arcColors[i % 4])
            },
            take: [
                explanations > 0 ? "You opened the content up \(explanations) time\(explanations == 1 ? "" : "s")." : nil,
                keyTerms.isEmpty ? nil : "\(keyTerms.filter { $0.studentCount > 0 }.count) of \(keyTerms.count) key terms heard from students.",
            ].compactMap { $0 }.joined(separator: " ").nilIfEmpty
        )
        sectionCard(
            .routines,
            stat: directions.count == 1 ? "\(directions[0].parts.count) of 4" : directions.count > 1 ? "\(complete) of \(directions.count)" : "—",
            statNote: directions.count == 1 ? "parts named in your one set of directions"
                : directions.count > 1 ? "directions named all four parts" : nil,
            slices: directions.isEmpty ? hatch : directions.enumerated().map { i, d in
                Slice(id: i, weight: 1, color: d.parts.count == 4 ? Color(hex: 0x1F3A2E) : d.parts.count >= 2 ? Color(hex: 0x7FAE93) : Color(hex: 0xCFC6B4))
            },
            take: redirections.count == 1
                ? (actionable == 1 ? "Your one redirection told students what to do." : "Your one redirection said what to stop, not what to do instead.")
                : redirections.count > 1 ? "\(actionable) of \(redirections.count) redirections told students what to do." : nil
        )
    }

    // MARK: Keep doing

    @ViewBuilder private var keepDoingCard: some View {
        let questions = QuestionMix.classify(session)
        let reasoning = questions.filter { $0.mix == .reasoning }.count
        let explain = questions.filter { $0.mix == .explain }.count
        if let q = questions.first(where: { $0.mix == .reasoning }) ?? questions.first(where: { $0.mix == .explain }) {
            VStack(alignment: .leading, spacing: 6) {
                Text("KEEP DOING").font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(AppTheme.forest)
                Text(reasoning > 0
                     ? "Your \u{201C}why\u{201D} questions. \(reasoning) asked students to justify, compare or judge, not just answer."
                     : "\(explain) of your questions asked students to explain why or how.")
                    .font(.body).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                (Text("\u{201C}\(Redaction.withoutAddressedNames(q.entry.text))\u{201D} ")
                    + Text(ReportConfidence.formatDuration(q.entry.timestampSec)).font(.caption.monospacedDigit()))
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.mintTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 22))
        }
    }

    // MARK: Try next time

    private func planningPrefill(_ chosenItems: [NextTimeItem]) -> PlanningPrefill {
        let focusLine = focus.map { ["- My one focus: \($0.text)"] } ?? []
        let lines = focusLine + chosenItems.map { "- \($0.lead.map { "\($0): " } ?? "")\($0.text)" }
        return PlanningPrefill(
            subject: session.classSubject ?? session.lessonContent?.subject,
            gradeLevel: session.gradeLevel,
            additionalContext: (["From the debrief of my last lesson with this class, build these into the plan:"] + lines).joined(separator: "\n"),
            source: "\(session.displayTitle), \(formattedDate(session.sessionDate))"
        )
    }

    @ViewBuilder private var tryNextTimeCard: some View {
        // The one focus has its own card above; it goes to planning first.
        let rest = items.filter { $0.id != focus?.id }
        if !rest.isEmpty || focus != nil {
            let chosenItems = rest.filter { !skippedForPlan.contains($0.id) }
            VStack(alignment: .leading, spacing: 6) {
                Text("TRY NEXT TIME").font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(Color(hex: 0x8E3F22))
                Text(focus != nil ? "The rest of what this report suggests, alongside your one focus." : "What this report suggests, from every section, in one list.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                ForEach(rest) { item in
                    HStack(alignment: .top, spacing: 10) {
                        if choosingForPlan {
                            Button {
                                if skippedForPlan.contains(item.id) { skippedForPlan.remove(item.id) } else { skippedForPlan.insert(item.id) }
                            } label: {
                                Image(systemName: skippedForPlan.contains(item.id) ? "square" : "checkmark.square.fill")
                                    .foregroundStyle(AppTheme.forest)
                            }
                            .buttonStyle(.plain)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.from.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                            Text(item.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            if !choosingForPlan && item.focusable {
                                Button("Make this my focus") { chooseFocus(item.id) }
                                    .font(.caption.weight(.semibold)).foregroundStyle(Color(hex: 0x8E3F22))
                                    .padding(.top, 2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.top, 8)
                }
                Divider().overlay(Color(hex: 0xE8C9B4)).padding(.vertical, 8)
                if !choosingForPlan {
                    Text("Would you like to plan your next class with this in mind?")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Yes, choose what to include") { choosingForPlan = true }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.cream)
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(AppTheme.forest, in: Capsule())
                        .padding(.top, 4)
                } else {
                    NavigationLink {
                        LessonPlanningView(prefill: planningPrefill(chosenItems))
                    } label: {
                        Text(chosenItems.count == rest.count ? "Plan the next lesson with all of these →" : "Plan the next lesson with \(chosenItems.count) of these →")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.cream)
                            .padding(.horizontal, 16).padding(.vertical, 9)
                            .background(AppTheme.terracotta, in: Capsule())
                    }
                    .disabled(chosenItems.isEmpty && focus == nil)
                    Button("Not now") { choosingForPlan = false }
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 2)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.peachTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 22))
        }
    }
}

extension AudioLessonFocus {
    init(itemId: String) { self.next = Next(itemId: itemId) }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// Student names in quoted teacher speech, shown as "[name]" — mirrors
/// `withoutAddressedNames` in AudioCoaching.tsx. A name is a capitalised word
/// set off the way direct address is ("Shania, what…", "…do you think,
/// Caleb?"); common openers are not names.
enum Redaction {
    private static let notNames: Set<String> = ["okay", "ok", "so", "now", "well", "yes", "yeah", "alright", "right", "and", "but", "guys", "everyone", "everybody", "class", "folks", "friends", "sure", "wait", "really", "hmm", "um", "good", "great", "perfect", "exactly", "nice"]
    // swiftlint:disable:next force_try
    private static let addressed = try! NSRegularExpression(pattern: "(^|[,.!?]\\s*)(\\p{Lu}\\p{Ll}+(?:['\u{2019}-]\\p{L}+)*)(?=\\s*[,?])")

    static func withoutAddressedNames(_ text: String) -> String {
        let ns = text as NSString
        var result = text
        for match in addressed.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
            let word = ns.substring(with: match.range(at: 2))
            guard !notNames.contains(word.lowercased()), let range = Range(match.range(at: 2), in: result) else { continue }
            result.replaceSubrange(range, with: "[name]")
        }
        return result
    }
}
