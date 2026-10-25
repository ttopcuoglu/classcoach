import Foundation

/// Mirrors `web/src/lib/categories.ts` — the flat list of every sub-category
/// across all six focus areas (see FocusAreas.swift), so `categoryLabel` can
/// name any stored category without the caller knowing which area it came from.
/// The six original behavior values are Classroom Management's sub-categories.
let scenarioCategories: [(label: String, value: String?)] =
    [("All", nil)] + focusAreas.flatMap { area in
        area.subCategories.map { (label: $0.label, value: Optional($0.value)) }
    }

/// What a teacher's own situation from Practice's "Something I'm facing"
/// carries until the coach has read it and assigned a real category.
let ownSituationCategory = "own_situation"

func categoryLabel(_ value: String) -> String {
    if value == ownSituationCategory { return "Your situation" }
    return scenarioCategories.first { $0.value == value }?.label ?? value
}
