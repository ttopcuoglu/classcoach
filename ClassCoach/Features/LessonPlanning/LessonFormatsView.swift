import SwiftUI
import UIKit
import UniformTypeIdentifiers

// Lesson plan formats on the iPhone: a lesson shown in the teacher's own form
// (or their school's), and the screen where they set one up. Mirrors the
// format bar and `LessonFormats.tsx` on the web. Any teacher can add their
// own format; only a school's Wivoza admins can set the school's.

// MARK: - Which format a lesson is in

/// Asks the server for the lesson laid out in its format and keeps track of
/// whether what is on screen is still that layout. One per panel.
@MainActor
final class LessonFormatModel: ObservableObject {
    @Published private(set) var templates: LessonTemplates?
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    /// The format being switched to, shown in the picker while it loads.
    @Published private(set) var pendingChoice: String?
    @Published private(set) var appliedId: String?
    @Published private var appliedSignature: String?
    private var request = 0

    var hasAny: Bool { !allTemplates.isEmpty }
    var allTemplates: [LessonTemplate] { (templates?.school ?? []) + (templates?.personal ?? []) }

    func loadTemplates() async {
        templates = try? await LessonFormatService.list()
    }

    /// Lays the lesson out when it has not been yet, or when it changed since
    /// (an adaptation applied, a revision used). The server answers from its
    /// store when nothing that matters changed, so this is cheap to call.
    func sync(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        guard plan.isFormatable else { return }
        if templates == nil { await loadTemplates() }
        guard hasAny, appliedSignature != Self.signature(plan) else { return }
        await run(plan.id, choice: nil, apply: apply)
    }

    func choose(_ choice: String, for plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        await run(plan.id, choice: choice, apply: apply)
    }

    /// After formats were added, edited or removed.
    func changed(_ plan: LessonPlan?, apply: @escaping (LessonPlan) -> Void) async {
        await loadTemplates()
        appliedSignature = nil
        appliedId = nil
        if let plan, plan.isFormatable, hasAny { await run(plan.id, choice: nil, apply: apply) }
    }

    func retry(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        await run(plan.id, choice: nil, apply: apply)
    }

    private func run(_ id: String, choice: String?, apply: @escaping (LessonPlan) -> Void) async {
        request += 1
        let n = request
        loading = true
        error = nil
        pendingChoice = choice
        do {
            let result = try await LessonFormatService.layout(id: id, choice: choice)
            guard n == request else { return }
            apply(result.plan)
            appliedId = result.appliedTemplateId
            appliedSignature = Self.signature(result.plan)
        } catch {
            if n == request { self.error = error.localizedDescription }
        }
        if n == request {
            loading = false
            pendingChoice = nil
        }
    }

    /// The layout to show, or nil to show the lesson in Wivoza's own layout.
    func content(for plan: LessonPlan) -> TemplateContent? {
        guard !loading, let id = appliedId, appliedSignature == Self.signature(plan),
              let content = plan.templateContent, content.templateId == id, !content.sections.isEmpty
        else { return nil }
        return content
    }

    /// What a layout depends on — the same fields as `lessonSignature` on the web.
    static func signature(_ plan: LessonPlan) -> String {
        struct Signature: Encodable {
            let id: String
            let planText, objective, successCriteria, materials, approach: String?
            let durationMinutes: Int?
            let sequence: [LessonStep]?
            let checks: [LessonCheck]?
            let misconceptions: [LessonMisconception]?
            let exitTicket: LessonExitTicket?
            let subject, gradeLevel, unitName, essentialQuestion, standard: String?
        }
        let value = Signature(
            id: plan.id, planText: plan.planText, objective: plan.objective, successCriteria: plan.successCriteria,
            materials: plan.materials, approach: plan.approach, durationMinutes: plan.durationMinutes,
            sequence: plan.sequence, checks: plan.checks, misconceptions: plan.misconceptions, exitTicket: plan.exitTicket,
            subject: plan.subject, gradeLevel: plan.gradeLevel, unitName: plan.unitName,
            essentialQuestion: plan.essentialQuestion, standard: plan.standard
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return (try? encoder.encode(value)).map { String(decoding: $0, as: UTF8.self) } ?? plan.id
    }
}

// MARK: - The format line above a lesson

struct LessonFormatBar: View {
    @ObservedObject var model: LessonFormatModel
    let onChoose: (String) -> Void
    let onManage: () -> Void

