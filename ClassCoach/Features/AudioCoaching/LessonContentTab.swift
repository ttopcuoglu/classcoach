import SwiftUI

/// Mirrors `AudioCoaching.tsx`'s `LessonContentTab` — flags & quotes only,
/// never scored.
struct LessonContentTab: View {
    let session: AudioSessionWithSegments
    let onUpdate: (AudioSessionWithSegments) -> Void

    @State private var generating = false
    @State private var error: String?
    @State private var dismissed: Set<String> = []

    private var content: AudioLessonContent? { session.lessonContent }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Flags & quotes only — not scored").font(.caption).italic().foregroundStyle(AppTheme.textSecondary)

            if let content {
                topicTermsSection(content)
                objectiveSection(content)
                quotesSection(title: "REAL-WORLD / PRIOR-KNOWLEDGE CONNECTIONS", quotes: content.connections)
                quotesSection(title: "DEFINED VOCABULARY", quotes: content.vocabulary)
                contentNotesSection(content)
            } else {
                Text("No lesson content analysis available for this session.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
    }

    @ViewBuilder
    private func topicTermsSection(_ content: AudioLessonContent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TOPIC TERMS DETECTED").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            if let flat = content.topicTermsFlat {
                if flat.isEmpty {
                    Text("No recurring terms detected.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {
                    wrapChips(flat.map { ($0, 1) }, color: AppTheme.primary)
                }
            } else if let split = content.topicTermsSplit {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Teacher").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.primary)
                    if split.teacher.isEmpty {
                        Text("No recurring terms detected.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                    } else {
                        wrapChips(split.teacher.map { ($0.term, $0.count) }, color: AppTheme.primary)
                    }
                }
                if session.studentTalkPct != nil && session.studentTalkPct! > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Student").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.accent)
                        if split.student.isEmpty {
                            Text("No recurring terms detected.").font(.caption).foregroundStyle(AppTheme.textSecondary)
                        } else {
                            wrapChips(split.student.map { ($0.term, $0.count) }, color: AppTheme.accent)
                        }
                    }
                } else {
                    Text("Student language couldn't be analyzed this session (little or no separately-detected student talk).")
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
            } else {
                Text("No recurring subject-specific terms detected.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func wrapChips(_ terms: [(String, Int)], color: Color) -> some View {
        let maxCount = max(terms.map(\.1).max() ?? 1, 1)
        return FlowLayout(spacing: 6) {
            ForEach(Array(terms.enumerated()), id: \.offset) { _, term in
                Text(term.0)
                    .font(.system(size: 12 + CGFloat(term.1) / CGFloat(maxCount) * 8, weight: .medium))
                    .foregroundStyle(color)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(color.opacity(0.1), in: Capsule())
            }
        }
    }

    @ViewBuilder
    private func objectiveSection(_ content: AudioLessonContent) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("STATED OBJECTIVE").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            if content.statedObjectiveFound == nil {
                Text("— Opening phase not captured").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if content.statedObjectiveFound == true, let quote = content.statedObjectiveQuote {
                Text("Detected: \"\(quote)\"\(content.statedObjectiveTimestampSec.map { " (\(ReportConfidence.formatDuration($0)))" } ?? "")")
                    .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            } else {
                Text("Not detected in the Opening phase.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        }
    }

    private func quotesSection(title: String, quotes: [AudioQuote]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
            if quotes.isEmpty {
                Text("None detected.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(Array(quotes.enumerated()), id: \.offset) { _, q in
                    Text("\"\(q.quote)\" · \(ReportConfidence.formatDuration(q.timestampSec))")
                        .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
            }
        }
    }

    private static let noteLabelColors: [String: Color] = [
        "Clarity": .blue, "Vocabulary": .blue, "Engagement with content": .blue, "Worth double-checking": .orange,
    ]

    @ViewBuilder
    private func contentNotesSection(_ content: AudioLessonContent) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CONTENT SPECIALIST NOTES").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)

            if content.subject == nil {
                Text("Not enough subject-specific content detected to generate notes this session.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if session.contentNotes == nil {
                Button(generating ? "Generating..." : "Generate content specialist notes") {
                    Task { await generateNotes() }
                }
                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(AppTheme.primary, in: Capsule())
                .disabled(generating)
            } else if let notes = session.contentNotes {
                Text("These notes are generated from a short audio excerpt and may miss context. They're meant as a starting point for your own reflection, not a factual review — please use your own subject expertise as the final word.")
                    .font(.caption2).foregroundStyle(AppTheme.textSecondary)

                let visible = notes.notes.filter { !dismissed.contains($0.id) }
                if visible.isEmpty {
                    Text("No notes to show.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {
                    ForEach(visible) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(note.label.uppercased())
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background((Self.noteLabelColors[note.label] ?? AppTheme.textSecondary).opacity(0.12), in: Capsule())
                                    .foregroundStyle(Self.noteLabelColors[note.label] ?? AppTheme.textSecondary)
                                Spacer()
                                Button {
                                    dismissed.insert(note.id)
                                } label: {
                                    Image(systemName: "xmark").font(.caption).foregroundStyle(AppTheme.textSecondary)
                                }
                            }
                            Text(note.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            Text("\"\(note.excerpt)\" · \(ReportConfidence.formatDuration(note.timestampSec))")
                                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        }
                        .padding(10)
                        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    private func generateNotes() async {
        generating = true
        error = nil
        do {
            let updated = try await AudioCoachingService.generateContentNotes(sessionId: session.id)
            onUpdate(AudioSessionWithSegments(session: updated, segments: session.segments))
        } catch {
            self.error = error.localizedDescription
        }
        generating = false
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
