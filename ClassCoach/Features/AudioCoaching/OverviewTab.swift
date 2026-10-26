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
        add("content-worked", "What worked · Clarity & Content",
            notes.first { $0.label == "What worked" }?.text, lead: "What worked")
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
        case .recall: return Color(hex: 0xA89C84)
        case .explain: return Color(hex: 0x4F9A72)
        case .reasoning: return Color(hex: 0x173F2D)
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

/// Teacher-Anchored Wait Time — mirrors `pausesAfter`/`averagePause` in
/// web/src/lib/thinkingPause.ts and `tawtOf` in AudioCoaching.tsx: after each
/// question that asked students to explain or reason (not one the teacher
/// answered themselves), the time from the end of the teacher's turn to the
/// teacher speaking again, averaged to a tenth of a second.
enum ThinkingPause {
    private static let maxJoinGapSec = 2.0
    private static let maxPauseSec = 30.0
    private static let maxWordsAfter = 3
    /// A gap this long between two teacher lines, straight after the question,
    /// is a pause even though the turn carries on; under it is a breath.
    private static let minPauseInTurnSec = 1.0

    private static func words(_ t: String) -> [String] {
        let cleaned = t.lowercased().map { $0.isLetter || $0.isNumber || $0 == "'" || $0 == " " ? $0 : " " }
        return String(cleaned).split(separator: " ").map(String.init)
    }

    private static func norm(_ q: String) -> String {
        String(q.lowercased().filter { $0.isLetter || $0.isNumber || $0 == " " }).trimmingCharacters(in: .whitespaces)
    }

    private static func sameMoment(_ aSec: Double, _ aQuote: String, _ bSec: Double, _ bQuote: String) -> Bool {
        let na = norm(aQuote), nb = norm(bQuote)
        return abs(aSec - bSec) <= 8 && !na.isEmpty && !nb.isEmpty && (na.hasPrefix(String(nb.prefix(20))) || nb.hasPrefix(String(na.prefix(20))))
    }

    /// `answered`: a student was heard before the teacher spoke again.
    /// `keptTalking`: the teacher talked straight past the question.
    struct Pause {
        let sec: Double
        let answered: Bool
        var keptTalking = false
    }

    static func pause(after t: Double, quote: String, in ordered: [TranscriptSegment]) -> Pause? {
        guard let idx = ordered.firstIndex(where: { $0.endSec > t }), ordered[idx].speakerLabel == "Teacher" else { return nil }
        var end = idx
        while end + 1 < ordered.count, ordered[end + 1].speakerLabel == "Teacher", ordered[end + 1].startSec - ordered[end].endSec <= maxJoinGapSec {
            end += 1
        }
        let turn = words(ordered[idx...end].map(\.text).joined(separator: " "))
        let tail = words(quote).suffix(3).joined(separator: " ")
        var at = -1
        if turn.count >= 3 { for i in 0...(turn.count - 3) where turn[i..<(i + 3)].joined(separator: " ") == tail { at = i + 3 } }
        if at != -1 && turn.count - at > maxWordsAfter {
            // The line the question ends in, and how many words it still had.
            var k = idx
            var upTo = words(ordered[idx].text).count
            while upTo < at && k < end { k += 1; upTo += words(ordered[k].text).count }
            if upTo - at > maxWordsAfter || k == end { return Pause(sec: 0, answered: false, keptTalking: true) }
            let inTurn = ordered[k + 1].startSec - ordered[k].endSec
            if inTurn < minPauseInTurnSec { return Pause(sec: 0, answered: false, keptTalking: true) }
            return Pause(sec: (inTurn * 10).rounded() / 10, answered: false)
        }
        let rest = ordered[(end + 1)...]
        guard let next = rest.first(where: { $0.speakerLabel == "Teacher" }) else { return nil }
        let gap = next.startSec - ordered[end].endSec
        guard gap >= 0, gap <= maxPauseSec else { return nil }
        let answered = rest.contains { $0.speakerLabel != "Teacher" && $0.startSec < next.startSec }
        return Pause(sec: (gap * 10).rounded() / 10, answered: answered)
    }

    typealias Question = (entry: AudioQuestionLogEntry, mix: QuestionMix)

