import SwiftUI

/// The same palette as the web app and the printable reports
/// (`web/src/index.css`): dark forest green, cream, terracotta and gold, with
/// soft mint / peach / gold tints for cards. The original names (primary,
/// accent, background...) are kept so every existing screen picks the new
/// palette up without changes.
enum AppTheme {
    // MARK: Report palette

    static let forest = Color(hex: 0x1B2E28)
    static let forestSoft = Color(hex: 0x2A4239)
    static let cream = Color(hex: 0xF7F3EA)
    static let card = Color(hex: 0xFFFFFF)
    static let terracotta = Color(hex: 0xC96A45)
    static let terracotta600 = Color(hex: 0xB35A38)
    static let gold = Color(hex: 0xE4B84A)
    static let teal = Color(hex: 0x2F6F66)
    static let mintTint = Color(hex: 0xDCE7DF)
    static let peachTint = Color(hex: 0xF5DBC8)
    static let goldTint = Color(hex: 0xF5E7C4)
    static let hairline = Color(hex: 0xE7E0D3)

    // MARK: Roles used throughout the app

    /// Key actions, selected states and emphasis.
    static let primary = forest
    /// Calls to action and eyebrow labels.
    static let accent = terracotta
    /// Supporting tint (used as a feature icon colour).
    static let sage = teal

    static let background = cream
    /// Slightly deeper warm neutral for grouped content on the cream ground.
    static let surface = Color(hex: 0xF0E9DC)

    static let textPrimary = Color(hex: 0x2F2A24)
    static let textSecondary = Color(hex: 0x6B6259)

    enum Category {
        static let defiance = Color(hex: 0xB5563C)
        static let disengagement = Color(hex: 0x2F6F66)
        static let peerConflict = Color(hex: 0xC96A45)
        static let disruption = Color(hex: 0xB08D2E)
        static let transitions = Color(hex: 0x3E7C8A)
        static let technology = Color(hex: 0x4A7A6B)
    }
}

extension Font {
    /// The rounded, heavy heading style that stands in for the web app's
    /// Baloo 2 headings without bundling a custom font.
    static func heading(_ style: Font.TextStyle = .title2) -> Font {
        .system(style, design: .rounded).weight(.bold)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }
}
