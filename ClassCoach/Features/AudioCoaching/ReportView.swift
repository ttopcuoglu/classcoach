import SwiftUI

enum ReportTab: String, CaseIterable {
    /// `rubric` is a whole-report view, like every tab here except `insights`
    /// — which is why it sits at this level. It spent a while as a card at the
    /// foot of the Insights column, where a report-scoped thing repeated under
    /// all four sections and belonged to none of them, and a teacher who came
    /// looking for it had to scroll a section to the end to find it.
    case summary, insights, specialist, rubric, reflect, myGrowth

    var label: String {
        switch self {
        case .summary: return "Summary"
        case .insights: return "Insights"
        case .specialist: return "Content Specialist"
        case .rubric: return "Rubric lens"
        case .reflect: return "Reflect"
        case .myGrowth: return "My Growth"
        }
    }
}

/// The report's four Insights sections, numbered and coloured the same way
/// as the web report and the printable PDF, so "section 3" means the same
/// thing on the phone, the website and paper.
///
/// Organised by how much a microphone can actually hear. Everything the
/// teacher says is captured well; everything that depends on students
/// answering out loud is not. Questions & Thinking and Checks & Feedback were
/// two sections that failed together whenever the room was quiet, so a teacher
/// read two apologies for one cause — they are one section with two labelled
/// halves now, and Rubric Lens is a whole-report view with its own tab rather
/// than a section competing with them.
enum InsightsSection: String, CaseIterable, Identifiable {
    case talk, questions, content, routines

    var id: String { rawValue }
    var number: Int { (InsightsSection.allCases.firstIndex(of: self) ?? 0) + 1 }

    var title: String {
        switch self {
        case .talk: return "Talk & Participation"
        case .questions: return "Questioning & Checking"
        case .content: return "Clarity & Content"
        case .routines: return "Climate & Routines"
        }
    }

    var blurb: String {
        switch self {
        case .talk: return "Who was heard, and for how long."
        case .questions: return "What you asked, how you checked, and how you responded."
        case .content: return "What the lesson said it was about, in its own words."
        case .routines: return "Directions, praise and redirections, as they sounded."
        }
    }

    var accent: ReportAccent {
        switch self {
        case .talk: return .terracotta
        case .questions: return .gold
        case .content: return .forest
        case .routines: return .terracotta
        }
    }
}

/// A "Discuss this with Wivoza Coach" press, on its way to Reflect.
///
/// `label` names the page for the conversation's own turn, and `focus` is what
/// Coach should open about. `detail` is the text the teacher has just finished
/// reading: without it Coach only ever received the section's name and opened
/// about the lesson in the abstract.
struct ReflectFocus: Equatable {
    let label: String
    let focus: String
    let detail: String?

    static func forSummary(_ session: AudioSessionWithSegments) -> ReflectFocus {
        ReflectFocus(
            label: "The summary of this lesson",
            focus: "what the report says about the summary of this lesson",
            detail: session.classSummary
        )
    }

    static func forSpecialist(_ session: AudioSessionWithSegments) -> ReflectFocus {
        let notes = session.contentNotes?.notes ?? []
        return ReflectFocus(
            label: "Content Specialist in this lesson",
            focus: "what the report says about Content Specialist in this lesson",
            detail: notes.isEmpty ? nil : notes.map { "\($0.label): \($0.text)" }.joined(separator: " ")
        )
    }

    static func forSection(_ section: InsightsSection, in session: AudioSessionWithSegments) -> ReflectFocus {
        let label = "\(section.title) in this lesson"
        return ReflectFocus(
            label: label,
            focus: "what the report says about \(label)",
            detail: narrativeForSection(session, section)
        )
    }
}

/// The narrative a teacher is looking at on an Insights sub-page, handed to
/// Coach so "Discuss this" opens about that page rather than about the lesson
/// in general. Clarity & Content carries notes rather than a narrative, so its
/// own text is joined instead; Questioning & Checking shows two narratives on
/// one page, so Coach gets both.
func narrativeForSection(_ session: AudioSessionWithSegments, _ section: InsightsSection) -> String? {
    switch section {
    case .talk: return session.talkNarrative
    case .questions:
        let halves = [session.questionsNarrative, session.checksNarrative].compactMap { $0 }.filter { !$0.isEmpty }
        return halves.isEmpty ? nil : halves.joined(separator: " ")
    case .routines: return session.climateNarrative
    case .content:
        let notes = session.contentNotes?.notes ?? []
        return notes.isEmpty ? nil : notes.map { "\($0.label): \($0.text)" }.joined(separator: " ")
    }
}

