import Foundation

/// The four things teachers bring to a coach — the top level of Ask & Practice.
/// Mirrors `web/src/lib/focusAreas.ts`, labels and sub-categories only; the
/// coaching instructions that make each area behave differently are server-side.
///
/// The six original behavior categories are Classroom Management's
/// sub-categories here, which is why nothing already saved needed relabelling.
struct FocusArea: Identifiable {
    let value: String
    let label: String
    /// One or two words, for the chip rows where the full label would wrap.
    let shortLabel: String
    /// What this area covers, in a teacher's words.
    let blurb: String
    /// One example of each mode, so the picker teaches what the area is for.
    let askExample: String
    let practiceExample: String
    let subCategories: [(label: String, value: String)]
    /// First-person openers for Ask — sent verbatim as the teacher's first turn.
    let askStarters: [String]
    /// Practice openers, each carrying the sub-category to generate from.
    let practiceStarters: [(label: String, category: String)]
    /// For the areas that overlap Communication Coach: a quick question or
    /// one rehearsed exchange belongs here, an actual drafted email or a whole
    /// prepared meeting belongs there. Nil for the other four.
    var handoffNote: String? = nil

    var id: String { value }
}

let focusAreas: [FocusArea] = [
    FocusArea(
        value: "teaching_and_learning",
        label: "Teaching and Learning",
        shortLabel: "Teaching",
        blurb: "Explaining, questioning, checking, pacing — and grading what comes back.",
        askExample: "I explain it well and half the room still does not have it.",
        practiceExample: "A student says plants get their food from the soil.",
        subCategories: [
            ("Explaining clearly", "explaining_clearly"),
            ("Checking for understanding", "checking_understanding"),
            ("Questioning & discussion", "questioning_discussion"),
            ("Pacing & chunking", "pacing_chunking"),
            ("Reaching every level", "reaching_every_level"),
            ("Student misconceptions", "misconceptions"),
            ("Planning & sequencing", "content_sequencing"),
            ("Feedback & grading", "feedback_and_grading"),
        ],
        askStarters: [
            "I explain something well and half the room still doesn't have it.",
            "The same three students answer every question I ask.",
            "There's one idea in this unit they get wrong every single year.",
            "I can't tell if my grades are fair or just consistent.",
        ],
        practiceStarters: [
            ("Half the class looks blank after two explanations", "checking_understanding"),
            ("A misconception that survives everything you try", "misconceptions"),
            ("A piece of work sitting between two rubric levels", "feedback_and_grading"),
        ]
    ),
    FocusArea(
        value: "classroom_management",
        label: "Classroom Management",
        shortLabel: "Classroom",
        blurb: "Behavior, routines, and getting the room with you.",
        askExample: "My class talks over directions.",
        practiceExample: "A student refuses to move to their assigned seat.",
        subCategories: [
            ("Responding to resistance", "defiance"),
            ("Engagement & participation", "disengagement"),
            ("Conflict & repair", "peer_conflict"),
            ("Interruptions & redirection", "disruption"),
            ("Routines & transitions", "transitions"),
            ("Devices & digital routines", "technology_misuse"),
        ],
        askStarters: [
            "My class talks over directions.",
            "A student pushed back in front of everyone and I froze.",
            "My routines work but they've gone stale.",
            "Getting started takes five minutes every single day.",
        ],
        practiceStarters: [
            ("A student is checked out and not participating", "disengagement"),
            ("A student pushes back when you ask them to do something", "defiance"),
            ("The class is slow to settle into a routine", "transitions"),
        ]
    ),
    FocusArea(
        value: "parent_communication",
        label: "Parent Communication",
        shortLabel: "Parents",
        blurb: "Hard emails, conferences, and hard news — said well.",
        askExample: "A parent email is accusatory and I do not know how to answer.",
        practiceExample: "A parent writes: \"That is not what I expect from her teacher.\"",
        subCategories: [
            ("A difficult email", "difficult_parent_email"),
            ("Conferences", "conferences"),
            ("Delivering hard news", "delivering_hard_news"),
            ("Building a partnership", "building_partnership"),
        ],
        askStarters: [
            "A parent email is stressing me out.",
            "I have to tell a parent something they won't want to hear.",
            "A conference is coming up and I'm dreading it.",
            "A parent only ever hears from me when something is wrong.",
        ],
        practiceStarters: [
            ("An accusatory parent email you have to answer", "difficult_parent_email"),
            ("A parent opens a conference by criticizing your class", "conferences"),
            ("A phone call about a student who is going to fail", "delivering_hard_news"),
        ],
        handoffNote: "Need the actual email drafted, or a conference prepared? That's Communication Coach, under More."
    ),
    FocusArea(
        value: "professionalism",
        label: "Professionalism",
        shortLabel: "Professional",
        blurb: "Co-teachers, admin, team time, paperwork, and growing as a teacher.",
        askExample: "A co-teacher keeps overriding me in front of students.",
        practiceExample: "Your co-teacher re-explains your task, mid-class.",
        subCategories: [
            ("Co-teaching", "co_teaching"),
            ("Disagreeing with a peer", "disagreeing_with_a_peer"),
            ("Talking with admin", "talking_with_admin"),
            ("Team & PLC time", "team_and_plc_time"),
            ("Mentoring & growth", "mentoring"),
            ("Records & deadlines", "records_and_deadlines"),
        ],
        askStarters: [
            "My co-teacher keeps overriding me in front of students.",
            "I need to raise a concern with someone more senior than me.",
            "Our team meetings never get to the work we planned.",
            "I'm behind on paperwork and it's starting to show.",
        ],
        practiceStarters: [
            ("A co-teacher contradicts you mid-lesson", "co_teaching"),
            ("Your department decides something you think is wrong for kids", "talking_with_admin"),
            ("A colleague writes off a student you share", "disagreeing_with_a_peer"),
        ],
        handoffNote: "Need to prepare a whole meeting, or draft the message first? That's Communication Coach, under More."
    ),
]

func findFocusArea(_ value: String?) -> FocusArea? {
    guard let value else { return nil }
    return focusAreas.first { $0.value == value }
}

func focusAreaLabel(_ value: String?) -> String? {
    findFocusArea(value)?.label
}

/// The area a sub-category belongs to — how rows saved before the area axis
/// existed still show the right area label.
func focusAreaForCategory(_ category: String?) -> FocusArea? {
    guard let category else { return nil }
    return focusAreas.first { $0.subCategories.contains { $0.value == category } }
}

/// The six areas as `ChipRow` items, with an "any" option first.
func focusAreaChips(anyLabel: String) -> [(label: String, value: String?)] {
    [(anyLabel, nil)] + focusAreas.map { ($0.shortLabel, Optional($0.value)) }
}

/// Sub-categories for one area, with an "any" option first, ready for `ChipRow`.
func subCategoryChips(_ focusArea: String?) -> [(label: String, value: String?)] {
    guard let area = findFocusArea(focusArea) else { return [] }
    return [("Any situation", nil)] + area.subCategories.map { ($0.label, Optional($0.value)) }
}
