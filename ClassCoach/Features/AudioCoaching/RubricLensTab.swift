import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `RubricLensTab` — built only when the
/// teacher taps the button, kept after that. Each component shows a Danielson
/// level for the teacher alone, with their own note beside it if they
/// disagree; the export never prints either.
struct RubricLensTab: View {
    let session: AudioSessionWithSegments
    let locked: Bool
    let onUpdate: (AudioSessionWithSegments) -> Void

    @State private var generating = false
    @State private var error: String?
    @State private var noteComponent: AudioRubricComponent?
    @State private var noteDraft = ""
    @State private var savingNote = false
    @State private var noteError: String?

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
        .sheet(item: $noteComponent) { component in
            noteSheet(component)
        }
    }

    // MARK: Before generating

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("See this lesson through the Danielson Framework")
                .font(.heading(.headline)).foregroundStyle(AppTheme.forest)
            Text("Rubric Lens sorts what your recording captured under Danielson's Domain 2 (Learning Environments) and Domain 3 (Learning Experiences). For each component you get a level from 1 to 4, the moments behind it, and one next step to try.")
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text("· Levels come from what audio can show. Anything visual, like room setup, is left out.")
                Text("· When the recording doesn't show enough, it says so instead of guessing.")
                Text("· Disagree with a level? Add your own note beside it.")
                Text("· Only you see it. Levels are not part of the export.")
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
            Text("\(lens.frameworkName), Domains 2 and 3. Each level is an estimate from this one recording, for you alone. It can't see the room or student work, and \"not enough evidence\" only means audio couldn't show it, not that it didn't happen. Disagree? Add a note beside the level.")
            if (session.durationSec ?? 0) > 0, (session.durationSec ?? 0) < ReportConfidence.shortSessionThresholdSec {
                Text("This session is under \(Int(ReportConfidence.shortSessionThresholdSec / 60)) minutes, so there is less evidence to work with.")
                    .fontWeight(.semibold).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .font(.caption2).foregroundStyle(AppTheme.textSecondary)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))

        if lens.scored != true && !locked {
            VStack(alignment: .leading, spacing: 10) {
                Text("This lens was made before Rubric Lens gave levels. Rebuild it to get a level for each component.")
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                Button(generating ? "Adding levels..." : "Add Danielson levels") {
                    Task { await generate() }
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(generating ? AppTheme.textSecondary : AppTheme.terracotta, in: Capsule())
                .disabled(generating)
                ProgressRing(active: generating, estimatedSeconds: 30, label: "Matching your lesson to the framework")
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
        }

        ForEach(domains(lens), id: \.self) { domain in
            VStack(alignment: .leading, spacing: 10) {
                Text(domain.uppercased())
                    .font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                ForEach(lens.components.filter { $0.domain == domain }) { component in
                    componentCard(component, scored: lens.scored == true)
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

    private func componentCard(_ component: AudioRubricComponent, scored: Bool) -> some View {
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

            if scored {
                levelBadge(component.level)
            }

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

            if scored {
                teacherNote(component)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    // Four steps, filled up to the level, with the framework's name beside it —
    // or a dashed "not enough evidence" when the recording couldn't place it.
    @ViewBuilder
    private func levelBadge(_ level: Int?) -> some View {
        if let level, let name = AudioRubricComponent.levelNames[level] {
            HStack(spacing: 10) {
                HStack(spacing: 4) {
                    ForEach(1...4, id: \.self) { step in
                        Capsule()
                            .fill(step <= level ? levelColor(level) : AppTheme.hairline)
                            .frame(width: 24, height: 8)
                    }
                }
                .accessibilityHidden(true)
                Text("\(level) · \(name)")
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Level \(level) of 4: \(name)")
        } else {
            Text("Not enough evidence in this recording")
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .overlay(Capsule().strokeBorder(AppTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        }
    }

    private func levelColor(_ level: Int) -> Color {
        switch level {
        case 1: return AppTheme.terracotta
        case 2: return AppTheme.gold
        case 3: return Color(hex: 0x4F9187)
        default: return AppTheme.forest
        }
    }

    @ViewBuilder
    private func teacherNote(_ component: AudioRubricComponent) -> some View {
        if let note = component.teacherNote, !note.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("YOUR NOTE").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    Spacer()
                    if !locked {
                        Button("Edit") { openNote(component) }
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    }
                }
                Text(note).font(.footnote).foregroundStyle(AppTheme.textPrimary)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.hairline))
        } else if !locked {
            Button("Disagree? Add a note") { openNote(component) }
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
        }
    }

    private func openNote(_ component: AudioRubricComponent) {
        noteDraft = component.teacherNote ?? ""
        noteError = nil
        noteComponent = component
    }

    private func noteSheet(_ component: AudioRubricComponent) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(component.code) \(component.name)")
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                Text("Why you see this component differently, e.g. what happened that the recording missed.")
                    .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                TextEditor(text: $noteDraft)
                    .frame(minHeight: 140)
                    .padding(8)
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.hairline))
                    .onChange(of: noteDraft) { _, value in
                        if value.count > 1000 { noteDraft = String(value.prefix(1000)) }
                    }
                if component.teacherNote?.isEmpty == false {
                    Button("Remove note", role: .destructive) {
                        Task { await saveNote(component, text: "") }
                    }
                    .font(.footnote.weight(.semibold))
                    .disabled(savingNote)
                }
                if let noteError {
                    Text(noteError).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                }
                Spacer()
            }
            .padding(16)
            .navigationTitle("Your note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { noteComponent = nil }.disabled(savingNote)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(savingNote ? "Saving..." : "Save") {
                        Task { await saveNote(component, text: noteDraft) }
                    }
                    .disabled(savingNote)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func saveNote(_ component: AudioRubricComponent, text: String) async {
        savingNote = true
        noteError = nil
        do {
            let updated = try await AudioCoachingService.saveRubricLensNote(sessionId: session.id, code: component.code, note: text)
            onUpdate(updated)
            noteComponent = nil
        } catch {
            noteError = error.localizedDescription
        }
        savingNote = false
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
