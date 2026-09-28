import Foundation

/// Ask & Practice asks for a single grade, not a three-year band: a 6th-grade
/// scenario and an 8th-grade one are not the same scenario. Mirrors
/// `web/src/lib/gradeLevels.ts` — the server derives the band from this.
let gradeLevels = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]

/// "K" -> "Kindergarten", "3" -> "3rd grade". Used where a bare number would
/// read as a count rather than a grade.
func gradeLevelLabel(_ level: String) -> String {
    if level == "K" { return "Kindergarten" }
    guard let n = Int(level) else { return level }
    let suffix: String
    switch (n % 10, n) {
    case (1, let v) where v != 11: suffix = "st"
    case (2, let v) where v != 12: suffix = "nd"
    case (3, let v) where v != 13: suffix = "rd"
    default: suffix = "th"
    }
    return "\(n)\(suffix) grade"
}

/// Grade chips for `ChipRow`.
let gradeLevelChips: [(label: String, value: String?)] = gradeLevels.map { ($0, Optional($0)) }

/// The subjects Ask & Practice offers. "Other" reveals a free-text field, and
/// what gets stored is what the teacher typed — never the literal "Other".
let subjects = ["ELA", "Math", "Science", "History/SS", "Technology", "AP", "Fine Arts"]

let otherSubjectLabel = "Other"

/// Best guess at a grade from the free-text `gradeLevels` on a profile
/// ("7th,8th" -> "7"). Falls back to 7th, the app's mid-point.
func gradeFromProfile(_ text: String?) -> String {
    let lower = (text ?? "").lowercased()
    if lower.range(of: #"\bk\b|kinder"#, options: .regularExpression) != nil { return "K" }
    if let match = lower.range(of: #"\b(1[0-2]|[1-9])\b"#, options: .regularExpression) {
        return String(lower[match])
    }
    if lower.contains("high school") { return "10" }
    if lower.contains("elementary") { return "3" }
    return "7"
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
    if lower.range(of: "science|biology|chemistry|physics", options: .regularExpression) != nil { return "Science" }
    if lower.range(of: "history|social studies|civics|government|geography|economics", options: .regularExpression) != nil { return "History/SS" }
    if lower.range(of: "tech|computer|coding|engineering|robotics", options: .regularExpression) != nil { return "Technology" }
    if lower.range(of: "art|music|theat|drama|band|chorus|dance", options: .regularExpression) != nil { return "Fine Arts" }
    // Anything else is kept verbatim — it lands in the "Other" field.
    return first
}
