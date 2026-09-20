import SwiftUI
import UIKit

private let reviewQuickActions: [(label: String, message: String)] = [
    ("Address the biggest issue", "Let's address the biggest issue with this assignment."),
    ("Make it AI-resilient", "Let's make this more resistant to being fully outsourced to AI."),
    ("Strengthen the rigor", "Let's strengthen the rigor of this assignment."),
    ("Remove low-value work", "Let's remove any low-value or busywork steps."),
    ("Clarify student directions", "Let's clarify the student directions."),
    ("Adjust the workload", "Let's adjust the workload for this assignment."),
    ("Review everything with the coach", "Let's review the entire assignment together."),
]

private let gradeFitLabels = [
    "below": "Likely below the intended level",
    "appropriate": "Appears grade-level appropriate",
    "above": "May be above the intended level",
    "need_more_context": "More context needed",
]
private let meaningfulWorkLabels = [
    "clear_value": "Clear learning value",
    "some_repetition": "Some low-value repetition",
    "purpose_unclear": "Purpose needs clarification",
    "mostly_completion": "Mostly completion-focused",
]
private let aiRiskLabels = ["high": "High", "moderate": "Moderate", "low": "Low"]

/// Restrained status colors and no numeric scores anywhere: green for aligned,
/// gold for worth reviewing, terracotta for a genuine concern, grey for
/// informational / not yet determined.
private enum Tone {
    case good, warn, concern, neutral

    var color: Color {
        switch self {
        case .good: return AppTheme.teal
        case .warn: return AppTheme.gold
        case .concern: return AppTheme.terracotta
        case .neutral: return AppTheme.textSecondary.opacity(0.4)
        }
    }
}

