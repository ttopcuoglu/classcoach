import Foundation

// A nudge for a teacher facing a blank box under a dense scenario. Mirrors
// `web/src/lib/practiceHints.ts`.
//
// Every hint is a QUESTION, never an answer or an option to pick. The value of
// Practice is that the teacher composes a response themselves — recognising a
// good answer and producing one under pressure are different skills, and only
// the second one happens at 10:15 on a Tuesday. A list of candidate responses
// would also quietly corrupt the private rating that steers future practice,
// since it would then be scoring recognition rather than the teacher's instinct.
//
// Offered to everyone, not just newer teachers: expertise is domain-specific,
// and a hint only novices can see is a label.

/// Keyed by course level, which only Teaching and Learning asks for — the
/// sharpest hints available, since the teacher has told us the most.
private let hintsByLevel: [String: [String]] = [
    "Inclusion": [
        "What is your co-teacher doing while you handle this?",
        "Is the barrier the thinking itself, or how the task is presented?",
    ],
    "AP": [
        "What would you cut to make room for this, and what does cutting it cost?",
        "Which students are holding on rather than keeping up?",
    ],
    "Honors": ["Are they stuck, or are they finished and unchallenged?"],
    "Regular": ["Who in this room is furthest from the goal, and what do they need first?"],
]

private let hintsByArea: [String: [String]] = [
    "teaching_and_learning": [
        "What does this student already believe that is getting in the way?",
        "What would you need to see or hear to know they actually have it?",
        "What is the smallest change you could make to how you explain it?",
    ],
    "classroom_management": [
        "What might this student be getting out of the behaviour?",
        "What is the smallest response that keeps the lesson moving?",
        "Does this need handling now, or after class?",
    ],
    "parent_communication": [
        "What does this parent most need to hear first?",
        "What can you say that is specific and true about their child?",
        "What do you want to be different after this exchange?",
    ],
    "professionalism": [
        "What do you and this person both want for the student?",
        "What might you be missing about why they did it that way?",
        "What is the specific request you would make, rather than the complaint?",
    ],
]

private let generalHints = [
    "What is the first thing you would say out loud?",
    "What do you want to be different five minutes from now?",
]

/// Most specific first — level, then section, then general — so the first hint a
/// teacher sees is the one that knows the most about their room.
///
/// The level is only honoured under Teaching and Learning, the one section that
/// asks for it. A teacher who picks Inclusion there and switches to Classroom
/// Management still carries the value in state, hidden; the routes already
/// discard it in that case, and the hints have to agree.
func hintsFor(focusArea: String?, courseLevel: String?) -> [String] {
    let usableLevel = focusArea == teachingAndLearning ? courseLevel : nil
    let level = usableLevel.flatMap { hintsByLevel[$0] } ?? []
    let area = focusArea.flatMap { hintsByArea[$0] } ?? []
    return level + area + generalHints
}
