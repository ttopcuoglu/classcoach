import Foundation

// The example questions under Ask. Mirrors `web/src/lib/starters.ts` — same
// bank, same matching rule.
//
// Practice has no equivalent: there the coach writes the scenario, so a teacher
// never has to phrase anything, and the Situation chips already steer what they
// get.
//
// Each starter can declare which rooms it belongs to. The picker takes the most
// specific matches first and tops up with general ones, so the list is always
// full but the top of it is always about the room on screen.

struct Starter {
    /// May contain {course} — the course if one is set, else the subject, else a
    /// neutral fallback. Written so it reads naturally in all three cases.
    let text: String
    var bands: [String]? = nil
    var subjects: [String]? = nil
    var levels: [String]? = nil
}

/// A course name drops into a sentence as written ("my Algebra 2 students"); a
/// bare subject label does not ("the Science vocabulary"), so subjects get a
/// spoken form. Proper nouns keep their capital.
private let subjectInASentence = [
    "ELA": "English",
    "Math": "math",
    "Science": "science",
    "History/SS": "history",
    "Technology": "tech",
    "Fine Arts": "art",
]

/// How many of a starter's declared constraints the room satisfies. Nil when the
/// room contradicts one, which disqualifies it entirely.
private func specificity(_ starter: Starter, _ room: TeachingContextValue, _ area: String?) -> Int? {
    var score = 0
    if let bands = starter.bands {
        if !bands.contains(room.gradeBand) { return nil }
        score += 1
    }
    // Subject and level are only asked for under Teaching and Learning, so a
    // starter that depends on them cannot apply anywhere else.
    if let subjects = starter.subjects {
        guard area == teachingAndLearning, let s = room.subject, subjects.contains(s) else { return nil }
        score += 1
    }
    if let levels = starter.levels {
        guard area == teachingAndLearning, let l = room.courseLevel, levels.contains(l) else { return nil }
        score += 1
    }
    return score
}

private func fill(_ text: String, _ room: TeachingContextValue, _ area: String?) -> String {
    guard area == teachingAndLearning else { return text.replacingOccurrences(of: "{course}", with: "this unit") }
    let named = room.course ?? room.subject.map { subjectInASentence[$0] ?? $0 }
    return text.replacingOccurrences(of: "{course}", with: named ?? "this unit")
}

/// Most specific first, topped up with general ones so the list is always full.
func pickStarters(
    _ all: [Starter],
    room: TeachingContextValue,
    area: String?,
    count: Int
) -> [Starter] {
    let scored = all
        .compactMap { s -> (Starter, Int)? in specificity(s, room, area).map { (s, $0) } }
        .enumerated()
        .sorted { a, b in
            // Ties keep their written order — the general starters are ordered
            // by how often teachers actually bring them.
            a.element.1 == b.element.1 ? a.offset < b.offset : a.element.1 > b.element.1
        }
        .map(\.element.0)

    var seen = Set<String>()
    var out: [Starter] = []
    for starter in scored {
        let text = fill(starter.text, room, area)
        if seen.contains(text) { continue }
        seen.insert(text)
        out.append(Starter(text: text, bands: starter.bands,
                           subjects: starter.subjects, levels: starter.levels))
        if out.count == count { break }
    }
    return out
}

