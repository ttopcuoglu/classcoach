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

private let gradeBands = ["K-5", "6-8", "9-12"]

/// Thin wrapper for standalone tab use — `TryItOutContent` is reused
/// without this `NavigationStack` inside the combined Ask & Practice view,
/// since nesting `NavigationStack`s causes duplicate/broken back buttons
/// (see the same issue noted for Profile's "More"-hosted sub-pages).
struct TryItOutView: View {
    var body: some View {
        NavigationStack {
            TryItOutContent()
                .navigationTitle("Try It Out")
        }
    }
}

struct TryItOutContent: View {
    @State private var category: String?
    @State private var gradeBand = "6-8"
    @State private var difficulty: String?

    @State private var attempt: ScenarioAttempt?
    @State private var responseText = ""
    @State private var generating = false
    @State private var submitting = false
    @State private var error: String?

    @State private var allAttempts: [ScenarioAttempt] = []
    @State private var historyLoading = true

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?

    private var savedAttempts: [ScenarioAttempt] { allAttempts.filter(\.saved) }
    private var hasFeedback: Bool { attempt?.feedback != nil || attempt?.modelResponse != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ChipRow(items: scenarioCategories, selection: category) { category = $0 }
                ChipRow(items: difficulties, selection: difficulty) { difficulty = $0 }
                gradeBandPicker

                scenarioCard

                savedSection
            }
            .padding()
        }
        .background(AppTheme.background)
        .task { await loadHistory() }
    }

    // MARK: - Filter rows

    private var gradeBandPicker: some View {
        Picker("Grade band", selection: $gradeBand) {
            ForEach(gradeBands, id: \.self) { band in
                Text("Grades \(band)").tag(band)
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: - Main card

    @ViewBuilder
    private var scenarioCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let attempt {
                scenarioDetail(attempt)
            } else {
                emptyState
            }

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("No scenario loaded yet.")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
            Button {
                Task { await generateScenario() }
            } label: {
                Text(generating ? "Generating..." : "New Scenario")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(AppTheme.primary, in: Capsule())
            }
            .disabled(generating)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func scenarioDetail(_ attempt: ScenarioAttempt) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(categoryLabel(attempt.scenario.category)) · Grades \(attempt.scenario.gradeBand) · \(difficultyLabel(attempt.scenario.difficulty))")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(AppTheme.primary.opacity(0.1), in: Capsule())

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
                .frame(minHeight: 100)
                .padding(8)
                .background(AppTheme.background, in: RoundedRectangle(cornerRadius: 10))
                .disabled(submitting)

            HStack {
                Button("Try a different scenario") {
                    Task { await generateScenario() }
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
                        .background(AppTheme.primary, in: Capsule())
                        .opacity(responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
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
                    Task { await generateScenario() }
                } label: {
                    Text(generating ? "Generating..." : "New Scenario")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(AppTheme.primary, in: Capsule())
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
                .foregroundStyle(AppTheme.textSecondary)

            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedAttempts.isEmpty {
                Text("Scenarios you save will show up here.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
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
        chatDraft = ""
        chatError = nil
        do {
            let scenario = try await TryItOutService.generateScenario(
                category: category, gradeBand: gradeBand, difficulty: difficulty, subject: nil
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
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    TryItOutView()
}
