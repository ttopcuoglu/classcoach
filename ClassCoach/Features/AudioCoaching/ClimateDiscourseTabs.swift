import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `ClimateRoutinesTab`.
struct ClimateRoutinesTab: View {
    let session: AudioSessionWithSegments

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            routinesSection
        }
    }

    /// The note, then what to try. No numbers card on purpose — a count of
    /// directions says nothing about whether they landed — and no stock tip:
    /// the next step is this lesson's own, or absent.
    private var routinesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let narrative = session.climateNarrative, !narrative.isEmpty {
                CoachNoteView(text: narrative)
            } else {
                Text("This section fills in once the report has been summarised.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }
            escalationCard
            SectionNextStep(text: session.nextSteps?.climate)
        }
    }

    /// Whether a bid for the room's attention HELD. Mirrors
    /// `AudioCoaching.tsx`'s `EscalationCard`, including what it refuses to
    /// say: no count of asks appears anywhere. Across five readings of one
    /// lesson that number came back 11, 12, 13, 13 and 13 while the run
    /// itself and the rung it reached never moved, so the run is shown and
    /// the number stays out of sight.
    ///
    /// Not on screen: nothing builds `ClimateRoutinesTab` any more, and the web
    /// retired `EscalationCard`. What the report shows now is "Keeping learning
    /// on track" in InsightsSections.swift (`OnTrackFindings`).
    @ViewBuilder
    private var escalationCard: some View {
        // Nil on every report analyzed before this existed. Showing nothing
        // is right: that is "not looked at", not "nothing happened".
        if let e = session.escalation {
            switch e.state {
            case "not_measurable":
                VStack(alignment: .leading, spacing: 6) {
                    Text("DID YOUR ASKS HOLD?")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(AppTheme.textSecondary)
                    Text(e.reason ?? "Too little of this recording came through as speech to tell whether attention held.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))

            case "confirmed_none":
                Text("No run of repeated asks in this lesson \u{2014} when you asked for attention, the recording shows you moving on rather than asking again.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)

            case "found":
                foundEscalation(e)

            default:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private func foundEscalation(_ e: AudioEscalation) -> some View {
        let cluster = e.clusters?.first
        let repeated = e.repeatedAsks?.first
        VStack(alignment: .leading, spacing: 8) {
            Text("DID YOUR ASKS HOLD?")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(AppTheme.terracotta600)

            if let c = cluster, let start = c.startSec {
                let climb = (c.climbed ?? false)
                    ? AudioEscalation.rungPhrase(c.fromRung).flatMap { from in
                        AudioEscalation.rungPhrase(c.topRung).map { ", rising from \(from) to \($0)." }
                    } ?? "."
                    : "."
                Text("Around \(formatTimerDisplay(start)) you asked for the room several times in quick succession\(climb)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.textPrimary)

                if let quote = c.quote {
                    Text("\u{201C}\(quote)\u{201D}")
                        .font(.subheadline.italic())
                        .foregroundStyle(AppTheme.textPrimary)
                } else {
                    // The wording was too rough to attribute. The moment is
                    // real; putting a garbled sentence in a teacher's mouth
                    // inside this section is not worth being right most of
                    // the time.
                    Text("The transcript\u{2019}s wording here was too rough to quote back to you, so only the moment is shown.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }

                Text("Asking again that soon means the first ask didn\u{2019}t land. When that becomes the pattern, each one is worth less than the last, and escalating is the only way left to be heard.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
            }

            if let r = repeated, let at = r.timestampSec {
                if let quote = r.quote {
                    Text("At \(formatTimerDisplay(at)) you said you\u{2019}d already asked \u{2014} \u{201C}\(quote)\u{201D}")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                } else {
                    Text("At \(formatTimerDisplay(at)) your own words noted you\u{2019}d already asked once.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                }
            }

            Text(capturedNote(e))
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(AppTheme.goldTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
    }

    private func capturedNote(_ e: AudioEscalation) -> String {
        let base = "Read from your speech alone. Whether the room actually settled isn\u{2019}t something a room microphone can hear"
        guard let pct = e.capturedSharePct else { return base + "." }
        return base + ", and about \(pct)% of this recording came through as speech."
    }
}

extension DiscourseDetailsTab {
    /// Why "24 of 24 turns were about the lesson" is not the good news it
    /// reads as. Mirrors `STUDENT_FOCUS_SELECTION_CAVEAT` in
    /// `web/src/lib/reportConfidence.ts`.
    ///
    /// The turns that survive transcription are the ones spoken loudly and
    /// towards the teacher — answers to questions, on-topic by construction.
    /// Quiet side conversations never become text, so they cannot be counted
    /// as off-task. Across real lessons the WORST-captured one returned 24 of
    /// 24 on-topic with zero unclear, while lessons captured at 44% and 48%
    /// returned 23 and 17 unclear turns.
    static let focusSelectionCaveat = "Turns spoken loudly and towards you are the ones that reach a room microphone; quiet side conversations are the least likely to be picked up. This describes the turns that carried, not the whole room."
}

enum DiscoursePart {
    case talk, questions
}

/// Talk & Participation and Questioning & Checking, which share the same
/// session metrics. Both follow the section shape in `DetailRow`'s comment.
struct DiscourseDetailsTab: View {
    let session: AudioSessionWithSegments
    let part: DiscoursePart

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
                Text("Of the \(focus.classified) student turn\(focus.classified == 1 ? "" : "s") the microphone caught clearly\(focus.sampled ? ", sampled across the lesson" : ""):")
                Text(Self.focusSelectionCaveat)
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
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
            .frame(maxWidth: .infinity, alignment: .leading)
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
            case .talk: talkSection
            case .questions: questioningSection
            }
        }
    }

    private var silencePct: Double? {
        guard let t = session.teacherTalkPct, let s = session.studentTalkPct else { return nil }
        return max(0, ((100 - t - s) * 10).rounded() / 10)
    }

    private var talkSection: some View {
        let wpm = session.metricsDetail?["teacherWordsPerMinute"]
        let focus = session.studentTalkFocus.flatMap { $0.classified > 0 ? $0 : nil }
        return VStack(alignment: .leading, spacing: 14) {
            // The reading before the numbers it was drawn from, and the
            // written one when the report has it — the rule-assembled fallback
            // can only restate the percentages.
            CoachNoteView(text: session.talkNarrative ?? AudioInsights.buildTalkInsight(session))

            // One picture of the split. It used to be four tiles.
            VStack(alignment: .leading, spacing: 10) {
                TalkSplitBar(teacherPct: session.teacherTalkPct, studentPct: session.studentTalkPct, silencePct: silencePct)
                if let wpm {
                    Text("Your pace \(Int(wpm)) wpm").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AppTheme.hairline))

            if let focus {
                // "Of 24 student turns heard, 24 were about the lesson" reads
                // as a verdict on the class and is the opposite: the turns a
                // room mic catches are the ones aimed at the teacher, which
                // are on-topic by construction. On the real lesson that
                // produced 24 of 24, the mic heard 15% of the room and the
                // teacher remembers redirecting it ten times.
                Text("Of the \(focus.classified) student turn\(focus.classified == 1 ? "" : "s") the microphone caught clearly\(focus.sampled ? ", sampled across the lesson," : ",") \(focus.onTopic) \(focus.onTopic == 1 ? "was" : "were") about the lesson.")
                Text(Self.focusSelectionCaveat)
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            SectionNextStep(text: session.nextSteps?.talk)

            VStack(alignment: .leading, spacing: 0) {
                DetailRow(title: "Talk flow across the lesson") {
                    PacingTimelineView(segments: session.segments, durationSec: session.durationSec, soundTimeline: session.soundTimeline)
                }
                if focus != nil {
                    DetailRow(title: "What students talked about, with examples") { studentTalkFocusCard }
                }
                // Only when it is long enough to be worth a look: every lesson
                // has a longest stretch, and a 40-second one is not a finding.
                if let stretch = TeacherStretch.longest(in: session.segments), stretch.durationSec >= TeacherStretch.minToShowSec {
                    DetailRow(title: "Your longest stretch of talk · about \(Int((stretch.durationSec / 60).rounded())) min, from \(ReportConfidence.formatDuration(stretch.startSec))") {
                        Text("From \(ReportConfidence.formatDuration(stretch.startSec)) to \(ReportConfidence.formatDuration(stretch.endSec)), opening with:")
                            .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        Text("\u{201C}\(stretch.opening)…\u{201D}")
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        readingNote("A stretch ends when a student is heard or you pause for more than ten seconds. A student the microphone missed does not end it, so check it against what you remember of that part of the lesson.")
                    }
                }
                DetailRow(title: "How to read these numbers") {
                    readingNote("Talk time describes the recording, not the room: it doesn't show how many students took part or whether they were engaged, and a microphone near you hears you far better than it hears them.")
                    readingNote("\u{201C}Silence / other\u{201D} is everything that was neither clearly you nor clearly a student — quiet work, several voices at once, and audio too faint to place.")
                    // Only when there is silence for it to explain.
                    if (silencePct ?? 0) > 0,
                       let note = AudioInsights.leadingSilenceNote(firstWordSec: session.metricsDetail?["firstWordSec"]) {
                        readingNote(note)
                    }
                    if wpm != nil {
                        readingNote("Pace is words a minute of your own speaking time. Everyday conversation runs about \(Int(AudioInsights.conversationalWpm)) — an anchor to place yourself against, not a target.")
                    }
                }
                Divider()
            }
        }
    }

    private var questioningSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            CoachNoteView(text: session.questionsNarrative
                ?? AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio))

            // The mix below is this section's one finding and states the
            // count itself. A count, never a share.
            QuestioningMixView(session: session)

            SectionNextStep(text: session.nextSteps?.questions)

            VStack(alignment: .leading, spacing: 0) {
                DetailRow(title: "The numbers") {
                    StatGridView {
                        StatView(label: "Questions you asked", metric: ReportConfidence.getCountMetric(count: session.questionCount, recordedSec: recordedSec))
                        StatView(label: "Higher-order questions", metric: higherOrderCountMetric)
                        // A lesson can be built on reasoning without a single
                        // higher-order question in it — a task can ask for
                        // more thinking than anything said out loud did.
                        StatView(label: "Thinking tasks", metric: thinkingTaskMetric)
                        StatView(label: "Your follow-up questions", metric: m.followUpMetric)
                        StatView(label: "Your avg. wait time", metric: waitTimeMetric)
                        // The other half of wait time: the pause after a
                        // student's answer, where a follow-up has to fit.
                        StatView(label: "Your pause after an answer", metric: waitTime2Metric)
                    }
                }
                if let log = session.questionLog, !log.isEmpty {
                    DetailRow(title: "Your questions, in order (\(log.count))") { questionLogList(log) }
                }
                // The section's second note. It sat on the page under the
                // first, the one section with two paragraphs to read before
                // anything else.
                if let narrative = session.checksNarrative, !narrative.isEmpty {
                    DetailRow(title: "How you checked and responded") {
                        Text(narrative).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                DetailRow(title: "How to read these numbers") {
                    readingNote("Questions and checks are read from your side of the transcript. Spoken checks only — hand signals and written work are invisible to a recording.")
                    readingNote("Wait time, follow-ups and feedback all need a student to be heard, so they are limited by how much of the room the microphone reached. Where too little came through, the number says so rather than showing zero.")
                }
                Divider()
            }
        }
    }

    private var waitTime2Metric: ReportConfidence.ConfidentMetric {
        guard let sec = session.metricsDetail?["waitTime2Sec"] else {
            return ReportConfidence.ConfidentMetric(
                state: .notAnalyzed, display: "—",
                reason: "This session was analyzed before the pause after an answer was measured.")
        }
        let samples = Int(session.metricsDetail?["waitTime2SampleCount"] ?? 0)
        let display = String(format: "%.1fs", sec)
        if Double(samples) < AudioInsights.minWaitTimeSamples {
            return ReportConfidence.ConfidentMetric(
                state: .limitedEvidence, display: display,
                reason: "Averaged over only \(samples) exchange\(samples == 1 ? "" : "s"), which is too few to read as a habit.")
        }
        return ReportConfidence.ConfidentMetric(
            state: .measured, display: display,
            reason: "How long you left after a student finished before speaking. The pause above is the one after your question; this is the one after their answer, and it is where a follow-up has to fit.")
    }

    private var higherOrderCountMetric: ReportConfidence.ConfidentMetric {
        guard let count = session.metricsDetail?["higherOrderQuestionCount"] else {
            return ReportConfidence.ConfidentMetric(state: .notAnalyzed, display: "—", reason: "This session was analyzed before questions were classified.")
        }
        let total = session.questionCount ?? 0
        return ReportConfidence.ConfidentMetric(
            state: count > 0 ? .measured : .confirmedNone,
            display: total > 0 ? "\(Int(count)) of \(total)" : "\(Int(count))")
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

    private func questionLogList(_ log: [AudioQuestionLogEntry]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
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
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(Array(entry.followUps.enumerated()), id: \.offset) { _, followUp in
                        Text("\"\(followUp.text)\" · \(ReportConfidence.formatDuration(followUp.timestampSec))")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                            .padding(.leading, 10)
                            .overlay(Rectangle().frame(width: 1).foregroundStyle(AppTheme.textSecondary.opacity(0.3)), alignment: .leading)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

/// The longest stretch of unbroken teacher talk. Mirrors
/// server/src/lib/teacherStretch.ts, which has the reasoning: a stretch ends
/// when a student is heard OR the teacher pauses for longer than a breath, so
/// a video, a hand-out or a quiet room is not counted as talking. Computed
/// from the transcript the report already holds, so reports analysed before
/// the measure was corrected show the corrected one too.
struct TeacherStretch {
    let startSec: Double
    let endSec: Double
    let opening: String
    var durationSec: Double { endSec - startSec }

    static let pauseBreakSec = 10.0
    /// Shorter than this is not a "long stretch" of anything, and is not shown.
    static let minToShowSec = 120.0

    static func longest(in segments: [TranscriptSegment]) -> TeacherStretch? {
        var best: TeacherStretch?
        var run: (start: Double, end: Double, opening: String)?
        func close() {
            guard let r = run else { return }
            if best == nil || r.end - r.start > best!.durationSec {
                best = TeacherStretch(startSec: r.start, endSec: r.end, opening: r.opening)
            }
            run = nil
        }
        for segment in segments.sorted(by: { $0.startSec < $1.startSec }) {
            let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if segment.speakerLabel != "Teacher" {
                if !text.isEmpty { close() }
                continue
            }
            if text.isEmpty { continue }
            if let r = run, segment.startSec - r.end > pauseBreakSec { close() }
            if let r = run {
                run = (r.start, max(r.end, segment.endSec), r.opening.count < 120 ? "\(r.opening) \(text)" : r.opening)
            } else {
                run = (segment.startSec, segment.endSec, text)
            }
        }
        close()
        return best
    }
}

/// The talk split as one bar and its three numbers.
private struct TalkSplitBar: View {
    let teacherPct: Double?
    let studentPct: Double?
    let silencePct: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let teacherPct {
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Rectangle().fill(AppTheme.terracotta).frame(width: geo.size.width * CGFloat(teacherPct / 100))
                        Rectangle().fill(AppTheme.gold).frame(width: geo.size.width * CGFloat((studentPct ?? 0) / 100))
                        Rectangle().fill(AppTheme.hairline)
                    }
                }
                .frame(height: 14)
                .clipShape(Capsule())
                legend("You", teacherPct, AppTheme.terracotta)
                legend("Students", studentPct, AppTheme.gold)
                legend("Silence or other", silencePct, AppTheme.hairline)
            } else {
                Text("Talk balance unavailable this session.").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func legend(_ label: String, _ pct: Double?, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text("\(label) \(pct.map { "\(Int($0.rounded()))%" } ?? "unavailable")")
                .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
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
    /// Present only for recordings that carried a loudness envelope. Without
    /// it an empty block stays one combined "No dominant speaker", since
    /// nothing in the recording can tell a quiet room from lost audio.
    let soundTimeline: SoundTimeline?

    private enum Bin { case teacher, student, sound, quiet, unavailable }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let durationSec, durationSec > 0, !segments.isEmpty {
                let bins = 24
                let binDuration = durationSec / Double(bins)
                HStack(spacing: 1) {
                    ForEach(0..<bins, id: \.self) { i in
                        let binStart = Double(i) * binDuration
                        binView(bin(binStart: binStart, binEnd: binStart + binDuration))
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
                    legend("Teacher", AnyView(Circle().fill(AppTheme.terracotta)))
                    legend("Student", AnyView(Circle().fill(AppTheme.gold)))
                    if soundTimeline != nil {
                        legend("Sound, no words", AnyView(Circle().fill(AppTheme.textSecondary.opacity(0.15)).overlay(Hatch().clipShape(Circle()))))
                        legend("Quiet", AnyView(Circle().fill(AppTheme.textSecondary.opacity(0.15))))
                    } else {
                        legend("No dominant speaker", AnyView(Circle().fill(AppTheme.textSecondary.opacity(0.15))))
                    }
                }
                .font(.caption2)
                if let soundTimeline {
                    Text(Self.sentence(soundTimeline))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.textPrimary)
                        .padding(.top, 4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Text("Pacing timeline unavailable this session.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 20)
                    .background(AppTheme.textSecondary.opacity(0.1))
            }
        }
    }

    private func legend(_ label: String, _ swatch: AnyView) -> some View {
        HStack(spacing: 4) {
            swatch.frame(width: 8, height: 8)
            Text(label).foregroundStyle(AppTheme.textSecondary)
        }
    }

    @ViewBuilder
    private func binView(_ bin: Bin) -> some View {
        switch bin {
        case .teacher: Rectangle().fill(AppTheme.terracotta)
        case .student: Rectangle().fill(AppTheme.gold)
        // Hatched, like the web report: sound the transcript has no words for.
        case .sound: Rectangle().fill(AppTheme.textSecondary.opacity(0.15)).overlay(Hatch().clipped())
        case .quiet, .unavailable: Rectangle().fill(AppTheme.textSecondary.opacity(0.15))
        }
    }

    private func bin(binStart: Double, binEnd: Double) -> Bin {
        let overlapping = segments.filter { $0.startSec < binEnd && $0.endSec > binStart }
        guard !overlapping.isEmpty else { return emptyBin(binStart: binStart, binEnd: binEnd) }
        let teacherDuration = overlapping.filter { $0.speakerLabel == "Teacher" }
            .reduce(0.0) { $0 + (min($1.endSec, binEnd) - max($1.startSec, binStart)) }
        let studentDuration = overlapping.filter { $0.speakerLabel != "Teacher" }
            .reduce(0.0) { $0 + (min($1.endSec, binEnd) - max($1.startSec, binStart)) }
        return teacherDuration >= studentDuration ? .teacher : .student
    }

    /// Whichever of quiet and sound-with-no-words filled more of the block.
    private func emptyBin(binStart: Double, binEnd: Double) -> Bin {
        guard let chars = soundTimeline.map({ Array($0.seconds) }) else { return .unavailable }
        var sound = 0
        var quiet = 0
        var sec = Int(binStart.rounded(.down))
        while sec < Int(binEnd.rounded(.up)) && sec < chars.count {
            if chars[sec] == "s" { sound += 1 } else if chars[sec] == "q" { quiet += 1 }
            sec += 1
        }
        if sound == 0 && quiet == 0 { return .unavailable }
        return sound >= quiet ? .sound : .quiet
    }

    private static func minutes(_ sec: Double) -> String {
        if sec < 60 { return "under a minute" }
        let m = Int((sec / 60).rounded())
        return "\(m) minute\(m == 1 ? "" : "s")"
    }

    /// Same sentence as the web report: what came through and where, never why.
    static func sentence(_ t: SoundTimeline) -> String {
        func cap(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }
        var parts = ["Words came through for \(minutes(t.wordsSec)) of \(minutes(Double(t.seconds.count)))."]
        if t.soundSec >= 30 {
            let whereText = t.soundRuns
                .map { "\(ReportConfidence.formatDuration($0.startSec))–\(ReportConfidence.formatDuration($0.endSec))" }
                .joined(separator: ", ")
            parts.append("\(cap(minutes(t.soundSec))) had sound but no words\(whereText.isEmpty ? "" : " (\(whereText))").")
        }
        if t.quietSec >= 30 {
            parts.append("\(cap(minutes(t.quietSec))) \(t.quietSec < 90 ? "was" : "were") quiet.")
        }
        return parts.joined(separator: " ")
    }
}

/// Diagonal stripes for "sound, no words" — the hatch the web report uses
/// for the same thing.
private struct Hatch: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += 4
            }
            context.stroke(path, with: .color(AppTheme.textSecondary.opacity(0.5)), lineWidth: 1)
        }
    }
}
