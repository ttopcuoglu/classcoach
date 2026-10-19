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

    var body: some View {
        let terms = session.lessonContent?.keyTerms ?? []
        let connections = session.lessonContent?.connections ?? []
        // The same note "Try next time" on Summary carries for this section.
        let takeFurther = session.contentNotes?.notes.first { $0.label == "Where it could go further" }?.text
        return VStack(alignment: .leading, spacing: 14) {
            CoachNoteView(text: session.contentNarrative)

            if !terms.isEmpty {
                academicVocabulary(terms)
            }

            SectionNextStep(text: takeFurther)

            VStack(alignment: .leading, spacing: 0) {
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
                DetailRow(title: "How to read this section") {
                    if !terms.isEmpty {
                        readingNote("Vocabulary is counted from the transcript, so read the counts as \u{201C}at least\u{201D}: unusual terms are the words a recording most often mishears, and student counts include only what the microphone picked up.")
                    }
                    readingNote("Ideas for teaching this subject \u{2014} the specialist\u{2019}s notes, ways in, and where students get stuck \u{2014} are in the Content Specialist tab.")
                }
                Divider()
            }
        }
    }
}

/// Content Specialist: a specialist's ideas for teaching the subject — notes
/// on moments of this lesson, ways in next time, where students get stuck.
/// Never a read of the lesson itself, and labelled so. Its own report tab,
/// beside Insights — mirrors `TopicTab` in AudioCoaching.tsx.
struct ContentSpecialistTab: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onDiscuss: () -> Void

    @State private var generating = false
    @State private var error: String?
    @State private var pick = "notes"

    static let lavender = Color(hex: 0x6E62A0)
    static let lavenderTint = Color(hex: 0xECE8F4)

    private var subject: String { session.lessonContent?.subject ?? session.contentNotes?.subject ?? "this subject" }

    private struct Option {
        let key: String
        let label: String
        let desc: String
        let count: Int
    }

    private var options: [Option] {
        [
            Option(key: "notes", label: "Specialist notes",
                   desc: "What a \(subject) specialist would want you to know, from excerpts of this lesson.",
                   count: session.contentNotes?.notes.count ?? 0),
            Option(key: "ways", label: "Ways in, next time", desc: "Other entry points into this content.",
                   count: (session.lessonContent?.connectionIdeas ?? session.contentNotes?.connectionIdeas ?? []).count),
            Option(key: "stuck", label: "Where students get stuck",
                   desc: "Common misconceptions on this topic \u{2014} you may well have covered them.",
                   count: (session.contentNotes?.misconceptions ?? []).count),
        ].filter { $0.count > 0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                Text("\u{2726}")
                    .font(.heading(.title3)).foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(Self.lavender, in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Content Specialist").font(.heading(.title3)).foregroundStyle(AppTheme.forest)
                    Text("A specialist\u{2019}s ideas for teaching this subject.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                }
            }
            Text("\u{2726} Ideas for teaching \(subject), not a read of this lesson")
                .font(.caption.weight(.semibold)).foregroundStyle(Self.lavender)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Self.lavenderTint, in: Capsule())

            if session.contentNotes == nil {
                Button(generating ? "Writing the notes\u{2026}" : "Generate content specialist notes") {
                    Task { await generate() }
                }
                .disabled(generating)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.cream)
                .padding(.horizontal, 20).padding(.vertical, 10)
                .background(generating ? AppTheme.hairline : AppTheme.terracotta, in: Capsule())
                ProgressRing(active: generating, estimatedSeconds: 14, label: "Writing content specialist notes")
            } else {
                picker
                Button(generating ? "Writing new notes\u{2026}" : "Write these notes again \u{21BB}") {
                    Task { await generate() }
                }
                .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                .disabled(generating)
                ProgressRing(active: generating, estimatedSeconds: 16, label: "Writing content specialist notes")
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
            }

            VStack(alignment: .leading, spacing: 0) {
                DetailRow(title: "How to read this") {
                    readingNote("These are a specialist\u{2019}s ideas for teaching \(subject), written from excerpts of what you said. They may miss context, they are a starting point for your own reflection rather than a review, and your subject expertise is the final word.")
                }
                Divider()
            }
            DiscussFooter(action: onDiscuss)
        }
    }

    @ViewBuilder private var picker: some View {
        let opts = options
        let current = opts.first { $0.key == pick } ?? opts.first
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(opts, id: \.key) { o in
                    let on = o.key == current?.key
                    Button { pick = o.key } label: {
                        HStack(spacing: 6) {
                            Text(o.label)
                            Text("\(o.count)").font(.caption2.weight(.bold))
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(on ? Color.white.opacity(0.25) : Self.lavenderTint, in: Capsule())
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(on ? Color.white : AppTheme.textPrimary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(on ? Self.lavender : AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(on ? Color.clear : AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        if let current {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(current.label) \u{00B7} \(current.count)").font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                Text(current.desc).font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                switch current.key {
                case "notes":
                    ForEach(session.contentNotes?.notes ?? [], id: \.id) { note in
                        itemCard(tag: note.label, text: note.text, quote: note.excerpt, timestampSec: note.timestampSec)
                    }
                case "ways":
                    ForEach(session.lessonContent?.connectionIdeas ?? session.contentNotes?.connectionIdeas ?? [], id: \.self) { idea in
                        itemCard(tag: "Way in", text: idea)
                    }
                default:
                    ForEach(session.contentNotes?.misconceptions ?? [], id: \.self) { line in
                        itemCard(tag: "Misconception", text: line)
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Self.lavenderTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 20))
        }
    }

    private func itemCard(tag: String, text: String, quote: String? = nil, timestampSec: Double? = nil) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(tag).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                if let timestampSec {
                    Text(ReportConfidence.formatDuration(timestampSec)).font(.caption.monospacedDigit()).foregroundStyle(AppTheme.textSecondary)
                }
            }
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let quote, !quote.isEmpty {
                Text("\u{201C}\(Redaction.withoutAddressedNames(quote))\u{201D}").font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
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