/// One invitation to talk, at the foot of the page. Repeating it under every
/// card did not make it more inviting.
struct DiscussFooter: View {
    var label = "Discuss this with Wivoza Coach"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label)
                Spacer()
                Image(systemName: "arrow.right")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.forest)
            .padding(.horizontal, 18).padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
        }
    }
}

/// One of the report's accent colours: a solid badge colour, the tint its
/// number cards sit on, and the text colour used on that tint.
struct ReportAccent: Equatable {
    let band: Color
    let onBand: Color
    let tint: Color
    let ink: Color

    static let terracotta = ReportAccent(band: AppTheme.terracotta, onBand: .white, tint: AppTheme.peachTint, ink: AppTheme.terracotta600)
    static let gold = ReportAccent(band: AppTheme.gold, onBand: AppTheme.forest, tint: AppTheme.goldTint, ink: AppTheme.terracotta600)
    static let teal = ReportAccent(band: AppTheme.teal, onBand: .white, tint: AppTheme.mintTint, ink: AppTheme.forest)
    static let forest = ReportAccent(band: AppTheme.forest, onBand: AppTheme.gold, tint: AppTheme.mintTint, ink: AppTheme.forest)
}

private struct ReportAccentKey: EnvironmentKey {
    static let defaultValue = ReportAccent.teal
}

extension EnvironmentValues {
    /// The colour of the Insights section a view sits in — read by the shared
    /// stat tiles so each section's numbers take on its own colour.
    var reportAccent: ReportAccent {
        get { self[ReportAccentKey.self] }
        set { self[ReportAccentKey.self] = newValue }
    }
}

