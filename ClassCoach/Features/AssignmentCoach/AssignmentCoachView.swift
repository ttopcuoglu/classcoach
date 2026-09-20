import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Labels shared by the intake and the workspace — the same wording as the
/// web app's Assignment Coach.
enum AssignmentCoachOptions {
    static let aiUseLevels: [(value: String, label: String, description: String)] = [
        ("thinking_partner", "AI as a thinking partner",
         "Students may use AI to question, brainstorm, receive feedback, or revise—but must show their own reasoning."),
        ("limited", "Limited AI use", "AI is permitted only for specific teacher-approved steps."),
        ("no_ai", "No AI use",
         "The task is completed without generative AI and includes authentic evidence of student thinking."),
    ]

    static func aiUseLabel(_ value: String?) -> String? {
        aiUseLevels.first { $0.value == value }?.label
    }

    static let assignmentTypes: [(value: String, label: String)] = [
        ("classwork", "Classwork"), ("homework", "Homework"), ("project", "Project"),
        ("assessment", "Assessment"), ("group_task", "Group task"), ("exit_ticket", "Exit ticket"), ("other", "Other"),
    ]

    static func typeLabel(_ value: String?) -> String {
        guard let value else { return "Assignment" }
        return assignmentTypes.first { $0.value == value }?.label ?? value
    }

    static let gradeLevels = [
        "Pre-K", "Kindergarten", "1st grade", "2nd grade", "3rd grade", "4th grade", "5th grade", "6th grade",
        "7th grade", "8th grade", "9th grade", "10th grade", "11th grade", "12th grade",
    ]

    static let subjects = [
        "Math", "English / ELA", "Science", "Social Studies", "World Language", "Arts", "PE / Health",
        "CTE / Elective", "Other",
    ]

    static let estimatedTimes = [
        "10 min", "20 min", "30 min", "45-60 min", "1-2 class periods", "1 week", "2 weeks", "3-4 weeks", "Other",
    ]
}

/// What "Make this assignment AI-ready" hands to the redesign intake, so the
/// teacher never re-adds a file they already gave.
private struct RedesignPrefill {
    let originalText: String
    let extraNote: String?
}

struct AssignmentCoachView: View {
    @State private var session: AssignmentCoachSession?
    @State private var pendingMode: String?
    @State private var prefill: RedesignPrefill?

    @State private var sessions: [AssignmentCoachSession] = []
    @State private var historyLoading = true
    @State private var filter = "all"
    @State private var showAll = false

    private static let shownAtFirst = 8

    private var filtered: [AssignmentCoachSession] {
        filter == "saved" ? sessions.filter(\.saved) : sessions
    }

    var body: some View {
        Group {
            if let session {
                AssignmentWorkspaceView(
                    session: session,
                    onUpdate: handleUpdate,
                    onExit: { self.session = nil; pendingMode = nil },
                    onRedesignFromReview: redesignFromReview
                )
                // A fresh workspace (and fresh local state) for each session.
                .id(session.id)
            } else if let pendingMode {
                AssignmentIntakeView(
                    mode: pendingMode,
                    originalTextPrefill: prefill?.originalText,
                    extraNote: prefill?.extraNote,
                    onBack: { self.pendingMode = nil; prefill = nil },
                    onStarted: { started in
                        prefill = nil
                        handleUpdate(started)
                    }
                )
            } else {
                hub
            }
        }
        .background(AppTheme.background)
        .navigationTitle("Assignment Coach")
        .task { await loadHistory() }
    }

    // MARK: Hub

    private var hub: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PanelHeader(
                    eyebrow: "Wivoza · Plan",
                    title: "Assignment Coach",
                    subtitle: "Design, review, and refine meaningful student work—with a coach beside you."
                )

                modeCard(
                    number: "01",
                    title: "Review an assignment",
                    description: "Get coaching feedback on clarity, rigor, student thinking, accessibility, differentiation, and assessment alignment.",
                    action: "Start review",
                    icon: "checklist",
                    dark: false
                ) { pendingMode = "review" }