    private var currentId: String { model.pendingChoice ?? model.appliedId ?? "wivoza" }
    private var currentName: String {
        model.allTemplates.first { $0.id == currentId }?.name ?? "Wivoza layout"
    }

    var body: some View {
        if model.templates != nil {
            if !model.hasAny {
                // Every teacher, not only one at a school: a form of their own
                // counts just as much.
                Text("Have your own lesson plan form, or one your school uses? [Set up your format](wivoza-format://setup) and your lessons come out in it.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.textSecondary)
                    .tint(AppTheme.forest)
                    .fixedSize(horizontal: false, vertical: true)
                    .environment(\.openURL, OpenURLAction { _ in
                        onManage()
                        return .handled
                    })
            } else {
                HStack(spacing: 8) {
                    Text("FORMAT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.textSecondary)
                    Menu {
                        ForEach(model.allTemplates) { template in
                            Button {
                                onChoose(template.id)
                            } label: {
                                if template.id == currentId { Label(template.name, systemImage: "checkmark") } else { Text(template.name) }
                            }
                        }
                        Button {
                            onChoose("wivoza")
                        } label: {
                            if currentId == "wivoza" { Label("Wivoza layout", systemImage: "checkmark") } else { Text("Wivoza layout") }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(currentName).lineLimit(1)
                            Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                        }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    }
                    .disabled(model.loading)
                    Spacer(minLength: 4)
                    Button("Manage formats", action: onManage)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                }
            }
        }
    }
}

// MARK: - The lesson in the format

func readableText(_ text: String) -> String {
    text.split(separator: "\n", omittingEmptySubsequences: false)
        .map { line -> String in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            for marker in ["- ", "* ", "• "] where trimmed.hasPrefix(marker) {
                return "•  " + trimmed.dropFirst(marker.count)
            }
            return String(line)
        }
        .joined(separator: "\n")
}

/// Puts text on the clipboard and says so for a moment.
struct CopyButton: View {
    let label: String
    let text: () -> String
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = text()
            copied = true
            Task {
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                copied = false
            }
        } label: {
            Label(copied ? "Copied ✓" : label, systemImage: copied ? "checkmark" : "doc.on.doc")
                .labelStyle(.titleAndIcon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(AppTheme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(AppTheme.hairline))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(copied ? "Copied" : label)
    }
}

/// The lesson as the teacher's form lays it out, box by box, each one
/// copyable on its own for pasting into the real form.
struct TemplatedLessonView: View {
    let content: TemplateContent
    /// A plan the teacher brought (Improve a Lesson) rather than one Wivoza built.
    let ownPlan: Bool

    private var wholePlan: String {
        content.sections
            .map { section in
                let text = section.text.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? section.title : "\(section.title)\n\(text)"
            }
            .joined(separator: "\n\n")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text((content.templateName ?? "Your format").uppercased())
                    .font(.caption2.weight(.bold)).tracking(1)
                    .foregroundStyle(AppTheme.textSecondary)
                    .lineLimit(1)
                Spacer()
                CopyButton(label: "Copy whole plan") { wholePlan }
            }
            LaidOutSectionList(
                sections: content.sections,
                emptyText: ownPlan
                    ? "Your plan has nothing for this box. Fill it in yourself, or leave it."
                    : "Nothing in this lesson goes here. Fill it in yourself, or leave it."
            )
        }
    }

}

/// A form's boxes, filled in, each copyable on its own. Used for a lesson in
/// a format and for each day of a week.
struct LaidOutSectionList: View {
    let sections: [LaidOutSection]
    /// What an empty box says, unless it is one the teacher fills in.
    let emptyText: String
    var framed = true