/// Mirrors `AudioCoaching.tsx`'s `ReportPanel`: a dark green cover, then
/// Summary / Insights / Reflect / My Growth. Metrics are computed once and
/// threaded down to each tab, matching the single-fetch pattern on web.
struct ReportView: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onExit: () -> Void

    @State private var tab: ReportTab = .summary
    @State private var section: InsightsSection = .talk
    @State private var rubricOpen = false
    @State private var hardLookOpen = false
    @State private var focusMetric: FocusMetric?
    /// Set by a Discuss footer and consumed by Reflect on arrival.
    @State private var reflectFocus: ReflectFocus?
    @State private var summarizing = false
    /// One attempt per visit, so a server hiccup doesn't retry in a loop every
    /// time the teacher comes back to this tab.
    @State private var attemptedSummary = false
    @State private var readingMoment = false
    @State private var attemptedMoment = false
    @State private var attemptedContentNotes = false
    @State private var attemptedNextSteps = false
    @State private var retagging = false

    private var locked: Bool { session.status == "locked" }
    private var m: OverviewMetrics { OverviewMetrics(session) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Button("← Back to sessions", action: onExit)
                    .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                // Tagging the wrong voice swapped teacher and student talk
                // through the whole report, and there was no way back from it
                // short of deleting the lesson. Only an analyzed report has
                // voices to re-tag; a locked one is final.
                if session.status == "analyzed" {
                    Button("Fix who's who") { retagging = true }
                        .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                }
            }

            cover

            tabBar

            Group {
                switch tab {
                case .summary:
                    OverviewTab(
                        session: session,
                        summarizing: summarizing,
                        readingMoment: readingMoment,
                        onUpdate: onUpdate,
                        onNavigateInsights: { target in section = target; tab = .insights }
                    )
                    // The whole-lesson Hard Look, asked for here once. It used
                    // to open the Insights tab, above whichever section a
                    // teacher had just chosen; each section keeps its own part.
                    if !(locked && session.hardLook == nil) {
                        hardLookRow
                    }
                    Text("\u{1F512} Audio was used for transcription only and is not stored.")
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    // Reading the summary and wanting to talk about it is the
                    // same impulse, so the way to do that ends the page.
                    DiscussFooter(label: "Discuss with Wivoza Coach") { discuss(.forSummary(session)) }
                case .insights:
                    insights
                case .specialist:
                    ContentSpecialistTab(session: session, onUpdate: onUpdate) { discuss(.forSpecialist(session)) }
                case .rubric:
                    // Nothing collapsed here — a teacher who opened this tab
                    // has already said what they want.
                    RubricLensTab(session: session, locked: locked, onUpdate: onUpdate)
                case .reflect:
                    ReflectTab(session: session, locked: locked, focus: $reflectFocus, onUpdate: onUpdate)
                case .myGrowth:
                    MyGrowthTab(currentSessionId: session.id, focusMetric: $focusMetric)
                }
            }

            disclaimer
        }
        .task(id: tab) {
            // The quick one first, so the card is there while the prose is
            // still being written.
            await fillMissingMoment()
            await fillMissingSummary()
            await fillMissingContentNotes()
            await fillMissingNextSteps()
        }
        .sheet(isPresented: $retagging) {
            RetagSpeakersView(session: session) { updated in
                retagging = false
                onUpdate(updated)
            }
        }
    }

    /// Asks for the written summary when a report doesn't carry one. Reports
    /// made now have it already — it is written with the rest of the report —
    /// so this is for the older ones, which otherwise fell back to a line
    /// assembled from the raw numbers and read nothing like the same lesson
    /// on the website.
    private func fillMissingSummary() async {
        guard tab == .summary, !locked, session.classSummary == nil, !attemptedSummary else { return }
        attemptedSummary = true
        summarizing = true
        defer { summarizing = false }
        if let updated = try? await AudioCoachingService.generateClassSummary(sessionId: session.id) {
            onUpdate(updated)
        }
    }

    /// The same for the moment to revisit: an older report is read for one
    /// the first time its Summary is opened.
    private func fillMissingMoment() async {
        guard tab == .summary, !locked, session.momentToRevisit == nil, !attemptedMoment else { return }
        attemptedMoment = true
        readingMoment = true
        defer { readingMoment = false }
        if let updated = try? await AudioCoachingService.generateMomentToRevisit(sessionId: session.id) {
            onUpdate(updated)
        }
    }

    /// Content Specialist Notes used to wait for a button. They feed "Try next
    /// time" on Summary, so a report without them is asked for them once —
    /// quietly: if it fails, the button in Clarity & Content is still there
    /// and says why when pressed.
    private func fillMissingContentNotes() async {
        guard !locked, session.contentNotes == nil, !attemptedContentNotes else { return }
        attemptedContentNotes = true
        if let updated = try? await AudioCoachingService.generateContentNotes(sessionId: session.id) {
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        }
    }

    /// "Try next time" lines for a report summarised before they existed,
    /// written from the notes it already has. Waits for the summary, which
    /// brings its own on new reports.
    private func fillMissingNextSteps() async {
        guard !locked, session.nextSteps == nil, session.classSummary != nil, !attemptedNextSteps else { return }
        attemptedNextSteps = true
        if let updated = try? await AudioCoachingService.generateNextSteps(sessionId: session.id) {
            onUpdate(updated)
        }
    }

    /// Both footers land here: hand Reflect the page the teacher was reading,
    /// then show it to them.
    private func discuss(_ focus: ReflectFocus) {
        reflectFocus = focus
        tab = .reflect
    }

    // MARK: Cover

    private var cover: some View {
        let evidence = ReportConfidence.buildEvidenceQualityLine(
            coverage: m.coverage,
            metrics: [m.cfuMetric, m.redirectionMetric, m.directiveMetric, m.nameMentionMetric, m.followUpMetric,
                      m.higherOrderRatio, m.feedbackRatio, ReportConfidence.getPresenceMetric(session.teacherTalkPct),
                      ReportConfidence.getPresenceMetric(session.avgWaitTimeSec)].compactMap { $0 }
        )
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("WIVOZA · LESSON DEBRIEF")
                    .font(.caption2.weight(.bold)).tracking(1.4)
                    .foregroundStyle(AppTheme.gold)
                Spacer()
                if locked {
                    Label("Locked", systemImage: "lock.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(AppTheme.gold, in: Capsule())
                }
            }
            (Text(session.displayTitle)
                + Text(session.period.map { " · \($0)" } ?? "").foregroundColor(AppTheme.gold))
                .font(.heading(.title2))
                .foregroundStyle(.white)
            Text([session.teacherName, formattedDate(session.sessionDate), session.gradeLevel,
                  session.durationSec.map { ReportConfidence.formatDuration($0) }]
                .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.white.opacity(0.7))
            Text(evidence.text)
                .font(.caption2.weight(evidence.warn ? .semibold : .regular))
                .foregroundStyle(evidence.warn ? AppTheme.gold : .white.opacity(0.55))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
    }

    // MARK: Tabs

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ReportTab.allCases, id: \.self) { t in
                    Button {
                        tab = t
                    } label: {
                        Text(t.label)
                            .font(.subheadline.weight(tab == t ? .semibold : .medium))
                            .foregroundStyle(tab == t ? AppTheme.cream : AppTheme.textSecondary)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(tab == t ? AppTheme.forest : Color.clear, in: Capsule())
                    }
                }
            }
        }
    }

    // MARK: Insights

    private var insights: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(InsightsSection.allCases) { s in
                        Button {
                            section = s
                        } label: {
                            HStack(spacing: 6) {
                                Text("\(s.number)")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(s.accent.onBand)
                                    .frame(width: 20, height: 20)
                                    .background(s.accent.band, in: RoundedRectangle(cornerRadius: 6))
                                Text(s.title)
                                    .font(.caption.weight(section == s ? .semibold : .medium))
                                    .foregroundStyle(section == s ? AppTheme.forest : AppTheme.textSecondary)
                            }
                            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 6)
                            .background(section == s ? AppTheme.card : Color.clear, in: Capsule())
                            .overlay(Capsule().strokeBorder(section == s ? AppTheme.hairline : .clear))
                        }
                    }
                }
            }

            // One card per section in the web's design: header, note, the
            // section's own evidence, Keep and Try, and a footer holding
            // "How to read this", this section's hard look, and the coach.
            Group {
                switch section {
                case .talk:
                    TalkSection(session: session, note: AudioInsights.buildTalkInsight(session), hardLook: sectionHardLook, onDiscuss: discussSection)
                case .questions:
                    QuestionsSection(session: session, note: AudioInsights.buildQuestioningInsight(session, higherOrderRatio: m.higherOrderRatio),
                                     hardLook: sectionHardLook, onDiscuss: discussSection)
                case .content:
                    ContentSection(session: session, hardLook: sectionHardLook, onDiscuss: discussSection)
                case .routines:
                    RoutinesSection(session: session, hardLook: sectionHardLook, onDiscuss: discussSection)
                }
            }
            .id(section)

        }
    }

    /// This section's part of the Hard Look, opened from the card's footer.
    /// A locked report that never asked for one has none to show.
    private var sectionHardLook: AnyView? {
        if locked && session.hardLook == nil { return nil }
        return AnyView(SectionHardLook(section: section, session: session, locked: locked, onUpdate: onUpdate))
    }

    private func discussSection() { discuss(.forSection(section, in: session)) }

    /// The other lens over the same four sections: the least generous reading
    /// rather than the framework's. Second, and closed, on purpose — a teacher
    /// should arrive at an unsparing critique of their own lesson by choosing
    /// it on a day they can use it, not by scrolling past it on any other.
    private var hardLookRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation { hardLookOpen.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("The Hard Look")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        Text("The least generous honest reading of the whole lesson. For when you want it straight.")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Text(hardLookOpen ? "Hide" : "Show")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                }
            }

            if hardLookOpen {
                HardLookTab(session: session, locked: locked, onUpdate: onUpdate)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private var disclaimer: some View {
        Text("This report reflects what could be heard in your recording — talk patterns, questioning, and classroom routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything outside class time. Automated counts above are suggestions to confirm or edit, not final judgments. Audio is never saved: it's sent once for transcription and discarded, and only the transcript and these insights are kept.")
            .font(.caption2)
            .foregroundStyle(AppTheme.textSecondary)
            .padding(12)
            .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))
    }
}

