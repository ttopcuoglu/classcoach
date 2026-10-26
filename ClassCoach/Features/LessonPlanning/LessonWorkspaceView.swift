import SwiftUI

// Planning Coach's Lesson Workspace on the iPhone: a built lesson (or a plan
// the teacher brought to Improve a Lesson) as one document a teacher can read,
// lift into their own school's template piece by piece, and adapt. Mirrors
// `web/src/components/LessonWorkspace.tsx`.
//
// The web puts Make It Yours and Bring It to Life in a column beside the
// document; a phone has no room beside anything, so they follow the document,
// with a link at the top that jumps to them. Downloads, share links and slides
// go through the share sheet, which is how a file leaves an iPhone.

// MARK: - State the panels share

/// The adapt / apply / undo / discard / revert cycle, delivery coaching, and
/// the files the workspace hands to the share sheet. One per Planning Coach
/// screen; the panels differ in what they render, not in what these calls do.
@MainActor
final class LessonWorkspaceModel: ObservableObject {
    @Published private(set) var busy: LessonAdaptation?
    @Published private(set) var applying = false
    @Published private(set) var reverting = false
    @Published private(set) var undoing = false
    @Published private(set) var error: String?
    /// The adaptation just applied, for the "applied — Undo" toast.
    @Published private(set) var justApplied: String?
    private var undoTarget: (id: String, apply: (LessonPlan) -> Void)?

    @Published private(set) var deliveryLoading = false
    @Published private(set) var deliveryError: String?
    /// Create Slides on a lesson without delivery coaching gets the coaching
    /// first, then builds the deck the moment it lands.
    @Published private(set) var slidesWaiting = false
    @Published private(set) var buildingDeck = false
    @Published private(set) var deckError: String?

    @Published private(set) var exporting: String?
    @Published private(set) var exportError: String?
    @Published private(set) var sharing = false
    @Published private(set) var shareError: String?
    @Published var shareFile: ShareFile?

    struct ShareFile: Identifiable {
        let id = UUID()
        let item: URL
    }

    func reset() {
        error = nil
        justApplied = nil
        undoTarget = nil
        deliveryError = nil
        deckError = nil
        exportError = nil
        shareError = nil
        slidesWaiting = false
    }

