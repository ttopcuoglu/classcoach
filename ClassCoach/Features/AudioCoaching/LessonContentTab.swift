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

    private var visibleNotes: [AudioContentNote] {
        (session.contentNotes?.notes ?? []).filter { !dismissed.contains($0.id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Only when the lesson actually contained one — "None detected"
            // over a lesson built on a cooking example said more about the
            // detector than the teaching.
            if let connections = session.lessonContent?.connections, !connections.isEmpty {
                Text("REAL-WORLD / PRIOR-KNOWLEDGE CONNECTIONS")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.textSecondary)
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

            Text("CONTENT SPECIALIST NOTES")
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.textSecondary)

            // Offered for every lesson: a keyword scan deciding a moon-phases
            // lesson had "no subject" used to hide this entirely. The server
            // says so if the recording caught too little to write from.
            if session.contentNotes == nil {
                Button(generating ? "Generating…" : "Generate content specialist notes") {
                    Task { await generate() }
                }
                .disabled(generating)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.cream)
                .padding(.horizontal, 20).padding(.vertical, 10)
                .background(generating ? AppTheme.hairline : AppTheme.terracotta, in: Capsule())
            } else {
                Text("These notes are generated from a short audio excerpt and may miss context. They're a starting point for your own reflection, not a factual review — use your own subject expertise as the final word.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                // Notes are written once and kept; this is the only way to ask
                // for a fresh set once the specialist itself has improved.
                Button(generating ? "Writing new notes…" : "Write these notes again ↻") {
                    Task { await generate() }
                }
                .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                .disabled(generating)

                ProgressRing(active: generating, estimatedSeconds: 16, label: "Writing content specialist notes")

                if let misconceptions = session.contentNotes?.misconceptions, !misconceptions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TEACHING THIS TOPIC · WHERE STUDENTS USUALLY GET STUCK")
                            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.forest)
                        Text("Subject knowledge, not a reading of your lesson — you may well have covered it.")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        ForEach(misconceptions, id: \.self) { line in
                            Text("• \(line)").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.mintTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 16))
                }

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
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                }
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
            }
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