                modeCard(
                    number: "02",
                    title: "Redesign for meaningful AI use",
                    description: "Adapt an assignment so students must demonstrate their own thinking—whether AI is allowed, limited, or not allowed.",
                    action: "Start redesign",
                    icon: "sparkles",
                    dark: true
                ) { pendingMode = "redesign_ai" }

                historySection
            }
            .padding()
        }
    }

    private func modeCard(
        number: String, title: String, description: String, action: String,
        icon: String, dark: Bool, onTap: @escaping () -> Void
    ) -> some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Image(systemName: icon)
                        .font(.title3)
                        .foregroundStyle(dark ? AppTheme.forest : .white)
                        .frame(width: 48, height: 48)
                        .background(dark ? AppTheme.gold : AppTheme.terracotta, in: RoundedRectangle(cornerRadius: 14))
                    Spacer()
                    Text(number)
                        .font(.heading(.title))
                        .foregroundStyle((dark ? Color.white : AppTheme.forest).opacity(0.15))
                }
                Text(title)
                    .font(.heading(.title3))
                    .foregroundStyle(dark ? Color.white : AppTheme.forest)
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(dark ? Color.white.opacity(0.7) : AppTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(action) →")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(dark ? AppTheme.gold : AppTheme.terracotta600)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(dark ? AppTheme.forest : AppTheme.peachTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(.plain)
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionEyebrow(text: "My assignments")
                Spacer()
                if !sessions.isEmpty {
                    Picker("Filter", selection: $filter) {
                        Text("All · \(sessions.count)").tag("all")
                        Text("Saved · \(sessions.filter(\.saved).count)").tag("saved")
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 200)
                }
            }

            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if filtered.isEmpty {
                Text(filter == "saved" && !sessions.isEmpty
                     ? "Nothing starred yet. Tap \"Save for later\" on an assignment to star it."
                     : "Assignments you review or redesign will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(showAll ? filtered : Array(filtered.prefix(Self.shownAtFirst))) { item in
                    AssignmentRow(session: item, onOpen: { session = item }, onDelete: { Task { await delete(item) } })
                }
                if filtered.count > Self.shownAtFirst {
                    Button(showAll ? "Show fewer" : "Show all \(filtered.count)") { showAll.toggle() }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                }
            }
        }
    }

    // MARK: Actions

    private func loadHistory() async {
        if let loaded = try? await AssignmentCoachService.getSessions() { sessions = loaded }
        historyLoading = false
    }

    private func handleUpdate(_ updated: AssignmentCoachSession) {
        session = updated
        if let index = sessions.firstIndex(where: { $0.id == updated.id }) {
            sessions[index] = updated
        } else {
            sessions.insert(updated, at: 0)
        }
    }

    private func delete(_ target: AssignmentCoachSession) async {
        sessions.removeAll { $0.id == target.id }
        // Best-effort — a stale row reappearing on the next load is minor.
        try? await AssignmentCoachService.delete(id: target.id)
    }

    /// From a review's "Make this assignment AI-ready" — carries the original
    /// text plus the review's own AI-risk finding over to the redesign intake.
    private func redesignFromReview(_ reviewed: AssignmentCoachSession) {
        var note: String?
        if let risk = reviewed.reviewSnapshot?.aiRisk {
            note = "This assignment was already reviewed. Detected AI completion risk: \(risk.rating ?? "unknown"). \(risk.explanation ?? "") \(risk.reasons ?? "")"
                .trimmingCharacters(in: .whitespaces)
        }
        prefill = RedesignPrefill(originalText: reviewed.originalText ?? "", extraNote: note)
        session = nil
        pendingMode = "redesign_ai"
    }
}

private struct AssignmentRow: View {
    let session: AssignmentCoachSession
    let onOpen: () -> Void
    let onDelete: () -> Void

