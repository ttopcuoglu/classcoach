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

    private var qualifying: [AudioSession] {
        Array(
            sessions
                .filter { $0.teacherTalkPct != nil && $0.durationSec != nil }
                .sorted { $0.createdAt < $1.createdAt }
                .suffix(Self.maxTrendSessions)
        )
    }

    private var orderedMetrics: [FocusMetric] {
        var all = FocusMetric.allCases
        if let focus = focusMetric, let idx = all.firstIndex(of: focus) {
            all.remove(at: idx)
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
                Text("Showing your last \(qualifying.count) analyzed sessions. Short sessions add noise — read the overall direction, not any single point. This is compared only against your own history, not other teachers.")
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
