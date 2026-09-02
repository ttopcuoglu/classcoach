import SwiftUI

/// Mirrors `web/src/pages/CoachChat.tsx` — a thin pill-switcher combining
/// Try It Out ("Practice") and Ask an Expert ("Ask") under one screen,
/// matching the "Ask & Practice" card on web's home page. The standalone
/// `TryItOutView`/`AskExpertView` tabs keep working independently; this is
/// just the same content reused behind a single combined entry point.
struct AskAndPracticeView: View {
    @State private var tab = "practice"

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                ChipRow(items: [("Ask", "ask"), ("Practice", "practice")], selection: tab) {
                    tab = $0 ?? "practice"
                }
                .padding(.horizontal)
                .padding(.top, 12)

                if tab == "practice" {
                    TryItOutContent()
                } else {
                    AskExpertContent()
                }
            }
            .navigationTitle("Ask & Practice")
        }
    }
}

#Preview {
    AskAndPracticeView()
}
