import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `RubricLensTab` — built only when the
/// teacher taps the button, kept after that, and never shows a level.
struct RubricLensTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    let onUpdate: (AudioSessionWithSegments) -> Void

    @State private var generating = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let lens = session.rubricLens {
                lensView(lens)
            } else {
                intro
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
            }
        }
    }

    // MARK: Before generating

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("See this lesson through the Danielson Framework")
                .font(.heading(.headline)).foregroundStyle(AppTheme.forest)
            Text("Rubric Lens sorts what your recording captured under Danielson's Domain 2 (Learning Environments) and Domain 3 (Learning Experiences). For each component you get the moments that show it and one next step to try.")
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text("· Evidence and next steps only. It never gives a level or a score.")
                Text("· Only what audio can show. Anything visual, like room setup, is left out.")
                Text("· Only you see it.")
            }
            .font(.footnote).foregroundStyle(AppTheme.textSecondary)

            if locked {
                Text("This report is locked, so a rubric lens can't be added to it.")
                    .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                    .padding(.top, 4)
            } else {
                Button(generating ? "Building your rubric lens..." : "View through Danielson rubric") {
                    Task { await generate() }
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(generating ? AppTheme.textSecondary : AppTheme.terracotta, in: Capsule())
                .disabled(generating)
                .padding(.top, 4)

                ProgressRing(active: generating, estimatedSeconds: 30, label: "Matching your lesson to the framework")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AppTheme.hairline))
    }

    // MARK: Generated lens

    @ViewBuilder
    private func lensView(_ lens: AudioRubricLens) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(lens.frameworkName), Domains 2 and 3. This organizes what your recording captured under each component. It isn't a rating, and a thin section only means audio couldn't show much there, not that it didn't happen.")
            if (session.durationSec ?? 0) > 0, (session.durationSec ?? 0) < ReportConfidence.shortSessionThresholdSec {
                Text("This session is under \(Int(ReportConfidence.shortSessionThresholdSec / 60)) minutes, so there is less evidence to work with.")
                    .fontWeight(.semibold).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .font(.caption2).foregroundStyle(AppTheme.textSecondary)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))

        ForEach(domains(lens), id: \.self) { domain in
            VStack(alignment: .leading, spacing: 10) {
                Text(domain.uppercased())
                    .font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                ForEach(lens.components.filter { $0.domain == domain }) { component in
                    componentCard(component)
                }
                ForEach(lens.notObservable.filter { $0.domain == domain }) { item in
                    notObservableCard(item)
                }
            }
        }
    }

    private func domains(_ lens: AudioRubricLens) -> [String] {
        var seen: [String] = []
        for component in lens.components where !seen.contains(component.domain) {
            seen.append(component.domain)
        }
        return seen
    }

    private func componentCard(_ component: AudioRubricComponent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(component.code)
                    .font(.caption.weight(.bold)).foregroundStyle(AppTheme.forest)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(AppTheme.gold, in: RoundedRectangle(cornerRadius: 5))
                Text(component.name)
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
            }
            Text(component.audibility == "strong" ? "Audio shows this well" : "Audio shows part of this")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(component.audibility == "strong" ? AppTheme.forest : AppTheme.textSecondary)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(component.audibility == "strong" ? AppTheme.mintTint : AppTheme.surface, in: Capsule())

            Text(component.summary).font(.subheadline).foregroundStyle(AppTheme.textPrimary)

            ForEach(Array(component.evidence.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: 8) {
                    Rectangle().fill(AppTheme.gold.opacity(0.6)).frame(width: 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\"\(item.text)\"").font(.footnote).foregroundStyle(AppTheme.textPrimary)
                        Text("\(ReportConfidence.formatDuration(item.timestampSec)) · \(item.kind)")
                            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }

            if let nextStep = component.nextStep {
                VStack(alignment: .leading, spacing: 3) {
                    Text("NEXT STEP TO TRY").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                    Text(nextStep).font(.footnote).foregroundStyle(AppTheme.textPrimary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.goldTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private func notObservableCard(_ item: AudioRubricNotObservable) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(item.code)
                    .font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(AppTheme.hairline, in: RoundedRectangle(cornerRadius: 5))
                Text(item.name).font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            }
            Text("Not in a recording. \(item.reason)").font(.footnote).foregroundStyle(AppTheme.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(AppTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
    }

    private func generate() async {
        generating = true
        error = nil
        do {
            let updated = try await AudioCoachingService.generateRubricLens(sessionId: session.id)
            onUpdate(updated)
        } catch {
            self.error = error.localizedDescription
        }
        generating = false
    }
}