let askStartersByArea: [String: [Starter]] = [
    "teaching_and_learning": [
        Starter(text: "I can't cover the syllabus and still go deep enough.", levels: ["AP"]),
        Starter(text: "My strongest students coast until the exam panics them.", levels: ["AP"]),
        Starter(text: "They do everything I ask and I still am not sure they are learning.", levels: ["Honors"]),
        Starter(text: "The range of readiness in one room is about four years wide.", levels: ["Regular"]),
        Starter(text: "My co-teacher and I are not really splitting the teaching.", levels: ["Inclusion"]),
        Starter(text: "The accommodations are in place and the work is still out of reach.", levels: ["Inclusion"]),
        Starter(text: "My {course} students can do the procedure but cannot say why it works.", subjects: ["Math"]),
        Starter(text: "They freeze the moment a problem does not look like my example.", subjects: ["Math"]),
        Starter(text: "They can summarize what they read but they cannot analyze it.", subjects: ["ELA"]),
        Starter(text: "My discussions stay at plot level and never get past it.", subjects: ["ELA"]),
        Starter(text: "They memorize the {course} vocabulary and miss the concept underneath.", subjects: ["Science"]),
        Starter(text: "My labs are fun and I am not convinced anyone learns from them.", subjects: ["Science"]),
        Starter(text: "They treat every source as equally trustworthy.", subjects: ["History/SS"]),
        Starter(text: "It comes out as a list of dates instead of causes.", subjects: ["History/SS"]),
        Starter(text: "They can follow the tutorial and cannot do it on their own.", subjects: ["Technology"]),
        Starter(text: "Half the room is years ahead and half has never touched this.", subjects: ["Technology"]),
        Starter(text: "I cannot get them past \"I am just not good at this.\"", subjects: ["Fine Arts"]),
        Starter(text: "Critique turns into \"it is nice\" and stops there.", subjects: ["Fine Arts"]),
        Starter(text: "They can do it with me and not on their own.", bands: ["K-5"]),
        Starter(text: "They finish at wildly different times and I lose the room.", bands: ["K-5"]),
        Starter(text: "They will do the work but they will not explain their thinking.", bands: ["6-8"]),
        Starter(text: "They can pass my test and still not understand it.", bands: ["9-12"]),
        Starter(text: "I explain something well and half the room still doesn't have it."),
        Starter(text: "The same three students answer every question I ask."),
        Starter(text: "I can't tell if my grades are fair or just consistent."),
        Starter(text: "I run out of time before the part that actually matters."),
    ],
    "classroom_management": [
        Starter(text: "Lining up takes five minutes every single time.", bands: ["K-5"]),
        Starter(text: "Two of mine cannot sit anywhere near each other.", bands: ["K-5"]),
        Starter(text: "Tattling has taken over my whole morning.", bands: ["K-5"]),
        Starter(text: "A student pushed back in front of everyone and I froze.", bands: ["6-8"]),
        Starter(text: "The side conversations start the second I stop talking.", bands: ["6-8"]),
        Starter(text: "Phones keep coming out no matter what I say.", bands: ["6-8", "9-12"]),
        Starter(text: "Half of them walk in late and it is contagious.", bands: ["9-12"]),
        Starter(text: "A student challenged me in front of the class and had a point.", bands: ["9-12"]),
        Starter(text: "They are perfectly compliant and completely checked out.", bands: ["9-12"]),
        Starter(text: "My class talks over directions."),
        Starter(text: "My routines work but they've gone stale."),
        Starter(text: "Getting started takes five minutes every single day."),
    ],
    "parent_communication": [
        Starter(text: "A parent wants a daily report and I cannot sustain it.", bands: ["K-5"]),
        Starter(text: "A parent is upset about something at recess that I did not see.", bands: ["K-5"]),
        Starter(text: "A parent says their child is being singled out.", bands: ["6-8"]),
        Starter(text: "A parent only ever hears from me when something is wrong.", bands: ["6-8"]),
        Starter(text: "A parent is contesting a grade that affects a GPA.", bands: ["9-12"]),
        Starter(text: "A parent emailed my principal before they emailed me.", bands: ["9-12"]),
        Starter(text: "A parent email is stressing me out."),
        Starter(text: "I have to tell a parent something they won't want to hear."),
        Starter(text: "A conference is coming up and I'm dreading it."),
    ],
    "professionalism": [
        Starter(text: "My grade-level team does everything together and I want to try something else.", bands: ["K-5"]),
        Starter(text: "My department wants a common assessment I do not think fits my kids.", bands: ["9-12"]),
        Starter(text: "My co-teacher keeps overriding me in front of students."),
        Starter(text: "I need to raise a concern with someone more senior than me."),
        Starter(text: "Our team meetings never get to the work we planned."),
        Starter(text: "I'm behind on paperwork and it's starting to show."),
    ],
]

/// Shown when no section is picked — the coach infers the area from the text,
/// so these span all four and still narrow by grade band.
let generalAskStarters: [Starter] = [
        Starter(text: "Lining up takes five minutes every single time.", bands: ["K-5"]),
        Starter(text: "They can do it with me and not on their own.", bands: ["K-5"]),
        Starter(text: "The side conversations start the second I stop talking.", bands: ["6-8"]),
        Starter(text: "They will do the work but they will not explain their thinking.", bands: ["6-8"]),
        Starter(text: "They are perfectly compliant and completely checked out.", bands: ["9-12"]),
        Starter(text: "A parent is contesting a grade that affects a GPA.", bands: ["9-12"]),
        Starter(text: "My class talks over directions."),
        Starter(text: "I explain something well and half the room still doesn't have it."),
        Starter(text: "A parent email is stressing me out."),
        Starter(text: "My co-teacher keeps overriding me in front of students."),
]