    var body: some View {
        let list = VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(sections.enumerated()), id: \.offset) { index, section in
                if index > 0 { Divider().overlay(AppTheme.hairline) }
                row(index: index, section: section)
            }
        }
        if framed {
            list
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
        } else {
            list
        }
    }

    private func row(index: Int, section: LaidOutSection) -> some View {
        let text = section.text.trimmingCharacters(in: .whitespacesAndNewlines)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                Text("\(index + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.forest)
                    .frame(width: 24, height: 24)
                    .background(AppTheme.mintTint, in: Circle())
                Text(section.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppTheme.forest)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                if !text.isEmpty { CopyButton(label: "Copy") { text } }
            }
            if text.isEmpty {
                Text(section.kind == "teacher_fills" ? "For you to fill in." : emptyText)
                    .font(.footnote.italic())
                    .foregroundStyle(AppTheme.textSecondary)
            } else {
                Text(readableText(text))
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .padding(14)
    }
}

// MARK: - Managing formats

/// The same kinds, in the same order, as SECTION_KINDS on the server.
private let kindLabels: [(kind: String, label: String)] = [
    ("details", "Lesson details"),
    ("objective", "Objective"),
    ("standards", "Standards"),
    ("essential_question", "Essential question"),
    ("success_criteria", "Success criteria"),
    ("vocabulary", "Vocabulary"),
    ("materials", "Materials"),
    ("opening", "Opening / Do Now"),
    ("instruction", "Instruction (I do)"),
    ("guided_practice", "Guided practice (we do)"),
    ("independent_practice", "Independent practice (you do)"),
    ("activities", "All activities"),
    ("closing", "Closing"),
    ("checks", "Checks for understanding"),
    ("assessment", "Assessment"),
    ("misconceptions", "Misconceptions"),
    ("differentiation", "Differentiation"),
    ("exit_ticket", "Exit ticket"),
    ("homework", "Homework"),
    ("other", "Other"),
    ("teacher_fills", "You fill this in"),
]

private func kindLabel(_ kind: String) -> String {
    kindLabels.first { $0.kind == kind }?.label ?? "Other"
}

/// The same default as sectionScope on the server.
private func scopeOf(_ section: TemplateSection) -> String {
    section.scope ?? (["details", "standards", "essential_question", "vocabulary"].contains(section.kind) ? "week" : "day")
}

private let maxSections = 30

private struct FormatDraft {
    var templateId: String?
    var name: String
    var cadence: String
    var sections: [TemplateSection]
    var scope: String
    var sourceFileName: String?
    var note: String?
}

/// Lists, uploads and edits formats. Shown as a sheet from a lesson.
struct LessonFormatsSheet: View {
    /// Called after anything was saved or removed, so the lesson relays itself.
    let onChanged: () -> Void
    @Environment(\.dismiss) private var dismiss

    private enum Mode { case list, reading(String), edit }

    @State private var data: LessonTemplates?
    @State private var loadError: String?
    @State private var mode: Mode = .list
    @State private var draft = FormatDraft(name: "", cadence: "daily", sections: [], scope: "personal")
    @State private var error: String?
    @State private var busy = false
    @State private var showImporter = false
    @State private var removing: LessonTemplate?