    private func run(_ work: () async throws -> LessonPlan, apply: (LessonPlan) -> Void) async -> Bool {
        error = nil
        do {
            apply(try await work())
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func adapt(_ plan: LessonPlan, _ action: LessonAdaptation, minutes: Int? = nil, apply: @escaping (LessonPlan) -> Void) async {
        guard busy == nil else { return }
        justApplied = nil
        busy = action
        _ = await run({ try await LessonPlanningService.adapt(id: plan.id, action: action, targetMinutes: minutes) }, apply: apply)
        busy = nil
    }

    func applyPending(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        guard !applying else { return }
        let label = plan.pendingAdaptation?.label ?? "The revision"
        applying = true
        if await run({ try await LessonPlanningService.applyAdaptation(id: plan.id) }, apply: apply) {
            justApplied = label
            undoTarget = (plan.id, apply)
        }
        applying = false
    }

    /// One step back — the version the last applied adaptation replaced.
    func undo() async {
        guard let target = undoTarget, !undoing else { return }
        undoing = true
        if await run({ try await LessonPlanningService.undoAdaptation(id: target.id) }, apply: target.apply) {
            clearApplied()
        }
        undoing = false
    }

    func clearApplied() {
        justApplied = nil
        undoTarget = nil
    }

    func discard(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        _ = await run({ try await LessonPlanningService.discardAdaptation(id: plan.id) }, apply: apply)
    }

    func revert(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        guard !reverting else { return }
        clearApplied()
        reverting = true
        _ = await run({ try await LessonPlanningService.revert(id: plan.id) }, apply: apply)
        reverting = false
    }

    @discardableResult
    func requestDelivery(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async -> LessonPlan? {
        guard !deliveryLoading else { return nil }
        deliveryLoading = true
        deliveryError = nil
        defer { deliveryLoading = false }
        do {
            let updated = try await LessonPlanningService.deliveryFeedback(id: plan.id)
            apply(updated)
            return updated
        } catch {
            deliveryError = error.localizedDescription.isEmpty
                ? "Could not put together delivery feedback. Please try again."
                : error.localizedDescription
            return nil
        }
    }

    func createSlides(_ plan: LessonPlan, apply: @escaping (LessonPlan) -> Void) async {
        guard !buildingDeck, !slidesWaiting else { return }
        deckError = nil
        if plan.deliveryCoaching == nil {
            slidesWaiting = true
            let updated = await requestDelivery(plan, apply: apply)
            slidesWaiting = false
            guard updated?.deliveryCoaching != nil else { return }
        }
        buildingDeck = true
        do {
            shareFile = ShareFile(item: try await LessonPlanningService.lessonDeck(id: plan.id))
        } catch {
            deckError = error.localizedDescription
        }
        buildingDeck = false
    }

    func download(_ doc: LessonExportDoc, format: String) async {
        guard exporting == nil else { return }
        exporting = format
        exportError = nil
        do {
            shareFile = ShareFile(item: try await LessonPlanningService.lessonDocument(doc, format: format, fileName: fileName(doc.title)))
        } catch {
            exportError = error.localizedDescription
        }
        exporting = nil
    }

    func share(_ plan: LessonPlan) async {
        guard !sharing else { return }
        sharing = true
        shareError = nil
        do {
            shareFile = ShareFile(item: try await LessonPlanningService.shareLink(id: plan.id))
        } catch {
            shareError = "Couldn't share — try again."
        }
        sharing = false
    }

    private func fileName(_ title: String) -> String {
        let cleaned = title.components(separatedBy: CharacterSet(charactersIn: "/\\:?*\"<>|…")).joined()
            .trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? "Wivoza lesson" : String(cleaned.prefix(60))
    }
}

struct LessonShareSheet: UIViewControllerRepresentable {
    let item: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [item], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: - What the document shows

/// The parts of a plan the document is drawn from — separate from
/// `LessonPlan` so a drafted revision can be previewed as the lesson it would
/// become, with the same fallbacks the server uses when it applies one.
struct LessonDocContent {
    var mode: String
    var objective: String?
    var essentialQuestion: String?
    var standard: String?
    var successCriteria: String?
    var materials: String?
    var approach: String?
    var durationMinutes: Int?
    var sequence: [LessonStep]
    var checks: [LessonCheck]
    var misconceptions: [LessonMisconception]
    var exitTicket: LessonExitTicket?
    var quickIdeas: [QuickIdea]
    var planText: String?
    var feedback: String?
    var legacy: [(key: String, title: String, text: String?)]

    init(_ plan: LessonPlan) {
        mode = plan.mode
        objective = plan.objective
        essentialQuestion = plan.essentialQuestion
        standard = plan.standard
        successCriteria = plan.successCriteria
        materials = plan.materials
        approach = plan.approach
        durationMinutes = plan.durationMinutes
        sequence = plan.sequence ?? []
        checks = plan.checks ?? []
        misconceptions = plan.misconceptions ?? []
        exitTicket = plan.exitTicket
        quickIdeas = plan.quickIdeas ?? []
        planText = plan.planText
        feedback = plan.feedback
        legacy = [
            ("doNow", "Do Now", plan.doNow),
            ("agenda", "Agenda", plan.agenda),
            ("closure", "Closure", plan.closure),
            ("hots", "Higher-Order Thinking", plan.hots),
            ("homework", "Homework", plan.homework),
        ]
    }

    func revised(by pending: PendingAdaptation) -> LessonDocContent {
        var next = self
        let s = pending.sections
        if let planText = s.planText {
            next.planText = planText
            return next
        }
        next.objective = s.objective ?? objective
        next.approach = s.approach ?? approach
        next.successCriteria = s.successCriteria ?? successCriteria
        next.materials = s.materials ?? materials
        next.sequence = s.sequence ?? sequence
        next.checks = s.checks ?? checks
        next.misconceptions = s.misconceptions ?? misconceptions
        next.exitTicket = s.exitTicket ?? exitTicket
        next.durationMinutes = pending.minutes ?? durationMinutes
        return next
    }

    /// What the lesson actually runs to, said honestly: the steps' own
    /// minutes, and what the teacher asked for when the two drifted apart.
    var minutesLabel: String? {
        let total = sequence.reduce(0) { $0 + ($1.minutes ?? 0) }
        guard total > 0 else { return durationMinutes.map { "\($0) min" } }
        if let asked = durationMinutes, asked != total { return "\(total) min of \(asked) planned" }
        return "\(total) min"
    }
}

/// One numbered, collapsible section of the document, copyable on its own.
struct DocSection: Identifiable {
    let id: String
    let title: String
    let defaultOpen: Bool
    var copyLabel = "Copy"
    let copy: [CopyBlock]
    /// Nothing to copy — a school-format section the lesson left empty.
    var noCopy = false
    let body: AnyView
}

private let misconceptionNote = "These are common for this content at this grade — not a claim about your students. You'll find out which ones are in the room when you ask."

/// The sections a plan has, in teaching order. Three shapes reach here: a
/// Planning Coach lesson, a list of teaching ideas, and one of the old
/// five-slot sample plans reopened from history. A section with nothing in it
/// is left out rather than shown empty.
func documentSections(_ c: LessonDocContent, preview: Bool) -> [DocSection] {
    // Improve a Lesson: Coach's read of the plan, then the plan itself —
    // which is what an adaptation rewrites, so a preview shows only that.
    if c.mode == "feedback" {
        var sections: [DocSection] = []
        let feedback = textBlocks(c.feedback)
        if !feedback.isEmpty && !preview {
            sections.append(DocSection(id: "feedback", title: "Coaching Feedback", defaultOpen: true, copy: feedback, body: AnyView(CopyBlocksView(blocks: feedback))))
        }
        let plan = textBlocks(c.planText)
        if !plan.isEmpty {
            sections.append(DocSection(id: "plan", title: preview ? "Your Plan, Revised" : "Your Plan", defaultOpen: true, copy: plan, body: AnyView(CopyBlocksView(blocks: plan))))
        }
        return sections
    }

    if !c.quickIdeas.isEmpty {
        return c.quickIdeas.enumerated().map { i, idea in
            let blocks = textBlocks(idea.how)
            return DocSection(id: "idea-\(i)", title: idea.title, defaultOpen: true, copy: blocks, body: AnyView(CopyBlocksView(blocks: blocks)))
        }
    }

    if c.sequence.isEmpty {
        let legacy = c.legacy.compactMap { part -> DocSection? in
            let blocks = textBlocks(part.text)
            guard !blocks.isEmpty else { return nil }
            return DocSection(id: part.key, title: part.title, defaultOpen: true, copy: blocks, body: AnyView(CopyBlocksView(blocks: blocks)))
        }
        let plan = textBlocks(c.planText)
        if !legacy.isEmpty || plan.isEmpty { return legacy }
        return [DocSection(id: "plan", title: "Lesson Plan", defaultOpen: true, copy: plan, body: AnyView(CopyBlocksView(blocks: plan)))]
    }

    var sections: [DocSection] = []
    var objective = textBlocks(c.objective)
    let question = textBlocks(c.essentialQuestion)
    if !question.isEmpty { objective += [.label("Essential question")] + question }
    let standard = textBlocks(c.standard)
    if !standard.isEmpty { objective += [.label("Standard")] + standard }
    if !objective.isEmpty {
        sections.append(DocSection(id: "objective", title: "Learning Objective", defaultOpen: true, copy: objective, body: AnyView(CopyBlocksView(blocks: objective))))
    }

    let criteria = textBlocks(c.successCriteria)
    if !criteria.isEmpty {
        sections.append(DocSection(id: "criteria", title: "Success Criteria", defaultOpen: true, copy: criteria, body: AnyView(CopyBlocksView(blocks: criteria))))
    }

    let materials = textBlocks(c.materials)
    if !materials.isEmpty {
        sections.append(DocSection(id: "materials", title: "Materials & Preparation", defaultOpen: false, copy: materials, body: AnyView(CopyBlocksView(blocks: materials))))
    }

    sections.append(DocSection(
        id: "sequence", title: "Lesson Sequence", defaultOpen: true, copyLabel: "Copy all",
        copy: c.sequence.enumerated().flatMap { stepBlocks($0.element, $0.offset) },
        body: AnyView(LessonSequenceView(steps: c.sequence, preview: preview))
    ))

    if !c.checks.isEmpty {
        let blocks = c.checks.enumerated().flatMap { checkBlocks($0.element, $0.offset) }
        sections.append(DocSection(id: "checks", title: "Checks for Understanding", defaultOpen: true, copy: blocks, body: AnyView(CopyBlocksView(blocks: blocks))))
    }

    if !c.misconceptions.isEmpty {
        let blocks = c.misconceptions.enumerated().flatMap { misconceptionBlocks($0.element, $0.offset) }
        sections.append(DocSection(
            id: "misconceptions", title: "Potential Misconceptions", defaultOpen: true, copy: blocks,
            body: AnyView(VStack(alignment: .leading, spacing: 10) {
                CopyBlocksView(blocks: blocks)
                Text(misconceptionNote).font(.caption).foregroundStyle(AppTheme.textSecondary).fixedSize(horizontal: false, vertical: true)
            })
        ))
    }

    if let ticket = c.exitTicket, !ticket.task.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        let prompt = textBlocks(ticket.task)
        let lookFors = ticketLookForBlocks(ticket)
        sections.append(DocSection(
            id: "exit", title: "Exit Ticket", defaultOpen: true,
            copy: [.h3("Student prompt")] + prompt + (lookFors.isEmpty ? [] : [.h3("Teacher look-fors")] + lookFors),
            body: AnyView(VStack(alignment: .leading, spacing: 10) {
                SubBlock(title: "Student prompt", blocks: prompt, preview: preview, what: "Exit ticket student prompt")
                if !lookFors.isEmpty {
                    SubBlock(title: "Teacher look-fors", blocks: lookFors, preview: preview, what: "Exit ticket teacher look-fors")
                }
            })
        ))
    }
    return sections
}

private func metaLine(_ plan: LessonPlan, _ c: LessonDocContent) -> String {
    [[plan.subject, plan.gradeLevel].compactMap { $0 }.joined(separator: " · "), c.minutesLabel ?? ""]
        .filter { !$0.isEmpty }.joined(separator: " · ")
}

/// Which school-format kinds hold each part of Wivoza's own layout. A part no
/// section of the format holds is not lost: it is listed under "Also from
/// Wivoza", outside what is copied or downloaded as the plan.
private let heldBy: [String: [String]] = [
    "objective": ["objective"],
    "criteria": ["success_criteria"],
    "materials": ["materials"],
    "sequence": ["opening", "instruction", "guided_practice", "independent_practice", "activities", "closing"],
    "checks": ["checks", "assessment"],
    "misconceptions": ["misconceptions"],
    "exit": ["exit_ticket", "assessment"],
]

private func templateSections(_ content: TemplateContent, ownPlan: Bool) -> [DocSection] {
    content.sections.map { section in
        let blocks = textBlocks(section.text)
        let empty = section.kind == "teacher_fills"
            ? "For you to fill in."
            : ownPlan
                ? "Your plan has nothing for this box. Fill it in yourself, or leave it."
                : "Nothing in this lesson goes here. Fill it in yourself, or leave it."
        // Laid out for reading on screen; `copy` stays the text as written.
        let body: AnyView = blocks.isEmpty
            ? AnyView(Text(empty).font(.footnote.italic()).foregroundStyle(AppTheme.textSecondary))
            : AnyView(LessonTextView(text: section.text))
        return DocSection(id: section.id, title: section.title, defaultOpen: true, copy: blocks, noCopy: blocks.isEmpty, body: body)
    }
}

// MARK: - The document

struct DocSectionRow: View {
    let n: Int
    let section: DocSection
    let preview: Bool
    @State private var open: Bool

    init(n: Int, section: DocSection, preview: Bool) {
        self.n = n
        self.section = section
        self.preview = preview
        _open = State(initialValue: preview || section.defaultOpen)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { open.toggle() }
                } label: {
                    HStack(spacing: 10) {
                        Text("\(n)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.forest)
                            .frame(width: 26, height: 26)
                            .background(AppTheme.mintTint, in: Circle())
                        Text(section.title)
                            .font(.headline)
                            .foregroundStyle(AppTheme.forest)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
                if !preview && !section.noCopy {
                    CopyBlocksButton(label: section.copyLabel, what: section.title) { section.copy }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            if open {
                section.body
                    .padding(.horizontal, 14)
                    .padding(.bottom, 16)
            }
        }
    }
}

struct DocSectionList: View {
    let sections: [DocSection]
    var preview = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(sections.enumerated()), id: \.element.id) { i, section in
                if i > 0 { Divider().overlay(AppTheme.hairline) }
                DocSectionRow(n: i + 1, section: section, preview: preview)
            }
        }
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

/// Every activity collapsible on its own, with Expand / Collapse all.
private struct LessonSequenceView: View {
    let steps: [LessonStep]
    let preview: Bool
    @State private var open: Set<Int>

    init(steps: [LessonStep], preview: Bool) {
        self.steps = steps
        self.preview = preview
        _open = State(initialValue: preview ? Set(steps.indices) : [])
    }

    private var allOpen: Bool { open.count == steps.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !preview && steps.count > 1 {
                Button(allOpen ? "Collapse all activities" : "Expand all activities") {
                    withAnimation(.easeInOut(duration: 0.2)) { open = allOpen ? [] : Set(steps.indices) }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AppTheme.forest)
                .underline()
            }
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                ActivityRow(step: step, i: i, preview: preview, open: open.contains(i)) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if open.contains(i) { open.remove(i) } else { open.insert(i) }
                    }
                }
            }
        }
    }
}

