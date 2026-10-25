import SwiftUI

private let difficulties: [(label: String, value: String?)] = [
    ("Any difficulty", nil),
    ("Beginner", "beginner"),
    ("Intermediate", "intermediate"),
    ("Advanced", "advanced"),
]

private func difficultyLabel(_ value: String) -> String {
    value.prefix(1).uppercased() + value.dropFirst()
}


/// Thin wrapper for standalone tab use — `TryItOutContent` is reused
/// without this `NavigationStack` inside the combined Ask & Practice view,
/// since nesting `NavigationStack`s causes duplicate/broken back buttons
/// (see the same issue noted for Profile's "More"-hosted sub-pages).
struct TryItOutView: View {
    @EnvironmentObject private var authManager: AuthManager
    /// The standalone tab has no shell to own the room, so it holds its own.
    @State private var room = TeachingContextValue()

    var body: some View {
        NavigationStack {
            TryItOutContent(room: $room)
                .onAppear { room.seed(from: authManager.currentUser) }
                .navigationTitle("Try It Out")
        }
    }
}

struct TryItOutContent: View {
    /// One of the six focus areas, from the Ask & Practice shell. Nil lets the
    /// coach choose, weighted toward what this teacher has practiced least.
    /// Unlike Ask, this is the primary control here: it decides what scenario
    /// the teacher gets handed.
    var focusArea: String? = nil
    /// "Something I'm facing": the teacher writes the situation instead of
    /// being handed one. After the first coaching it is the same attempt view.
    var real = false

    @EnvironmentObject private var authManager: AuthManager
    @State private var category: String?
    @State private var difficulty: String?
    @Binding var room: TeachingContextValue

    @State private var attempt: ScenarioAttempt?
    @State private var responseText = ""
    @State private var situationText = ""
    /// The stored situation, so a retry after a failed coaching call doesn't
    /// save the same words twice. Dropped as soon as the words change.
    @State private var realScenario: (id: String, text: String)?
    /// Nil until a teacher asks. Cycles rather than showing the whole list, so a
    /// hint stays a nudge rather than becoming a menu to choose from.
    @State private var hintIndex: Int?
    @State private var generating = false
    @State private var submitting = false
    @State private var error: String?

    @State private var allAttempts: [ScenarioAttempt] = []
    @State private var historyLoading = true

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var area: FocusArea? { findFocusArea(focusArea) }

    private var asksAboutContent: Bool { focusArea == teachingAndLearning }


