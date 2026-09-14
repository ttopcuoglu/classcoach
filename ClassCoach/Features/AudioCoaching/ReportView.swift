import SwiftUI

enum ReportTab: String, CaseIterable {
    case summary, insights, reflect, myGrowth

    var label: String {
        switch self {
        case .summary: return "Summary"
        case .insights: return "Insights"
        case .reflect: return "Reflect"
        case .myGrowth: return "My Growth"
        }
    }
}

/// The report's five Insights sections, numbered and coloured the same way
/// as the web report and the printable PDF, so "section 3" means the same
/// thing on the phone, the website and paper.
enum InsightsSection: String, CaseIterable, Identifiable {
    case talk, questions, understanding, content, routines

    var id: String { rawValue }
    var number: Int { (InsightsSection.allCases.firstIndex(of: self) ?? 0) + 1 }

    var title: String {
        switch self {
        case .talk: return "Talk & Participation"
        case .questions: return "Questions & Thinking"
        case .understanding: return "Checks & Feedback"
        case .content: return "Clarity & Content"
        case .routines: return "Climate & Routines"
        }
    }

    var blurb: String {
        switch self {
        case .talk: return "Who was heard, and for how long."
        case .questions: return "What you asked, and how long you left for an answer."
        case .understanding: return "How you checked they were with you, and how specific your feedback was."
        case .content: return "What the lesson said it was about, in its own words."
        case .routines: return "Counts, not scores. There is no such thing as a correct number here."
        }
    }

    var accent: ReportAccent {
        switch self {
        case .talk: return .terracotta
        case .questions: return .gold
        case .understanding: return .teal
        case .content: return .forest
        case .routines: return .terracotta
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
    @State private var focusMetric: FocusMetric?

    private var locked: Bool { session.status == "locked" }
    private var m: OverviewMetrics { OverviewMetrics(session) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button("← Back to sessions", action: onExit)
                .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)

            cover

            tabBar

            Group {
                switch tab {
                case .summary:
                    OverviewTab(
                        session: session,
                        onSetFocus: { metric in focusMetric = metric; tab = .myGrowth },
                        onNavigateReflect: { tab = .reflect },
                        onNavigateInsights: { target in section = target; tab = .insights }
                    )
                case .insights:
                    insights
                case .reflect:
                    ReflectTab(session: session, locked: locked, onUpdate: onUpdate)
                case .myGrowth:
                    MyGrowthTab(currentSessionId: session.id, focusMetric: $focusMetric)
                }
            }

            disclaimer
        }
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
            (Text(session.classSubject ?? "New Recording")
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

            InsightsSectionHeader(section: section)

            Group {
                switch section {
                case .talk: DiscourseDetailsTab(session: session, part: .talk)
                case .questions: DiscourseDetailsTab(session: session, part: .questions)
                case .understanding: DiscourseDetailsTab(session: session, part: .understanding)
                case .content: LessonContentTab(session: session, onUpdate: onUpdate)
                case .routines: ClimateRoutinesTab(session: session)
                }
            }
            .environment(\.reportAccent, section.accent)
        }
    }

    private var disclaimer: some View {
        Text("This report reflects what could be heard in your recording — talk patterns, questioning, and classroom routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything outside class time. Automated counts above are suggestions to confirm or edit, not final judgments.")
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

struct CoachNoteView: View {
    let text: String?
    var body: some View {
        if let text {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bubble.left.fill").foregroundStyle(AppTheme.forest).padding(.top, 2)
                Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
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

struct CategorySectionView<Content: View>: View {
    let title: String
    let coverage: String
    @ViewBuilder let content: Content
    @Environment(\.reportAccent) private var accent

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.uppercased()).font(.caption.weight(.bold)).foregroundStyle(accent.ink)
                Spacer()
                Text(coverage).font(.caption2).foregroundStyle(AppTheme.textSecondary)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                content
            }
        }
        .padding(14)
        .background(accent.tint.opacity(0.7), in: RoundedRectangle(cornerRadius: 20))
    }
}
