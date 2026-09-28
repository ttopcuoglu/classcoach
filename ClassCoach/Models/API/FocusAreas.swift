import Foundation

/// The six things teachers bring to a coach — the top level of Ask & Practice.
/// Mirrors `web/src/lib/focusAreas.ts`, labels and sub-categories only; the
/// coaching instructions that make each area behave differently are server-side.
///
/// The six original behavior categories are Classroom Management's
/// sub-categories here, which is why nothing already saved needed relabelling.
struct FocusArea: Identifiable {
    let value: String
    let label: String
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
    /// For the two areas that overlap Communication Coach: a quick question or
    /// one rehearsed exchange belongs here, an actual drafted email or a whole
    /// prepared meeting belongs there. Nil for the other four.
    var handoffNote: String? = nil

    var id: String { value }
}

let focusAreas: [FocusArea] = [
    FocusArea(
        value: "delivery_of_instruction",
        label: "Delivery of Instruction",
        blurb: "How you explain, question, check, and pace.",
        askExample: "My explanations run long and I lose half the room.",
        practiceExample: "Half the class still looks blank after two explanations.",
        subCategories: [
            ("Explaining clearly", "explaining_clearly"),
            ("Checking for understanding", "checking_understanding"),
            ("Questioning & discussion", "questioning_discussion"),
            ("Pacing & chunking", "pacing_chunking"),
            ("Openings & hooks", "openings_hooks"),
            ("Reaching every level", "reaching_every_level"),
        ],
        askStarters: [
            "I explain something well and half the room still doesn't have it.",
            "The same three students answer every question I ask.",
            "I always run out of time before the part that matters.",
        ],
        practiceStarters: [
            ("Half the class looks blank after two explanations", "checking_understanding"),
            ("A discussion where only three students ever talk", "questioning_discussion"),
            ("A good student question that would derail the lesson", "explaining_clearly"),
        ]
    ),
    FocusArea(
        value: "content_pedagogy",
        label: "Teaching Specific Content",
        blurb: "How to teach this topic so it lands.",
        askExample: "How do I teach mitosis so it is not just vocabulary?",
        practiceExample: "A student says plants get their food from the soil.",
        subCategories: [
            ("Student misconceptions", "misconceptions"),
            ("Building an explanation", "building_explanation"),
            ("Examples & analogies", "examples_analogies"),
            ("Sequencing the content", "content_sequencing"),
            ("Academic vocabulary", "academic_vocabulary"),
        ],
        askStarters: [
            "My students can do the procedure but can't say why it works.",
            "There's one idea in this unit they get wrong every single year.",
            "I need a better way into this topic than the one I've been using.",
        ],
        practiceStarters: [
            ("A misconception that survives everything you try", "misconceptions"),
            ("A topic you have to build an explanation for from scratch", "building_explanation"),
            ("Choosing between two analogies for a hard idea", "examples_analogies"),
        ]
    ),
    FocusArea(
        value: "classroom_management",
        label: "Classroom Management",
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
        ],
        practiceStarters: [
            ("A student is checked out and not participating", "disengagement"),
            ("A student pushes back when you ask them to do something", "defiance"),
            ("The class is slow to settle into a routine", "transitions"),
        ]
    ),
    FocusArea(
        value: "grading",
        label: "Grading & Feedback",
        blurb: "Fair grades, feedback that lands, a load you can carry.",
        askExample: "How do I grade fairly when effort and mastery disagree?",
        practiceExample: "Strong tests, four missing assignments, a 71 in the book.",
        subCategories: [
            ("Feedback that lands", "feedback_that_lands"),
            ("Rubrics & consistency", "rubrics_consistency"),
            ("Grade disputes", "grade_disputes"),
            ("Late & missing work", "late_and_missing"),
            ("Grading workload", "grading_workload"),
        ],
        askStarters: [
            "I can't tell if my grades are fair or just consistent.",
            "A student is contesting a grade and I'm not sure I can defend it.",
            "I spend every Sunday grading and I don't think anyone reads it.",
        ],
        practiceStarters: [
            ("A piece of work sitting between two rubric levels", "rubrics_consistency"),
            ("Strong tests, missing homework, a failing average", "late_and_missing"),
            ("A student asks why they got a lower grade than a friend", "grade_disputes"),
        ]
    ),
    FocusArea(
        value: "parent_communication",
        label: "Parent Communication",
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
        ],
        practiceStarters: [
            ("An accusatory parent email you have to answer", "difficult_parent_email"),
            ("A parent opens a conference by criticizing your class", "conferences"),
            ("A phone call about a student who is going to fail", "delivering_hard_news"),
        ],
        handoffNote: "Need the actual email drafted, or a conference prepared? That's Communication Coach, under More."
    ),
    FocusArea(
        value: "colleagues",
        label: "Colleagues & Team",
        blurb: "Co-teachers, meetings, admin asks, honest disagreement.",
        askExample: "A co-teacher keeps overriding me in front of students.",
        practiceExample: "Your co-teacher re-explains your task, mid-class.",
        subCategories: [
            ("Co-teaching", "co_teaching"),
            ("Disagreeing with a peer", "disagreeing_with_a_peer"),
            ("Talking with admin", "talking_with_admin"),
            ("Team & PLC time", "team_and_plc_time"),
            ("Mentoring", "mentoring"),
        ],
        askStarters: [
            "My co-teacher keeps overriding me in front of students.",
            "I need to raise a concern with someone more senior than me.",
            "Our team meetings never get to the work we planned.",
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

/// Sub-categories for one area, with an "any" option first, ready for `ChipRow`.
func subCategoryChips(_ focusArea: String?) -> [(label: String, value: String?)] {
    guard let area = findFocusArea(focusArea) else { return [] }
    return [("Any situation", nil)] + area.subCategories.map { ($0.label, Optional($0.value)) }
}