    private var savedAttempts: [ScenarioAttempt] { allAttempts.filter(\.saved) }
    private var hasFeedback: Bool { attempt?.feedback != nil || attempt?.modelResponse != nil }
    /// The teacher's own situation, not a generated one: there is no other
    /// scenario to swap in, only a fresh situation of their own.
    private var isOwn: Bool { attempt?.scenario.source == "teacher" }
    private var trimmedSituation: String { situationText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedResponse: String { responseText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if real {
                    PanelHeader(
                        eyebrow: "Practice",
                        title: "Practice something real",
                        subtitle: "Describe a moment you\u{2019}re facing and how you\u{2019}d handle it. Your coach responds to your words, and you can keep working on them together."
                    )
                    if attempt == nil {
                        TeachingContextFields(focusArea: nil, value: $room)
                    }
                } else {
                PanelHeader(
                    eyebrow: "Practice a scenario",
                    title: "Rehearse a hard moment",
                    subtitle: area.map {
                        "\($0.blurb) Set the details, then practice what you'd say."
                    } ?? "Set your room, then practice what you'd say."
                )
                narrowingRow
                TeachingContextFields(focusArea: focusArea, value: $room)
                }

                scenarioCard

                savedSection
            }
            .padding()
        }
        .background(AppTheme.background)
        .clearsFloatingTabBar()
        .task { await loadHistory() }
        // A sub-category from a different area would silently contradict the
        // area on the next generate, so changing area clears a mismatched one.
        .onChange(of: focusArea) { _, newValue in
            if let newValue, let category, focusAreaForCategory(category)?.value != newValue {
                self.category = nil
            }
        }
    }

    // MARK: - Filter rows

    /// Every choice is shown. Situation and difficulty used to rest behind a
    /// Change toggle as "refinements" — but a teacher cannot choose what they
    /// cannot see, and the conversation rehearsal one chip away never hid its
    /// own.
    private var narrowingRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Showing all twenty-four sub-categories at once would be a wall of
            // chips, so this narrows only once a section is chosen.
            if area != nil {
                Text("SITUATION")
                    .font(.caption2.weight(.bold)).tracking(0.8)
                    .foregroundStyle(AppTheme.terracotta600)
                    .padding(.horizontal)
                ChipRow(items: subCategoryChips(focusArea), selection: category) { category = $0 }
            }
            Text("DIFFICULTY")
                .font(.caption2.weight(.bold)).tracking(0.8)
                .foregroundStyle(AppTheme.terracotta600)
                .padding(.horizontal)
            ChipRow(items: difficulties, selection: difficulty) { difficulty = $0 }
        }
        .padding(.vertical, 12)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Main card

    @ViewBuilder
    private var scenarioCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let attempt {
                scenarioDetail(attempt)
            } else if real {
                realForm
            } else {
                emptyState
            }

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.terracotta600)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(AppTheme.hairline))
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("Set the situation and your room above, then build a scenario.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            ProgressRing(active: generating, estimatedSeconds: 8, label: "Building a scenario", hint: "Usually under ten seconds.")
            Button {
                Task { await generateScenario() }
            } label: {
                Text(generating ? "Generating..." : "New Scenario")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .disabled(generating)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private var realForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What\u{2019}s happening?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)
            editor($situationText, placeholder: "e.g. A student in my third period calls out every answer before anyone else can think, and the quieter kids have stopped trying.")
            Text("No need to sort it into a type \u{2014} your coach works that out. Leave out names.")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)

            Text("How would you handle it?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)
                .padding(.top, 4)
            editor($responseText, placeholder: "What you\u{2019}d say, word for word, and what you\u{2019}d do.")

            ProgressRing(active: submitting, estimatedSeconds: 8, label: "Reading your situation", hint: "Usually under ten seconds.")

            let ready = trimmedSituation.count >= 15 && !trimmedResponse.isEmpty
            Button {
                Task { await submitReal() }
            } label: {
                Text(submitting ? "Getting coaching..." : "Get coaching")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(ready ? AppTheme.terracotta : AppTheme.textSecondary.opacity(0.35), in: Capsule())
            }
            .disabled(submitting || !ready)
        }
    }

    private func editor(_ text: Binding<String>, placeholder: String) -> some View {
        TextEditor(text: text)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 100)
            .padding(8)
            .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(alignment: .topLeading) {
                if text.wrappedValue.isEmpty {
                    Text(placeholder)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
            .disabled(submitting)
    }

    private func tagLine(_ attempt: ScenarioAttempt) -> String {
        let scenario = attempt.scenario
        let parts: [String?]
        if scenario.source == "teacher" {
            parts = [
                "Your situation",
                scenario.category == ownSituationCategory ? nil : categoryLabel(scenario.category),
                "Grades \(scenario.gradeBand)",
            ]
        } else {
            parts = [
                focusAreaLabel(scenario.focusArea ?? focusAreaForCategory(scenario.category)?.value),
                categoryLabel(scenario.category),
                "Grades \(scenario.gradeBand)",
                scenario.course ?? scenario.subject,
                scenario.courseLevel,
                scenario.subject,
                difficultyLabel(scenario.difficulty),
            ]
        }
        return parts.compactMap { $0 }.joined(separator: " · ")
    }

    @ViewBuilder
    private func scenarioDetail(_ attempt: ScenarioAttempt) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tagLine(attempt))
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(AppTheme.mintTint, in: Capsule())

            Text(attempt.scenario.text)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)

            if attempt.scenario.fallback == true {
                Text("Couldn't reach your coach for a fresh scenario, so here's one from the practice bank.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }

        if hasFeedback {
            feedbackView(attempt)
        } else {
            responseForm
        }
    }

    private var responseForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How would you handle this?")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textPrimary)

            TextEditor(text: $responseText)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 100)
                .padding(8)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                .disabled(submitting)

            // A question, never an answer. Picking from options and composing a
            // response under pressure are different skills, and only the second
            // happens in a real classroom — so the hint scaffolds the thinking
            // and leaves the words to the teacher.
            let hints = hintsFor(focusArea: focusArea, courseLevel: room.courseLevel, classMakeup: room.makeup)
            VStack(alignment: .leading, spacing: 6) {
                Button(hintIndex == nil ? "Not sure where to start?" : "Another way in") {
                    withAnimation { hintIndex = hintIndex.map { ($0 + 1) % hints.count } ?? 0 }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textSecondary)
                .disabled(submitting)

                if let i = hintIndex, hints.indices.contains(i) {
                    Text(hints[i])
                        .font(.subheadline.italic())
                        .foregroundStyle(AppTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(AppTheme.goldTint.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }

            ProgressRing(active: submitting, estimatedSeconds: 8, label: "Reading your response", hint: "Usually under ten seconds.")

            HStack {
                Button(isOwn ? "Something else" : "Try a different scenario") {
                    if isOwn { startOver() } else { Task { await generateScenario() } }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textSecondary)
                .disabled(generating)

                Spacer()

                Button {
                    Task { await submitResponse() }
                } label: {
                    Text(submitting ? "Getting feedback..." : "Get Feedback")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? AppTheme.textSecondary.opacity(0.35) : AppTheme.terracotta, in: Capsule())
                }
                .disabled(submitting || responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    @ViewBuilder
    private func feedbackView(_ attempt: ScenarioAttempt) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            labeledBlock(title: "YOUR RESPONSE", text: attempt.responseText, tint: AppTheme.textSecondary)

            if let feedback = attempt.feedback {
                labeledBlock(title: "COACHING", text: feedback, tint: AppTheme.accent)
            }
            if let modelResponse = attempt.modelResponse {
                labeledBlock(title: "A MODEL RESPONSE TO COMPARE AGAINST", text: modelResponse, tint: AppTheme.primary)
            }

            followUpChat(attempt)

            HStack {
                Button {
                    Task { await toggleSaved(attempt) }
                } label: {
                    Label(attempt.saved ? "Saved" : "Save for later", systemImage: attempt.saved ? "star.fill" : "star")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(attempt.saved ? AppTheme.accent : AppTheme.textSecondary)

                Spacer()

                Button {
                    if isOwn { startOver() } else { Task { await generateScenario() } }
                } label: {
                    Text(generating ? "Generating..." : isOwn ? "Something else" : "New Scenario")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(AppTheme.terracotta, in: Capsule())
                }
                .disabled(generating)
            }
        }
    }

    private func labeledBlock(title: String, text: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2.weight(.bold))
                .foregroundStyle(tint)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 10))
    }

    private func followUpChat(_ attempt: ScenarioAttempt) -> some View {
        let followUps = attempt.conversation.count > 2 ? Array(attempt.conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps,
            draft: $chatDraft,
            sending: chatSending,
            error: chatError,
            placeholder: "Ask a follow-up about this feedback..."
        ) {
            Task { await sendChat(attempt) }
        }
    }

    // MARK: - Saved section

    private var savedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("SAVED SCENARIOS")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.terracotta600)

            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedAttempts.isEmpty {
                Text("Scenarios you save will show up here.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            } else {
                ForEach(savedAttempts) { saved in
                    SavedAttemptRow(attempt: saved)
                }
            }
        }
    }

    // MARK: - Actions

    private func loadHistory() async {
        do {
            allAttempts = try await TryItOutService.getAttempts()
        } catch {
            // Best-effort — an empty saved list is a fine fallback.
        }
        historyLoading = false
    }

    private func generateScenario() async {
        generating = true
        error = nil
        attempt = nil
        responseText = ""
        hintIndex = nil
        chatDraft = ""
        chatError = nil
        do {
            let scenario = try await TryItOutService.generateScenario(
                focusArea: focusArea, category: category, gradeBand: room.gradeBand,
                difficulty: difficulty,
                // Only asked for under Teaching and Learning, so only sent from there.
                subject: asksAboutContent ? room.subject : nil,
                course: asksAboutContent ? room.course : nil,
                topic: asksAboutContent ? room.topic : nil,
                courseLevel: asksAboutContent ? room.courseLevel : nil,
                classMakeup: asksAboutContent ? room.makeup : []
            )
            attempt = ScenarioAttempt(
                id: "draft-\(scenario.id)", scenarioId: scenario.id, responseText: "",
                feedback: nil, modelResponse: nil, rating: nil, saved: false,
                createdAt: scenario.createdAt, scenario: scenario, conversation: []
            )
        } catch {
            self.error = "Could not generate a scenario. Please try again."
        }
        generating = false
    }

    private func submitResponse() async {
        guard let attempt, !responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        submitting = true
        error = nil
        do {
            let result = try await TryItOutService.submitAttempt(
                scenarioId: attempt.scenarioId,
                responseText: responseText.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            self.attempt = result
            allAttempts.insert(result, at: 0)
        } catch {
            self.error = "Could not get coaching feedback. Please try again."
        }
        submitting = false
    }

    private func submitReal() async {
        let situation = trimmedSituation
        let response = trimmedResponse
        guard !situation.isEmpty, !response.isEmpty, !submitting else { return }
        submitting = true
        error = nil
        do {
            var scenarioId = realScenario?.text == situation ? realScenario?.id : nil
            if scenarioId == nil {
                let created = try await TryItOutService.createRealScenario(text: situation, gradeBand: room.gradeBand)
                scenarioId = created.id
                realScenario = (created.id, situation)
            }
            let result = try await TryItOutService.submitAttempt(scenarioId: scenarioId!, responseText: response)
            attempt = result
            allAttempts.insert(result, at: 0)
        } catch {
            self.error = "Could not get coaching feedback. Please try again."
        }
        submitting = false
    }

    /// Back to an empty "Something I'm facing" form, for the next situation.
    private func startOver() {
        attempt = nil
        situationText = ""
        responseText = ""
        realScenario = nil
        hintIndex = nil
        chatDraft = ""
        chatError = nil
        error = nil
    }

    private func toggleSaved(_ target: ScenarioAttempt) async {
        let nextSaved = !target.saved
        do {
            let updated = try await TryItOutService.setSaved(attemptId: target.id, saved: nextSaved)
            attempt = updated
            if let index = allAttempts.firstIndex(where: { $0.id == target.id }) {
                allAttempts[index] = updated
            }
        } catch {
            // Leave state unchanged on failure — user can retry the tap.
        }
    }

    private func sendChat(_ target: ScenarioAttempt) async {
        let trimmed = chatDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        chatSending = true
        chatError = nil
        chatDraft = ""
        do {
            attempt = try await TryItOutService.sendChat(attemptId: target.id, message: trimmed)
        } catch {
            chatError = error.localizedDescription
            chatDraft = trimmed
        }
        chatSending = false
    }
}

private struct SavedAttemptRow: View {
    let attempt: ScenarioAttempt
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(categoryLabel(attempt.scenario.category))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.primary)
                        Text(attempt.scenario.text)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    Text(expanded ? "Hide" : "Show")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    Text("YOUR RESPONSE").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    Text(attempt.responseText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    if let feedback = attempt.feedback {
                        Text("COACHING").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.accent)
                        Text(feedback).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
    }
}

#Preview {
    TryItOutView()
        .environmentObject(AuthManager.shared)
}
