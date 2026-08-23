import SwiftUI

/// Warm, calm, professional palette for adult educators — deliberately avoids
/// bright/playful "kids app" colors in favor of muted, grounded tones.
enum AppTheme {
    /// Deep teal — primary brand color, used for key actions and emphasis.
    static let primary = Color(hex: 0x2D6A6A)
    /// Warm terracotta — secondary accent for highlights and CTAs.
    static let accent = Color(hex: 0xC97B4A)
    /// Soft sage — supporting tint for success/positive states.
    static let sage = Color(hex: 0x8FA98A)

    /// Warm off-white background, easier on the eyes than stark white.
    static let background = Color(hex: 0xFBF7F1)
    /// Slightly deeper warm neutral for cards and grouped content.
    static let surface = Color(hex: 0xF2EBE0)

    /// Near-black warm charcoal for primary text.
    static let textPrimary = Color(hex: 0x2B2724)
    /// Muted warm gray for secondary text.
    static let textSecondary = Color(hex: 0x6B6560)

    enum Category {
        static let defiance = Color(hex: 0xB5563C)
        static let disengagement = Color(hex: 0x7A6FA0)
        static let peerConflict = Color(hex: 0xC97B4A)
        static let disruption = Color(hex: 0xB08D2E)
        static let transitions = Color(hex: 0x3E7C8A)
        static let technology = Color(hex: 0x4A7A6B)
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
