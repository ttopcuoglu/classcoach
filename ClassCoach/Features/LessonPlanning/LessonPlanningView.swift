import SwiftUI
import UniformTypeIdentifiers

/// Planning Coach. Assignment Coach is the fourth chip rather than a seventh
/// tab — every chip here is one planning job, and a chip row puts them one tap
/// apart instead of a tool apart.
///
/// The chips sit above the scroll rather than inside it, the way Practice's
/// section chips do, so the assignment tab can bring its own scrolling instead
/// of nesting one ScrollView inside another.
/// What a Lesson Debrief suggested, carried into the build form so the next
/// lesson can be planned around it. The room and the suggestions travel; the
/// topic never does — the report knows what was taught, not what comes next.
struct PlanningPrefill {
    var subject: String?
    var gradeLevel: String?
    let additionalContext: String
    /// Which lesson this came from, for the note above the form.
    let source: String
}

struct LessonPlanningView: View {
    @State private var tab: String
    private let prefill: PlanningPrefill?
    @StateObject private var workspace = LessonWorkspaceModel()

    /// Lets a caller open straight onto a chip, the way the web's
    /// `/lesson-planning?tab=assignment` does — Home links to the assignment
    /// review rather than to a second, separate Assignment Coach screen.
    init(initialTab: String = "generate", prefill: PlanningPrefill? = nil) {
        _tab = State(initialValue: initialTab)
        self.prefill = prefill
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
                ScrollViewReader { scroll in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Color.clear.frame(height: 0).id("top")
                            if tab == "generate" {
                                BuildPanel(prefill: prefill, workspace: workspace, scroll: scroll)
                            } else {
                                FeedbackPanel(workspace: workspace, scroll: scroll)
                            }
                        }
                        .padding()
                    }
                }
                // Applying a revision closes its preview; the Undo for it
                // floats over wherever the teacher is on the page.
                .overlay(alignment: .bottom) {
                    LessonUndoToast(model: workspace)
                        .animation(.easeInOut(duration: 0.25), value: workspace.justApplied)
                }
            }
        }
        .background(AppTheme.background)
        .navigationTitle("Planning Coach")
        .onChange(of: tab) { workspace.reset() }
    }
}

// MARK: - Build a Lesson

private struct BuildPanel: View {
    @EnvironmentObject private var authManager: AuthManager
    var prefill: PlanningPrefill? = nil
    @ObservedObject var workspace: LessonWorkspaceModel
    var scroll: ScrollViewProxy?
    /// The lesson a Debrief's suggestions were carried over from, once landed.
    @State private var fromDebrief: String?

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

    @StateObject private var format = LessonFormatModel()
    @State private var formatsOpen = false

    /// Plan a Week: which days the class meets, and anything already fixed on one.
    @State private var weekDays: [(name: String, on: Bool, note: String)] =
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map { ($0, true, "") }
    @State private var showDayNotes = false
    /// The day of a week being built as a full lesson, while it is.
    @State private var openingDay: Int?
    @State private var dayError: String?

