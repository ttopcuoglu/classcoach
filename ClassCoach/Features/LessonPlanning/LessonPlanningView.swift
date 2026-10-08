import SwiftUI
import UniformTypeIdentifiers

/// Planning Coach. Assignment Coach is the fourth chip rather than a seventh
/// tab — every chip here is one planning job, and a chip row puts them one tap
/// apart instead of a tool apart.
///
/// The chips sit above the scroll rather than inside it, the way Practice's
/// section chips do, so the assignment tab can bring its own scrolling instead
/// of nesting one ScrollView inside another.
struct LessonPlanningView: View {
    @State private var tab: String

    /// Lets a caller open straight onto a chip, the way the web's
    /// `/lesson-planning?tab=assignment` does — Home links to the assignment
    /// review rather than to a second, separate Assignment Coach screen.
    init(initialTab: String = "generate") {
        _tab = State(initialValue: initialTab)
    }

    /// The chip values are unchanged even though the labels are not: they are
    /// what Home and the web's URLs pass in, and a renamed tab is no reason to
    /// break a link somebody saved.
    private let tabs: [(label: String, value: String?)] = [
        ("Build a Lesson", "generate"),
        ("Improve a Lesson", "feedback"),
        ("Review Slides", "presentation"),
        ("Review an Assignment", "assignment"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ChipRow(items: tabs, selection: tab) { tab = $0 ?? "generate" }
                .padding(.vertical, 10)

            if tab == "assignment" {
                AssignmentCoachView(embedded: true)
            } else if tab == "presentation" {
                // Brings its own scrolling, like the assignment tab, rather than
                // nesting a ScrollView inside the one below.
                PresentationReviewContent()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if tab == "generate" {
                            PanelHeader(
                                eyebrow: "Planning Coach",
                                title: "Build a lesson",
                                subtitle: "Start with a topic, or the material you already have. Everything else is optional."
                            )
                            BuildPanel()
                        } else {
                            PanelHeader(
                                eyebrow: "Planning Coach",
                                title: "Improve a lesson",
                                subtitle: "Paste or upload a plan you already have — finished, partial, or rough notes. Your learning goal and the parts that work stay as they are."
                            )
                            FeedbackPanel()
                        }
                    }
                    .padding()
                }
            }
        }
        .background(AppTheme.background)
        .navigationTitle("Planning Coach")
    }
}

// MARK: - Shared pieces

private func labeledBlock(_ title: String, _ text: String, _ tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.caption2.weight(.bold)).foregroundStyle(tint)
        Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background((tint == AppTheme.textSecondary ? AppTheme.gold : tint).opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
}

/// A section a teacher opens only when they want it. Checks, misconceptions
/// and the exit ticket's answer key are all genuinely useful and all genuinely
/// long — printed open, they bury the lesson they belong to.
private struct Expandable<Content: View>: View {
    let summary: String
    @ViewBuilder var content: Content
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { open.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.top, 2)
                    Text(summary)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)

            if open { content }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
    }
}

private func detailRow(_ title: String, _ body: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(title.uppercased()).font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(AppTheme.textSecondary)
        Text(body).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
}

