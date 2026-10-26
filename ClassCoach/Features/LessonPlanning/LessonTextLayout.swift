import SwiftUI

// How a school-format section's text is laid out ON SCREEN. Mirrors
// `web/src/lib/lessonTextLayout.ts` and `LessonText.tsx`. A section is one
// stored string ("Explore: Comparing specimens (10 min)\nTeacher: …\nStudents:
// …"), which used to be printed as one dense paragraph per activity. This
// reads the structure that is already in the words — activity titles with
// their minutes, I Do / We Do / You Do and the other named lesson parts,
// Teacher / Students lines, a short lead-in before a colon — so the screen can
// show it. Copy, Word and PDF still use the text as written: nothing here
// changes what leaves the screen.

enum LessonRole { case teacher, students }
/// Gradual release, when the activity is one of its three moves.
enum LessonPhase { case i, we, you }

/// A paragraph may open with a short lead ("During the observation step,",
/// "Exit ticket:") that is worth setting apart; everything else is a block.
enum LeadBlock {
    case block(CopyBlock)
    case lead(String, String)
}

struct LessonTextRow {
    let role: LessonRole
    let label: String
    let blocks: [CopyBlock]
}

struct LessonTextActivity {
    var title: String?
    var minutes: String?
    var phase: LessonPhase?
    var rows: [LessonTextRow] = []
    var notes: [LeadBlock] = []
}

enum LessonTextPart {
    case activity(LessonTextActivity)
    case prose([LeadBlock])
}

// MARK: - Reading the text

private func regex(_ pattern: String, _ options: NSRegularExpression.Options = [.caseInsensitive]) -> NSRegularExpression {
    try! NSRegularExpression(pattern: pattern, options: options)
}

/// The capture groups of the first match, nil where a group did not take part.
private func groups(_ re: NSRegularExpression, _ text: String) -> [String?]? {
    guard let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
    return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: text).map { String(text[$0]) } }
}