private struct ActivityRow: View {
    let step: LessonStep
    let i: Int
    let preview: Bool
    let open: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button(action: onToggle) {
                    HStack(alignment: .center, spacing: 8) {
                        Text("\(i + 1)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(AppTheme.forest)
                            .frame(width: 22, height: 22)
                            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.title.isEmpty ? "Activity \(i + 1)" : step.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(AppTheme.forest)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            if let minutes = step.minutes {
                                Text("\(minutes) min")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(AppTheme.forest)
                                    .padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(AppTheme.goldTint, in: Capsule())
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(AppTheme.textSecondary)
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
                if !preview {
                    CopyBlocksButton(what: stepHeading(step, i), blocks: { stepBlocks(step, i, top: true) }, compact: true)
                }
            }
            if open {
                if let teacher = step.teacher { actions("Teacher actions", teacher, AppTheme.mintTint) }
                if let students = step.students { actions("Student actions", students, AppTheme.peachTint) }
            }
        }
        .padding(10)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
    }

    private func actions(_ title: String, _ text: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.forest)
            CopyBlocksView(blocks: textBlocks(text))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct SubBlock: View {
    let title: String
    let blocks: [CopyBlock]
    let preview: Bool
    let what: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.forest)
                Spacer()
                if !preview { CopyBlocksButton(what: what) { blocks } }
            }
            CopyBlocksView(blocks: blocks)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.hairline))
    }
}

/// The lesson in a school's (or the teacher's own) format: Coach's feedback
/// stays above a plan the teacher brought, and what the format has no box for
/// is kept under "Also from Wivoza".
private struct TemplateDocument: View {
    let plan: LessonPlan
    let content: TemplateContent
    @State private var extrasOpen = false

