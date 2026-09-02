import Foundation

/// Mirrors `web/src/lib/categories.ts` — shared by Try It Out and
/// Ask/Debrief, both of which tag content with the same category strings.
let scenarioCategories: [(label: String, value: String?)] = [
    ("All", nil),
    ("Defiance", "defiance"),
    ("Disengagement", "disengagement"),
    ("Peer conflict", "peer_conflict"),
    ("Disruption", "disruption"),
    ("Transitions", "transitions"),
    ("Technology misuse", "technology_misuse"),
]

func categoryLabel(_ value: String) -> String {
    scenarioCategories.first { $0.value == value }?.label ?? value
}