struct InsightsSectionHeader: View {
    let section: InsightsSection

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Text("\(section.number)")
                .font(.heading(.title3))
                .foregroundStyle(section.accent.onBand)
                .frame(width: 48, height: 48)
                .background(section.accent.band, in: RoundedRectangle(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 2) {
                Text(section.title).font(.heading(.title3)).foregroundStyle(AppTheme.forest)
                Text(section.blurb).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }
}

// MARK: - Shared tab building blocks

/// A labelled half of a section, one step quieter than `InsightsSectionHeader`
/// so the page still reads as one section rather than two stacked ones.
struct SubsectionHeading: View {
    let title: String
    let blurb: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(AppTheme.gold).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                Text(blurb).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// A section's note opens with its first two or three sentences and keeps the
/// rest behind "Read more". The note is the reading of the section and the
/// page below it is the evidence, so a teacher should reach the evidence
/// without scrolling past a paragraph first. Short notes are shown whole.
/// Mirrors `CoachNote` in AudioCoaching.tsx.
struct CoachNoteView: View {
    let text: String?
    @State private var open = false

    /// Whole sentences, up to about three lines' worth; always at least one.
    static func opening(of text: String) -> String {
        let flat = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        var sentences: [String] = []
        var current = ""
        for word in flat.split(separator: " ") {
            current += current.isEmpty ? String(word) : " \(word)"
            if let last = word.last, ".!?".contains(last) {
                sentences.append(current)
                current = ""
            }
        }
        if !current.isEmpty { sentences.append(current) }
        var result = sentences.first ?? ""
        for sentence in sentences.dropFirst().prefix(2) {
            if result.count + sentence.count + 1 > 330 { break }
            result += " \(sentence)"
        }
        return result
    }

