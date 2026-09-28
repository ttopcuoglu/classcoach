import SwiftUI

/// Mirrors `web/src/pages/CoachChat.tsx` — the Ask & Practice shell: a focus
/// area picker over a pill-switcher combining Try It Out ("Practice") and Ask
/// an Expert ("Ask"). The standalone `TryItOutView`/`AskExpertView` tabs keep
/// working independently; this is the same content behind one entry point.
///
/// The area lives here rather than in either tab, because it's the one choice
/// that applies to both: the same teacher wanting help with grading may want to
/// ask about it or rehearse a call on it, and switching modes shouldn't lose it.
/// It stays optional — a teacher who types "my class talks over directions"
/// should never have to classify it first; the coach infers the area from the
/// text. The picker is for Practice, where the coach has to decide what to hand
/// them, and for narrowing Ask when the teacher already knows.
struct AskAndPracticeView: View {
    @State private var tab = "ask"
    @State private var focusArea: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                areaPicker

                ChipRow(items: [("Ask", "ask"), ("Practice", "practice")], selection: tab) {
                    tab = $0 ?? "ask"
                }
                .padding(.horizontal)

                if tab == "practice" {
                    TryItOutContent(focusArea: focusArea)
                } else {
                    AskExpertContent(focusArea: focusArea)
                }
            }
            .background(AppTheme.background)
            .navigationTitle("Ask & Practice")
        }
    }

    @ViewBuilder
    private var areaPicker: some View {
        if let area = findFocusArea(focusArea) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(area.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.primary)
                        Text(area.blurb)
                            .font(.footnote)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    Spacer()
                    Button("Change") { withAnimation { focusArea = nil } }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.terracotta600)
                }
                // Parent and colleague work overlaps Communication Coach on
                // purpose: a quick question or one rehearsed exchange belongs
                // here, an actual drafted email or a prepared meeting there.
                if let note = area.handoffNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
            .padding(.horizontal)
            .padding(.top, 12)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("What would you like to work on?")
                    .font(.headline)
                    .foregroundStyle(AppTheme.primary)
                Text("Or skip this and start typing — your coach will work out which one it is.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(focusAreas.enumerated()), id: \.element.id) { index, area in
                            Button {
                                withAnimation { focusArea = area.value }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(area.label)
                                        .font(.subheadline.weight(.bold))
                                        .foregroundStyle(AppTheme.forest)
                                    Text(area.blurb)
                                        .font(.caption)
                                        .foregroundStyle(AppTheme.textSecondary)
                                    Text("“\(tab == "practice" ? area.practiceExample : area.askExample)”")
                                        .font(.caption.italic())
                                        .foregroundStyle(AppTheme.textPrimary)
                                }
                                .multilineTextAlignment(.leading)
                                .frame(width: 210, alignment: .leading)
                                .padding(14)
                                .background(
                                    [AppTheme.peachTint, AppTheme.goldTint, AppTheme.mintTint][index % 3],
                                    in: RoundedRectangle(cornerRadius: 16)
                                )
                            }
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.horizontal, -16)
            }
            .padding(.horizontal)
            .padding(.top, 12)
        }
    }
}

#Preview {
    AskAndPracticeView()
        .environmentObject(AuthManager.shared)
}