    /// Worked out once for the Summary tile and the Questioning & Checking
    /// card so the two never disagree — mirrors `tawtOf`: the questions left
    /// with students (one you answered yourself is not one), the thinking ones
    /// among them, each one's pause, and their average.
    struct Detail {
        let selfAnswered: [AudioTeachingMoves.Quoted]
        let questions: [Question]
        let thinking: [Question]
        let pauses: [Pause?]
        var measured: Int { pauses.compactMap { $0 }.count }
        var average: Double? {
            let secs = pauses.compactMap { $0?.sec }
            guard !secs.isEmpty else { return nil }
            return ((secs.reduce(0, +) / Double(secs.count)) * 10).rounded() / 10
        }
    }

    static func detail(_ session: AudioSessionWithSegments) -> Detail {
        let selfAnswered = session.teachingMoves?.selfAnswered ?? []
        let ordered = session.segments.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }.sorted { $0.startSec < $1.startSec }
        let questions = QuestionMix.classify(session).filter { q in
            !selfAnswered.contains { sa in
                sameMoment(q.entry.timestampSec, Redaction.withoutAddressedNames(q.entry.text), sa.timestampSec, Redaction.withoutAddressedNames(sa.quote))
            }
        }
        let thinking = questions.filter { $0.mix != .recall }
        let pauses = thinking.map { pause(after: $0.entry.timestampSec, quote: Redaction.withoutAddressedNames($0.entry.text), in: ordered) }
        return Detail(selfAnswered: selfAnswered, questions: questions, thinking: thinking, pauses: pauses)
    }

    /// The average, and how many questions it rests on.
    static func tawt(_ session: AudioSessionWithSegments) -> (average: Double, count: Int)? {
        let d = detail(session)
        return d.average.map { ($0, d.measured) }
    }
}

