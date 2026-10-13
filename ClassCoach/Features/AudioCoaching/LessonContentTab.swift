import SwiftUI

/// Content Specialist Notes — the iOS twin of `AudioCoaching.tsx`'s
/// `LessonContentTab`.
///
/// This section used to list separate detections: topic-term clouds, the
/// stated objective, real-world connections, defined vocabulary, then a notes
/// block. Each could read "None detected" while the lesson plainly contained
/// the thing — a teacher tying ratios to cooking was told there were no
/// real-world connections. Everything still detected now feeds one narrative
/// written by a subject specialist who listened, about the content and about
/// how it was delivered.
struct LessonContentTab: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void

    @State private var generating = false
    @State private var error: String?
    @State private var dismissed: Set<String> = []

    /// The lesson's own terms and who said them — the iOS twin of the web's
    /// "Academic vocabulary" table. Hidden when there are none, like the
    /// connections below it.
    private func academicVocabulary(_ terms: [AudioKeyTerm]) -> some View {
        // Three is where "you kept saying it" starts; fewer is a mention.
        let unheard = terms.filter { $0.teacherCount >= 3 && $0.studentCount == 0 }.map { "\u{201C}\($0.term)\u{201D}" }
        return VStack(alignment: .leading, spacing: 8) {
            Text("ACADEMIC VOCABULARY")
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.textSecondary)
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    Text("TERM")
                    Text("YOU").gridColumnAlignment(.trailing)
                    Text("STUDENTS").gridColumnAlignment(.trailing)
                }
                .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                ForEach(terms, id: \.term) { t in
                    Divider()
                    GridRow {
                        Text(t.term).font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(t.teacherCount)").font(.subheadline).monospacedDigit().foregroundStyle(AppTheme.textPrimary)
                        Text("\(t.studentCount)").font(.subheadline.weight(t.studentCount == 0 ? .regular : .semibold)).monospacedDigit()
                            .foregroundStyle(t.studentCount == 0 ? AppTheme.textSecondary : AppTheme.forest)
                    }
                }
            }
            .padding(14)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            if !unheard.isEmpty {
                Text("You said \(ListFormatter.localizedString(byJoining: unheard)) three or more times\(unheard.count == 1 ? "" : " each"), and no student was heard saying \(unheard.count == 1 ? "it" : "them").")
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var visibleNotes: [AudioContentNote] {
        (session.contentNotes?.notes ?? []).filter { !dismissed.contains($0.id) }
    }

    var body: some View {
        let terms = session.lessonContent?.keyTerms ?? []
        let connections = session.lessonContent?.connections ?? []
        let ideas = session.lessonContent?.connectionIdeas ?? session.contentNotes?.connectionIdeas ?? []
        let misconceptions = session.contentNotes?.misconceptions ?? []
        // The same note "Try next time" on Summary carries for this section.
        let takeFurther = session.contentNotes?.notes.first { $0.label == "Where it could go further" }?.text
        return VStack(alignment: .leading, spacing: 14) {
            CoachNoteView(text: session.contentNarrative)

            if !terms.isEmpty {
                academicVocabulary(terms)
            }

            SectionNextStep(text: takeFurther)

            VStack(alignment: .leading, spacing: 0) {
                // Offered for every lesson, and asked for when the report
                // opens. The button stays for when that request failed, and to
                // write them again.
                DetailRow(title: session.contentNotes == nil ? "Content specialist notes" : "Content specialist notes (\(visibleNotes.count))") {
                    contentNotesBody
                }
                // Only when the lesson actually contained one: silence is the
                // right answer when nothing was found.
                if !connections.isEmpty {
                    DetailRow(title: "Connections you made (\(connections.count))") {
                        ForEach(Array(connections.enumerated()), id: \.offset) { _, c in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\"\(c.quote)\"").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(ReportConfidence.formatDuration(c.timestampSec))
                                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                        }
                    }
                }
                if !ideas.isEmpty {
                    DetailRow(title: "Ways into this topic, for next time") {
                        readingNote("Suggestions from a subject specialist, not a reading of your lesson.")
                        ForEach(ideas, id: \.self) { idea in
                            Text("• \(idea)").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                if !misconceptions.isEmpty {
                    DetailRow(title: "Where students usually get stuck on this topic") {
                        readingNote("Subject knowledge, not a reading of your lesson — you may well have covered it.")
                        ForEach(misconceptions, id: \.self) { line in
                            Text("• \(line)").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                DetailRow(title: "How to read this section") {
                    if !terms.isEmpty {
                        readingNote("Vocabulary is counted from the transcript, so read the counts as \u{201C}at least\u{201D}: unusual terms are the words a recording most often mishears, and student counts include only what the microphone picked up.")
                    }
                    readingNote("The specialist notes are written from excerpts of what you said and may miss context. They're a starting point for your own reflection, not a factual review — your subject expertise is the final word.")
                }
                Divider()
            }
        }
    }

    @ViewBuilder private var contentNotesBody: some View {
        if session.contentNotes == nil {
            Button(generating ? "Writing the notes…" : "Generate content specialist notes") {
                Task { await generate() }
            }
            .disabled(generating)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.cream)
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(generating ? AppTheme.hairline : AppTheme.terracotta, in: Capsule())
        } else {
            ForEach(visibleNotes, id: \.id) { note in
                VStack(alignment: .leading, spacing: 6) {
                    Text(note.label.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(AppTheme.mintTint.opacity(0.6), in: Capsule())
                    Text(note.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\"\(note.excerpt)\" (\(ReportConfidence.formatDuration(note.timestampSec)))")
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            }
            // Notes are written once and kept; this is the only way to ask
            // for a fresh set once the specialist itself has improved.
            Button(generating ? "Writing new notes…" : "Write these notes again ↻") {
                Task { await generate() }
            }
            .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
            .disabled(generating)
            ProgressRing(active: generating, estimatedSeconds: 16, label: "Writing content specialist notes")
        }
        if let error {
            Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
        }
    }

    private func generate() async {
        generating = true
        defer { generating = false }
        error = nil
        do {
            let updated = try await AudioCoachingService.generateContentNotes(sessionId: session.id)
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Minimal flow layout for word-cloud-style chip wrapping — iOS 16+
/// `Layout` protocol, no third-party dependency.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
