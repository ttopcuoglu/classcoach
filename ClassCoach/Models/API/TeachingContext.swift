import Foundation

/// What Ask & Practice asks about the teacher's room. Mirrors
/// `web/src/lib/teachingContext.ts`.
///
/// Four fields, each narrowing the one before it: grade band, subject, and — at
/// 9-12, where a subject splits into genuinely different courses — the course
/// and the level it's taught at. A 9th-grade Algebra 1 inclusion section and an
/// AP Calculus section are not the same room.
/// K-5 used to be one band, and it was the weakest of the three: a kindergarten
/// room and a 5th grade room differ more than 9th and 10th do, and elementary
/// has no course to disambiguate it.
let gradeBands = ["K-2", "3-5", "6-8", "9-12"]

let gradeBandChips: [(label: String, value: String?)] = gradeBands.map { ("Grades \($0)", Optional($0)) }

/// AP used to sit in this list. It moved to `courseLevels`, where it belongs:
/// AP is how a course is taught, not what subject it is.
let subjects = ["ELA", "Math", "Science", "History/SS", "Technology", "Fine Arts"]

let otherSubjectLabel = "Other"

/// The courses a subject splits into, per band. Middle school and high school
/// both departmentalise, so both have real course names; K-2 and 3-5 do not,
/// because one teacher owns every subject and there is nothing to name.
///
/// This is what pins a room down above elementary: "Algebra 1" says more than a
/// grade number would — it is taken by 7th, 8th and 9th graders depending on
/// track — and it is the difference between a 6th grade topic and an 8th grade
/// one, which a band could never express.
let coursesByBandAndSubject: [String: [String: [String]]] = [
    "6-8": [
        "ELA": ["ELA 6", "ELA 7", "ELA 8"],
        "Math": ["Math 6", "Math 7", "Math 8", "Pre-Algebra", "Algebra 1"],
        "Science": ["Science 6", "Science 7", "Science 8", "Life Science", "Earth Science", "Physical Science"],
        "History/SS": ["World Geography", "Ancient History", "World History", "US History", "Civics"],
        "Technology": ["Computer Science", "STEM & Robotics", "Digital Media"],
        "Fine Arts": ["Art", "Band", "Chorus", "Theater"],
    ],
    "9-12": [
        "ELA": ["English 9", "English 10", "English 11", "English 12", "Creative Writing", "Journalism"],
        "Math": ["Algebra 1", "Geometry", "Algebra 2", "Pre-Calculus", "Calculus", "Statistics"],
        "Science": ["Biology", "Chemistry", "Physics", "Environmental Science", "Anatomy", "Computer Science"],
        "History/SS": ["World History", "US History", "Government", "Economics", "Psychology", "Geography"],
        "Technology": ["Computer Science", "Engineering", "Robotics", "Digital Media", "Business/IT"],
        "Fine Arts": ["Visual Art", "Music", "Theater", "Dance", "Film"],
    ],
]

func coursesFor(gradeBand: String, subject: String?) -> [String] {
    guard let subject else { return [] }
    return coursesByBandAndSubject[gradeBand]?[subject] ?? []
}

/// Middle school course naming varies far more by district than high school
/// does — "Math 7" here is "Course 2" there — so the list is a shortcut, not a
/// closed set. "Other" takes whatever the teacher actually calls it.
let otherCourseLabel = "Other"

/// How the section is tracked. Band-aware: AP is a College Board programme and
/// does not exist before high school, and honours tracks start around 6th grade.
///
/// Rigour only. Who is in the room is a separate question below — as one
/// single-select the two forced a false choice, since a co-taught Algebra 1 with
/// fourteen English learners is Regular AND inclusion AND ESL.
let courseLevelsByBand: [String: [String]] = [
    "K-2": ["Regular"],
    "3-5": ["Regular"],
    "6-8": ["Honors", "Regular"],
    "9-12": ["AP", "Honors", "Regular"],
]

func courseLevelsFor(_ gradeBand: String) -> [String] {
    courseLevelsByBand[gradeBand] ?? []
}

/// One line of plain English per level, so a teacher knows what picking it changes.
let courseLevelBlurb: [String: String] = [
    "AP": "Fixed syllabus, an exam date, real pace pressure.",
    "Honors": "Capable and compliant — depth matters more than more work.",
    "Regular": "The widest mix of readiness in the building.",
]

/// Who is in the room. Multi-select, and kept apart from the level: inclusion is
/// a disability framework (IEPs, 504s, a co-teacher) while English learners sit
/// under a different law and need different moves. Treating an English learner
/// as though they had a learning disability is a classic harmful error, and one
/// shared chip would have taught the coach to make it.
let classMakeup: [(value: String, label: String)] = [
    ("inclusion", "Co-taught / inclusion"),
    ("english_learners", "English learners"),
]

let classMakeupBlurb: [String: String] = [
    "inclusion": "IEPs and 504s, accommodations, usually a co-teacher in the room.",
    "english_learners": "Learning the content and the language at once.",
]

/// Best guess at a band from the free-text `gradeLevels` on a profile.
func bandFromProfile(_ text: String?) -> String {
    let lower = (text ?? "").lowercased()
    if lower.range(of: #"\b(9|10|11|12)\b|9-12|high ?school"#, options: .regularExpression) != nil { return "9-12" }
    if lower.range(of: #"\bk\b|kindergarten|\b[12](st|nd)?\b|k-2|primary"#, options: .regularExpression) != nil { return "K-2" }
    if lower.range(of: #"\b[3-5](rd|th)?\b|3-5|elementary|k-5"#, options: .regularExpression) != nil { return "3-5" }
    return "6-8"
}

/// Map a teacher's free-text profile subject onto the offered list, so the
/// default is a real chip rather than an unmatched value.
func subjectFromProfile(_ text: String?) -> String? {
    guard let first = text?.split(separator: ",").first?.trimmingCharacters(in: .whitespaces), !first.isEmpty else {
        return nil
    }
    let lower = first.lowercased()
    if let exact = subjects.first(where: { $0.lowercased() == lower }) { return exact }
    if lower.range(of: "english|language arts|reading|literature|writing", options: .regularExpression) != nil { return "ELA" }
    if lower.range(of: "math|algebra|geometry|calculus|statistic", options: .regularExpression) != nil { return "Math" }
    if lower.range(of: "science|biology|chemistry|physics|anatomy", options: .regularExpression) != nil { return "Science" }
    if lower.range(of: "history|social studies|civics|government|geography|economics|psychology", options: .regularExpression) != nil { return "History/SS" }
    if lower.range(of: "tech|computer|coding|engineering|robotics", options: .regularExpression) != nil { return "Technology" }
    if lower.range(of: "art|music|theat|drama|band|chorus|dance|film", options: .regularExpression) != nil { return "Fine Arts" }
    // Anything else is kept verbatim — it lands in the "Other" field.
    return first
}