/// The Summary tab — mirrors `SummaryTab` in AudioCoaching.tsx: the headline,
/// your one focus for next lesson, how the lesson moved, the lesson's
/// numbers, keep doing, and Try next time. Everything else lives in Insights; talking it through
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
        // The short lines already written stay with the lesson, as on the server.
        let lines = session.lessonFocus?.lines
        updated.session.lessonFocus = itemId != nil || lines != nil
            ? AudioLessonFocus(next: itemId.map { AudioLessonFocus.Next(itemId: $0) }, lines: lines)
            : nil
        onUpdate(updated)
        Task {
            do { try await AudioCoachingService.setLessonFocus(sessionId: session.id, itemId: itemId) } catch { onUpdate(before) }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // The focus first: it is the takeaway, and a teacher should not
            // have to read the summary to reach it.
            focusCard
            headlineCard
            lessonMovedCard
            numbersCard
            keepDoingCard
            tryNextTimeCard
        }
    }

    // MARK: Headline

    @ViewBuilder private var headlineCard: some View {
        // The lesson summary, whole — what the lesson was about, what went
        // well, what might be worth a look. The short pattern headline is not
        // shown; it still picks the suggested focus, which sits above it.
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

    @State private var whyOpen = false
    @State private var triedFocusLines: Set<String> = []

    /// The focus said simply (server lib/focusLine.ts), once it is written.
    private func focusLine(for focus: NextTimeItem) -> FocusLine? {
        session.lessonFocus?.lines?[FocusLine.key(for: focus.text)]
    }

    /// Written the first time the Summary opens on a focus, and kept with the
    /// lesson. Until then, or if it cannot be written, the card shows the
    /// suggestion as it is.
    private func writeFocusLineIfNeeded() async {
        guard let focus, focusLine(for: focus) == nil else { return }
        let key = FocusLine.key(for: focus.text)
        guard !triedFocusLines.contains(key) else { return }
        triedFocusLines.insert(key)
        guard let result = try? await AudioCoachingService.writeFocusLine(sessionId: session.id, text: focus.text, from: focus.section) else { return }
        var updated = session
        var lines = session.lessonFocus?.lines ?? [:]
        lines[result.key] = result.line
        updated.session.lessonFocus = AudioLessonFocus(next: session.lessonFocus?.next, lines: lines)
        onUpdate(updated)
    }

    @ViewBuilder private var focusCard: some View {
        if let focus {
            let withGoal = focus.id == "questions" && (heard ?? 0) >= 3 && (followed ?? Int.max) < (heard ?? 0)
            let line = focusLine(for: focus)
            VStack(alignment: .leading, spacing: 10) {
                Text("NEXT LESSON, TRY THIS")
                    .font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(Color(hex: 0x8E3F22))
                if let line {
                    if let well = line.well {
                        Text(well).font(.subheadline).foregroundStyle(Color(hex: 0x6E4A3A))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(line.tryLine).font(.heading(.title3)).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text(focus.text).font(.body).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
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
                // The full suggestion, and where it came from, one tap away.
                if line != nil && whyOpen {
                    VStack(alignment: .leading, spacing: 6) {
                        Divider()
                        Text(focus.text).font(.subheadline).foregroundStyle(Color(hex: 0x6E4A3A))
                            .fixedSize(horizontal: false, vertical: true)
                        if let section = focus.insightsSection {
                            Button("See it in \(focus.section) →") { onNavigateInsights(section) }
                                .font(.subheadline.weight(.semibold)).foregroundStyle(Color(hex: 0x8E3F22))
                        }
                    }
                }
                HStack {
                    if line != nil {
                        Button(whyOpen ? "Hide why" : "Why this ›") { whyOpen.toggle() }
                    } else if let section = focus.insightsSection {
                        Button("From \(focus.section) →") { onNavigateInsights(section) }
                    } else {
                        Text("From \(focus.section)")
                    }
                    Spacer(minLength: 8)
                    // With no suggestion to go back to, the way out is to clear it.
                    if let chosen, suggested?.id != chosen.id {
                        Button(suggested == nil ? "Clear my focus" : "Back to the suggestion") { chooseFocus(nil) }
                    } else {
                        Text("Choose a different one below")
                    }
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(Color(hex: 0x8E3F22))
            }
            // No card around it: the focus is the page's opening line, not a
            // box on it. A rule on the left marks where it starts.
            .padding(.leading, 16).padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) { Rectangle().fill(AppTheme.terracotta).frame(width: 4) }
            .task(id: FocusLine.key(for: focus.text)) { await writeFocusLineIfNeeded() }
        }
    }

    // MARK: The lesson's numbers

    /// One tile — mirrors the web Summary's tiles: the same eight numbers,
    /// labels and colours.
    private struct Tile: Identifiable {
        var id: String { label }
        let label: String
        let value: String?
        let unit: String
        let tint: Color
        var hint: String? = nil
        /// What a measured number rests on.
        var note: String? = nil
    }

    private static func pct(_ v: Double?) -> String? { v.map { String(format: "%.1f", ($0 * 10).rounded() / 10) } }

    private var tiles: [Tile] {
        let teacher = session.teacherTalkPct
        let students = session.studentTalkPct
        let silence = teacher != nil && students != nil ? max(0, ((100 - teacher! - students!) * 10).rounded() / 10) : nil
        var out = [
            Tile(label: "You spoke", value: Self.pct(teacher), unit: "%", tint: Color(hex: 0xF5DBC8)),
            Tile(label: "Students spoke", value: Self.pct(students), unit: "%", tint: Color(hex: 0xF5E7C4)),
        ]
        // The rest split the way Talk & Participation splits it; recordings
        // with no sound reading keep one combined tile.
        if let silence, let quiet = detail["quietSec"], let unresolved = detail["unresolvedSec"], quiet + unresolved > 0 {
            let sound = (silence * unresolved / (quiet + unresolved) * 10).rounded() / 10
            out.append(Tile(label: "Sound, no words", value: Self.pct(sound), unit: "%", tint: Color(hex: 0xE5E0EF)))
            out.append(Tile(label: "Quiet", value: Self.pct(max(0, silence - sound)), unit: "%", tint: Color(hex: 0xDDE8F4)))
        } else {
            out.append(Tile(label: "Silence / other", value: Self.pct(silence), unit: "%", tint: Color(hex: 0xE5E0EF)))
        }
        out.append(Tile(label: "Pace", value: detail["teacherWordsPerMinute"].map { "\(Int($0.rounded()))" }, unit: "wpm", tint: Color(hex: 0xF4DFE4)))
        out.append(Tile(label: "Questions", value: session.questionCount.map { "\($0)" }, unit: "", tint: Color(hex: 0xDCE7DF)))
        let tawt = ThinkingPause.tawt(session)
        out.append(Tile(label: "TAWT", value: tawt.map { String(format: "%.1f", $0.average) }, unit: "s", tint: Color(hex: 0xE6EBD2),
                        hint: tawt == nil ? "No pause after a thinking question could be timed." : nil,
                        note: tawt.map { "from \($0.count) question\($0.count == 1 ? "" : "s")" }))
        // The checks Questioning & Checking lists, left-out non-checks and all;
        // older lessons with no log fall back to the stored count.
        let checks = session.cfuLog.map { log in log.filter { $0.loop?.who != "not_a_check" }.count } ?? session.cfuCount
        let tooShort = (session.durationSec ?? 0) < 3 * 60
        out.append(Tile(label: "Checks", value: tooShort ? nil : checks.map { "\($0)" }, unit: "", tint: Color(hex: 0xD2E8E6),
                        hint: tooShort ? "Recording too short (under 3 min) to reliably detect this." : nil))
        return out
    }

    private var hasSoundSplit: Bool { tiles.contains { $0.label == "Quiet" } }
    @State private var readingOpen = false

    @ViewBuilder private var numbersCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(tiles) { t in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(t.label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.forest.opacity(0.6))
                        (Text(t.value ?? "\u{2014}").font(.heading(.title)).foregroundColor(AppTheme.forest)
                            + Text(t.value != nil && !t.unit.isEmpty ? " \(t.unit)" : "").font(.subheadline.weight(.bold)).foregroundColor(AppTheme.forest))
                        if let hint = t.hint ?? t.note {
                            Text(hint).font(.caption2).foregroundStyle(AppTheme.forest.opacity(0.7)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
                    .background(t.tint, in: RoundedRectangle(cornerRadius: 16))
                }
            }
            DisclosureGroup(isExpanded: $readingOpen) {
                VStack(alignment: .leading, spacing: 6) {
                    readingLine("You spoke, Students spoke", "the share of the recording each voice took. The microphone hears you better than students.")
                    if hasSoundSplit {
                        readingLine("Sound, no words", "sound the microphone caught but couldn\u{2019}t turn into words, usually voices too far away or talking over each other.")
                        readingLine("Quiet", "no sound at all: quiet work, pauses, a settled room.")
                    } else {
                        readingLine("Silence / other", "everything that was neither clearly you nor clearly a student: quiet, and voices too faint to place.")
                    }
                    readingLine("Pace", "your words a minute, short pauses included. Everyday conversation usually runs about \(AudioInsights.conversationalWpmRange).")
                    readingLine("Questions", "the questions you asked, as the transcript caught them.")
                    readingLine("TAWT (Teacher-Anchored Wait Time)", "after a question that asked students to explain or reason, how long until you spoke again, averaged. Three seconds or more gives most students time to think.")
                    readingLine("Checks", "the times you checked for understanding, as the transcript caught them. It counts the checks, not whether students understood.")
                }
                .padding(.top, 6)
            } label: {
                Text("How to read these numbers").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
            }
            .tint(AppTheme.forest)
        }
    }

    private func readingLine(_ term: String, _ text: String) -> some View {
        (Text("\(term) \u{00B7} ").font(.subheadline.weight(.semibold)).foregroundColor(AppTheme.textPrimary)
            + Text(text).font(.subheadline).foregroundColor(AppTheme.textSecondary))
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: How the lesson moved

    private static let arcRoleLabel = ["opened": "Opened with", "built": "Built", "applied": "Applied to", "practiced": "Practiced", "closed": "Closed with"]

    private static func clock(_ sec: Double) -> String {
        let s = Int(sec.rounded(.down))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    /// Mirrors the web Summary's "How the lesson moved": each stage the arc
    /// read found, what it did, its title and when. Only where it found them.
    @ViewBuilder private var lessonMovedCard: some View {
        let arc = session.teachingMoves?.arc ?? []
        if !arc.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("How the lesson moved").font(.heading(.title3)).foregroundStyle(AppTheme.forest)
                VStack(spacing: 6) {
                    ForEach(Array(arc.enumerated()), id: \.offset) { i, stage in
                        VStack(alignment: .leading, spacing: 3) {
                            Text((Self.arcRoleLabel[stage.role] ?? stage.role.capitalized).uppercased())
                                .font(.caption.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                            Text(stage.title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(Self.clock(stage.startSec))\u{2013}\(i == arc.count - 1 ? "end" : Self.clock(stage.endSec))")
                                .font(.caption.monospacedDigit()).foregroundStyle(AppTheme.textSecondary)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22))
        }
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
                SchoolFocusIdeaRow(session: session, onUpdate: onUpdate)
                    .padding(.top, 10)
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


/// One idea for next time connected to a school focus the teacher chose —
/// mirrors `SchoolFocusDebriefIdea` in web AudioCoaching.tsx. Asked for, never
/// generated with the report, and only for focuses the teacher turned on.
private struct SchoolFocusIdeaRow: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void

    /// Fetched once per app run: a school's focuses rarely change mid-session.
    @MainActor private static var cached: [SchoolFocusChoice]?

    @State private var focuses: [SchoolFocusChoice] = []
    @State private var busy: String?
    @State private var error: String?
    @State private var hidden = false

    private var idea: AudioSchoolFocusIdea? {
        guard let idea = session.session.schoolFocusIdea, idea.dismissed != true else { return nil }
        return idea
    }

    var body: some View {
        Group {
            if hidden {
                EmptyView()
            } else if let idea, let text = idea.text, let quote = idea.quote {
                ideaBox(idea, text: text, quote: quote)
            } else if let idea {
                (Text("\(idea.name): ").fontWeight(.semibold).foregroundColor(AppTheme.forest)
                    + Text(idea.none ?? "this recording didn't give a clear moment to build on."))
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.gold, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            } else if !focuses.isEmpty {
                askBox
            }
        }
        .task { await loadFocuses() }
    }

    private func ideaBox(_ idea: AudioSchoolFocusIdea, text: String, quote: AudioSchoolFocusIdea.Quote) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("One option for next time").font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
            Text("Connected to your selected school focus · \(idea.name)")
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(AppTheme.goldTint, in: Capsule())
                .fixedSize(horizontal: false, vertical: true)
            (Text("At \(Self.clock(quote.atSec)) you said: ").foregroundColor(AppTheme.textSecondary)
                + Text("\u{201C}\(quote.text)\u{201D}").italic().foregroundColor(AppTheme.textPrimary))
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Not for this lesson") { notForThisLesson() }
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.gold, lineWidth: 1.5))
    }

    private var askBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(focuses) { f in
                VStack(alignment: .leading, spacing: 6) {
                    (Text(f.name).fontWeight(.semibold).foregroundColor(AppTheme.forest)
                        + Text(" · your selected school focus").foregroundColor(AppTheme.textPrimary))
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        ask(f.id)
                    } label: {
                        Text(busy == f.id ? "Looking…" : "Find an idea in this lesson")
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(Color.white, in: Capsule())
                            .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy != nil)
                    .opacity(busy != nil && busy != f.id ? 0.6 : 1)
                }
            }
            Text("Looks only at what you said, and may find nothing — that's a fine answer.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let error {
                Text(error).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.gold, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }

    private func loadFocuses() async {
        if let cached = Self.cached {
            focuses = cached.filter { $0.state == "on" }
            return
        }
        // No school, or the list can't be read: nothing to ask about, so nothing shows.
        guard let all = try? await AudioCoachingService.fetchSchoolFocuses() else { return }
        Self.cached = all
        focuses = all.filter { $0.state == "on" }
    }

    private func ask(_ priorityId: String) {
        busy = priorityId
        error = nil
        Task {
            do {
                onUpdate(try await AudioCoachingService.requestSchoolFocusIdea(sessionId: session.id, priorityId: priorityId))
            } catch let APIError.server(_, message) {
                error = message
            } catch {
                self.error = "Could not look for an idea. Please try again."
            }
            busy = nil
        }
    }

    private func notForThisLesson() {
        hidden = true
        Task {
            do { try await AudioCoachingService.dismissSchoolFocusIdea(sessionId: session.id) } catch { hidden = false }
        }
    }

    private static func clock(_ sec: Double) -> String {
        let s = max(0, Int(sec))
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
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
