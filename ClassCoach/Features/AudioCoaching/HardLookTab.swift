import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `HardLookTab` — the unsparing reading of the
/// same evidence Rubric Lens organises. Built only when the teacher asks for
/// it, kept after that, and never printed into the exportable report (see the
/// note in `AudioCoachingExport.tsx`: they were promised it reaches nobody).
///
/// The cleared sections are shown as prominently as the criticisms on purpose.
/// A critic who finds something every time is a generator, and the sections
/// where it came back empty are what make the rest of it worth reading.
struct HardLookTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    let onUpdate: (AudioSessionWithSegments) -> Void

    @State private var generating = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let hardLook = session.hardLook {
                resultView(hardLook)
            } else {
                intro
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
            }
        }
    }

    private func label(for section: String) -> String {
        InsightsSection(rawValue: section)?.title ?? section
    }

    // MARK: Before generating

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ask for the version that doesn't go easy on you")
                .font(.heading(.headline)).foregroundStyle(AppTheme.forest)
            Text("The rest of this report is written to be useful on a hard day. This one isn't. It goes back through the same four sections as a demanding reader looking for what could have been better, and says it plainly.")
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text("· Every criticism has to point at something you actually said. No evidence, no criticism.")
                Text("· It can come back with nothing. Sections it can't make a case against are named as such.")
                Text("· Only you see it. It reaches no evaluator and changes nothing in your report.")
                Text("· Written once and kept, so it can't be re-rolled into a kinder answer.")
            }
            .font(.footnote).foregroundStyle(AppTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)

            if locked {
                Text("This report is locked, so a hard look can't be added to it.")
                    .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                    .padding(.top, 4)
            } else {
                Button(generating ? "Taking the hard look..." : "Give it to me straight") {
                    Task { await generate() }
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(generating ? AppTheme.textSecondary : AppTheme.terracotta, in: Capsule())
                .disabled(generating)
                .padding(.top, 4)

                ProgressRing(active: generating, estimatedSeconds: 30, label: "Looking for what could be better")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AppTheme.hairline))
    }

    // MARK: The hard look itself

    @ViewBuilder
    private func resultView(_ hardLook: AudioHardLook) -> some View {
        Text("The hardest reading these recordings support. It only presses on things it can point at, so a quiet section means the audio didn't carry a case — not that the lesson was flawless, and not that it was poor. Quotes come from automatic transcription, so a line may be garbled even when the point behind it holds.")
            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14))

        if hardLook.critiques.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Nothing here it can make a hard case against.")
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                Text("On what the microphone caught, none of these sections support a criticism worth your time. That is a real result, and it is the reason to trust this section on a lesson where it does find something.")
                    .font(.footnote).foregroundStyle(AppTheme.textPrimary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.mintTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
        } else {
            // Grouped by section rather than one flat list: a section now
            // carries several findings, and repeating its name above each one
            // read as a pile of complaints rather than a reading of that part
            // of the lesson.
            ForEach(InsightsSection.allCases.filter { section in
                hardLook.critiques.contains { $0.section == section.rawValue }
            }) { section in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Rectangle().fill(AppTheme.terracotta)
                            .frame(width: 3, height: 18)
                            .clipShape(Capsule())
                        Text(section.title)
                            .font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
                    }
                    ForEach(hardLook.critiques.filter { $0.section == section.rawValue }) { critique in
                        critiqueCard(critique)
                    }
                }
            }
        }

        if !hardLook.cleared.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("LOOKED AT JUST AS HARD, NO CASE TO MAKE")
                    .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                ForEach(hardLook.cleared) { cleared in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label(for: cleared.section))
                            .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        Text(cleared.reason)
                            .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
        }
    }

    private func critiqueCard(_ critique: AudioHardLookCritique) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(critique.headline)
                .font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
                .fixedSize(horizontal: false, vertical: true)
            Text(critique.critique)
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(critique.evidence.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .top, spacing: 8) {
                    Rectangle().fill(AppTheme.terracotta.opacity(0.5)).frame(width: 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\"\(item.text)\"").font(.footnote).foregroundStyle(AppTheme.textPrimary)
                        Text("\(ReportConfidence.formatDuration(item.timestampSec)) · \(item.kind)")
                            .font(.caption2).foregroundStyle(AppTheme.textSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }

            if !critique.likelyCost.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("WHAT IT LIKELY COST")
                        .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    Text(critique.likelyCost)
                        .font(.footnote).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            }

            if !critique.nextStep.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("TRY INSTEAD")
                        .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                    Text(critique.nextStep)
                        .font(.footnote).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
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

    private func generate() async {
        generating = true
        error = nil
        do {
            let updated = try await AudioCoachingService.generateHardLook(sessionId: session.id)
            onUpdate(updated)
        } catch {
            self.error = error.localizedDescription
        }
        generating = false
    }
}
