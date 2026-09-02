import SwiftUI

struct LessonPlanningView: View {
    @State private var tab = "generate"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Get feedback on a plan you wrote, or generate a sample plan for ideas.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)

                    ChipRow(items: [("Generate Ideas", "generate"), ("Get Feedback", "feedback")], selection: tab) {
                        tab = $0 ?? "generate"
                    }

                    if tab == "generate" {
                        GeneratePanel()
                    } else {
                        FeedbackPanel()
                    }
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Lesson Planning")
        }
    }
}

private func labeledBlock(_ title: String, _ text: String, _ tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.caption2.weight(.bold)).foregroundStyle(tint)
        Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
}

private struct GeneratePanel: View {
    @State private var objective = ""
    @State private var unitName = ""
    @State private var essentialQuestion = ""
    @State private var standard = ""
    @State private var subject = ""
    @State private var gradeLevel = ""

    @State private var plan: LessonPlan?
    @State private var generating = false
    @State private var error: String?
    @State private var allPlans: [LessonPlan] = []
    @State private var historyLoading = true

    private var savedPlans: [LessonPlan] { allPlans.filter(\.saved) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let plan {
                resultView(plan)
            } else {
                form
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .center)
            }

            historySection(title: "Saved sample plans", plans: savedPlans, loading: historyLoading)
        }
        .task { await loadHistory() }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Give a clear objective and any context you have — get a sample single-day plan modeled on a gradual-release template, for ideas. Not a plan you have to follow.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)

            field("Objective (SWBAT)", $objective)
            field("Subject", $subject)
            field("Grade level", $gradeLevel)
            field("Standard", $standard)
            field("Unit name", $unitName)
            field("Essential question", $essentialQuestion)

            Button {
                Task { await generate() }
            } label: {
                Text(generating ? "Generating..." : "Generate Sample Plan")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || generating)
        }
    }

    private func field(_ title: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            TextField(title, text: text)
                .textFieldStyle(.roundedBorder)
        }
    }

    @ViewBuilder
    private func resultView(_ plan: LessonPlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("SAMPLE PLAN · \(plan.subject ?? "") · \(plan.gradeLevel ?? "")")
                    .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                if let objective = plan.objective { Text(objective).font(.subheadline).foregroundStyle(AppTheme.textPrimary) }
                if let standard = plan.standard { Text("Standard: \(standard)").font(.caption).foregroundStyle(AppTheme.textSecondary) }
            }

            if let doNow = plan.doNow { labeledBlock("DO NOW", doNow, AppTheme.textSecondary) }
            if let agenda = plan.agenda { labeledBlock("AGENDA", agenda, AppTheme.textSecondary) }
            if let closure = plan.closure { labeledBlock("CLOSURE", closure, AppTheme.textSecondary) }
            if let hots = plan.hots { labeledBlock("HIGHER-ORDER THINKING", hots, AppTheme.accent) }
            if let homework = plan.homework { labeledBlock("HOMEWORK", homework, AppTheme.textSecondary) }

            Text("This is a sample for ideas — adjust it to fit your class.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)

            HStack {
                saveButton(plan.saved) { Task { await toggleSaved(plan) } }
                Spacer()
                Button("New Sample Plan") { self.plan = nil; error = nil }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .background(AppTheme.primary, in: Capsule())
            }
        }
    }

    private func historySection(title: String, plans: [LessonPlan], loading: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            if loading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if plans.isEmpty {
                Text("Plans you save will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            } else {
                ForEach(plans) { LessonPlanRow(plan: $0) }
            }
        }
    }

    private func loadHistory() async {
        do { allPlans = try await LessonPlanningService.getLessonPlans(mode: "generated") } catch {}
        historyLoading = false
    }

    private func generate() async {
        generating = true
        error = nil
        do {
            plan = try await LessonPlanningService.generate(
                objective: objective.trimmingCharacters(in: .whitespacesAndNewlines),
                unitName: unitName.isEmpty ? nil : unitName,
                essentialQuestion: essentialQuestion.isEmpty ? nil : essentialQuestion,
                standard: standard.isEmpty ? nil : standard,
                subject: subject.isEmpty ? nil : subject,
                gradeLevel: gradeLevel.isEmpty ? nil : gradeLevel
            )
            if let plan { allPlans.insert(plan, at: 0) }
        } catch {
            self.error = error.localizedDescription
        }
        generating = false
    }

    private func toggleSaved(_ target: LessonPlan) async {
        do {
            let updated = try await LessonPlanningService.setSaved(id: target.id, saved: !target.saved)
            if plan?.id == target.id { plan = updated }
            if let index = allPlans.firstIndex(where: { $0.id == target.id }) { allPlans[index] = updated }
        } catch {}
    }
}

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

    private var savedPlans: [LessonPlan] { allPlans.filter(\.saved) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let plan {
                resultView(plan)
            } else {
                form
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .center)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("SAVED FEEDBACK").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                if historyLoading {
                    Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else if savedPlans.isEmpty {
                    Text("Plans you save will show up here.")
                        .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .center).padding()
                        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                } else {
                    ForEach(savedPlans) { LessonPlanRow(plan: $0) }
                }
            }
        }
        .task { await loadHistory() }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your lesson plan").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
            TextEditor(text: $planText)
                .frame(minHeight: 160)
                .padding(8)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 10))
                .disabled(submitting)

            Button {
                Task { await submit() }
            } label: {
                Text(submitting ? "Getting feedback..." : "Get Feedback")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(planText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || submitting)
        }
    }

    @ViewBuilder
    private func resultView(_ plan: LessonPlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            labeledBlock("YOUR PLAN", plan.planText ?? "", AppTheme.textSecondary)
            if let feedback = plan.feedback {
                labeledBlock("COACHING", feedback, AppTheme.accent)
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
                        .background(AppTheme.primary, in: Capsule())
                        .disabled(applyingRevision)

                        Button("Dismiss") { revisionDismissed = true }
                            .font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
                    }
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
                    .background(AppTheme.primary, in: Capsule())
            }
        }
    }

    private func followUpChat(_ target: LessonPlan) -> some View {
        let followUps = target.conversation.count > 2 ? Array(target.conversation.dropFirst(2)) : []
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

    private func submit() async {
        submitting = true
        error = nil
        do {
            plan = try await LessonPlanningService.submitFeedback(planText: planText.trimmingCharacters(in: .whitespacesAndNewlines))
            if let plan { allPlans.insert(plan, at: 0) }
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
            plan = try await LessonPlanningService.sendChat(id: target.id, message: trimmed)
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
            plan = try await LessonPlanningService.applyRevision(id: target.id)
        } catch {
            self.error = error.localizedDescription
        }
        applyingRevision = false
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
        error = nil
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

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(plan.mode == "generated" ? "Sample plan" : "Feedback")
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
                    if plan.mode == "generated" {
                        if let v = plan.doNow { labeledBlock("DO NOW", v, AppTheme.textSecondary) }
                        if let v = plan.agenda { labeledBlock("AGENDA", v, AppTheme.textSecondary) }
                        if let v = plan.closure { labeledBlock("CLOSURE", v, AppTheme.textSecondary) }
                        if let v = plan.hots { labeledBlock("HIGHER-ORDER THINKING", v, AppTheme.accent) }
                        if let v = plan.homework { labeledBlock("HOMEWORK", v, AppTheme.textSecondary) }
                    } else {
                        if let v = plan.planText { labeledBlock("PLAN", v, AppTheme.textSecondary) }
                        if let v = plan.feedback { labeledBlock("COACHING", v, AppTheme.accent) }
                    }
                }
            }
        }
        .padding()
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    LessonPlanningView()
}