    var body: some View {
        let isImprove = plan.mode == "feedback"
        let kinds = Set(content.sections.map(\.kind))
        let own = documentSections(LessonDocContent(plan), preview: false)
        let feedback = isImprove ? own.filter { $0.id == "feedback" } : []
        let extras = isImprove ? [] : own.filter { !(heldBy[$0.id] ?? []).contains(where: kinds.contains) }

        VStack(alignment: .leading, spacing: 12) {
            if !feedback.isEmpty { DocSectionList(sections: feedback) }
            DocSectionList(sections: templateSections(content, ownPlan: isImprove))
            if !extras.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { extrasOpen.toggle() }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Also from Wivoza").font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                                Text("\(extras.map(\.title).joined(separator: ", ")) — your format has no place for these, so they're not in the copy or the download.")
                                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.down")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(AppTheme.textSecondary)
                                .rotationEffect(.degrees(extrasOpen ? 180 : 0))
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if extrasOpen {
                        DocSectionList(sections: extras)
                    }
                }
                .background(AppTheme.background.opacity(0.5), in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
            }
        }
    }
}

// MARK: - Make It Yours

private struct MakeItYoursCard: View {
    let plan: LessonPlan
    @ObservedObject var model: LessonWorkspaceModel
    let onAdapt: (LessonAdaptation, Int?) -> Void
    let onReview: () -> Void
    let onRevert: () -> Void
    @State private var timeOpen = false
    @State private var custom = ""

    private let buttons: [(action: LessonAdaptation, hint: String, busy: String, icon: String, tint: Color)] = [
        (.simplify, "Clearer steps & more support", "Simplifying…", "checklist", AppTheme.mintTint),
        (.challenge, "Deepen the thinking", "Adding challenge…", "brain", AppTheme.goldTint),
        (.participation, "More ways to contribute", "Revising…", "bubble.left.and.bubble.right", AppTheme.peachTint),
    ]

    var body: some View {
        let busy = model.busy
        let disabled = busy != nil || model.applying
        let history = plan.versionHistory?.count ?? 0

        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Label {
                    Text("Make It Yours").foregroundStyle(AppTheme.cream)
                } icon: {
                    Image(systemName: "sparkles").foregroundStyle(AppTheme.gold)
                }
                .font(.headline)
                Text("Adapt the lesson to your class.").font(.footnote).foregroundStyle(AppTheme.cream.opacity(0.85))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.forest)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(buttons, id: \.action) { item in
                    adaptButton(
                        label: busy == item.action ? item.busy : item.action.label,
                        hint: item.hint, icon: item.icon, tint: item.tint, dark: false,
                        working: busy == item.action, disabled: disabled
                    ) {
                        timeOpen = false
                        onAdapt(item.action, nil)
                    }
                }
                adaptButton(
                    label: busy == .time ? "Adjusting time…" : "Adjust Time",
                    hint: "Fit your class period", icon: "clock", tint: AppTheme.forest, dark: true,
                    working: busy == .time, disabled: disabled, chevron: timeOpen
                ) {
                    withAnimation(.easeInOut(duration: 0.2)) { timeOpen.toggle() }
                }
                if timeOpen && busy == nil { timePicker }

                ProgressRing(active: busy != nil, estimatedSeconds: 18, label: "Drafting a revision")

                if let error = model.error {
                    Text("\(error) Your current lesson hasn't changed.")
                        .font(.footnote).foregroundStyle(AppTheme.forest)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.peachTint, in: RoundedRectangle(cornerRadius: 10))
                }
                if let pending = plan.pendingAdaptation, busy == nil {
                    VStack(alignment: .leading, spacing: 8) {
                        (Text(pending.label).fontWeight(.semibold) + Text(" is drafted and waiting for you."))
                            .font(.footnote).foregroundStyle(AppTheme.forest)
                        Button("Review changes", action: onReview)
                            .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.cream)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(AppTheme.forest, in: Capsule())
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.goldTint.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.gold.opacity(0.6)))
                }
                Text("Preview first. Your current lesson stays until you apply changes.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                if history > 0 {
                    HStack(spacing: 4) {
                        Text(history == 1 ? "One adaptation applied. Your original is kept —" : "\(history) adaptations applied. Your original is kept —")
                        Button(model.reverting ? "going back…" : "go back to it", action: onRevert)
                            .fontWeight(.semibold)
                            .foregroundStyle(AppTheme.terracotta600)
                            .underline()
                            .disabled(model.reverting)
                    }
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(12)
        }
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private func adaptButton(
        label: String, hint: String, icon: String, tint: Color, dark: Bool,
        working: Bool, disabled: Bool, chevron: Bool? = nil, action: @escaping () -> Void
    ) -> some View {
        let fg = dark ? AppTheme.cream : AppTheme.forest
        return Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9).fill(dark ? Color.white.opacity(0.1) : Color.white.opacity(0.7))
                    if working { ProgressView().tint(fg) } else { Image(systemName: icon).foregroundStyle(fg) }
                }
                .frame(width: 36, height: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(label).font(.subheadline.weight(.bold)).foregroundStyle(fg)
                    Text(hint).font(.footnote).foregroundStyle(fg.opacity(0.8))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let chevron {
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold)).foregroundStyle(fg)
                        .rotationEffect(.degrees(chevron ? 180 : 0))
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(tint, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled && !working ? 0.6 : 1)
    }

    private var timePicker: some View {
        let minutes = plan.currentMinutes
        let customMinutes = Int(custom.trimmingCharacters(in: .whitespaces))
        let customValid = customMinutes.map { $0 >= 5 && $0 <= 240 && $0 != minutes } ?? false
        return VStack(alignment: .leading, spacing: 8) {
            (Text("Rebuild for a different length").fontWeight(.semibold)
                + Text(minutes.map { " — now \($0) min" } ?? "").foregroundColor(AppTheme.textSecondary))
                .font(.footnote).foregroundStyle(AppTheme.forest)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 68), spacing: 6)], alignment: .leading, spacing: 6) {
                ForEach(durationChoices, id: \.self) { choice in
                    let current = choice == minutes
                    Button {
                        timeOpen = false
                        onAdapt(.time, choice)
                    } label: {
                        Text("\(choice) min")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(current ? AppTheme.cream : AppTheme.forest)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 7)
                            .background(current ? AppTheme.forest : AppTheme.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(current ? Color.clear : AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                    // Not .disabled: the current length stays solid, as the web shows it.
                    .allowsHitTesting(!current)
                    .accessibilityLabel(current ? "\(choice) minutes (current length)" : "Rebuild for \(choice) minutes")
                }
            }
            HStack(spacing: 8) {
                TextField("Other", text: $custom)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
                    .accessibilityLabel("Other lesson length in minutes")
                Text("min").font(.footnote).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Button("Rebuild") {
                    guard let customMinutes else { return }
                    timeOpen = false
                    custom = ""
                    onAdapt(.time, customMinutes)
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(customValid ? AppTheme.cream : AppTheme.textSecondary)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(customValid ? AppTheme.forest : AppTheme.hairline, in: Capsule())
                .disabled(!customValid)
            }
        }
        .padding(12)
        .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(AppTheme.hairline))
    }
}

