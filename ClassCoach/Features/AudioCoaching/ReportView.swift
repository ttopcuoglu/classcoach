import SwiftUI

enum ReportTab: String, CaseIterable {
    case overview, myGrowth, reflect, lessonContent, climate, discourse

    var label: String {
        switch self {
        case .overview: return "Overview"
        case .myGrowth: return "My Growth"
        case .reflect: return "Reflect"
        case .lessonContent: return "Lesson Content"
        case .climate: return "Climate & Routines"
        case .discourse: return "Discourse Details"
        }
    }
}

/// Mirrors `AudioCoaching.tsx`'s `ReportPanel` — the six-tab analyzed
/// report. Metrics are computed once here and threaded down to each tab
/// as props, matching the single-fetch-many-tabs pattern on web.
struct ReportView: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onExit: () -> Void

    @State private var tab: ReportTab = .overview
    @State private var focusMetric: FocusMetric?

    private var locked: Bool { session.status == "locked" }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Button("← Back to sessions", action: onExit)
                    .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                if locked {
                    Text("Locked")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(AppTheme.primary.opacity(0.15), in: Capsule())
                        .foregroundStyle(AppTheme.primary)
                }
            }

            ChipRow(
                items: ReportTab.allCases.map { ($0.label, $0.rawValue) },
                selection: tab.rawValue
            ) { value in
                if let value, let t = ReportTab(rawValue: value) { tab = t }
            }

            Group {
                switch tab {
                case .overview:
                    OverviewTab(
                        session: session,
                        onSetFocus: { metric in focusMetric = metric; tab = .myGrowth },
                        onNavigateReflect: { tab = .reflect },
                        onNavigateDiscourse: { tab = .discourse }
                    )
                case .myGrowth:
                    MyGrowthTab(currentSessionId: session.id, focusMetric: $focusMetric)
                case .reflect:
                    ReflectTab(session: session, locked: locked, onUpdate: onUpdate)
                case .lessonContent:
                    LessonContentTab(session: session, onUpdate: onUpdate)
                case .climate:
                    ClimateRoutinesTab(session: session, onNavigateDiscourse: { tab = .discourse })
                case .discourse:
                    DiscourseDetailsTab(session: session)
                }
            }

            disclaimer
        }
    }

    private var disclaimer: some View {
        Text("This report reflects what could be heard in your recording — talk patterns, questioning, and classroom routines. It doesn't capture lesson planning, materials, physical space, visual engagement, or anything outside class time. Automated counts above are suggestions to confirm or edit, not final judgments.")
            .font(.caption2)
            .foregroundStyle(AppTheme.textSecondary)
            .padding(10)
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(AppTheme.textSecondary.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4])))
    }
}

// MARK: - Shared tab building blocks

struct CoachNoteView: View {
    let text: String?
    var body: some View {
        if let text {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bubble.left.and.bubble.right.fill").foregroundStyle(AppTheme.primary).padding(.top, 2)
                Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            }
            .padding(12)
            .background(AppTheme.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

struct StatView: View {
    let label: String
    let metric: ReportConfidence.ConfidentMetric
    var highlighted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundStyle(AppTheme.textSecondary)
            Text(metric.display)
                .font(.title3.weight(.bold))
                .foregroundStyle(metric.state.isMissing ? AppTheme.textSecondary : AppTheme.textPrimary)
            if let reason = metric.reason {
                Text(reason).font(.caption2).italic().foregroundStyle(AppTheme.textSecondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(highlighted ? AppTheme.primary.opacity(0.08) : AppTheme.background, in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(highlighted ? AppTheme.primary : .clear, lineWidth: 1.5)
        )
    }
}

struct CategorySectionView<Content: View>: View {
    let title: String
    let coverage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                Spacer()
                Text(coverage).font(.caption2).foregroundStyle(AppTheme.textSecondary)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                content
            }
        }
    }
}
