import SwiftUI
import Charts

/// Mirrors `AudioCoaching.tsx`'s `MyGrowthTab` — uses native SwiftUI
/// Charts for the ten trend lines instead of hand-rolled SVG paths (same
/// information, more idiomatic on iOS).
struct MyGrowthTab: View {
    let currentSessionId: String
    @Binding var focusMetric: FocusMetric?

    @State private var sessions: [AudioSession] = []
    @State private var loading = true

    private static let maxTrendSessions = 20

    /// Tiny recordings are tests, not lessons — half a real teacher's
    /// recordings are two minutes or less, and they were plotted beside a
    /// thirty-nine-minute period as though they were the same kind of thing.
    private var qualifying: [AudioSession] {
        Array(
            sessions
                .filter {
                    $0.teacherTalkPct != nil && ($0.durationSec ?? 0) >= ReportConfidence.tinyRecordingThresholdSec
                }
                .sorted { $0.createdAt < $1.createdAt }
                .suffix(Self.maxTrendSessions)
        )
    }

    /// The seven My Growth can defend, with the chosen focus lifted to the
    /// top. A stored focus that has since been retired is still charted — it
    /// is what this teacher asked to watch — but it is not offered to anyone
    /// new.
    private var orderedMetrics: [FocusMetric] {
        var all = FocusMetrics.trendable
        if let focus = focusMetric {
            all.removeAll { $0 == focus }
            all.insert(focus, at: 0)
        }
        return all
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LessonFocusLink(sessions: sessions, focusMetric: $focusMetric)
            FocusSelectorView(focusMetric: $focusMetric)

            if loading {
                ProgressView()
            } else if qualifying.count < 2 {
                Text("Your growth trends will show up here after a couple more sessions. One session — especially a short one — is too noisy on its own to read much into.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .padding().frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            } else {
                if let insight = AudioInsights.buildTrendInsight(qualifying) {
                    CoachNoteView(text: insight)
                }
                ForEach(orderedMetrics, id: \.self) { metric in
                    TrendChartView(metric: metric, sessions: qualifying, highlighted: metric == focusMetric)
                }
                Text("Showing your last \(qualifying.count) analyzed sessions over \(Int(ReportConfidence.tinyRecordingThresholdSec / 60)) minutes — shorter recordings are left out, since a one-minute clip and a full period are not the same kind of thing. A gap in a line means that lesson had no measurable value, never a measured zero. Read the overall direction, not any single point, and this is compared only against your own history, never other teachers.")
                    .font(.caption2).foregroundStyle(AppTheme.textSecondary)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do { sessions = try await AudioCoachingService.getSessions() } catch {}
        loading = false
    }
}

/// The one focus a teacher chose on their latest lesson's Summary, brought to
/// My Growth with the trends for that part of the lesson one tap away —
/// mirrors `LessonFocusLink` in AudioCoaching.tsx. It only offers: the
/// account-wide My Growth focus changes only when the teacher taps, since the
/// Coach reads it too.
private struct LessonFocusLink: View {
    let sessions: [AudioSession]
    @Binding var focusMetric: FocusMetric?

    private struct Resolved {
        let date: Date?
        let item: NextTimeItem
        let section: InsightsSection?
        let streak: Int
        /// Only Talk & Participation and Questioning & Checking have trends.
        let metrics: [FocusMetric]
    }

    private var resolved: Resolved? {
        let dated = sessions.map { (session: $0, date: LessonMonth.parseDate($0.sessionDate)) }
        let newestFirst = dated.sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
        // The latest lesson with a focus at all, chosen or suggested — the
        // banner follows the newest lesson, not the last one a focus was
        // picked on (mirrors the web).
        let focusOf = { (s: AudioSession) in NextTimeItem.focus(for: AudioSessionWithSegments(session: s, segments: [])) }
        guard let start = newestFirst.firstIndex(where: { focusOf($0.session) != nil }),
              let item = focusOf(newestFirst[start].session) else { return nil }
        let chosen = newestFirst[start]
        let section = item.insightsSection
        // How many lessons in a row, newest first, had a focus in this same part.
        var streak = 0
        for entry in newestFirst[start...] {
            guard let f = focusOf(entry.session), f.insightsSection == section else { break }
            streak += 1
        }
        let metrics = section.flatMap { s in FocusMetrics.groups.first { $0.category == s.title }?.metrics } ?? []
        return Resolved(date: chosen.date, item: item, section: section, streak: streak, metrics: metrics)
    }

    var body: some View {
        if let r = resolved {
            VStack(alignment: .leading, spacing: 6) {
                Text("Your one focus, from your lesson on \(r.date?.formatted(.dateTime.month(.abbreviated).day()) ?? "")".uppercased())
                    .font(.caption.weight(.bold)).tracking(0.6)
                    .foregroundStyle(Color(hex: 0x8E3F22))
                Text(r.item.text)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if r.streak >= 2, let section = r.section {
                    Text("\(section.title) has been your focus for your last \(r.streak) lessons.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                if !r.metrics.isEmpty {
                    FlowLayout(spacing: 8) {
                        Text("Follow it here:")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                            .padding(.vertical, 5)
                        ForEach(r.metrics, id: \.self) { metric in
                            let on = focusMetric == metric
                            Button { focusMetric = metric } label: {
                                Text(FocusMetrics.label(metric))
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(on ? AppTheme.cream : AppTheme.textSecondary)
                                    .padding(.horizontal, 12).padding(.vertical, 5)
                                    .background(on ? AppTheme.terracotta : AppTheme.card, in: Capsule())
                                    .overlay(Capsule().strokeBorder(on ? AppTheme.terracotta : AppTheme.hairline))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                    .padding(.top, 6)
                } else if let section = r.section {
                    Text("My Growth doesn\u{2019}t chart \(section.title) yet. Each lesson\u{2019}s own \(section.title) page is where to follow it.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 2)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.peachTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

private struct FocusSelectorView: View {
    @Binding var focusMetric: FocusMetric?

    var body: some View {
        Menu {
            Button("No focus") { focusMetric = nil }
            ForEach(FocusMetrics.groups, id: \.category) { group in
                Section(group.category) {
                    ForEach(group.metrics, id: \.self) { metric in
                        Button(FocusMetrics.label(metric)) { focusMetric = metric }
                    }
                }
            }
        } label: {
            HStack {
                Text("My focus").font(.caption).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Text(focusMetric.map(FocusMetrics.label) ?? "Choose a focus metric")
                    .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                Image(systemName: "chevron.down").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            .padding(10)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

private struct TrendPoint: Identifiable {
    let id = UUID()
    let index: Int
    let seriesLabel: String
    let value: Double
}

private struct TrendChartView: View {
    let metric: FocusMetric
    let sessions: [AudioSession]
    let highlighted: Bool

    private var series: [(label: String, values: [Double?])] { FocusMetrics.series(metric, sessions: sessions) }

    private var points: [TrendPoint] {
        series.flatMap { s in
            s.values.enumerated().compactMap { index, value in
                value.map { TrendPoint(index: index, seriesLabel: s.label, value: $0) }
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(FocusMetrics.title(metric)).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                if highlighted {
                    Text("YOUR FOCUS").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(AppTheme.primary.opacity(0.12), in: Capsule())
                }
            }
            if points.isEmpty {
                Text("Not enough data yet.").font(.caption).foregroundStyle(AppTheme.textSecondary)
            } else {
                Chart(points) { point in
                    LineMark(x: .value("Session", point.index), y: .value("Value", point.value))
                        .foregroundStyle(by: .value("Series", point.seriesLabel))
                    PointMark(x: .value("Session", point.index), y: .value("Value", point.value))
                        .foregroundStyle(by: .value("Series", point.seriesLabel))
                }
                .chartXAxis(.hidden)
                .frame(height: 120)
            }
        }
        .padding(10)
        .background(highlighted ? AppTheme.primary.opacity(0.06) : AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(highlighted ? AppTheme.primary : .clear, lineWidth: 1.5))
    }
}