private let minutesPattern = #"(\d+(?:\s*[-–]\s*\d+)?)\s*(?:min|mins|minutes)\.?"#
private let headingPatterns = [
    regex(#"^(.{2,110}?)\s*[(\[]\s*"# + minutesPattern + #"\s*[)\]]\s*:?\s*$"#),
    regex(#"^(.{2,110}?)\s*[—–-]\s*"# + minutesPattern + #"\s*$"#),
    regex(#"^(.{2,110}?)\s*[:|,]\s*"# + minutesPattern + #"\s*$"#),
]

// Only who does what. Any other label (Support:, Stretch:, Expected:) is a
// lead-in on its own line, set bold by splitLead. "T:", "S:" and "Ss:" are the
// shorthand many plans use; only in capitals, so a stray "s:" is not a role.
private let rolePattern = regex(#"^(teacher(?: prompt| says| does| moves| actions?| will| role)?|students?(?: task| do| does| actions?| will| role)?|T|S|Ss)\s*:\s*(.*)$"#)
private let shortRolePattern = regex(#"^(T|S|Ss)\s*:"#, [])

private func matchRole(_ line: String) -> (label: String, rest: String)? {
    guard let g = groups(rolePattern, line), let label = g[1] else { return nil }
    if label.count <= 2 && groups(shortRolePattern, line) == nil { return nil }
    return (label, g[2] ?? "")
}

/// Inside an activity, a sentence that opens with who does it ("Students
/// solve three problems…", "The teacher models…") is that person's line,
/// kept whole. Outside one it is just prose, so an objective such as
/// "Students will be able to…" is never turned into a line.
private let subjectPattern = regex(#"^(?:the )?(teacher|students?)\s+(?!:)[a-z]"#)

private func subjectOf(_ line: String) -> String? {
    groups(subjectPattern, line)?[1] ?? nil
}

private func roleOf(_ label: String) -> LessonRole {
    label.lowercased().hasPrefix("t") ? .teacher : .students
}

private func niceLabel(_ label: String) -> String {
    label.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("t") ? "Teacher" : "Students"
}

// The named parts of a lesson: gradual release, the 5E model and the parts
// most school forms use. One of these at the start of a line, on its own or
// before a colon or dash, starts an activity even without minutes. ("Explain
// why a membrane…" is a sentence, not the Explain phase: it has no colon.)
private let phasePattern = regex(#"^(I do|We do|You do(?: together| alone| independently)?|Y['’]?all do|Do now|Warm[- ]?up|Hook|Launch|Engage|Explore|Explain|Elaborate|Extend|Evaluate|Mini[- ]?lesson|Direct instruction|Modell?ing|Guided practice|Independent practice|Work time|Closing|Closure|Wrap[- ]?up|Exit ticket)\b\s*(\([^)]*\))?\s*(?:([:–—-])\s*(.*))?$"#)

func phaseOf(_ title: String) -> LessonPhase? {
    let t = title.trimmingCharacters(in: .whitespaces).lowercased()
    if groups(regex(#"^i do\b"#), t) != nil { return .i }
    if groups(regex(#"^we do\b"#), t) != nil { return .we }
    if groups(regex(#"^(you do|y['’]?all do)\b"#), t) != nil { return .you }
    return nil
}

/// Every word's first letter in capitals, the rest as written.
private func titleCased(_ text: String) -> String {
    var out = ""
    var previous: Character?
    for c in text {
        let startsWord = (c.isLetter || c.isNumber) && !(previous.map { $0.isLetter || $0.isNumber || $0 == "_" } ?? false)
        out.append(startsWord ? Character(c.uppercased()) : c)
        previous = c
    }
    return out
}

private struct Heading {
    let title: String
    let minutes: String?
    let rest: String?
}

/// An activity's opening line: a title with its minutes, or a named lesson
/// part ("We Do", "Exit Ticket:"). When a part's name is followed by a whole
/// sentence ("I Do: Model the first problem aloud…"), the name is the title
/// and the sentence comes back as `rest`, the activity's first line.
private func readHeading(_ line: String) -> Heading? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if matchRole(trimmed) != nil { return nil }
    for re in headingPatterns {
        if let g = groups(re, trimmed), let title = g[1], let minutes = g[2] {
            return Heading(
                title: title.replacingOccurrences(of: #"[:\s]+$"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces),
                minutes: minutes.replacingOccurrences(of: #"\s+"#, with: "", options: .regularExpression),
                rest: nil
            )
        }
    }
    guard let p = groups(phasePattern, trimmed), let name = p[1] else { return nil }
    let paren = p[2]
    let separator = p[3]
    let after = p[4]
    guard separator != nil || after == nil else { return nil }
    if separator == nil && trimmed.count > name.count + (paren?.count ?? 0) + 1 { return nil }
    let label = titleCased(name) + (paren.map { " \($0)" } ?? "")
    let rest = (after ?? "").trimmingCharacters(in: .whitespaces)
    if rest.isEmpty { return Heading(title: label, minutes: nil, rest: nil) }
    let short = rest.split(whereSeparator: \.isWhitespace).count <= 8 && !"!.?".contains(rest.last ?? " ")
    return short ? Heading(title: "\(label): \(rest)", minutes: nil, rest: nil) : Heading(title: label, minutes: nil, rest: rest)
}

private let duringPattern = regex(#"^(During (?:the )?["“]?[^,]{2,60}?["”]? (?:step|part|activity|discussion|launch|share[- ]out),)\s+(.+)$"#, [.dotMatchesLineSeparators])
private let colonPattern = regex(#"^([^:.!?\n]{2,70}):\s+(.+)$"#, [.dotMatchesLineSeparators])

/// "During the observation step, circulate…" → lead + rest; "Exit ticket
/// (used as …): In 2-3 sentences…" → lead + rest. Only short leads, so an
/// ordinary sentence that happens to contain a colon stays as it is.
func splitLead(_ paragraph: String) -> LeadBlock {
    if let g = groups(duringPattern, paragraph), let lead = g[1], let text = g[2] { return .lead(lead, text) }
    if let g = groups(colonPattern, paragraph), let lead = g[1], let text = g[2] {
        // Not before a quotation ("He said: "go now"" is a sentence, not a
        // label), and not when the lead is itself a long clause.
        let quoted = lead.contains("\"") || lead.contains("“") || text.hasPrefix("\"") || text.hasPrefix("“")
        if !quoted && lead.trimmingCharacters(in: .whitespaces).split(whereSeparator: \.isWhitespace).count <= 9 {
            return .lead("\(lead):", text)
        }
    }
    return .block(.p(paragraph))
}

private func isLabelledLead(_ line: String) -> Bool {
    if case .lead(let lead, _) = splitLead(line) { return lead.hasSuffix(":") }
    return false
}

private func proseOf(_ lines: [String]) -> [LeadBlock] {
    textBlocks(lines.joined(separator: "\n")).flatMap { block -> [LeadBlock] in
        if case .p(let text) = block { return text.components(separatedBy: "\n").map(splitLead) }
        return [.block(block)]
    }
}

/// The parts to draw for one section's text. A section with no activity titles
/// and no Teacher/Students lines comes back as prose only, drawn much as
/// before, with leads set apart.
func layoutLessonText(_ value: String?) -> [LessonTextPart] {
    let text = (value ?? "").replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return [] }
    var parts: [LessonTextPart] = []
    var prose: [String] = []
    var activity: LessonTextActivity?
    var row: (role: LessonRole, label: String, lines: [String])?

    func closeRow() {
        if activity != nil, let r = row {
            activity?.rows.append(LessonTextRow(role: r.role, label: r.label, blocks: textBlocks(r.lines.joined(separator: "\n"))))
        }
        row = nil
    }
    func closeActivity() {
        closeRow()
        if let activity { parts.append(.activity(activity)) }
        activity = nil
    }
    func closeProse() {
        if prose.contains(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty }) { parts.append(.prose(proseOf(prose))) }
        prose = []
    }

    for raw in text.components(separatedBy: "\n") {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if let heading = readHeading(line) {
            closeProse()
            closeActivity()
            activity = LessonTextActivity(title: heading.title, minutes: heading.minutes, phase: phaseOf(heading.title))
            if let rest = heading.rest {
                // "I Do: Teacher models…" — the sentence after the name is the
                // first line of the activity, and may itself name who does it.
                if let inner = matchRole(rest), !inner.rest.trimmingCharacters(in: .whitespaces).isEmpty {
                    row = (roleOf(inner.label), niceLabel(inner.label), [inner.rest])
                } else if let subject = subjectOf(rest) {
                    row = (roleOf(subject), niceLabel(subject), [rest])
                } else {
                    activity?.notes.append(splitLead(rest))
                }
            }
            continue
        }
        // A role line says something: "Teacher:" left blank, or "Teacher: Ms.
        // Rivera", is a form field to fill in, not a line of the lesson.
        if let role = matchRole(line), role.rest.trimmingCharacters(in: .whitespaces).split(whereSeparator: \.isWhitespace).count >= 3 {
            closeProse()
            if activity == nil { activity = LessonTextActivity() }
            closeRow()
            row = (roleOf(role.label), niceLabel(role.label), role.rest.isEmpty ? [] : [role.rest])
            continue
        }
        if line.isEmpty {
            // A blank line ends an activity's last row but not the activity:
            // what follows a gap inside an activity is usually more of the same.
            if row != nil { closeRow() } else if activity == nil { prose.append("") }
            continue
        }
        // A labelled line ("Look for: …") is its own entry, not more of the
        // Teacher or Students line above it.
        let labelled = isLabelledLead(line)
        if row != nil && labelled { closeRow() }
        if activity != nil, !labelled, let subject = subjectOf(line) {
            closeRow()
            row = (roleOf(subject), niceLabel(subject), [line])
            continue
        }
        if row != nil {
            row?.lines.append(line)
        } else if activity != nil {
            activity?.notes.append(splitLead(line))
        } else {
            prose.append(line)
        }
    }
    closeActivity()
    closeProse()
    return parts
}

private let quotePattern = regex(#"("[^"\n]+"|“[^”\n]+”)"#, [])

/// A teacher line's quoted words — what to actually say — set apart so the eye
/// can find them. Something to say aloud, not a quoted term ("cells"): three
/// words or more, or a line that ends like speech.
func spokenText(_ text: String) -> Text {
    var out = Text("")
    var last = text.startIndex
    for m in quotePattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
        guard let r = Range(m.range, in: text) else { continue }
        let inner = text[r].dropFirst().dropLast().trimmingCharacters(in: .whitespaces)
        let spoken = inner.split(whereSeparator: \.isWhitespace).count >= 3 || ["?", "!", ".", ","].contains(inner.last.map(String.init) ?? "")
        guard spoken else { continue }
        if r.lowerBound > last { out = out + Text(text[last..<r.lowerBound]) }
        out = out + Text(text[r]).italic().fontWeight(.medium).foregroundColor(AppTheme.forestSoft)
        last = r.upperBound
    }
    if last < text.endIndex { out = out + Text(text[last...]) }
    return out
}

// MARK: - Drawing it

/// A school-format section's text, laid out for reading: each activity gets
/// its title and minutes, Teacher and Students each get a labelled line, the
/// words to say aloud are set apart, and short lead-ins are bold.
struct LessonTextView: View {
    let text: String

    var body: some View {
        let parts = layoutLessonText(text)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                if i > 0 { Divider().overlay(AppTheme.hairline).padding(.vertical, 12) }
                switch part {
                case .activity(let activity): ActivityView(activity: activity)
                case .prose(let blocks): ProseView(blocks: blocks)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }
}

private struct ProseView: View {
    let blocks: [LeadBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .lead(let lead, let text):
                    (Text(lead).fontWeight(.semibold) + Text(" ") + spokenText(text))
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                case .block(.p(let text)):
                    spokenText(text)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                case .block(let other):
                    CopyBlocksView(blocks: [other])
                }
            }
        }
    }
}

private struct ActivityView: View {
    let activity: LessonTextActivity

    private static let phasePrefix = #"^(?:i|we|you|y['’]?all) do\b(?:\s+(?:together|alone|independently))?"#

    /// With a tag, the heading is what follows the phase name ("I Do:
    /// Modeling" → tag "I Do", heading "Modeling"); a bare "We Do" is the tag
    /// alone.
    private var tagText: String? {
        guard let phase = activity.phase else { return nil }
        if let title = activity.title, let range = title.range(of: Self.phasePrefix, options: [.regularExpression, .caseInsensitive]) {
            return String(title[range])
        }
        switch phase {
        case .i: return "I Do"
        case .we: return "We Do"
        case .you: return "You Do"
        }
    }

    private var heading: String? {
        guard let title = activity.title else { return nil }
        guard activity.phase != nil else { return title }
        let stripped = title.replacingOccurrences(of: Self.phasePrefix + #"\s*[:–—-]?\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
        return stripped.isEmpty ? nil : stripped
    }

    // Gradual release in three steady colours, so I Do / We Do / You Do read
    // as one sequence down the page.
    private var tagStyle: (background: Color, foreground: Color) {
        switch activity.phase {
        case .i: return (AppTheme.peachTint, AppTheme.terracotta600)
        case .we: return (AppTheme.goldTint, AppTheme.forest)
        default: return (AppTheme.mintTint, AppTheme.forest)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if activity.title != nil || activity.minutes != nil {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let tagText {
                        Text(tagText.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.8)
                            .foregroundStyle(tagStyle.foreground)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(tagStyle.background, in: Capsule())
                            .fixedSize()
                    }
                    if let heading {
                        Text(heading)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(AppTheme.forest)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    if let minutes = activity.minutes {
                        Text("\(minutes) min")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.forest)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(AppTheme.mintTint, in: Capsule())
                            .fixedSize()
                    }
                }
            }
            ForEach(Array(activity.rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(row.role == .teacher ? AppTheme.terracotta.opacity(0.7) : AppTheme.teal.opacity(0.6))
                        .frame(width: 3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.label.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.8)
                            .foregroundStyle(row.role == .teacher ? AppTheme.terracotta600 : AppTheme.teal)
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(row.blocks.enumerated()), id: \.offset) { _, block in
                                switch block {
                                case .ul, .ol: CopyBlocksView(blocks: [block])
                                case .p(let text), .h1(let text), .h2(let text), .h3(let text), .label(let text):
                                    spokenText(text)
                                        .font(.subheadline)
                                        .foregroundStyle(AppTheme.textPrimary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            if !activity.notes.isEmpty { ProseView(blocks: activity.notes) }
        }
    }
}