private func gradeFitTone(_ rating: String?) -> Tone { rating == "appropriate" ? .good : .neutral }
private func meaningfulWorkTone(_ rating: String?) -> Tone {
    switch rating {
    case "clear_value": return .good
    case "some_repetition": return .warn
    case "mostly_completion": return .concern
    default: return .neutral
    }
}
private func aiRiskTone(_ rating: String?) -> Tone {
    switch rating {
    case "low": return .good
    case "moderate": return .warn
    case "high": return .concern
    default: return .neutral
    }
}

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// A numbered section card — the iOS twin of the web's `NumberedCard`.
private struct AssignmentCard<Content: View>: View {
    let n: Int
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Text("\(n)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(AppTheme.forest, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
                    Text(subtitle).font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

struct AssignmentWorkspaceView: View {
    let session: AssignmentCoachSession
    let onUpdate: (AssignmentCoachSession) -> Void
    let onExit: () -> Void
    let onRedesignFromReview: (AssignmentCoachSession) -> Void

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    @State private var reviewing = false
    @State private var reviewError: String?
    @State private var regenerating = false
    @State private var regenerateError: String?
    @State private var applying = false

    @State private var revising = false
    @State private var revisedOnce = false
    @State private var revisionSummary: [String] = []
    @State private var reviseError: String?

    @State private var refining = false
    @State private var refineError: String?
    @State private var clarifyingDismissed = false
    @State private var showAllRecommendations = false

    @State private var editingDetails = false
    @State private var gradeLevel = ""
    @State private var subject = ""
    @State private var assignmentType = ""
    @State private var estimatedTime = ""
    @State private var savingDetails = false

    @State private var exporting = false
    @State private var exportError: String?
    @State private var shareItem: ShareItem?
    @State private var copiedNote: String?

    private var isRedesign: Bool { session.isRedesign }
    private var liveText: String { session.liveAssignmentText ?? "" }
    private var hasRevision: Bool {
        !isRedesign && !liveText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (revisedOnce || liveText.trimmingCharacters(in: .whitespacesAndNewlines)
                != (session.originalText ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                topBar
                statusLine

                if isRedesign {
                    redesignBody
                } else if let snapshot = session.reviewSnapshot {
                    reviewSnapshotBody(snapshot)
                } else {
                    legacyReviewBody
                }

                if hasRevision { revisedCard }

                chatSection
            }
            .padding()
        }
        .sheet(item: $shareItem) { ShareSheet(url: $0.url) }
        .onAppear {
            gradeLevel = session.gradeLevel ?? ""
            subject = session.subject ?? ""
            assignmentType = session.assignmentType ?? ""
            estimatedTime = session.estimatedTime ?? ""
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 14) {
            Button("← Assignment Coach", action: onExit)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textSecondary)
            Spacer()
            Menu {
                ForEach(AssignmentCoachService.ExportFormat.allCases) { format in
                    Button("Export as \(format.label)") { Task { await export(text: liveText, format: format) } }
                }
                Button("Copy assignment") { copy(liveText, note: "Assignment copied") }
            } label: {
                Image(systemName: "square.and.arrow.up").foregroundStyle(AppTheme.textSecondary)
            }
            .disabled(liveText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || exporting)

            Button { Task { await toggleSaved() } } label: {
                Image(systemName: session.saved ? "star.fill" : "star")
                    .foregroundStyle(session.saved ? AppTheme.accent : AppTheme.textSecondary)
            }
            .accessibilityLabel(session.saved ? "Saved" : "Save for later")
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        if exporting {
            Text("Building your file…").font(.caption).foregroundStyle(AppTheme.textSecondary)
        } else if let exportError {
            Text(exportError).font(.caption).foregroundStyle(AppTheme.terracotta600)
        } else if let copiedNote {
            Text(copiedNote).font(.caption).foregroundStyle(AppTheme.textSecondary)
        }
    }

    // MARK: Header (title, detected context, clarifying question)

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((isRedesign ? "Redesign for meaningful AI use" : "Assignment review").uppercased())
                .font(.caption2.weight(.bold)).tracking(1.4)
                .foregroundStyle(AppTheme.gold)
            Text(session.title ?? AssignmentCoachOptions.typeLabel(session.assignmentType))
                .font(.heading(.title3))
                .foregroundStyle(.white)
            Text(isRedesign
                 ? "How to keep the thinking with the student."
                 : "A concise review of what students are being asked to do and think.")
                .font(.subheadline).foregroundStyle(.white.opacity(0.7))

            chipRow
            if editingDetails { detailsEditor }

            if let question = session.clarifyingQuestion, !clarifyingDismissed {
                VStack(alignment: .leading, spacing: 8) {
                    Text(question.question).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    FlowChips(items: question.options + ["Skip"]) { option in
                        if option == "Skip" { clarifyingDismissed = true } else { Task { await refine(option) } }
                    }
                    .disabled(refining)
                }
                .padding(12)
                .background(AppTheme.terracotta.opacity(0.18), in: RoundedRectangle(cornerRadius: 14))
            }
            ProgressRing(active: refining, estimatedSeconds: 12, label: "Updating with your answer", tint: .white)
            if let refineError { Text(refineError).font(.footnote).foregroundStyle(AppTheme.terracotta) }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))
    }

    private var chipRow: some View {
        var chips: [String] = []
        if isRedesign, let level = AssignmentCoachOptions.aiUseLabel(session.aiUseLevel) { chips.append("AI use: \(level)") }
        if let grade = session.gradeLevel { chips.append("Likely \(grade)") }
        if let subject = session.subject { chips.append(subject) }
        if session.assignmentType != nil { chips.append(AssignmentCoachOptions.typeLabel(session.assignmentType)) }
        if let time = session.estimatedTime { chips.append(time) }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Wivoza detected").font(.caption).foregroundStyle(.white.opacity(0.6))
                Button(editingDetails ? "Done" : "Edit details") { editingDetails.toggle() }
                    .font(.caption.weight(.semibold)).foregroundStyle(.white)
            }
            FlowChips(items: chips, tappable: false) { _ in }
        }
    }

    private var detailsEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            detailPicker("Grade level", $gradeLevel, AssignmentCoachOptions.gradeLevels.map { ($0, $0) })
            detailPicker("Subject", $subject, AssignmentCoachOptions.subjects.map { ($0, $0) })
            detailPicker("Assignment type", $assignmentType, AssignmentCoachOptions.assignmentTypes.map { ($0.value, $0.label) })
            detailPicker("Estimated time", $estimatedTime, AssignmentCoachOptions.estimatedTimes.map { ($0, $0) })
            Button(savingDetails ? "Saving…" : "Save") { Task { await saveDetails() } }
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(AppTheme.cream, in: Capsule())
                .disabled(savingDetails)
        }
        .padding(12)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }

    private func detailPicker(_ title: String, _ selection: Binding<String>, _ options: [(String, String)]) -> some View {
        HStack {
            Text(title).font(.caption).foregroundStyle(.white.opacity(0.7))
            Spacer()
            Picker(title, selection: selection) {
                Text("Not set").tag("")
                ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
            }
            .tint(.white)
        }
    }

    // MARK: Review snapshot

    @ViewBuilder
    private func reviewSnapshotBody(_ snapshot: AssignmentReviewSnapshot) -> some View {
        headerCard

        let opportunity = snapshot.mainOpportunity
        let hasOpportunity = (opportunity?.title ?? "").isEmpty == false || (opportunity?.description ?? "").isEmpty == false
        // Numbered in reading order; only the opportunity card can be absent.
        let base = hasOpportunity ? 1 : 0

        if hasOpportunity {
            AssignmentCard(n: 1, title: "Most important opportunity", subtitle: "The one change that would improve this assignment most") {
                if let title = opportunity?.title { Text(title).font(.headline).foregroundStyle(AppTheme.forest) }
                if let description = opportunity?.description { Text(description).font(.subheadline).foregroundStyle(AppTheme.textPrimary) }
                HStack {
                    pillButton("Improve with Coach", filled: true) {
                        Task { await sendChat("Let's work on this: \(opportunity?.title ?? "the main opportunity").") }
                    }
                    Button(showAllRecommendations ? "Hide recommendations" : "See all recommendations") {
                        showAllRecommendations.toggle()
                    }
                    .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.forest)
                }
                if showAllRecommendations {
                    FlowChips(items: reviewQuickActions.map(\.label)) { label in
                        if let action = reviewQuickActions.first(where: { $0.label == label }) {
                            Task { await sendChat(action.message) }
                        }
                    }
                    .disabled(chatSending)
                }
            }
        }

        finding(
            n: base + 1, title: "Grade-level fit", subtitle: "Whether the task matches the grade it's meant for",
            tone: gradeFitTone(snapshot.gradeFit?.rating),
            status: gradeFitLabels[snapshot.gradeFit?.rating ?? ""], explanation: snapshot.gradeFit?.explanation
        )
        finding(
            n: base + 2, title: "Thinking and rigor", subtitle: "How much real thinking the task asks of students",
            tone: .warn, status: snapshot.rigor?.label, explanation: snapshot.rigor?.explanation
        )
        finding(
            n: base + 3, title: "Meaningful work", subtitle: "Whether every step earns its place",
            tone: meaningfulWorkTone(snapshot.meaningfulWork?.rating),
            status: meaningfulWorkLabels[snapshot.meaningfulWork?.rating ?? ""],
            explanation: snapshot.meaningfulWork?.explanation, note: snapshot.meaningfulWork?.suggestion
        )
        finding(
            n: base + 4, title: "AI completion risk", subtitle: "How easily a student could hand the whole task to AI",
            tone: aiRiskTone(snapshot.aiRisk?.rating), status: aiRiskLabels[snapshot.aiRisk?.rating ?? ""],
            explanation: snapshot.aiRisk?.explanation, detail: snapshot.aiRisk?.reasons,
            showRedesign: snapshot.aiRisk?.rating == "high" || snapshot.aiRisk?.rating == "moderate"
        )

        if let workload = snapshot.workloadSummary, !workload.isEmpty {
            AssignmentCard(n: base + 5, title: "Workload and clarity", subtitle: "How long it takes, and how clear the directions are") {
                Text(workload).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            }
        }

        reviseControls
    }

    private func finding(
        n: Int, title: String, subtitle: String, tone: Tone, status: String?, explanation: String?,
        detail: String? = nil, note: String? = nil, showRedesign: Bool = false
    ) -> some View {
        AssignmentCard(n: n, title: title, subtitle: subtitle) {
            HStack(spacing: 8) {
                Circle().fill(tone.color).frame(width: 10, height: 10)
                Text(status ?? "Not enough evidence yet").font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
            }
            if let explanation, !explanation.isEmpty {
                Text(explanation).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            }
            if let detail, !detail.isEmpty {
                Text(detail).font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            if let note, !note.isEmpty {
                Text(note).font(.caption).italic().foregroundStyle(AppTheme.terracotta600)
            }
            if showRedesign {
                pillButton("Make this assignment AI-ready →", filled: true) { onRedesignFromReview(session) }
            }
        }
    }

    private var reviseControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            ProgressRing(
                active: revising, estimatedSeconds: 16,
                label: "Revising the whole assignment", hint: "Working in everything you've discussed."
            )
            Button(revising ? "Revising…" : "Revise the whole assignment") { Task { await revise() } }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(AppTheme.mintTint, in: Capsule())
                .disabled(revising || session.conversation.isEmpty)
            if session.conversation.isEmpty {
                Text("Talk it over with the coach first — the revision works in what you discuss.")
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
            }
            if let reviseError { Text(reviseError).font(.footnote).foregroundStyle(AppTheme.terracotta600) }
        }
    }

    // MARK: Legacy review (sessions that predate the snapshot)

    @ViewBuilder
    private var legacyReviewBody: some View {
        headerCard

        if let summary = session.reviewSummary {
            let parts: [(String, String, String?)] = [
                ("What's already working", "Keep these parts", summary.working),
                ("What may need attention", "Where students may struggle, or coast", summary.needsAttention),
                ("Suggested improvements", "Changes to consider", summary.suggestions),
            ]
            ForEach(Array(parts.filter { !($0.2 ?? "").isEmpty }.enumerated()), id: \.offset) { index, part in
                AssignmentCard(n: index + 1, title: part.0, subtitle: part.1) {
                    Text(part.2 ?? "").font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
            }
            Button(reviewing ? "Refreshing…" : "Refresh review ↻") { Task { await runReview() } }
                .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                .disabled(reviewing)
        } else {
            VStack(spacing: 10) {
                Text("Get a concise coaching review of the assignment as it stands.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                pillButton(reviewing ? "Reviewing…" : "Get a coaching review", filled: true) { Task { await runReview() } }
                    .disabled(reviewing || liveText.isEmpty)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        }
        ProgressRing(active: reviewing, estimatedSeconds: 12, label: "Putting together a coaching review")
        if let reviewError { Text(reviewError).font(.footnote).foregroundStyle(AppTheme.terracotta600) }

        FlowChips(items: reviewQuickActions.map(\.label)) { label in
            if let action = reviewQuickActions.first(where: { $0.label == label }) { Task { await sendChat(action.message) } }
        }
        .disabled(chatSending)

        reviseControls
    }

    // MARK: Redesign

    @ViewBuilder
    private var redesignBody: some View {
        headerCard

        if let redesign = session.aiResistant {
            let safeguards = redesign.thinkingSafeguards ?? redesign.strategies
            // Numbered in reading order over the parts that are present.
            let present = [
                redesign.aiRole != nil,
                !(redesign.vulnerableSteps ?? "").isEmpty,
                !(safeguards ?? "").isEmpty,
                !(redesign.guidelines ?? "").isEmpty,
                !(redesign.revisedAssignment ?? "").isEmpty,
            ]
            let number = { (index: Int) in present[0...index].filter { $0 }.count }

            if let role = redesign.aiRole {
                AssignmentCard(n: number(0), title: "Recommended AI role", subtitle: "How students should, or shouldn't, use AI on this task") {
                    HStack(spacing: 8) {
                        Text(AssignmentCoachOptions.aiUseLabel(role.level) ?? "AI as a thinking partner")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        if role.recommended == true {
                            Text("RECOMMENDED BY WIVOZA")
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(AppTheme.mintTint, in: Capsule())
                                .foregroundStyle(AppTheme.forest)
                        }
                    }
                    if let explanation = role.explanation {
                        Text(explanation).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                }
            }
            if let steps = redesign.vulnerableSteps, !steps.isEmpty {
                AssignmentCard(n: number(1), title: "Vulnerable steps", subtitle: "The parts AI could do for a student") {
                    Text(steps).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
            }
            if let safeguards, !safeguards.isEmpty {
                AssignmentCard(n: number(2), title: "Thinking safeguards", subtitle: "Changes that keep the thinking with the student") {
                    Text(safeguards).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
            }
            if let guidelines = redesign.guidelines, !guidelines.isEmpty {
                AssignmentCard(n: number(3), title: "Student AI guidelines", subtitle: "Rules to share with students, ready to copy") {
                    Text(guidelines).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    textButton("Copy student AI guidelines") { copy(guidelines, note: "Guidelines copied") }
                }
            }
            if let revised = redesign.revisedAssignment, !revised.isEmpty {
                AssignmentCard(n: number(4), title: "Revised assignment", subtitle: "Save it in the format you need") {
                    Text(revised).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    exportButtons(text: revised)
                    HStack(spacing: 16) {
                        textButton(applying ? "Applying…" : "Apply to assignment") { Task { await apply(revised) } }
                        textButton("Copy revised text") { copy(revised, note: "Revised text copied") }
                        textButton(regenerating ? "Regenerating…" : "Regenerate ↻") { Task { await regenerate() } }
                    }
                }
            }
            ProgressRing(active: regenerating, estimatedSeconds: 16, label: "Redesigning the assignment")
            if let regenerateError { Text(regenerateError).font(.footnote).foregroundStyle(AppTheme.terracotta600) }
        }
    }

    // MARK: Revised assignment (review path)

    private var revisedCard: some View {
        AssignmentCard(n: session.reviewSnapshot != nil ? 7 : 1, title: "Revised assignment", subtitle: "Save it in the format you need") {
            if !revisionSummary.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("WHAT CHANGED").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.terracotta600)
                    ForEach(Array(revisionSummary.enumerated()), id: \.offset) { _, change in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(AppTheme.terracotta).frame(width: 6, height: 6).padding(.top, 6)
                            Text(change).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        }
                    }
                }
                .padding(12)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            }
            Text(liveText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            exportButtons(text: liveText)
            textButton("Copy revised text") { copy(liveText, note: "Revised text copied") }
        }
    }

    private func exportButtons(text: String) -> some View {
        HStack(spacing: 8) {
            ForEach(AssignmentCoachService.ExportFormat.allCases) { format in
                Button { Task { await export(text: text, format: format) } } label: {
                    Text(format.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(AppTheme.mintTint, in: Capsule())
                }
                .disabled(exporting)
            }
        }
    }

    // MARK: Chat

    private var chatSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionEyebrow(text: "Discuss with your coach")
            FollowUpChatView(
                messages: session.conversation, draft: $chatDraft, sending: chatSending, error: chatError,
                placeholder: "Discuss this with your coach..."
            ) {
                let message = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                Task { await sendChat(message, fromDraft: true) }
            }
        }
    }

    // MARK: Small pieces

    private func pillButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(filled ? .white : AppTheme.forest)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(filled ? AppTheme.forest : AppTheme.mintTint, in: Capsule())
        }
        .disabled(chatSending)
    }

    private func textButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(.caption.weight(.semibold))
            .foregroundStyle(AppTheme.textSecondary)
    }

    // MARK: Actions

    private func sendChat(_ message: String, fromDraft: Bool = false) async {
        guard !message.isEmpty, !chatSending else { return }
        chatSending = true
        chatError = nil
        if fromDraft { chatDraft = "" }
        do {
            onUpdate(try await AssignmentCoachService.sendChat(id: session.id, message: message))
        } catch {
            chatError = error.localizedDescription
            if fromDraft { chatDraft = message }
        }
        chatSending = false
    }

    private func refine(_ answer: String) async {
        guard !refining else { return }
        refining = true
        refineError = nil
        do {
            onUpdate(try await AssignmentCoachService.refine(id: session.id, answer: answer))
        } catch {
            refineError = error.localizedDescription
        }
        refining = false
    }

    private func revise() async {
        guard !revising else { return }
        revising = true
        reviseError = nil
        do {
            let updated = try await AssignmentCoachService.revise(id: session.id)
            revisionSummary = updated.revisionSummary ?? []
            revisedOnce = true
            onUpdate(updated)
        } catch {
            reviseError = error.localizedDescription
        }
        revising = false
    }

    private func runReview() async {
        guard !reviewing else { return }
        reviewing = true
        reviewError = nil
        do {
            onUpdate(try await AssignmentCoachService.review(id: session.id))
        } catch {
            reviewError = error.localizedDescription
        }
        reviewing = false
    }

    private func regenerate() async {
        guard !regenerating else { return }
        regenerating = true
        regenerateError = nil
        do {
            onUpdate(try await AssignmentCoachService.regenerateRedesign(id: session.id))
        } catch {
            regenerateError = error.localizedDescription
        }
        regenerating = false
    }

    /// Makes the redesign the assignment's working text (the redesign never
    /// overwrites it on its own — the teacher applies it explicitly).
    private func apply(_ revisedText: String) async {
        guard !applying else { return }
        applying = true
        do {
            onUpdate(try await AssignmentCoachService.setLiveText(id: session.id, text: revisedText))
            copiedNote = "Applied to your assignment"
        } catch {
            regenerateError = error.localizedDescription
        }
        applying = false
    }

    private func saveDetails() async {
        savingDetails = true
        do {
            onUpdate(try await AssignmentCoachService.saveDetails(
                id: session.id,
                assignmentType: assignmentType.isEmpty ? nil : assignmentType,
                gradeLevel: gradeLevel.isEmpty ? nil : gradeLevel,
                subject: subject.isEmpty ? nil : subject,
                estimatedTime: estimatedTime.isEmpty ? nil : estimatedTime
            ))
            editingDetails = false
        } catch {
            refineError = error.localizedDescription
        }
        savingDetails = false
    }

    private func toggleSaved() async {
        if let updated = try? await AssignmentCoachService.setSaved(id: session.id, saved: !session.saved) {
            onUpdate(updated)
        }
    }

    private func export(text: String, format: AssignmentCoachService.ExportFormat) async {
        guard !exporting else { return }
        exporting = true
        exportError = nil
        copiedNote = nil
        do {
            let url = try await AssignmentCoachService.exportFile(id: session.id, text: text, format: format)
            shareItem = ShareItem(url: url)
        } catch {
            exportError = error.localizedDescription
        }
        exporting = false
    }

    private func copy(_ text: String, note: String) {
        UIPasteboard.general.string = text
        exportError = nil
        copiedNote = note
    }
}

/// A wrapping row of capsule chips (the web's `flex flex-wrap` buttons).
private struct FlowChips: View {
    let items: [String]
    var tappable = true
    let onTap: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Button { onTap(item) } label: {
                    Text(item)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(tappable ? AppTheme.forest : Color.white.opacity(0.9))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(tappable ? AppTheme.card : Color.white.opacity(0.1), in: Capsule())
                        .overlay(Capsule().strokeBorder(tappable ? AppTheme.hairline : Color.clear))
                }
                .buttonStyle(.plain)
                .allowsHitTesting(tappable)
            }
        }
    }
}
