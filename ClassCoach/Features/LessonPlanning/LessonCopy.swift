import SwiftUI
import UIKit
import UniformTypeIdentifiers

// What the Lesson Workspace puts on the clipboard, and what its Word and PDF
// downloads are laid out from. Mirrors `web/src/lib/lessonCopy.ts`: teachers
// paste these into their own school's template, so every piece is written as
// plain text that survives any box it lands in, and as simple HTML that keeps
// headings and real bullets where the box understands it. Interface labels
// ("Copy", helper notes) are never in here; only the lesson.

enum CopyBlock: Equatable {
    case h1(String)
    case h2(String)
    case h3(String)
    case p(String)
    case label(String)
    case ul([String])
    case ol([String])

    var isLabel: Bool { if case .label = self { return true } else { return false } }
}

private let bulletPrefix = try! NSRegularExpression(pattern: #"^\s*[-•*–]\s+"#)
private let numberPrefix = try! NSRegularExpression(pattern: #"^\s*\d+[.)]\s+"#)

private func strip(_ regex: NSRegularExpression, _ line: String) -> String? {
    let range = NSRange(line.startIndex..., in: line)
    guard let match = regex.firstMatch(in: line, range: range), let r = Range(match.range, in: line) else { return nil }
    return String(line[r.upperBound...]).trimmingCharacters(in: .whitespaces)
}

/// A stored field as blocks: "- " and "1. " lines become real lists, blank
/// lines split paragraphs, and anything else stays as written.
func textBlocks(_ value: String?) -> [CopyBlock] {
    let text = (value ?? "").replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return [] }
    var blocks: [CopyBlock] = []
    var para: [String] = []
    var list: (ordered: Bool, items: [String])?
    func flushPara() {
        if !para.isEmpty { blocks.append(.p(para.joined(separator: "\n"))) }
        para = []
    }
    func flushList() {
        if let list { blocks.append(list.ordered ? .ol(list.items) : .ul(list.items)) }
        list = nil
    }
    for line in text.components(separatedBy: "\n") {
        if line.trimmingCharacters(in: .whitespaces).isEmpty {
            flushPara()
            flushList()
            continue
        }
        if let item = strip(bulletPrefix, line) ?? strip(numberPrefix, line) {
            let ordered = strip(bulletPrefix, line) == nil
            flushPara()
            if list == nil || list?.ordered != ordered {
                flushList()
                list = (ordered, [])
            }
            list?.items.append(item)
        } else {
            flushList()
            para.append(line.trimmingCharacters(in: .whitespaces))
        }
    }
    flushPara()
    flushList()
    return blocks
}

private func labelled(_ label: String, _ value: String?) -> [CopyBlock] {
    let body = textBlocks(value)
    return body.isEmpty ? [] : [.label(label)] + body
}

func toPlainText(_ blocks: [CopyBlock]) -> String {
    var out = ""
    for (i, block) in blocks.enumerated() {
        // A label sits directly on top of what it labels; everything else is a
        // paragraph of its own.
        if i > 0 { out += blocks[i - 1].isLabel ? "\n" : "\n\n" }
        switch block {
        case .ul(let items): out += items.map { "• \($0)" }.joined(separator: "\n")
        case .ol(let items): out += items.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
        case .label(let text): out += "\(text):"
        case .h1(let text), .h2(let text), .h3(let text), .p(let text): out += text
        }
    }
    return out
}

private func escapeHTML(_ text: String) -> String {
    text.replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\n", with: "<br>")
}

func toHTML(_ blocks: [CopyBlock]) -> String {
    blocks.map { block in
        switch block {
        case .ul(let items): return "<ul>\(items.map { "<li>\(escapeHTML($0))</li>" }.joined())</ul>"
        case .ol(let items): return "<ol>\(items.map { "<li>\(escapeHTML($0))</li>" }.joined())</ol>"
        case .label(let text): return "<p><strong>\(escapeHTML(text)):</strong></p>"
        case .p(let text): return "<p>\(escapeHTML(text))</p>"
        case .h1(let text): return "<h1>\(escapeHTML(text))</h1>"
        case .h2(let text): return "<h2>\(escapeHTML(text))</h2>"
        case .h3(let text): return "<h3>\(escapeHTML(text))</h3>"
        }
    }
    .joined()
}

/// Rich and plain together, so a paste into Word, Pages or a Google Doc keeps
/// headings and real bullets, and a plain box still gets clean text.
func copyToPasteboard(_ blocks: [CopyBlock]) {
    UIPasteboard.general.setItems([[
        UTType.plainText.identifier: toPlainText(blocks),
        // Said outright: a reader that guesses the encoding turns "·" into "Â·".
        UTType.html.identifier: "<meta charset=\"utf-8\">" + toHTML(blocks),
    ]])
}

// MARK: - The lesson's parts, as blocks

func stepHeading(_ step: LessonStep, _ i: Int) -> String {
    let title = step.title.trimmingCharacters(in: .whitespaces).isEmpty ? "Activity \(i + 1)" : step.title
    return "\(i + 1). \(title)" + (step.minutes.map { " (\($0) min)" } ?? "")
}

func stepBlocks(_ step: LessonStep, _ i: Int, top: Bool = false) -> [CopyBlock] {
    [top ? .h2(stepHeading(step, i)) : .h3(stepHeading(step, i))]
        + labelled("Teacher actions", step.teacher)
        + labelled("Student actions", step.students)
}

func checkBlocks(_ check: LessonCheck, _ i: Int) -> [CopyBlock] {
    [.h3("\(i + 1). \(check.when ?? "Check")")] + labelled("Check", check.check) + labelled("Look for", check.lookFor)
}

func misconceptionBlocks(_ item: LessonMisconception, _ i: Int) -> [CopyBlock] {
    [.h3("\(i + 1). \(item.belief)")] + labelled("How to surface it", item.surface) + labelled("How to address it", item.response)
}

func ticketLookForBlocks(_ ticket: LessonExitTicket) -> [CopyBlock] {
    labelled("Expected answer", ticket.expected)
        + labelled("What different responses show", ticket.signals)
        + labelled("Suggested next step", ticket.nextStep)
}

let durationChoices = [30, 45, 50, 60, 90]

private func replacing(_ pattern: String, in text: String, with template: String = "") -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return text }
    return regex.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: template)
}