    private var subtitle: String {
        var parts = [session.isRedesign ? "Redesign for AI" : "Review"]
        if let grade = session.gradeLevel { parts.append(grade) }
        if let subject = session.subject { parts.append(subject) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.title ?? AssignmentCoachOptions.typeLabel(session.assignmentType))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .multilineTextAlignment(.leading)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            if session.saved {
                Image(systemName: "star.fill").font(.caption).foregroundStyle(AppTheme.accent)
            }
            Menu {
                Button(role: .destructive, action: onDelete) { Label("Delete", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis").foregroundStyle(AppTheme.textSecondary).padding(.horizontal, 6)
            }
        }
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

// MARK: - Intake

private struct AssignmentIntakeView: View {
    let mode: String
    let originalTextPrefill: String?
    let extraNote: String?
    let onBack: () -> Void
    let onStarted: (AssignmentCoachSession) -> Void

    @State private var inputMode = "upload"
    @State private var text = ""
    @State private var fileName: String?
    @State private var carriedOver = false
    @State private var extracting = false
    @State private var showImporter = false
    @State private var photoItem: PhotosPickerItem?
    @State private var aiUseLevel: String?
    @State private var letWivozaRecommend = false
    @State private var starting = false
    @State private var error: String?

    private var isReview: Bool { mode == "review" }
    private var hasText: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var canSubmit: Bool { hasText && (isReview || aiUseLevel != nil || letWivozaRecommend) }
    private var fileReady: Bool { hasText && fileName != nil && !extracting }

    private var importTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg]
        for ext in ["docx", "pptx"] {
            if let type = UTType(filenameExtension: ext) { types.append(type) }
        }
        return types
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Button("← Back", action: onBack)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.textSecondary)

                PanelHeader(
                    eyebrow: "Assignment Coach",
                    title: isReview
                        ? "See what this assignment truly asks of students"
                        : "See how ready this assignment is for meaningful AI use",
                    subtitle: "Add the assignment. Wivoza will estimate the context and "
                        + (isReview ? "examine the quality of the learning experience." : "help you redesign it for meaningful AI use.")
                )

                intakeCard

                Label("Do not include student names or personally identifiable information.", systemImage: "shield")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)

                if !isReview { aiUseChooser }

                ProgressRing(
                    active: starting,
                    estimatedSeconds: 16,
                    label: isReview ? "Reading and reviewing the assignment" : "Redesigning the assignment",
                    hint: "Reading the whole assignment, not just the first paragraph."
                )

                if let error {
                    Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                }

