import SwiftUI

/// Mirrors `web/src/pages/CoachChat.tsx` — the Ask & Practice shell.
///
/// The shell owns the focus area and nothing else. It used to render a
/// horizontal deck of six area cards above both tabs, which put the picker
/// between a teacher and the box where they type. The area is now picked where
/// it actually does work, and that differs by tab: on Practice it decides what
/// scenario you get handed, so it's the primary control there; on Ask the coach
/// infers it from what you type, so it's only a filter on the starter
/// questions. Either tab's pick lives here, so switching tabs keeps it.
struct AskAndPracticeView: View {
    @State private var tab = "ask"
    @State private var focusArea: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                ChipRow(items: [("Ask", "ask"), ("Practice", "practice")], selection: tab) {
                    tab = $0 ?? "ask"
                }
                .padding(.horizontal)
                .padding(.top, 12)

                // Parent and colleague work overlaps Communication Coach on
                // purpose: a quick question or one rehearsed exchange belongs
                // here, an actual drafted email or a prepared meeting there.
                if let note = findFocusArea(focusArea)?.handoffNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal)
                }

                if tab == "practice" {
                    TryItOutContent(focusArea: focusArea) { focusArea = $0 }
                } else {
                    AskExpertContent(focusArea: focusArea) { focusArea = $0 }
                }
            }
            .background(AppTheme.background)
            .navigationTitle("Ask & Practice")
        }
    }
}

#Preview {
    AskAndPracticeView()
        .environmentObject(AuthManager.shared)
}