    var body: some View {
        if let text {
            let full = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let opening = Self.opening(of: full)
            // Not worth a button to reveal one more short sentence.
            let folds = full.count - opening.count > 80
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bubble.left.fill").foregroundStyle(AppTheme.forest).padding(.top, 2)
                VStack(alignment: .leading, spacing: 6) {
                    Text(open || !folds ? full : opening).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if folds {
                        Button(open ? "Show less" : "Read more") { withAnimation { open.toggle() } }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.mintTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

struct StatView: View {
    let label: String
    let metric: ReportConfidence.ConfidentMetric
    var highlighted = false
    @Environment(\.reportAccent) private var accent

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(accent.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(metric.display)
                .font(.heading(.title2))
                .foregroundStyle(metric.state.isMissing ? AppTheme.textSecondary : AppTheme.forest)
            if let reason = metric.reason {
                Text(reason).font(.caption2).foregroundStyle(AppTheme.textSecondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
        .background(AppTheme.card.opacity(0.75), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(highlighted ? AppTheme.gold : .clear, lineWidth: 2)
        )
    }
}

struct StatGridView<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.reportAccent) private var accent

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            content
        }
        .padding(14)
        .background(accent.tint.opacity(0.7), in: RoundedRectangle(cornerRadius: 20))
    }
}

/// One folded row of detail. Every Insights section has the same shape — the
/// note, one picture, one finding, one thing to try — and then everything else
/// lives in rows like this: the lists of quotes, the full numbers, how to read
/// them. A teacher who wants the evidence is one tap away, and one who does
/// not is not made to scroll past it. Mirrors `DetailRow` in AudioCoaching.tsx.
struct DetailRow<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            Button {
                withAnimation { open.toggle() }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                VStack(alignment: .leading, spacing: 12) { content }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 16)
            }
        }
    }
}

/// The section's own line from "Try next time" on Summary, shown where the
/// evidence for it is. A report summarised before these existed has none, and
/// a section with nothing worth suggesting says nothing.
struct SectionNextStep: View {
    let text: String?

    var body: some View {
        if let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("TRY NEXT TIME").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.goldTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

/// A caveat inside a "How to read…" row.
func readingNote(_ text: String) -> some View {
    Text(text).font(.caption).foregroundStyle(AppTheme.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
}