// MARK: - Bring It to Life

private struct BringItToLifeCard: View {
    let hasFeedback: Bool
    @ObservedObject var model: LessonWorkspaceModel
    let onRequest: () -> Void
    let onView: () -> Void
    let onSlides: () -> Void

    var body: some View {
        let loading = model.deliveryLoading
        VStack(alignment: .leading, spacing: 8) {
            Text("Bring It to Life").font(.headline).foregroundStyle(AppTheme.forest)
            Text("Talk through your lesson and get feedback on clarity, questions, and pacing.")
                .font(.footnote).foregroundStyle(AppTheme.forest.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)

            Button(action: hasFeedback ? onView : onRequest) {
                HStack(spacing: 8) {
                    if loading && !model.slidesWaiting {
                        ProgressView().tint(.white)
                        Text("Getting feedback…")
                    } else if hasFeedback {
                        Text("See Delivery Feedback ↓")
                    } else {
                        Text("Get Delivery Feedback")
                        Image(systemName: "arrow.right")
                    }
                }
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(AppTheme.terracotta600, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(loading)
            .padding(.top, 4)

            Button(action: onSlides) {
                HStack(spacing: 8) {
                    if model.buildingDeck || model.slidesWaiting {
                        ProgressView().tint(AppTheme.forest)
                    } else {
                        Text("P")
                            .font(.caption2.weight(.heavy)).foregroundStyle(.white)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(Color(red: 0.82, green: 0.28, blue: 0.15), in: RoundedRectangle(cornerRadius: 4))
                    }
                    Text(model.slidesWaiting ? "Preparing your slides…" : model.buildingDeck ? "Building your slides…" : "Create Slides")
                        .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(AppTheme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(AppTheme.hairline))
            }
            .buttonStyle(.plain)
            .disabled(loading || model.buildingDeck)

            Text("A deck to project, with your delivery notes in the speaker notes\(hasFeedback ? "." : " — delivery feedback comes first, then the slides.")")
                .font(.caption).foregroundStyle(AppTheme.forest.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)

            ProgressRing(active: model.buildingDeck, estimatedSeconds: 30, label: "Building your slides", hint: "Your hook first, a timed agenda, and your delivery notes.")

            if hasFeedback && !loading {
                Button("Get fresh feedback ↻", action: onRequest)
                    .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    .underline()
                    .frame(maxWidth: .infinity)
            }
            ForEach([model.deliveryError, model.deckError].compactMap { $0 }, id: \.self) { error in
                Text(error).font(.footnote).foregroundStyle(AppTheme.forest)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.peachTint.opacity(0.6), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

private struct DeliveryCoachingCard: View {
    let coaching: LessonPlanDeliveryCoaching

    var body: some View {
        let rows: [(String, String?)] = [
            ("Opening hook", coaching.openingHook),
            ("Pacing & timing", coaching.pacing),
            ("Engagement checkpoints", coaching.engagementCheckpoints),
            ("Explaining the hard part", coaching.explainingTheHardPart),
            ("Closing", coaching.closing),
        ]
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Presentation & delivery").font(.headline).foregroundStyle(AppTheme.forest)
                Text("How to teach it — opening, pacing, engagement and closing")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            ForEach(rows.filter { !($0.1 ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }, id: \.0) { title, body in
                VStack(alignment: .leading, spacing: 4) {
                    Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.terracotta600)
                    CopyBlocksView(blocks: textBlocks(body))
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

// MARK: - School focus

/// The one idea connected to a school focus the teacher chose
/// (docs/coaching-priorities.md). On screen only: it is not a section, so it
/// is never in Copy or a download, and the label goes nowhere the teacher
/// didn't put it. Mirrors `SchoolFocusIdeaBox` in LessonWorkspace.tsx.
private struct SchoolFocusIdeaBox: View {
    let plan: LessonPlan
    @ObservedObject var model: LessonWorkspaceModel
    let apply: (LessonPlan) -> Void
    @State private var hidden = false
    @State private var dismissing = false
    @State private var suggesting = false
    @State private var suggestError: String?

    var body: some View {
        if let idea = plan.schoolFocusIdea, !idea.name.isEmpty, !idea.dismissed, !idea.added, !hidden, plan.pendingAdaptation == nil {
            let text = idea.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if idea.skipped || text.isEmpty {
                skippedLine(idea)
            } else {
                ideaCard(idea, text: text)
            }
        }
    }

    /// Considered and left out: one quiet line, so a teacher who turned the
    /// focus on can see it was looked at, and can ask anyway.
    private func skippedLine(_ idea: LessonSchoolFocusIdea) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            (Text("\(idea.name):").fontWeight(.semibold).foregroundColor(AppTheme.forest)
                + Text(" no idea for this lesson. ")
                + Text(idea.reason.map { "It looked like a time your school said it may not fit: “\($0)”" } ?? "It didn't look like a fit."))
                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await suggestAnyway() }
            } label: {
                Text(suggesting ? "Thinking…" : "Suggest one anyway")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    .padding(.horizontal, 16).frame(minHeight: 40)
                    .background(AppTheme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(AppTheme.hairline))
            }
            .buttonStyle(.plain)
            .disabled(suggesting)
            if let suggestError {
                Text(suggestError).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.gold, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
    }

    private func ideaCard(_ idea: LessonSchoolFocusIdea, text: String) -> some View {
        let adding = model.busy == .schoolFocus
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text("One option here").font(.headline).foregroundStyle(AppTheme.forest)
                Text("Connected to your selected school focus · \(idea.name)")
                    .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .background(AppTheme.goldTint, in: Capsule())
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            HStack(spacing: 8) {
                Button {
                    Task { await model.adapt(plan, .schoolFocus, apply: apply) }
                } label: {
                    Text(adding ? "Adding…" : "Add to lesson")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.cream)
                        .padding(.horizontal, 16).frame(minHeight: 44)
                        .background(AppTheme.forest, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(adding || dismissing || model.busy != nil)
                Button {
                    Task { await notForThisClass() }
                } label: {
                    Text("Not for this class")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 16).frame(minHeight: 44)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                }
                .buttonStyle(.plain)
                .disabled(adding || dismissing)
            }
            .opacity(adding || dismissing ? 0.7 : 1)
            Text("Only you see this. It isn't part of the lesson unless you add it.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.gold, lineWidth: 1.5))
    }

    private func notForThisClass() async {
        dismissing = true
        do {
            apply(try await LessonPlanningService.dismissSchoolFocusIdea(id: plan.id))
            hidden = true
        } catch {
            dismissing = false
        }
    }

    /// The server saves the suggestion too, so it is there next time.
    private func suggestAnyway() async {
        suggesting = true
        suggestError = nil
        do {
            apply(try await LessonPlanningService.suggestSchoolFocusIdea(id: plan.id))
        } catch {
            suggestError = error.localizedDescription
        }
        suggesting = false
    }
}

// MARK: - Preview before apply

private struct AdaptationPreview: View {
    let plan: LessonPlan
    let pending: PendingAdaptation
    @ObservedObject var model: LessonWorkspaceModel
    let onApply: () -> Void
    let onKeep: () -> Void
    let onClose: () -> Void

    var body: some View {
        let current = LessonDocContent(plan)
        let next = current.revised(by: pending)
        let before = current.minutesLabel
        let after = next.minutesLabel
        let summary = textBlocks(pending.summary)

        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PREVIEW · \(pending.label.uppercased())")
                        .font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(AppTheme.gold)
                    Text("Your lesson, revised").font(.title3.weight(.bold)).foregroundStyle(AppTheme.cream)
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(AppTheme.cream).padding(6)
                }
                .accessibilityLabel("Close preview (the revision stays drafted)")
            }
            .padding(16)
            .background(AppTheme.forest)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !summary.isEmpty || (before != after && after != nil) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("WHAT CHANGED").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.terracotta600)
                            if !summary.isEmpty { CopyBlocksView(blocks: summary) }
                            if before != after, let after {
                                (Text("Length: \(before ?? "—") → ") + Text(after).fontWeight(.semibold).foregroundColor(AppTheme.forest))
                                    .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                    }
                    DocSectionList(sections: documentSections(next, preview: true), preview: true)
                }
                .padding(16)
            }
            .background(AppTheme.background)

            HStack(spacing: 10) {
                Button(action: onKeep) {
                    Text("Keep Current Lesson")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        .frame(maxWidth: .infinity).padding(.vertical, 11)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                }
                .buttonStyle(.plain)
                Button(action: onApply) {
                    HStack(spacing: 6) {
                        if model.applying { ProgressView().tint(AppTheme.cream) }
                        Text(model.applying ? "Applying…" : "Apply Changes")
                    }
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.cream)
                    .frame(maxWidth: .infinity).padding(.vertical, 11)
                    .background(AppTheme.forest, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .disabled(model.applying)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(AppTheme.background)
            .overlay(alignment: .top) { Divider().overlay(AppTheme.hairline) }
        }
        .interactiveDismissDisabled(model.applying)
    }
}

/// "Applied — Undo", for a few seconds after a revision replaces the lesson.
struct LessonUndoToast: View {
    @ObservedObject var model: LessonWorkspaceModel

    var body: some View {
        if let label = model.justApplied {
            HStack(spacing: 10) {
                Image(systemName: "checkmark").font(.body.weight(.bold)).foregroundStyle(AppTheme.gold)
                (Text(label).fontWeight(.semibold) + Text(" applied to your lesson."))
                    .font(.subheadline).foregroundStyle(AppTheme.cream)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button(model.undoing ? "Undoing…" : "Undo") { Task { await model.undo() } }
                    .font(.footnote.weight(.bold)).foregroundStyle(AppTheme.forest)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(AppTheme.cream, in: Capsule())
                    .disabled(model.undoing)
                Button { model.clearApplied() } label: {
                    Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(AppTheme.cream)
                }
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
            .padding(.horizontal, 16).padding(.bottom, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .task(id: label) {
                try? await Task.sleep(nanoseconds: 12_000_000_000)
                if !Task.isCancelled, !model.undoing, model.justApplied == label { model.clearApplied() }
            }
        }
    }
}

// MARK: - The format line

/// The format line above a lesson, and what it shows while the lesson is
/// being put into a format.
@MainActor @ViewBuilder
func formatControls(
    _ plan: LessonPlan,
    model: LessonFormatModel,
    onManage: @escaping () -> Void,
    apply: @escaping (LessonPlan) -> Void
) -> some View {
    LessonFormatBar(
        model: model,
        onChoose: { choice in Task { await model.choose(choice, for: plan, apply: apply) } },
        onManage: onManage
    )
    if let error = model.error {
        HStack(spacing: 6) {
            Text("\(error) Showing the Wivoza layout meanwhile.").font(.caption).foregroundStyle(AppTheme.terracotta600)
            Button("Try again") { Task { await model.retry(plan, apply: apply) } }
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
        }
    }
}

// MARK: - The workspace

struct LessonWorkspaceView<Extras: View>: View {
    let plan: LessonPlan
    @ObservedObject var model: LessonWorkspaceModel
    @ObservedObject var format: LessonFormatModel
    let apply: (LessonPlan) -> Void
    let onToggleSaved: () -> Void
    let onNew: () -> Void
    let onManageFormats: () -> Void
    var onBackToWeek: (() -> Void)? = nil
    var scroll: ScrollViewProxy? = nil
    @ViewBuilder var extras: Extras

    /// The preview opens itself when a revision arrives; closing it leaves the
    /// revision drafted, with a way back to it in Make It Yours.
    @State private var closedKey: String?

    private var isImprove: Bool { plan.mode == "feedback" }
    private var isIdeas: Bool { !isImprove && plan.isQuickIdeas }
    private var isFullLesson: Bool { !isImprove && plan.isFullLesson }
    /// A Planning Coach lesson and a plan the teacher brought can both be
    /// adapted; the old five-slot samples have nowhere to write a revision back.
    private var canAdapt: Bool {
        isFullLesson || (isImprove && !(plan.planText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
    private var canDeliver: Bool { !isIdeas }

    private var pendingKey: String? {
        plan.pendingAdaptation.map { "\(plan.id):\($0.action):\($0.label):\($0.summary ?? ""):\($0.minutes.map(String.init) ?? "")" }
    }
    private var previewOpen: Binding<Bool> {
        Binding(
            get: { plan.pendingAdaptation != nil && canAdapt && pendingKey != closedKey },
            set: { if !$0 { closedKey = pendingKey } }
        )
    }

    private var kind: String {
        isImprove ? "Your plan, with coaching" : isIdeas ? "Teaching ideas" : isFullLesson ? "Lesson draft" : "Sample plan"
    }

    var body: some View {
        let content = plan.isFormatable ? format.content(for: plan) : nil
        let doc = LessonDocContent(plan)

        VStack(alignment: .leading, spacing: 18) {
            header(content: content, doc: doc)

            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isIdeas ? "Your Ideas" : "Your Lesson").font(.title3.weight(.bold)).foregroundStyle(AppTheme.forest)
                    Text(content.map { "In \($0.templateName ?? "your format"). Copy any section, or the whole plan." } ?? "Copy any section into your own template.")
                        .font(.footnote).foregroundStyle(AppTheme.textSecondary)
                }
                if plan.isFormatable {
                    formatControls(plan, model: format, onManage: onManageFormats, apply: apply)
                }
                if format.loading && plan.isFormatable {
                    ProgressRing(active: true, estimatedSeconds: 12, label: "Putting it in your format", hint: "Your lesson, in your form's own sections.")
                        .padding(18)
                        .frame(maxWidth: .infinity)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
                } else if let content {
                    TemplateDocument(plan: plan, content: content)
                        .id("\(plan.id):\(content.templateId ?? ""):\(LessonFormatModel.signature(plan).hashValue)")
                } else {
                    let sections = documentSections(doc, preview: false)
                    if sections.isEmpty {
                        Text("This lesson has no content to show.")
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                            .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                    } else {
                        DocSectionList(sections: sections)
                            .id("\(plan.id):\(plan.versionHistory?.count ?? 0)")
                    }
                }
                if canAdapt && isFullLesson {
                    SchoolFocusIdeaBox(plan: plan, model: model, apply: apply)
                        .id(plan.id)
                }
                Text(isImprove
                     ? "Coaching on the plan you brought. Your learning goal and the parts that work stay as they are."
                     : isIdeas
                        ? "Ideas to pull into the plan you are writing — take the ones that fit your class."
                        : "A draft to edit, not a script. You know your class; change whatever needs changing.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if canAdapt {
                MakeItYoursCard(
                    plan: plan, model: model,
                    onAdapt: { action, minutes in Task { await model.adapt(plan, action, minutes: minutes, apply: apply) } },
                    onReview: { closedKey = nil },
                    onRevert: { Task { await model.revert(plan, apply: apply) } }
                )
                .id("make-it-yours")
            }
            if canDeliver {
                BringItToLifeCard(
                    hasFeedback: plan.deliveryCoaching != nil, model: model,
                    onRequest: {
                        Task {
                            if await model.requestDelivery(plan, apply: apply) != nil {
                                withAnimation { scroll?.scrollTo("delivery", anchor: .top) }
                            }
                        }
                    },
                    onView: { withAnimation { scroll?.scrollTo("delivery", anchor: .top) } },
                    onSlides: { Task { await model.createSlides(plan, apply: apply) } }
                )
            }

            extras

            if plan.deliveryCoaching != nil || model.deliveryLoading {
                VStack(alignment: .leading, spacing: 10) {
                    if let coaching = plan.deliveryCoaching { DeliveryCoachingCard(coaching: coaching) }
                    ProgressRing(active: model.deliveryLoading, estimatedSeconds: 14, label: "Coaching how to teach it", hint: "Opening, pacing, engagement, and closing.")
                }
                .id("delivery")
            }
        }
        .sheet(isPresented: previewOpen) {
            if let pending = plan.pendingAdaptation {
                AdaptationPreview(
                    plan: plan, pending: pending, model: model,
                    onApply: { Task { await model.applyPending(plan, apply: apply) } },
                    onKeep: { Task { await model.discard(plan, apply: apply) } },
                    onClose: { closedKey = pendingKey }
                )
            }
        }
    }

    // MARK: Header

    @ViewBuilder
    private func header(content: TemplateContent?, doc: LessonDocContent) -> some View {
        let meta = [plan.subject, plan.gradeLevel].compactMap { $0 }.joined(separator: " · ")
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 6) {
                    if let onBackToWeek {
                        Button("← Back to the week", action: onBackToWeek)
                            .fontWeight(.semibold).foregroundStyle(AppTheme.forest)
                        Text("·").foregroundStyle(AppTheme.textSecondary)
                    }
                    Text("Planning Coach").foregroundStyle(AppTheme.textSecondary)
                    Text("›").foregroundStyle(AppTheme.textSecondary)
                    Text(isImprove ? "Improve a Lesson" : isIdeas ? "Quick Ideas" : "Build a Lesson")
                        .fontWeight(.semibold).foregroundStyle(AppTheme.forest)
                }
                .font(.footnote)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                Spacer(minLength: 8)
                Button("+ \(isImprove ? "New plan" : isIdeas ? "New ideas" : "New lesson")", action: onNew)
                    .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                    .fixedSize()
            }

            FlowChips(items: [
                meta.isEmpty ? nil : (meta, AppTheme.mintTint),
                doc.minutesLabel.map { ($0, AppTheme.background) },
            ].compactMap { $0 }, trailing: kind)

            Text(lessonTitle(plan))
                .font(.title2.weight(.heavy))
                .foregroundStyle(AppTheme.forest)
                .fixedSize(horizontal: false, vertical: true)
            if let approach = plan.approach?.trimmingCharacters(in: .whitespacesAndNewlines), !approach.isEmpty {
                Text(approach).font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                Button(action: onToggleSaved) {
                    Label(plan.saved ? "Saved" : "Save for Later", systemImage: plan.saved ? "checkmark" : "star")
                        .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.cream)
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(AppTheme.forest, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(plan.saved ? .isSelected : [])

                Button { Task { await model.share(plan) } } label: {
                    HStack(spacing: 6) {
                        if model.sharing { ProgressView().tint(AppTheme.forest) } else { Image(systemName: "square.and.arrow.up") }
                        Text(model.sharing ? "Sharing…" : "Share")
                    }
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(AppTheme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(AppTheme.hairline))
                }
                .buttonStyle(.plain)
                .disabled(model.sharing)

                Menu {
                    Button { Task { await model.download(exportDoc(content: content, doc: doc), format: "docx") } } label: {
                        Label("Word document", systemImage: "doc.richtext")
                    }
                    Button { Task { await model.download(exportDoc(content: content, doc: doc), format: "pdf") } } label: {
                        Label("PDF", systemImage: "doc")
                    }
                } label: {
                    HStack(spacing: 6) {
                        if model.exporting != nil { ProgressView().tint(AppTheme.forest) } else { Image(systemName: "arrow.down.to.line") }
                        Text(model.exporting != nil ? "Preparing…" : content != nil ? "Download as Word" : "Download")
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(AppTheme.goldTint, in: Capsule())
                }
                .disabled(model.exporting != nil)

                CopyBlocksButton(
                    label: isIdeas ? "Copy All Ideas" : "Copy Entire Lesson",
                    what: "the entire lesson",
                    blocks: { wholeLesson(content: content, doc: doc) },
                    prominent: true
                )
            }

            ForEach([model.shareError, model.exportError].compactMap { $0 }, id: \.self) { error in
                Text(error).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }

            if canAdapt {
                Button("Adapt this lesson for your class ↓") {
                    withAnimation { scroll?.scrollTo("make-it-yours", anchor: .top) }
                }
                .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                .underline()
            }
        }
        .sheet(item: $model.shareFile) { file in
            LessonShareSheet(item: file.item).presentationDetents([.medium, .large])
        }
    }

    private func wholeLesson(content: TemplateContent?, doc: LessonDocContent) -> [CopyBlock] {
        let meta = metaLine(plan, doc)
        let head: [CopyBlock] = [.h1(lessonTitle(plan))] + (meta.isEmpty ? [] : [.p(meta)])
        if let content {
            return head + content.sections.flatMap { [CopyBlock.h2($0.title)] + textBlocks($0.text) }
        }
        return head + documentSections(doc, preview: true).flatMap { [CopyBlock.h2($0.title)] + $0.copy }
    }

    /// What the Word or PDF file is laid out from: the school's format when the
    /// lesson is in one, otherwise Wivoza's own sections.
    private func exportDoc(content: TemplateContent?, doc: LessonDocContent) -> LessonExportDoc {
        let meta = metaLine(plan, doc)
        if let content {
            return LessonExportDoc(
                title: lessonTitle(plan),
                subtitle: [content.templateName, meta.isEmpty ? nil : meta].compactMap { $0 }.joined(separator: " · "),
                sections: content.sections.map { ($0.title, textBlocks($0.text)) }
            )
        }
        return LessonExportDoc(
            title: lessonTitle(plan),
            subtitle: meta.isEmpty ? nil : meta,
            sections: documentSections(doc, preview: true).map { ($0.title, $0.copy) }
        )
    }
}

extension LessonWorkspaceView where Extras == EmptyView {
    init(
        plan: LessonPlan, model: LessonWorkspaceModel, format: LessonFormatModel,
        apply: @escaping (LessonPlan) -> Void, onToggleSaved: @escaping () -> Void, onNew: @escaping () -> Void,
        onManageFormats: @escaping () -> Void, onBackToWeek: (() -> Void)? = nil, scroll: ScrollViewProxy? = nil
    ) {
        self.init(
            plan: plan, model: model, format: format, apply: apply, onToggleSaved: onToggleSaved, onNew: onNew,
            onManageFormats: onManageFormats, onBackToWeek: onBackToWeek, scroll: scroll, extras: { EmptyView() }
        )
    }
}

/// The subject/grade and length chips, then what kind of thing this is.
private struct FlowChips: View {
    let items: [(String, Color)]
    let trailing: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { chips; kindText }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) { chips }
                kindText
            }
        }
    }

    private var chips: some View {
        ForEach(items, id: \.0) { text, tint in
            Text(text)
                .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                .lineLimit(1)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(tint, in: Capsule())
                .overlay(Capsule().strokeBorder(tint == AppTheme.background ? AppTheme.hairline : .clear))
        }
    }

    private var kindText: some View {
        Text(trailing.uppercased()).font(.caption2.weight(.bold)).tracking(1.2).foregroundStyle(AppTheme.textSecondary)
    }
}

// MARK: - Past lessons

/// Everything the teacher has built here, not just what they starred; tapping
/// a row reopens it in the workspace. Mirrors `PastList.tsx`.
struct LessonPastList: View {
    let title: String
    let plans: [LessonPlan]
    let activeId: String?
    let loading: Bool
    let emptyText: String
    let onOpen: (LessonPlan) -> Void
    @State private var savedOnly = false
    @State private var showAll = false

    private static let shownAtFirst = 8

    var body: some View {
        let filtered = savedOnly ? plans.filter(\.saved) : plans
        let shown = showAll ? filtered : Array(filtered.prefix(Self.shownAtFirst))
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.uppercased()).font(.caption.weight(.bold)).tracking(1).foregroundStyle(AppTheme.terracotta600)
                Spacer()
                if !plans.isEmpty {
                    Picker("Show", selection: $savedOnly) {
                        Text("All · \(plans.count)").tag(false)
                        Text("Saved · \(plans.filter(\.saved).count)").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                }
            }
            if loading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary).frame(maxWidth: .infinity)
            } else if filtered.isEmpty {
                Text(savedOnly && !plans.isEmpty ? "Nothing starred yet. Tap \"Save for Later\" to star one." : emptyText)
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(shown) { plan in row(plan) }
                if filtered.count > Self.shownAtFirst {
                    Button(showAll ? "Show fewer" : "Show all \(filtered.count)") { showAll.toggle() }
                        .font(.footnote.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func row(_ plan: LessonPlan) -> some View {
        let label = [plan.isWeek ? "Week" : nil, plan.subject, plan.gradeLevel].compactMap { $0 }.joined(separator: " · ")
        let text = plan.objective ?? plan.fileName ?? plan.planText.map { String($0.prefix(200)) } ?? "Lesson plan"
        let active = plan.id == activeId
        return Button { onOpen(plan) } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(dayLabel(plan.createdAt)).font(.caption).foregroundStyle(AppTheme.textSecondary)
                        if !label.isEmpty {
                            Text(label).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
                                .lineLimit(1)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(AppTheme.mintTint.opacity(0.6), in: Capsule())
                        }
                    }
                    Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        .lineLimit(2).multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if plan.saved {
                    Image(systemName: "star.fill").font(.caption).foregroundStyle(AppTheme.terracotta600)
                }
                Text(active ? "Open" : "Open →").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
            }
            .padding(12)
            .background(active ? AppTheme.mintTint.opacity(0.4) : AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(active ? AppTheme.forest : AppTheme.hairline))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func dayLabel(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: date), to: Calendar.current.startOfDay(for: Date())).day ?? 0
        if days <= 0 { return "Today" }
        if days == 1 { return "Yesterday" }
        if days < 7 { return "\(days) days ago" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