    private var isIdeas: Bool { kind == "ideas" }
    private var isWeek: Bool { kind == "week" }
    private var canGenerate: Bool {
        (!topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || materialText != nil)
            && (!isWeek || weekDays.contains(where: \.on))
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
        .task(id: plan.map(LessonFormatModel.signature)) {
            if let plan { await format.sync(plan, apply: replace) }
        }
        .onAppear(perform: prefillFromProfile)
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await readMaterial(url) } }
        }
        .sheet(isPresented: $formatsOpen) {
            LessonFormatsSheet { Task { await format.changed(plan, apply: replace) } }
        }
    }

    // MARK: Form

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            PanelHeader(
                eyebrow: "Planning Coach",
                title: isWeek ? "Plan a week" : "Build a lesson",
                subtitle: isWeek
                    ? "Start with what the class is learning this week. You check the daily objectives before anything else is written."
                    : "Start with a topic, or the material you already have. Everything else is optional."
            )
            if let fromDebrief {
                Text("Carried over from your Lesson Debrief (\(fromDebrief)): what you chose to build in is under More details, and you can edit it there. Add the topic for the next lesson, then build it.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.forest)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.peachTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(isWeek ? "What is the class learning this week?" : "Topic or learning goal")
                    .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                Text(isWeek
                     ? "One goal for the whole week. Wivoza writes an objective for each day, and you check them before the week is filled in."
                     : "What are you teaching? Enter a topic, learning goal, or paste material.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                TextEditor(text: $topic)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 72)
                    .padding(8)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                    .disabled(generating)
                if topic.isEmpty {
                    Text(isWeek ? "e.g. how cells move materials in and out" : "e.g. introducing cells")
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
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

            if isWeek { weekDaysField }

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
                            .frame(minHeight: fromDebrief == nil ? 60 : 180)
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
                estimatedSeconds: isIdeas ? 10 : isWeek ? 8 : 22,
                label: isIdeas ? "Putting together ideas" : isWeek ? "Planning your week" : "Building your lesson",
                hint: isIdeas ? "Usually about ten seconds." : isWeek ? "An objective for each day, in a few seconds." : "Usually about twenty seconds."
            )

            Button {
                Task { await generate() }
            } label: {
                Text(generating
                     ? (isIdeas ? "Generating…" : isWeek ? "Planning…" : "Building…")
                     : (isIdeas ? "Generate Ideas" : isWeek ? "Plan My Week" : "Build My Lesson"))
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
            Text(isWeek ? "How long is each class?" : "How much time do you have?").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
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

    /// Plan a Week's days: which ones the class meets, and anything already
    /// fixed on one — a quiz, a lab, a half day, an objective they have.
    private var weekDaysField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Which days do you teach this class?").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            HStack(spacing: 6) {
                ForEach(weekDays.indices, id: \.self) { i in
                    Button {
                        weekDays[i].on.toggle()
                    } label: {
                        Text(String(weekDays[i].name.prefix(3)))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(weekDays[i].on ? AppTheme.cream : AppTheme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(weekDays[i].on ? AppTheme.forest : AppTheme.card, in: Capsule())
                            .overlay(Capsule().strokeBorder(AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                    .disabled(generating)
                    .accessibilityAddTraits(weekDays[i].on ? .isSelected : [])
                }
            }
            DisclosureGroup("Anything already set on a day? — optional", isExpanded: $showDayNotes) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("A quiz, a lab, a half day, or an objective you already have. Wivoza plans the week around it.")
                        .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(weekDays.indices.filter { weekDays[$0].on }, id: \.self) { i in
                        HStack(spacing: 8) {
                            Text(String(weekDays[i].name.prefix(3)))
                                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                                .frame(width: 36, alignment: .leading)
                            TextField(weekDays[i].name == "Friday" ? "e.g. quiz" : "", text: $weekDays[i].note)
                                .textFieldStyle(.roundedBorder)
                                .disabled(generating)
                        }
                    }
                }
                .padding(.top, 6)
            }
            .font(.caption.weight(.semibold))
            .tint(AppTheme.primary)
        }
    }

    /// Two genuinely different outputs, one chip row. Full Lesson is the
    /// default because it is what most teachers opening this screen want;
    /// Quick Ideas is for the plan they are already writing.
    private var outputChooser: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("What do you want back?").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            ChipRow(
                items: [("Full Lesson", Optional("full")), ("Quick Ideas", Optional("ideas")), ("Plan a Week", Optional("week"))],
                selection: kind
            ) { kind = $0 ?? "full" }
            Text(isIdeas
                 ? "3-5 practical teaching ideas, briefly explained."
                 : isWeek ? "An objective for each day, then the week filled in." : "A complete lesson you can teach and edit.")
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
        if plan.isWeek {
            WeekPlanView(
                plan: plan,
                onPlan: replace,
                onNew: startOver,
                onOpenDay: { index in Task { await openDay(plan, index) } },
                openingDay: openingDay,
                dayError: dayError,
                onToggleSaved: { Task { await toggleSaved(plan) } }
            )
        } else {
            lessonResult(plan)
        }
    }

    private func lessonResult(_ plan: LessonPlan) -> some View {
        // Three shapes can come back here: a Planning Coach lesson, a list of
        // teaching ideas, and — reopened from history — one of the old
        // five-slot sample plans. The workspace draws all three.
        LessonWorkspaceView(
            plan: plan,
            model: workspace,
            format: format,
            apply: replace,
            onToggleSaved: { Task { await toggleSaved(plan) } },
            onNew: startOver,
            onManageFormats: { formatsOpen = true },
            onBackToWeek: plan.weekPlanId.map { id in { Task { await backToWeek(id) } } },
            scroll: scroll
        )
    }

    private var historySection: some View {
        LessonPastList(
            title: "Your lessons",
            plans: allPlans,
            activeId: plan?.id,
            loading: historyLoading,
            emptyText: "Lessons and ideas you build will show up here.",
            onOpen: open
        )
    }

    // MARK: Actions

    private func open(_ target: LessonPlan) {
        plan = target
        error = nil
        dayError = nil
        workspace.reset()
        withAnimation { scroll?.scrollTo("top", anchor: .top) }
    }

    /// A day of a week, opened as a full lesson: the one already built from
    /// it, or a new one built with the week around it as context.
    private func openDay(_ week: LessonPlan, _ index: Int) async {
        guard let days = week.week?.days, index < days.count, openingDay == nil else { return }
        let day = days[index]
        openingDay = index
        dayError = nil
        do {
            let lesson: LessonPlan
            if let id = day.lessonPlanId {
                if let known = allPlans.first(where: { $0.id == id }) {
                    lesson = known
                } else {
                    lesson = try await LessonPlanningService.getLessonPlan(id: id)
                }
            } else {
                lesson = try await LessonPlanningService.generate(
                    objective: day.objective, unitName: week.unitName, essentialQuestion: week.essentialQuestion,
                    standard: week.standard, subject: week.subject, gradeLevel: week.gradeLevel,
                    additionalContext: week.additionalContext, durationMinutes: day.minutes, kind: "full",
                    weekPlanId: week.id, weekDay: index
                )
                allPlans.insert(lesson, at: 0)
                // The week now links to this lesson; keep the copy in the list current.
                if let refreshed = try? await LessonPlanningService.getLessonPlan(id: week.id),
                   let i = allPlans.firstIndex(where: { $0.id == refreshed.id }) {
                    allPlans[i] = refreshed
                }
            }
            plan = lesson
        } catch {
            dayError = error.localizedDescription
        }
        openingDay = nil
    }

    private func backToWeek(_ id: String) async {
        if let known = allPlans.first(where: { $0.id == id && $0.week != nil }) {
            plan = known
        } else if let fetched = try? await LessonPlanningService.getLessonPlan(id: id) {
            plan = fetched
        }
    }

    private func prefillFromProfile() {
        // Arriving from a Lesson Debrief: the room wins over the profile
        // default — it is the class that was recorded — and what the teacher
        // chose lands in "Anything else", where it can be read and changed
        // before anything is built. Once, so coming back to this screen never
        // retypes over an edit.
        if let prefill, fromDebrief == nil {
            if let value = prefill.subject, !value.isEmpty { subject = value }
            if let value = prefill.gradeLevel, !value.isEmpty { gradeLevel = value }
            additionalContext = prefill.additionalContext
            showMoreDetails = true
            fromDebrief = prefill.source
        }
        guard let user = authManager.currentUser else { return }
        if gradeLevel.isEmpty { gradeLevel = profileList(user.gradeLevels).first ?? "" }
        if subject.isEmpty { subject = profileList(user.subjects).first ?? "" }
    }

    private func loadHistory() async {
        do { allPlans = try await LessonPlanningService.getLessonPlans(mode: "generated", includeWeeks: true) } catch {}
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
            if isWeek {
                let result = try await LessonPlanningService.startWeek(
                    objective: topic.trimmingCharacters(in: .whitespacesAndNewlines),
                    unitName: unitName.isEmpty ? nil : unitName,
                    essentialQuestion: essentialQuestion.isEmpty ? nil : essentialQuestion,
                    standard: standard.isEmpty ? nil : standard,
                    subject: subject.isEmpty ? nil : subject,
                    gradeLevel: gradeLevel.isEmpty ? nil : gradeLevel,
                    additionalContext: additionalContext.isEmpty ? nil : additionalContext,
                    sourceMaterial: materialText,
                    durationMinutes: durationMinutes,
                    days: weekDays.filter(\.on).map { day in
                        let note = day.note.trimmingCharacters(in: .whitespacesAndNewlines)
                        return LessonPlanningService.WeekDayRequest(label: day.name, note: note.isEmpty ? nil : note)
                    }
                )
                plan = result
                allPlans.insert(result, at: 0)
                generating = false
                return
            }
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
        workspace.reset()
        dayError = nil
        clearMaterial()
    }
}

// MARK: - Improve a Lesson

private struct FeedbackPanel: View {
    @ObservedObject var workspace: LessonWorkspaceModel
    var scroll: ScrollViewProxy?
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

    @StateObject private var format = LessonFormatModel()
    @State private var formatsOpen = false

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

            LessonPastList(
                title: "Plans you've improved",
                plans: allPlans,
                activeId: plan?.id,
                loading: historyLoading,
                emptyText: "Plans you bring for coaching will show up here.",
                onOpen: open
            )
        }
        .task { await loadHistory() }
        .task(id: plan.map(LessonFormatModel.signature)) {
            if let plan { await format.sync(plan, apply: replace) }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await readFile(url) } }
        }
        .sheet(isPresented: $formatsOpen) {
            LessonFormatsSheet { Task { await format.changed(plan, apply: replace) } }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 10) {
            PanelHeader(
                eyebrow: "Planning Coach",
                title: "Improve a lesson",
                subtitle: "Paste or upload a plan you already have — finished, partial, or rough notes. Your learning goal and the parts that work stay as they are."
            )
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

    /// The same workspace a built lesson opens in: Coach's feedback and the
    /// plan as copyable sections, the tools after them, and the follow-up chat
    /// under the plan it is about.
    private func resultView(_ plan: LessonPlan) -> some View {
        LessonWorkspaceView(
            plan: plan,
            model: workspace,
            format: format,
            apply: replace,
            onToggleSaved: { Task { await toggleSaved(plan) } },
            onNew: startOver,
            onManageFormats: { formatsOpen = true },
            scroll: scroll
        ) {
            VStack(alignment: .leading, spacing: 12) {
                followUpChat(plan)
                if let revision = plan.suggestedRevision, !revisionDismissed {
                    suggestedRevision(plan, revision)
                }
            }
        }
    }

    private func suggestedRevision(_ plan: LessonPlan, _ revision: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SUGGESTED REVISION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
            Text(revision).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
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
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
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

    private func open(_ target: LessonPlan) {
        plan = target
        error = nil
        chatDraft = ""
        chatError = nil
        revisionDismissed = false
        workspace.reset()
        withAnimation { scroll?.scrollTo("top", anchor: .top) }
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
        workspace.reset()
        chatDraft = ""
        chatError = nil
        revisionDismissed = false
    }
}

#Preview {
    LessonPlanningView()
        .environmentObject(AuthManager.shared)
}