/// The short name a lesson goes by on its own page. There is no title field,
/// so it comes from the objective with the "Students will be able to" taken
/// off — and kept short, because the full objective is the first section.
func lessonTitle(_ plan: LessonPlan) -> String {
    let raw = (plan.objective ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.isEmpty {
        // A plan the teacher brought has no objective of its own: its first
        // line usually names it ("Day 3: fractions on a number line").
        let firstLine = (plan.planText ?? "").components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty }
        let named = [plan.unitName, plan.fileName].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty }
        if let named { return named }
        if let firstLine, firstLine.count <= 80 { return replacing(#"[:.]$"#, in: firstLine) }
        return plan.planText != nil ? "Your lesson plan" : "Your lesson"
    }
    var title = replacing(#"^(students|learners|scholars)\s+will\s+(be\s+able\s+to\s+)?"#, in: raw)
    title = replacing(#"^swbat:?\s*"#, in: title)
    title = replacing(#"^i\s+can\s+"#, in: title)
    title = replacing(#"[.\s]+$"#, in: title)
    if title.count > 72 {
        let cut = String(title.prefix(72))
        let space = cut.lastIndex(of: " ").map { cut.distance(from: cut.startIndex, to: $0) } ?? -1
        let kept = space > 40 ? String(cut.prefix(space)) : cut
        title = replacing(#"[,;:\s]+$"#, in: kept) + "…"
    }
    return title.prefix(1).uppercased() + title.dropFirst()
}

// MARK: - Word and PDF

/// The export renderer's document model (`ExportDoc` in web/src/lib/api.ts,
/// `sanitizeDocModel` on the server).
struct LessonExportDoc: Encodable {
    struct Block: Encodable {
        let type: String
        var text: String? = nil
        var items: [String]? = nil
    }

    let title: String
    let subtitle: String?
    let blocks: [Block]

    /// Section headings become headings, lists stay lists, and everything else
    /// is a paragraph — a label keeps its colon so it still reads as one.
    init(title: String, subtitle: String?, sections: [(title: String, blocks: [CopyBlock])]) {
        self.title = title
        self.subtitle = subtitle
        self.blocks = sections.flatMap { section -> [Block] in
            [Block(type: "heading", text: section.title)] + section.blocks.map { block in
                switch block {
                case .ul(let items): return Block(type: "bullets", items: items)
                case .ol(let items): return Block(type: "numbered", items: items)
                case .label(let text): return Block(type: "paragraph", text: "\(text):")
                case .h1(let text), .h2(let text), .h3(let text), .p(let text): return Block(type: "paragraph", text: text)
                }
            }
        }
    }
}

// MARK: - Showing blocks

/// Blocks as the workspace draws them.
struct CopyBlocksView: View {
    let blocks: [CopyBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { i, block in
                switch block {
                case .ul(let items), .ol(let items):
                    let ordered: Bool = { if case .ol = block { return true } else { return false } }()
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(items.enumerated()), id: \.offset) { n, item in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(ordered ? "\(n + 1)." : "•")
                                    .foregroundStyle(AppTheme.textSecondary)
                                    .frame(minWidth: 14, alignment: .trailing)
                                Text(item)
                                    .foregroundStyle(AppTheme.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .font(.subheadline)
                case .label(let text):
                    Text(text.uppercased())
                        .font(.caption2.weight(.bold)).tracking(1)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, i > 0 ? 6 : 0)
                case .p(let text):
                    Text(text)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                case .h1(let text), .h2(let text), .h3(let text):
                    Text(text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, i > 0 ? 8 : 0)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }
}

/// Copies blocks and says so for a moment.
struct CopyBlocksButton: View {
    var label = "Copy"
    let what: String
    let blocks: () -> [CopyBlock]
    var prominent = false
    /// Icon only, where a row's title needs the width more than the word does.
    var compact = false
    @State private var copied = false

    var body: some View {
        Button {
            copyToPasteboard(blocks())
            copied = true
            Task {
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                copied = false
            }
        } label: {
            Group {
                if compact {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                } else {
                    Label(copied ? "Copied ✓" : label, systemImage: copied ? "checkmark" : "doc.on.doc")
                        .labelStyle(.titleAndIcon)
                }
            }
                .font(prominent ? .subheadline.weight(.bold) : .caption.weight(.semibold))
                .foregroundStyle(AppTheme.forest)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: prominent ? .infinity : nil)
                .padding(.horizontal, prominent ? 14 : compact ? 8 : 10)
                .padding(.vertical, prominent ? 10 : 5)
                .background(AppTheme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(AppTheme.hairline))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(copied ? "\(what) copied" : "\(label): \(what)")
    }
}
