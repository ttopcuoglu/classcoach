import SwiftUI

private struct Phrase {
    let text: String
    let source: String
}

/// Mirrors `web/src/pages/CheatSheet.tsx` — go-to phrases and tips,
/// auto-built from saved attempts/debriefs, no new data of its own.
struct CheatSheetView: View {
    @State private var attempts: [ScenarioAttempt] = []
    @State private var debriefs: [Debrief] = []
    @State private var loading = true

    private var byCategory: [(category: String, phrases: [Phrase])] {
        var map: [String: [Phrase]] = [:]
        var order: [String] = []
        func append(_ category: String, _ phrase: Phrase) {
            if map[category] == nil { order.append(category) }
            map[category, default: []].append(phrase)
        }
        for attempt in attempts {
            guard let modelResponse = attempt.modelResponse else { continue }
            append(attempt.scenario.category, Phrase(text: modelResponse, source: attempt.scenario.text))
        }
        for debrief in debriefs {
            guard let followUp = debrief.followUp, let category = debrief.category else { continue }
            append(category, Phrase(text: followUp, source: debrief.incidentText))
        }
        return scenarioCategories.compactMap { entry in
            guard let value = entry.value, let phrases = map[value] else { return nil }
            return (entry.label, phrases)
        }
    }

    private var generalTips: [Debrief] {
        debriefs.filter { $0.category == nil && ($0.followUp != nil || $0.feedback != nil) }
    }

    private var isEmpty: Bool { !loading && byCategory.isEmpty && generalTips.isEmpty }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Go-to phrases and tips, auto-built from what you've saved.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)

                if loading {
                    Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else if isEmpty {
                    Text("Save a scenario response or an answer from Ask, and it'll show up here.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding()
                        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                } else {
                    ForEach(byCategory, id: \.category) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(group.category.uppercased())
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.textSecondary)
                            ForEach(Array(group.phrases.enumerated()), id: \.offset) { _, phrase in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(phrase.text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                                    Text("For: \(phrase.source)").font(.caption).foregroundStyle(AppTheme.textSecondary)
                                }
                                .padding(12)
                                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }

                    if !generalTips.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("GENERAL TIPS").font(.caption.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                            ForEach(generalTips) { debrief in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(debrief.incidentText).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                                    Text(debrief.followUp ?? debrief.feedback ?? "")
                                        .font(.subheadline)
                                        .foregroundStyle(AppTheme.textSecondary)
                                }
                                .padding(12)
                                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Your Cheat Sheet")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            async let savedAttempts = CheatSheetService.getSavedAttempts()
            async let savedDebriefs = CheatSheetService.getSavedDebriefs()
            attempts = (try? await savedAttempts) ?? []
            debriefs = (try? await savedDebriefs) ?? []
            loading = false
        }
    }
}

#Preview {
    NavigationStack { CheatSheetView() }
}