    private var importTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg]
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        return types
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle(isEditing ? (draft.templateId == nil ? "Check your format" : "Edit format") : "Lesson plan formats")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if isEditing {
                        Button("Cancel") {
                            error = nil
                            mode = .list
                        }
                    } else {
                        Button("Done") { dismiss() }
                    }
                }
                if isEditing {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(busy ? "Saving…" : "Save") { Task { await save() } }
                            .disabled(!canSave)
                    }
                }
            }
        }
        .task { await refresh() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await read(url) } }
        }
        .confirmationDialog(
            "Remove \(removing?.name ?? "this format")?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                if let target = removing { Task { await act { try await LessonFormatService.delete(id: target.id) } } }
                removing = nil
            }
            Button("Keep", role: .cancel) { removing = nil }
        } message: {
            Text("Lessons already in this format keep their copy.")
        }
    }

    private var isEditing: Bool { if case .edit = mode { return true } else { return false } }

    private var canSave: Bool {
        !busy && !draft.name.trimmingCharacters(in: .whitespaces).isEmpty
            && draft.sections.contains { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    @ViewBuilder
    private var content: some View {
        if let loadError {
            errorText(loadError)
        } else if data == nil {
            HStack(spacing: 8) {
                ProgressView()
                Text("Loading formats…").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            }
        } else if case .reading(let fileName) = mode {
            ProgressRing(active: true, estimatedSeconds: 12, label: "Reading \(fileName)", hint: "Finding the sections your form asks for.")
        } else if case .edit = mode {
            FormatEditor(draft: $draft, schoolName: data?.schoolName, canChooseScope: (data?.canManageSchool ?? false) && draft.templateId == nil)
            if let error { errorText(error) }
        } else if let data {
            list(data)
        }
    }

    private func errorText(_ message: String) -> some View {
        Text(message)
            .font(.footnote)
            .foregroundStyle(AppTheme.forest)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.peachTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: List

    @ViewBuilder
    private func list(_ data: LessonTemplates) -> some View {
        let schoolDefaultId = data.school.first(where: \.isDefault)?.id

        if let schoolName = data.schoolName {
            VStack(alignment: .leading, spacing: 8) {
                sectionHeading(schoolName)
                if data.school.isEmpty {
                    note(data.canManageSchool
                         ? "Your school doesn't have a format yet. Upload the form your teachers use and every lesson they build comes out in it."
                         : "Your school hasn't set up a format. You can add your own below.")
                } else {
                    ForEach(data.school) { template in
                        FormatRow(
                            template: template,
                            isDefault: data.defaultId == template.id,
                            editable: data.canManageSchool,
                            busy: busy,
                            defaultLabel: data.canManageSchool ? "Make it the school's default" : "Use for my lessons",
                            // A teacher picks the school's format by clearing their
                            // own default; an admin sets the school's.
                            onDefault: data.canManageSchool
                                ? { Task { await act { _ = try await LessonFormatService.update(id: template.id, isDefault: true) } } }
                                : (template.id == schoolDefaultId && data.personal.contains(where: \.isDefault))
                                    ? { Task { await act { for own in data.personal where own.isDefault { _ = try await LessonFormatService.update(id: own.id, isDefault: false) } } } }
                                    : nil,
                            onEdit: { edit(template) },
                            onRemove: { removing = template }
                        )
                    }
                }
            }
        }

        VStack(alignment: .leading, spacing: 8) {
            sectionHeading("Your formats")
            if data.personal.isEmpty {
                note(data.school.isEmpty
                     ? "Upload the lesson plan form you hand in, and your lessons will come out in it."
                     : "Using your school format. If you use a different form, add it here and your lessons will use that.")
            } else {
                ForEach(data.personal) { template in
                    FormatRow(
                        template: template,
                        isDefault: data.defaultId == template.id,
                        editable: true,
                        busy: busy,
                        defaultLabel: "Use for my lessons",
                        onDefault: { Task { await act { _ = try await LessonFormatService.update(id: template.id, isDefault: true) } } },
                        onEdit: { edit(template) },
                        onRemove: { removing = template }
                    )
                }
            }
        }

        if let error { errorText(error) }

        VStack(alignment: .leading, spacing: 10) {
            Button {
                showImporter = true
            } label: {
                Label("Upload your form", systemImage: "arrow.up.doc")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppTheme.cream)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(AppTheme.forest, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
            Text("A Word document, a PDF, or a photo of the blank form. Wivoza reads its sections and you check them before anything is saved.")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
            Button {
                startBlank(data)
            } label: {
                Text("Or type the sections yourself")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.forest)
                    .underline()
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(.top, 4)
    }

    private func sectionHeading(_ text: String) -> some View {
        Text(text.uppercased()).font(.caption.weight(.bold)).tracking(1).foregroundStyle(AppTheme.textSecondary)
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(AppTheme.textSecondary).fixedSize(horizontal: false, vertical: true)
    }

    /// New formats are the teacher's own, except for an admin whose school has
    /// none yet — the same default as the web.
    private func defaultScope(_ data: LessonTemplates?) -> String {
        (data?.canManageSchool ?? false) && (data?.school.isEmpty ?? false) ? "school" : "personal"
    }

    private func startBlank(_ data: LessonTemplates) {
        error = nil
        draft = FormatDraft(
            name: "My lesson plan",
            cadence: "daily",
            sections: [TemplateSection(id: "s1", title: "", kind: "other", prompt: nil, scope: nil)],
            scope: defaultScope(data)
        )
        mode = .edit
    }

    private func edit(_ template: LessonTemplate) {
        error = nil
        draft = FormatDraft(
            templateId: template.id,
            name: template.name,
            cadence: template.cadence,
            sections: template.sections,
            scope: template.organizationId != nil ? "school" : "personal",
            sourceFileName: template.sourceFileName
        )
        mode = .edit
    }

    // MARK: Actions

    private func refresh() async {
        do {
            data = try await LessonFormatService.list()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func read(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        error = nil
        mode = .reading(url.lastPathComponent)
        do {
            let read = try await LessonFormatService.read(fileURL: url)
            draft = FormatDraft(
                name: read.name ?? url.deletingPathExtension().lastPathComponent,
                cadence: read.cadence,
                sections: read.sections,
                scope: defaultScope(data),
                sourceFileName: read.sourceFileName ?? url.lastPathComponent,
                note: read.note
            )
            mode = .edit
        } catch {
            self.error = error.localizedDescription
            mode = .list
        }
    }

    private func save() async {
        let named = draft.sections.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
        busy = true
        error = nil
        do {
            let name = draft.name.trimmingCharacters(in: .whitespaces)
            if let id = draft.templateId {
                _ = try await LessonFormatService.update(id: id, name: name, cadence: draft.cadence, sections: named)
            } else {
                _ = try await LessonFormatService.create(
                    scope: draft.scope, name: name, cadence: draft.cadence, sections: named, sourceFileName: draft.sourceFileName
                )
            }
            await refresh()
            mode = .list
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func act(_ work: () async throws -> Void) async {
        busy = true
        error = nil
        do {
            try await work()
            await refresh()
            onChanged()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

private struct FormatRow: View {
    let template: LessonTemplate
    let isDefault: Bool
    let editable: Bool
    let busy: Bool
    let defaultLabel: String
    let onDefault: (() -> Void)?
    let onEdit: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(template.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.forest)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isDefault {
                    Text("Default")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(AppTheme.mintTint, in: Capsule())
                }
            }
            Text("\(template.cadence == "weekly" ? "Weekly" : "Daily") · \(template.sections.count) sections")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
            HStack(spacing: 14) {
                if !isDefault, let onDefault {
                    Button(defaultLabel, action: onDefault)
                }
                if editable {
                    Button("Edit sections", action: onEdit)
                    Button("Remove", action: onRemove).foregroundStyle(AppTheme.terracotta600)
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(AppTheme.forest)
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
    }
}

/// Checking what Wivoza read, or editing a saved format.
private struct FormatEditor: View {
    @Binding var draft: FormatDraft
    let schoolName: String?
    let canChooseScope: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let note = draft.note {
                (Text("Worth checking: ").bold() + Text(note))
                    .font(.footnote)
                    .foregroundStyle(AppTheme.forest)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.goldTint, in: RoundedRectangle(cornerRadius: 12))
            }
            Text(draft.templateId != nil
                 ? "Change anything that is wrong. Lessons already laid out in this format are redone the next time they are opened."
                 : "Check the sections and what goes in each, then save. Nothing is used until you do.")
                .font(.footnote)
                .foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            labeled("Name") {
                TextField("Name", text: $draft.name).textFieldStyle(.roundedBorder)
            }
            labeled("Plans are") {
                Picker("Plans are", selection: $draft.cadence) {
                    Text("Daily").tag("daily")
                    Text("Weekly").tag("weekly")
                }
                .pickerStyle(.segmented)
            }
            if draft.cadence == "weekly" {
                Text("Plan a Week (on the web) fills this form in for the whole week. Mark which boxes are filled once for the week and which each day. A single lesson uses the same boxes, as one day.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.forest)
                    .padding(10)
                    .background(AppTheme.mintTint, in: RoundedRectangle(cornerRadius: 12))
            }
            if canChooseScope {
                labeled("Who uses it") {
                    Picker("Who uses it", selection: $draft.scope) {
                        Text("Everyone at \(schoolName ?? "my school")").tag("school")
                        Text("Just me").tag("personal")
                    }
                    .pickerStyle(.segmented)
                }
            }

            Text("SECTIONS, IN ORDER").font(.caption.weight(.bold)).tracking(1).foregroundStyle(AppTheme.textSecondary)
            ForEach(Array(draft.sections.enumerated()), id: \.element.id) { index, section in
                sectionCard(index: index, section: section)
            }
            if draft.sections.count < maxSections {
                Button {
                    draft.sections.append(TemplateSection(id: nextId(), title: "", kind: "other", prompt: nil, scope: nil))
                } label: {
                    Label("Add a section", systemImage: "plus")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func labeled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption.weight(.bold)).tracking(1).foregroundStyle(AppTheme.textSecondary)
            content()
        }
    }

    private func nextId() -> String {
        let taken = Set(draft.sections.map(\.id))
        var n = draft.sections.count + 1
        while taken.contains("s\(n)") { n += 1 }
        return "s\(n)"
    }

    private func binding(_ index: Int) -> Binding<TemplateSection> {
        Binding(
            get: { index < draft.sections.count ? draft.sections[index] : TemplateSection(id: "", title: "", kind: "other") },
            set: { if index < draft.sections.count { draft.sections[index] = $0 } }
        )
    }

    private func move(_ index: Int, by offset: Int) {
        let target = index + offset
        guard draft.sections.indices.contains(index), draft.sections.indices.contains(target) else { return }
        draft.sections.swapAt(index, target)
    }

    private func sectionCard(index: Int, section: TemplateSection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("\(index + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.forest)
                    .frame(width: 24, height: 24)
                    .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 6))
                TextField("Section title, as the form says it", text: binding(index).title)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Section \(index + 1) title")
            }
            HStack(spacing: 6) {
                Text("What goes here").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                Picker("What goes here", selection: binding(index).kind) {
                    ForEach(kindLabels, id: \.kind) { Text($0.label).tag($0.kind) }
                }
                .pickerStyle(.menu)
                .tint(AppTheme.forest)
                Spacer(minLength: 0)
            }
            if draft.cadence == "weekly" {
                Picker("How often", selection: Binding(
                    get: { scopeOf(section) },
                    set: { binding(index).wrappedValue.scope = $0 }
                )) {
                    Text("Each day").tag("day")
                    Text("Once for the week").tag("week")
                }
                .pickerStyle(.segmented)
            }
            if section.kind == "teacher_fills" {
                Text("Left blank for you. Wivoza never writes here.").font(.caption).foregroundStyle(AppTheme.textSecondary)
            } else if let prompt = section.prompt, !prompt.isEmpty {
                Text("The form says: \(prompt)").font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            HStack(spacing: 16) {
                Button { move(index, by: -1) } label: { Image(systemName: "arrow.up") }
                    .disabled(index == 0)
                    .accessibilityLabel("Move section \(index + 1) up")
                Button { move(index, by: 1) } label: { Image(systemName: "arrow.down") }
                    .disabled(index == draft.sections.count - 1)
                    .accessibilityLabel("Move section \(index + 1) down")
                Spacer()
                Button(role: .destructive) {
                    draft.sections.remove(at: index)
                } label: {
                    Label("Remove", systemImage: "trash").font(.caption.weight(.semibold))
                }
                .accessibilityLabel("Remove section \(index + 1)")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.forest)
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
    }
}
