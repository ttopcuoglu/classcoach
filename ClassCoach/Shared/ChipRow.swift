import SwiftUI

/// Single-select, horizontally-scrolling capsule chip row — the iOS
/// equivalent of the `flex flex-wrap` filter/option buttons used all over
/// the web app (category/difficulty filters, recipient/tone/format
/// pickers, etc). A horizontal scroll is simpler and more idiomatic on
/// iOS than replicating a wrapping flow layout.
struct ChipRow: View {
    let items: [(label: String, value: String?)]
    let selection: String?
    let onSelect: (String?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.label) { item in
                    let isActive = selection == item.value
                    Button(item.label) { onSelect(item.value) }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(isActive ? AppTheme.primary : AppTheme.textSecondary)
                        .background(isActive ? AppTheme.primary.opacity(0.12) : AppTheme.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(isActive ? AppTheme.primary : .clear))
                }
            }
        }
    }
}
