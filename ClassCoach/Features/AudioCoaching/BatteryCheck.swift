import UIKit

/// Whether to say something before a teacher starts a fifty-minute recording.
///
/// Chunking (see `RecordingStore`) makes a dead phone cost the last few
/// minutes rather than the period, but the cheapest fix is still not starting
/// on 12%. Only ever a warning: a teacher who has decided to record on a low
/// battery knows something about their day that this does not.
enum BatteryCheck {
    /// Below this, unplugged, a full class period is genuinely at risk.
    private static let threshold: Float = 0.25

    static func warning() -> String? {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel
        // -1 means the system will not say — the simulator, mostly. Silence is
        // better than a warning based on nothing.
        guard level >= 0 else { return nil }
        guard device.batteryState != .charging, device.batteryState != .full else { return nil }
        guard level < threshold else { return nil }
        return "Your battery is at \(Int(level * 100))%. A full class period can outlast it — plug in first if you can. "
            + "If it does die, everything up to the last few minutes is still saved."
    }
}