private func planHeadline(_ plan: LessonPlan) -> some View {
    let kind: String = {
        if plan.mode != "generated" { return "Feedback" }
        if plan.isQuickIdeas { return "Teaching ideas" }
        return plan.isFullLesson ? "Lesson" : "Sample plan"
    }()
    let chips = [plan.subject, plan.gradeLevel, plan.approach, plan.minutesLabel].compactMap { $0 }

    return VStack(alignment: .leading, spacing: 4) {
        Text(([kind] + chips).joined(separator: " · ").uppercased())
            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
        if let objective = plan.objective {
            Text(objective).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        if let standard = plan.standard {
            Text("Standard: \(standard)").font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }
}

/// The full lesson, section by section.
@ViewBuilder
private func lessonSections(_ plan: LessonPlan) -> some View {
    VStack(alignment: .leading, spacing: 10) {
        if plan.objective != nil || plan.successCriteria != nil {
            VStack(alignment: .leading, spacing: 8) {
                Text("WHAT STUDENTS WILL BE ABLE TO DO")
                    .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                if let objective = plan.objective { detailRow("Objective", objective) }
                if let criteria = plan.successCriteria { detailRow("Students can show it when they", criteria) }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.mintTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
        }

        if let materials = plan.materials { labeledBlock("MATERIALS", materials, AppTheme.textSecondary) }

        if !(plan.sequence ?? []).isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("THE LESSON").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                Text("What happens, in order, with what you say and what students do")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                ForEach(Array((plan.sequence ?? []).enumerated()), id: \.offset) { index, step in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(index + 1). \(step.title)")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.primary)
                            Spacer(minLength: 8)
                            if let minutes = step.minutes {
                                Text("\(minutes) min")
                                    .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(AppTheme.goldTint, in: Capsule())
                            }
                        }
                        if let teacher = step.teacher { detailRow("You", teacher) }
                        if let students = step.students { detailRow("Students", students) }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        }

        if !(plan.checks ?? []).isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("CHECKS FOR UNDERSTANDING").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                Text("Where to find out whether they're getting it — not whether they're busy")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                ForEach(plan.checks ?? []) { check in
                    Expandable(summary: [check.when, check.check].compactMap { $0 }.joined(separator: " — ")) {
                        VStack(alignment: .leading, spacing: 8) {
                            detailRow("The check", check.check)
                            if let lookFor = check.lookFor { detailRow("What to look for", lookFor) }
                        }
                    }
                }
            }
        }

        if !(plan.misconceptions ?? []).isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("LIKELY MISCONCEPTIONS").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                ForEach(plan.misconceptions ?? []) { item in
                    Expandable(summary: item.belief) {
                        VStack(alignment: .leading, spacing: 8) {
                            if let surface = item.surface { detailRow("How to surface it", surface) }
                            if let response = item.response { detailRow("How to address it", response) }
                        }
                    }
                }
                Text("These are common for this content at this grade. They are not a claim about your students — you'll find out which ones are in the room when you ask.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
        }

        if let ticket = plan.exitTicket {
            VStack(alignment: .leading, spacing: 8) {
                Text("EXIT TICKET").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("FOR STUDENTS").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                    Text(ticket.task).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))

                if !ticket.detail.isEmpty {
                    Expandable(summary: "What to look for in the answers") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(ticket.detail, id: \.title) { detailRow($0.title, $0.body) }
                        }
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.goldTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

/// The old five-slot sample plans, still in teachers' histories and still read.
@ViewBuilder
private func legacySections(_ plan: LessonPlan) -> some View {
    if let doNow = plan.doNow { labeledBlock("DO NOW", doNow, AppTheme.textSecondary) }
    if let agenda = plan.agenda { labeledBlock("AGENDA", agenda, AppTheme.textSecondary) }
    if let closure = plan.closure { labeledBlock("CLOSURE", closure, AppTheme.textSecondary) }
    if let hots = plan.hots { labeledBlock("HIGHER-ORDER THINKING", hots, AppTheme.accent) }
    if let homework = plan.homework { labeledBlock("HOMEWORK", homework, AppTheme.textSecondary) }
}

@ViewBuilder
private func quickIdeaSections(_ plan: LessonPlan) -> some View {
    ForEach(Array((plan.quickIdeas ?? []).enumerated()), id: \.offset) { index, idea in
        VStack(alignment: .leading, spacing: 4) {
            Text("\(index + 1). \(idea.title)")
                .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.primary)
            Text(idea.how).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
    }
}

// MARK: - Adaptations

/// The four adaptations, offered on a lesson that already exists. Each drafts
/// a revision the teacher reads before anything replaces what they have —
/// nothing here edits the lesson on its own.
private struct AdaptationTools: View {
    let plan: LessonPlan
    let busy: LessonAdaptation?
    let onAdapt: (LessonAdaptation, Int?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Adapt it").font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.primary)
            Text("Each one rewrites the lesson and shows you the result first — your current version stays until you apply it.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)

            ForEach([LessonAdaptation.simplify, .challenge, .participation]) { action in
                Button {
                    onAdapt(action, nil)
                } label: {
                    adaptLabel(action.label, busy == action, action.hint)
                }
                .buttonStyle(.plain)
                .disabled(busy != nil)
            }

            // Adjust Time is a menu rather than a button: it needs a length,
            // and "shorten to 30" only makes sense when there is something to
            // shorten.
            Menu {
                if let minutes = plan.currentMinutes, minutes > 30 {
                    Button("Shorten to 30 minutes") { onAdapt(.time, 30) }
                }
                ForEach([20, 40, 50, 60, 90], id: \.self) { minutes in
                    Button("Rebuild for \(minutes) minutes") { onAdapt(.time, minutes) }
                }
            } label: {
                adaptLabel(LessonAdaptation.time.label, busy == .time, LessonAdaptation.time.hint)
            }
            .disabled(busy != nil)

            ProgressRing(active: busy != nil, estimatedSeconds: 18, label: "Revising the lesson")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }

    private func adaptLabel(_ title: String, _ working: Bool, _ hint: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(working ? "\(title)…" : title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.primary)
            Text(hint).font(.caption).foregroundStyle(AppTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .opacity(working ? 0.6 : 1)
    }
}

/// The drafted revision, read before it replaces anything.
private struct PendingAdaptationCard: View {
    let pending: PendingAdaptation
    let applying: Bool
    let onApply: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(pending.label.uppercased()) — SUGGESTED REVISION")
                .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
            Text("Read it, then use it or discard it. Nothing changes until you do.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)

            if let summary = pending.summary { detailRow("What changed", summary) }

            Expandable(summary: "See the revised lesson") {
                VStack(alignment: .leading, spacing: 8) {
                    if let planText = pending.sections.planText {
                        Text(planText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    } else {
                        if let objective = pending.sections.objective { detailRow("Objective", objective) }
                        if let criteria = pending.sections.successCriteria { detailRow("Success criteria", criteria) }
                        ForEach(Array((pending.sections.sequence ?? []).enumerated()), id: \.offset) { index, step in
                            detailRow(
                                "\(index + 1). \(step.title)" + (step.minutes.map { " · \($0) min" } ?? ""),
                                [step.teacher.map { "You: \($0)" }, step.students.map { "Students: \($0)" }]
                                    .compactMap { $0 }.joined(separator: "\n")
                            )
                        }
                        if let ticket = pending.sections.exitTicket { detailRow("Exit ticket", ticket.task) }
                    }
                }
            }

            HStack {
                Button(applying ? "Applying…" : "Use this version", action: onApply)
                    .font(.caption.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(AppTheme.terracotta, in: Capsule())
                    .disabled(applying)

                Button("Discard", action: onDiscard)
                    .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                    .disabled(applying)
            }

            ProgressRing(active: applying, estimatedSeconds: 6, label: "Applying the revision")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.mintTint.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct RevertNote: View {
    let count: Int
    let reverting: Bool
    let onRevert: () -> Void

    var body: some View {
        if count > 0 {
            HStack(spacing: 4) {
                Text(count == 1 ? "One adaptation applied." : "\(count) adaptations applied.")
                Button(reverting ? "going back…" : "Go back to your original") { onRevert() }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.terracotta600)
                    .disabled(reverting)
            }
            .font(.caption)
            .foregroundStyle(AppTheme.textSecondary)
        }
    }
}

// MARK: - Build a Lesson

private struct BuildPanel: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var topic = ""
    @State private var subject = ""
    @State private var gradeLevel = ""
    @State private var durationMinutes = 45
    @State private var standard = ""
    @State private var unitName = ""
    @State private var essentialQuestion = ""
    @State private var additionalContext = ""
    @State private var kind = "full"
    @State private var showMoreDetails = false

    /// Optional starting material: slides, a reading, a worksheet, an activity.
    @State private var materialText: String?
    @State private var materialName: String?
    @State private var reading = false
    @State private var showImporter = false
    @State private var materialError: String?
    @State private var suggestedFields: [String] = []
    @State private var followUp: String?

    @State private var plan: LessonPlan?
    @State private var generating = false
    @State private var error: String?
    @State private var allPlans: [LessonPlan] = []
    @State private var historyLoading = true

    @State private var adaptBusy: LessonAdaptation?
    @State private var applying = false
    @State private var reverting = false
    @State private var adaptError: String?

    private var savedPlans: [LessonPlan] { allPlans.filter(\.saved) }
    private var isIdeas: Bool { kind == "ideas" }
    private var canGenerate: Bool {
        !topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || materialText != nil
    }

    /// Every format the shared document reader handles — scans go through OCR.
    private var importTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg]
        for ext in ["docx", "pptx", "xlsx", "xls"] {
            if let type = UTType(filenameExtension: ext) { types.append(type) }
        }
        return types
    }

    /// A profile field like "7th,8th" is a list of what this teacher teaches.
    /// One value prefills; several become chips, because guessing which of a
    /// teacher's three preps a lesson is for is exactly the guess that makes a
    /// prefilled form worse than an empty one.
    private func profileList(_ value: String?) -> [String] {
        (value ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let plan {
                resultView(plan)
            } else {
                form
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600).frame(maxWidth: .infinity, alignment: .center)
            }

            historySection
        }
        .task { await loadHistory() }
        .onAppear(perform: prefillFromProfile)
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await readMaterial(url) } }
        }
    }

    // MARK: Form

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Topic or learning goal").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                Text("What are you teaching? Enter a topic, learning goal, or paste material.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                TextEditor(text: $topic)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 72)
                    .padding(8)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                    .disabled(generating)
                if topic.isEmpty {
                    Text("e.g. introducing cells").font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
            }

            materialRow

            if let followUp {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ONE QUESTION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                    Text(followUp).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.goldTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
            }

            pickerField("Grade level", options: profileList(authManager.currentUser?.gradeLevels), text: $gradeLevel, placeholder: "e.g. 7th grade")
            pickerField("Subject", options: profileList(authManager.currentUser?.subjects), text: $subject, placeholder: "e.g. Science")

            durationField

            DisclosureGroup("More details — optional", isExpanded: $showMoreDetails) {
                VStack(alignment: .leading, spacing: 10) {
                    field("Standard", $standard)
                    field("Unit name", $unitName)
                    field("Essential question", $essentialQuestion)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Anything else").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                        Text("Student needs, what you have in the room, where the class is coming from.")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        TextEditor(text: $additionalContext)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 60)
                            .padding(8)
                            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                    }
                }
                .padding(.top, 8)
            }
            .font(.subheadline.weight(.semibold))
            .tint(AppTheme.primary)
            .padding(12)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))

            outputChooser

            ProgressRing(
                active: generating,
                estimatedSeconds: isIdeas ? 10 : 22,
                label: isIdeas ? "Putting together ideas" : "Building your lesson",
                hint: isIdeas ? "Usually about ten seconds." : "Usually about twenty seconds."
            )

            Button {
                Task { await generate() }
            } label: {
                Text(generating ? (isIdeas ? "Generating…" : "Building…") : (isIdeas ? "Generate Ideas" : "Build My Lesson"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(canGenerate && !generating ? AppTheme.terracotta : AppTheme.terracotta.opacity(0.4), in: Capsule())
            }
            .disabled(!canGenerate || generating || reading)
        }
    }

    @ViewBuilder
    private var materialRow: some View {
        if reading {
            ProgressRing(active: true, estimatedSeconds: 8, label: "Reading your file", hint: "Pulling the text out, then filling in what it's about.")
        } else if let materialName {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(materialName, systemImage: "doc.text")
                        .font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    Button("Remove") { clearMaterial() }
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                }
                Text("The lesson will be built around this.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                if !suggestedFields.isEmpty {
                    Text("Filled in the \(suggestedFields.joined(separator: ", ")) from your file — change anything that isn't right.")
                        .font(.caption).foregroundStyle(AppTheme.primary)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
        } else {
            Button {
                showImporter = true
            } label: {
                Label("Upload materials — start from slides, a reading, a worksheet or an activity", systemImage: "arrow.up.doc")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }

        if let materialError {
            Text(materialError).font(.caption).foregroundStyle(AppTheme.terracotta600)
        }
    }

    private var durationField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("How much time do you have?").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            ChipRow(
                items: [30, 45, 50, 60, 90].map { (label: "\($0) min", value: Optional("\($0)")) },
                selection: "\(durationMinutes)"
            ) { picked in
                if let picked, let minutes = Int(picked) { durationMinutes = minutes }
            }
            Stepper("Custom: \(durationMinutes) minutes", value: $durationMinutes, in: 5...240, step: 5)
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    /// Two genuinely different outputs, one chip row. Full Lesson is the
    /// default because it is what most teachers opening this screen want;
    /// Quick Ideas is for the plan they are already writing.
    private var outputChooser: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("What do you want back?").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            ChipRow(
                items: [("Full Lesson", Optional("full")), ("Quick Ideas", Optional("ideas"))],
                selection: kind
            ) { kind = $0 ?? "full" }
            Text(isIdeas ? "3-5 practical teaching ideas, briefly explained." : "A complete lesson you can teach and edit.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func field(_ title: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            TextField(title, text: text).textFieldStyle(.roundedBorder)
        }
    }

    /// A free-text field with the teacher's own profile values offered above
    /// it — both editable, and the chips only appear when there is a real
    /// choice to make.
    private func pickerField(_ title: String, options: [String], text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            if options.count > 1 {
                ChipRow(items: options.map { (label: $0, value: Optional($0)) }, selection: text.wrappedValue) {
                    if let picked = $0 { text.wrappedValue = picked }
                }
            }
            TextField(placeholder, text: text).textFieldStyle(.roundedBorder)
        }
    }

    // MARK: Result

    @ViewBuilder
    private func resultView(_ plan: LessonPlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            planHeadline(plan)

            if plan.isFullLesson {
                lessonSections(plan)
            } else if plan.isQuickIdeas {
                quickIdeaSections(plan)
            } else {
                legacySections(plan)
            }

            Text(plan.isQuickIdeas
                 ? "Ideas to pull into the plan you are writing — take the ones that fit your class."
                 : "A draft to edit, not a script. You know your class; change whatever needs changing.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)

            if plan.isFullLesson {
                AdaptationTools(plan: plan, busy: adaptBusy) { action, minutes in
                    Task { await adapt(plan, action, minutes) }
                }
                RevertNote(count: plan.versionHistory?.count ?? 0, reverting: reverting) {
                    Task { await revert(plan) }
                }
                if let adaptError {
                    Text(adaptError).font(.caption).foregroundStyle(AppTheme.terracotta600)
                }
                if let pending = plan.pendingAdaptation {
                    PendingAdaptationCard(
                        pending: pending,
                        applying: applying,
                        onApply: { Task { await applyAdaptation(plan) } },
                        onDiscard: { Task { await discardAdaptation(plan) } }
                    )
                }
            }

            HStack {
                saveButton(plan.saved) { Task { await toggleSaved(plan) } }
                Spacer()
                Button(plan.isQuickIdeas ? "New Ideas" : "New Lesson") { startOver() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .background(AppTheme.terracotta, in: Capsule())
            }
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SAVED LESSONS").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedPlans.isEmpty {
                Text("Lessons you save will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding()
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            } else {
                ForEach(savedPlans) { LessonPlanRow(plan: $0) }
            }
        }
    }

    // MARK: Actions

    private func prefillFromProfile() {
        guard let user = authManager.currentUser else { return }
        if gradeLevel.isEmpty { gradeLevel = profileList(user.gradeLevels).first ?? "" }
        if subject.isEmpty { subject = profileList(user.subjects).first ?? "" }
    }

    private func loadHistory() async {
        do { allPlans = try await LessonPlanningService.getLessonPlans(mode: "generated") } catch {}
        historyLoading = false
    }

    private func readMaterial(_ url: URL) async {
        // Files chosen from Files/iCloud are security-scoped.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        reading = true
        materialError = nil
        suggestedFields = []
        followUp = nil
        do {
            let text = try await LessonPlanningService.extractMaterial(fileURL: url)
            materialText = text
            materialName = url.lastPathComponent

            // What the file appears to be about, offered as a filled-in field
            // the teacher can change — never overwriting something they typed.
            if let inferred = try? await LessonPlanningService.inferContext(text: text) {
                var filled: [String] = []
                if let value = inferred.topic, topic.trimmingCharacters(in: .whitespaces).isEmpty {
                    topic = value
                    filled.append("topic")
                }
                if let value = inferred.subject, subject.trimmingCharacters(in: .whitespaces).isEmpty {
                    subject = value
                    filled.append("subject")
                }
                if let value = inferred.gradeLevel, gradeLevel.trimmingCharacters(in: .whitespaces).isEmpty {
                    gradeLevel = value
                    filled.append("grade level")
                }
                suggestedFields = filled
                followUp = inferred.followUp
            }
        } catch {
            materialError = "Could not read that file. You can still type the topic instead."
        }
        reading = false
    }

    private func clearMaterial() {
        materialText = nil
        materialName = nil
        materialError = nil
        suggestedFields = []
        followUp = nil
    }

    private func generate() async {
        generating = true
        error = nil
        do {
            let result = try await LessonPlanningService.generate(
                objective: topic.trimmingCharacters(in: .whitespacesAndNewlines),
                unitName: unitName.isEmpty ? nil : unitName,
                essentialQuestion: essentialQuestion.isEmpty ? nil : essentialQuestion,
                standard: standard.isEmpty ? nil : standard,
                subject: subject.isEmpty ? nil : subject,
                gradeLevel: gradeLevel.isEmpty ? nil : gradeLevel,
                additionalContext: additionalContext.isEmpty ? nil : additionalContext,
                sourceMaterial: materialText,
                durationMinutes: durationMinutes,
                kind: kind
            )
            plan = result
            allPlans.insert(result, at: 0)
        } catch {
            self.error = error.localizedDescription
        }
        generating = false
    }

    private func adapt(_ target: LessonPlan, _ action: LessonAdaptation, _ minutes: Int?) async {
        guard adaptBusy == nil else { return }
        adaptBusy = action
        adaptError = nil
        do {
            replace(try await LessonPlanningService.adapt(id: target.id, action: action, targetMinutes: minutes))
        } catch {
            adaptError = error.localizedDescription
        }
        adaptBusy = nil
    }

    private func applyAdaptation(_ target: LessonPlan) async {
        applying = true
        adaptError = nil
        do {
            replace(try await LessonPlanningService.applyAdaptation(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
        applying = false
    }

    private func discardAdaptation(_ target: LessonPlan) async {
        do {
            replace(try await LessonPlanningService.discardAdaptation(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
    }

    private func revert(_ target: LessonPlan) async {
        reverting = true
        adaptError = nil
        do {
            replace(try await LessonPlanningService.revert(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
        reverting = false
    }

    private func replace(_ updated: LessonPlan) {
        plan = updated
        if let index = allPlans.firstIndex(where: { $0.id == updated.id }) { allPlans[index] = updated }
    }

    private func toggleSaved(_ target: LessonPlan) async {
        do {
            let updated = try await LessonPlanningService.setSaved(id: target.id, saved: !target.saved)
            if plan?.id == target.id { plan = updated }
            if let index = allPlans.firstIndex(where: { $0.id == target.id }) { allPlans[index] = updated }
        } catch {}
    }

    private func startOver() {
        plan = nil
        error = nil
        adaptError = nil
        clearMaterial()
    }
}

// MARK: - Improve a Lesson

private struct FeedbackPanel: View {
    @State private var planText = ""
    @State private var plan: LessonPlan?
    @State private var submitting = false
    @State private var error: String?
    @State private var allPlans: [LessonPlan] = []
    @State private var historyLoading = true

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?
    @State private var applyingRevision = false
    @State private var revisionDismissed = false

    @State private var showImporter = false
    @State private var extracting = false
    @State private var fileName: String?

    @State private var adaptBusy: LessonAdaptation?
    @State private var applying = false
    @State private var reverting = false
    @State private var adaptError: String?

    private var savedPlans: [LessonPlan] { allPlans.filter(\.saved) }

    private var importTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg]
        for ext in ["docx", "pptx", "xlsx", "xls"] {
            if let type = UTType(filenameExtension: ext) { types.append(type) }
        }
        return types
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let plan {
                resultView(plan)
            } else {
                form
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600).frame(maxWidth: .infinity, alignment: .center)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("SAVED FEEDBACK").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
                if historyLoading {
                    Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else if savedPlans.isEmpty {
                    Text("Plans you save will show up here.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .center).padding()
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                } else {
                    ForEach(savedPlans) { LessonPlanRow(plan: $0) }
                }
            }
        }
        .task { await loadHistory() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await readFile(url) } }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your lesson plan").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            Text("A full plan, a half-written one, or the notes you were going to teach from.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)

            if extracting {
                ProgressRing(active: true, estimatedSeconds: 8, label: "Reading your file", hint: "Pulling the text out — this only takes a moment.")
            }

            TextEditor(text: $planText)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 160)
                .padding(8)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                .disabled(submitting)

            HStack {
                Button {
                    showImporter = true
                } label: {
                    Label(fileName.map { "Replace \($0)" } ?? "Or upload a file", systemImage: "arrow.up.doc")
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                }
                .buttonStyle(.plain)
                Spacer()
            }

            ProgressRing(active: submitting, estimatedSeconds: 12, label: "Reading your plan", hint: "Usually about fifteen seconds.")

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Reading your plan…" : "Improve My Lesson")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(planText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || submitting || extracting)
        }
    }

    @ViewBuilder
    private func resultView(_ plan: LessonPlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            labeledBlock("YOUR PLAN", plan.planText ?? "", AppTheme.textSecondary)
            if let feedback = plan.feedback {
                labeledBlock("COACHING", feedback, AppTheme.accent)
            }

            AdaptationTools(plan: plan, busy: adaptBusy) { action, minutes in
                Task { await adapt(plan, action, minutes) }
            }
            RevertNote(count: plan.versionHistory?.count ?? 0, reverting: reverting) {
                Task { await revert(plan) }
            }
            if let adaptError {
                Text(adaptError).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
            if let pending = plan.pendingAdaptation {
                PendingAdaptationCard(
                    pending: pending,
                    applying: applying,
                    onApply: { Task { await applyAdaptation(plan) } },
                    onDiscard: { Task { await discardAdaptation(plan) } }
                )
            }

            followUpChat(plan)

            if let revision = plan.suggestedRevision, !revisionDismissed {
                VStack(alignment: .leading, spacing: 8) {
                    Text("SUGGESTED REVISION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                    Text(revision).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    HStack {
                        Button(applyingRevision ? "Applying..." : "Use this version") {
                            Task { await applyRevision(plan) }
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(AppTheme.terracotta, in: Capsule())
                        .disabled(applyingRevision)

                        Button("Dismiss") { revisionDismissed = true }
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                    }

                    ProgressRing(active: applyingRevision, estimatedSeconds: 12, label: "Applying the revision")
                }
                .padding(10)
                .background(AppTheme.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }

            HStack {
                saveButton(plan.saved) { Task { await toggleSaved(plan) } }
                Spacer()
                Button("New Plan") { startOver() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .background(AppTheme.terracotta, in: Capsule())
            }
        }
    }

    private func followUpChat(_ target: LessonPlan) -> some View {
        let conversation = target.conversation ?? []
        let followUps = conversation.count > 2 ? Array(conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps, draft: $chatDraft, sending: chatSending, error: chatError,
            placeholder: "Ask a follow-up, or ask the coach to revise your plan..."
        ) {
            Task { await sendChat(target) }
        }
    }

    private func loadHistory() async {
        do { allPlans = try await LessonPlanningService.getLessonPlans(mode: "feedback") } catch {}
        historyLoading = false
    }

    private func readFile(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }

        extracting = true
        error = nil
        do {
            planText = try await LessonPlanningService.extractMaterial(fileURL: url)
            fileName = url.lastPathComponent
        } catch {
            self.error = "Could not read that file. Please try pasting the text instead."
        }
        extracting = false
    }

    private func submit() async {
        submitting = true
        error = nil
        do {
            let result = try await LessonPlanningService.submitFeedback(
                planText: planText.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            plan = result
            allPlans.insert(result, at: 0)
        } catch {
            self.error = error.localizedDescription
        }
        submitting = false
    }

    private func sendChat(_ target: LessonPlan) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            replace(try await LessonPlanningService.sendChat(id: target.id, message: trimmed))
            revisionDismissed = false
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }

    private func applyRevision(_ target: LessonPlan) async {
        applyingRevision = true
        do {
            replace(try await LessonPlanningService.applyRevision(id: target.id))
        } catch {
            self.error = error.localizedDescription
        }
        applyingRevision = false
    }

    private func adapt(_ target: LessonPlan, _ action: LessonAdaptation, _ minutes: Int?) async {
        guard adaptBusy == nil else { return }
        adaptBusy = action
        adaptError = nil
        do {
            replace(try await LessonPlanningService.adapt(id: target.id, action: action, targetMinutes: minutes))
        } catch {
            adaptError = error.localizedDescription
        }
        adaptBusy = nil
    }

    private func applyAdaptation(_ target: LessonPlan) async {
        applying = true
        adaptError = nil
        do {
            replace(try await LessonPlanningService.applyAdaptation(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
        applying = false
    }

    private func discardAdaptation(_ target: LessonPlan) async {
        do {
            replace(try await LessonPlanningService.discardAdaptation(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
    }

    private func revert(_ target: LessonPlan) async {
        reverting = true
        adaptError = nil
        do {
            replace(try await LessonPlanningService.revert(id: target.id))
        } catch {
            adaptError = error.localizedDescription
        }
        reverting = false
    }

    private func replace(_ updated: LessonPlan) {
        plan = updated
        if let index = allPlans.firstIndex(where: { $0.id == updated.id }) { allPlans[index] = updated }
    }

    private func toggleSaved(_ target: LessonPlan) async {
        do {
            let updated = try await LessonPlanningService.setSaved(id: target.id, saved: !target.saved)
            if plan?.id == target.id { plan = updated }
            if let index = allPlans.firstIndex(where: { $0.id == target.id }) { allPlans[index] = updated }
        } catch {}
    }

    private func startOver() {
        planText = ""
        plan = nil
        fileName = nil
        error = nil
        adaptError = nil
        chatDraft = ""
        chatError = nil
        revisionDismissed = false
    }
}

private func saveButton(_ saved: Bool, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Label(saved ? "Saved" : "Save for later", systemImage: saved ? "star.fill" : "star")
            .font(.subheadline.weight(.medium))
    }
    .foregroundStyle(saved ? AppTheme.accent : AppTheme.textSecondary)
}

private struct LessonPlanRow: View {
    let plan: LessonPlan
    @State private var expanded = false

    private var kindLabel: String {
        if plan.mode != "generated" { return "Feedback" }
        if plan.isQuickIdeas { return "Teaching ideas" }
        return plan.isFullLesson ? "Lesson" : "Sample plan"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(kindLabel)
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.primary)
                        Text(plan.objective ?? String((plan.planText ?? "").prefix(80)))
                            .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                    Spacer()
                    Text(expanded ? "Hide" : "Show").font(.caption.weight(.medium)).foregroundStyle(AppTheme.textSecondary)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 6) {
                    if plan.isFullLesson {
                        lessonSections(plan)
                    } else if plan.isQuickIdeas {
                        quickIdeaSections(plan)
                    } else if plan.mode == "generated" {
                        legacySections(plan)
                    } else {
                        if let v = plan.planText { labeledBlock("PLAN", v, AppTheme.textSecondary) }
                        if let v = plan.feedback { labeledBlock("COACHING", v, AppTheme.accent) }
                    }
                }
            }
        }
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

#Preview {
    LessonPlanningView()
        .environmentObject(AuthManager.shared)
}
