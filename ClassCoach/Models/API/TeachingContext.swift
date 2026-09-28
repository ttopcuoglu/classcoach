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

/// The courses a subject splits into at 9-12. Offered only for that band —
/// "Algebra 2" means something specific in a high school schedule, while a 4th
/// grade teacher teaches math, full stop.
let coursesBySubject: [String: [String]] = [
    "ELA": ["English 9", "English 10", "English 11", "English 12", "Creative Writing", "Journalism"],
    "Math": ["Algebra 1", "Geometry", "Algebra 2", "Pre-Calculus", "Calculus", "Statistics"],
    "Science": ["Biology", "Chemistry", "Physics", "Environmental Science", "Anatomy", "Computer Science"],
    "History/SS": ["World History", "US History", "Government", "Economics", "Psychology", "Geography"],
    "Technology": ["Computer Science", "Engineering", "Robotics", "Digital Media", "Business/IT"],
    "Fine Arts": ["Visual Art", "Music", "Theater", "Dance", "Film"],
]

func coursesFor(gradeBand: String, subject: String?) -> [String] {
    guard gradeBand == "9-12", let subject else { return [] }
    return coursesBySubject[subject] ?? []
}

/// How the section is taught. Distinct from the course: the same Algebra 2 runs
/// as an honors section and as an inclusion section, and what a teacher needs
/// from a coach differs sharply between them.
let courseLevels = ["AP", "Honors", "Regular", "Inclusion"]

/// One line of plain English per level, so a teacher knows what picking it changes.
let courseLevelBlurb: [String: String] = [
    "AP": "Fixed syllabus, an exam date, real pace pressure.",
    "Honors": "Capable and compliant — depth matters more than more work.",
    "Regular": "The widest mix of readiness in the building.",
    "Inclusion": "IEPs and 504s, accommodations, usually a co-teacher in the room.",
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
