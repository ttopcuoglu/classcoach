import SwiftUI

/// A circular progress indicator with the percentage in the middle, for the
/// moments where Wivoza is preparing an answer and the teacher would
/// otherwise be staring at a disabled button. The iOS twin of the web app's
/// `ProgressRing` + `useSimulatedProgress` (web/src/components/ProgressRing.tsx,
/// web/src/hooks/useSimulatedProgress.ts).
///
/// There is no real "% done" signal from Claude, so the number is an honest
/// estimate, not a measurement: it climbs quickly at first, eases off, and
/// approaches but never reaches 92% on its own. It only ever "finishes" by
/// disappearing the moment the response arrives and the caller flips
/// `active` back to false. Renders nothing while inactive.
struct ProgressRing: View {
    let active: Bool
    /// Roughly how long the request usually takes — the curve's time constant.
    var estimatedSeconds: Double = 6
    /// What Wivoza is doing right now, e.g. "Reading what you wrote".
    let label: String
    /// Sub-line, e.g. "Usually about ten seconds."
    var hint: String?
    var tint: Color = AppTheme.forest
    var size: CGFloat = 72

    var body: some View {
        // Inserting a fresh `RunningRing` each time `active` turns true is what
        // restarts the clock at 0% — its start date lives in its own @State.
        if active {
            RunningRing(estimatedSeconds: estimatedSeconds, label: label, hint: hint, tint: tint, size: size)
        }
    }
}

private struct RunningRing: View {
    let estimatedSeconds: Double
    let label: String
    let hint: String?
    let tint: Color
    let size: CGFloat

    @State private var startedAt = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Same ceiling as the web hook, so both platforms show the same numbers.
    private static let ceiling = 92.0

    private func progress(at date: Date) -> Double {
        // Guard against a caller passing 0/NaN and producing an instant 92%.
        let tau = max(1.2, estimatedSeconds.isFinite ? estimatedSeconds : 0)
        let elapsed = max(0, date.timeIntervalSince(startedAt))
        return Self.ceiling * (1 - exp(-elapsed / tau))
    }

    var body: some View {
        // With Reduce Motion on, step once a second without the sweep animation
        // instead of gliding every tenth of a second.
        TimelineView(.periodic(from: startedAt, by: reduceMotion ? 1 : 0.1)) { context in
            let pct = progress(at: context.date)
            let stroke = max(4, (size / 12).rounded())

            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .stroke(tint.opacity(0.15), lineWidth: stroke)
                    Circle()
                        .trim(from: 0, to: pct / 100)
                        .stroke(tint, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                        // Sweep clockwise from 12 o'clock.
                        .rotationEffect(.degrees(-90))
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: pct)
                    Text("\(Int(pct.rounded()))%")
                        .font(.system(size: (size / 4).rounded(), weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(tint)
                }
                .padding(stroke / 2)
                .frame(width: size, height: size)

                Text(label)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.textPrimary)
                if let hint {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityValue("\(Int(pct.rounded())) percent")
            .accessibilityHint(hint ?? "")
            .accessibilityAddTraits(.updatesFrequently)
        }
    }
}
