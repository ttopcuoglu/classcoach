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