                Button {
                    Task { await analyze() }
                } label: {
                    Text(starting ? "Analyzing…" : error != nil ? "Try again" : "Analyze assignment")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(canSubmit && !starting ? AppTheme.terracotta : AppTheme.terracotta.opacity(0.4), in: Capsule())
                }
                .disabled(!canSubmit || starting || extracting)
            }
            .padding()
        }
        .onAppear {
            if let originalTextPrefill, text.isEmpty {
                text = originalTextPrefill
                carriedOver = true
            }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await extractFile(url) } }
        }
        .onChange(of: photoItem) { _, item in
            if let item { Task { await extractPhoto(item) } }
        }
    }

    @ViewBuilder
    private var intakeCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if carriedOver {
                readyRow(title: "Carried over from your review — no need to re-add it.", status: nil) {
                    text = ""; carriedOver = false
                }
            } else if inputMode == "upload" {
                if extracting {
                    ProgressRing(active: true, estimatedSeconds: 8, label: "Reading your file", hint: "Pulling the text out — this only takes a moment.")
                } else if fileReady {
                    readyRow(title: fileName ?? "Assignment text", status: isReview ? "Ready to review" : "Ready to redesign") {
                        text = ""; fileName = nil
                    }
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "doc.text.magnifyingglass").font(.largeTitle).foregroundStyle(AppTheme.terracotta)
                        Text("Add your assignment").font(.heading(.headline)).foregroundStyle(AppTheme.forest)
                        HStack(spacing: 8) {
                            Button { showImporter = true } label: { pill("Choose file", "square.and.arrow.up") }
                            PhotosPicker(selection: $photoItem, matching: .images) { pill("Photo", "photo") }
                            Button { inputMode = "paste" } label: { pill("Paste text", "doc.on.clipboard") }
                        }
                        Text("PDF, Word, PowerPoint, image, or plain text")
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                }
            } else {
                HStack {
                    Text("Paste the assignment").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                    Spacer()
                    Button("Upload a file instead") { inputMode = "upload" }
                        .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                }
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 180)
                    .padding(8)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                    .disabled(starting)
                Text("\(text.count.formatted()) characters")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(16)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 18))
    }

    private func pill(_ title: String, _ icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
            .foregroundStyle(AppTheme.forest)
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(AppTheme.mintTint, in: Capsule())
    }

    private func readyRow(title: String, status: String?, onRemove: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.text.fill").foregroundStyle(AppTheme.terracotta)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest).lineLimit(2)
                if let status { Text(status).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.teal) }
            }
            Spacer()
            Button("Remove", action: onRemove).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
        }
    }

    private var aiUseChooser: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("How should students use AI?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            Toggle("Not sure? Let Wivoza recommend the best approach.", isOn: $letWivozaRecommend)
                .font(.caption)
                .tint(AppTheme.forest)
                .onChange(of: letWivozaRecommend) { _, on in if on { aiUseLevel = nil } }
            ForEach(AssignmentCoachOptions.aiUseLevels, id: \.value) { option in
                let selected = !letWivozaRecommend && aiUseLevel == option.value
                Button { aiUseLevel = option.value } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(option.label).font(.subheadline.weight(.semibold))
                            Spacer()
                            if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(AppTheme.terracotta) }
                        }
                        Text(option.description).font(.caption).foregroundStyle(AppTheme.textSecondary)
                    }
                    .foregroundStyle(AppTheme.forest)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(selected ? AppTheme.peachTint.opacity(0.6) : AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(selected ? AppTheme.terracotta : AppTheme.hairline))
                }
                .buttonStyle(.plain)
                .disabled(starting || letWivozaRecommend)
                .opacity(letWivozaRecommend ? 0.4 : 1)
            }
        }
    }

    // MARK: Actions

    private func extractFile(_ url: URL) async {
        // Files chosen from Files/iCloud are security-scoped.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        await extract(url: url, displayName: url.lastPathComponent)
    }

    private func extractPhoto(_ item: PhotosPickerItem) async {
        defer { photoItem = nil }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            error = "Could not read that photo. Please try pasting the text instead."
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("assignment-photo.jpg")
        do {
            try data.write(to: url, options: .atomic)
            await extract(url: url, displayName: "Photo of assignment")
        } catch {
            self.error = "Could not read that photo. Please try pasting the text instead."
        }
    }

    private func extract(url: URL, displayName: String) async {
        extracting = true
        error = nil
        fileName = nil
        do {
            // Held internally, never shown back — the teacher just sees a
            // "ready" confirmation, not the (possibly OCR-rough) text.
            text = try await AssignmentCoachService.extractText(fileURL: url)
            fileName = displayName
        } catch {
            self.error = error.localizedDescription
        }
        extracting = false
    }

    private func analyze() async {
        guard canSubmit, !starting else { return }
        starting = true
        error = nil
        do {
            let session = try await AssignmentCoachService.start(
                mode: mode,
                aiUseLevel: !isReview && !letWivozaRecommend ? aiUseLevel : nil,
                letWivozaChoose: !isReview && letWivozaRecommend,
                originalText: text.trimmingCharacters(in: .whitespacesAndNewlines),
                extraNote: extraNote
            )
            onStarted(session)
        } catch {
            // The text and AI-use choice are still here, so "start over" is
            // never required.
            // A redesign failure gets calm, reassuring copy — except a usage
            // limit, whose message tells the teacher what to do next.
            if !isReview, case APIError.server(let status, _) = error, status != 403 {
                self.error = "We couldn't redesign the assignment. Your work is still here."
            } else if !isReview, !(error is APIError) {
                self.error = "We couldn't redesign the assignment. Your work is still here."
            } else {
                self.error = error.localizedDescription
            }
            starting = false
        }
    }
}
