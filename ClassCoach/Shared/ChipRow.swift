import SwiftUI

/// Single-select, horizontally-scrolling capsule chip row — the iOS
/// equivalent of the `flex flex-wrap` filter/option buttons used all over
/// the web app (category/difficulty filters, recipient/tone/format
/// pickers, etc). A horizontal scroll is simpler and more idiomatic on
/// iOS than replicating a wrapping flow layout. The selected chip is solid
/// dark green, as on web.
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
                        .font(.subheadline.weight(isActive ? .semibold : .medium))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(isActive ? AppTheme.cream : AppTheme.textSecondary)
                        .background(isActive ? AppTheme.forest : AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(isActive ? .clear : AppTheme.hairline))
                }
            }
        }
    }
}

/// The dark green header card that opens a feature screen — the same cover
/// the web app and the printable reports use: a small gold label, a heading
/// with a gold full stop, and a short line of explanation.
struct PanelHeader<Accessory: View>: View {
    let eyebrow: String
    let title: String
    var subtitle: String?
    @ViewBuilder var accessory: Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow.uppercased())
                .font(.caption2.weight(.bold)).tracking(1.4)
                .foregroundStyle(AppTheme.gold)
            (Text(title) + Text(title.hasSuffix("?") || title.hasSuffix("!") ? "" : ".").foregroundColor(AppTheme.gold))
                .font(.heading(.title2))
                .foregroundStyle(.white)
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }
            accessory
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
    }
}

extension PanelHeader where Accessory == EmptyView {
    init(eyebrow: String, title: String, subtitle: String? = nil) {
        self.eyebrow = eyebrow
        self.title = title
        self.subtitle = subtitle
        self.accessory = EmptyView()
    }
}

/// A small uppercase section label in the report's terracotta.
struct SectionEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold)).tracking(1.1)
            .foregroundStyle(AppTheme.terracotta600)
    }
}
