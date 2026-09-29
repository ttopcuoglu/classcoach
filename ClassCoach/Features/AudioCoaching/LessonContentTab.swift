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

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let narrative = session.contentNarrative, !narrative.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(
                        narrative.components(separatedBy: "\n\n")
                            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty },
                        id: \.self
                    ) { para in
                        Text(para)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            } else {
                Text("These notes are written when the report is summarised — open Summary once and they will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
            }
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
