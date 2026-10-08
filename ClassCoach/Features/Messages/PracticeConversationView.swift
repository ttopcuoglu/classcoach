import SwiftUI

private let personTypeChips: [(label: String, value: String?)] =
    CommunicationOptions.recipientTypes.map { ($0.label, $0.value) }
private let challengeChips: [(label: String, value: String?)] =
    CommunicationOptions.challengeTypes.map { ($0.label, $0.value) }
private let difficultyChips: [(label: String, value: String?)] =
    CommunicationOptions.conversationDifficulties.map { ($0.label, $0.value) }
private let practiceGradeBands: [(label: String, value: String?)] =
    ["K-5", "6-8", "9-12"].map { ("Grades \($0)", $0) }

struct PracticeConversationView: View {
    @State private var personType: String?
    @State private var challenge: String?
    @State private var gradeBand = "6-8"
    @State private var difficulty: String?

    @State private var situationText: String?
    @State private var responseText = ""
    @State private var prep: ConversationPrep?
    @State private var generating = false
    @State private var submitting = false
    @State private var error: String?

    // Practice is hypothetical, end to end: you set who, what and how hard, and
    // Wivoza writes the scenario. A conversation that is actually happening goes
    // to Communication Coach, which takes it as prose instead of asking a teacher
    // to classify what they just described — and to pick how difficult their real
    // colleague is, which is a person, not a dial.
    private var activeSituation: String? { situationText }
    private var canGenerate: Bool { challenge != nil && !generating }
    private var canSubmit: Bool {
        !(activeSituation ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !responseText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PanelHeader(eyebrow: "Practice a conversation", title: "Ready when you are", subtitle: "Say who you are up against and how hard they push, and Wivoza writes you one to practice cold.")
                if let prep, let report = prep.coachingReport {
                    reportView(prep, report)
                } else {
                    form
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600).frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .clearsFloatingTabBar()
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption2.weight(.bold)).tracking(0.8)
            .foregroundStyle(AppTheme.terracotta600)
            .padding(.horizontal)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                fieldLabel("WHO YOU'RE PRACTICING WITH")
                ChipRow(items: personTypeChips, selection: personType) { personType = $0 }

                fieldLabel("CHALLENGE")
                ChipRow(items: challengeChips, selection: challenge) { challenge = $0 }

                fieldLabel("DIFFICULTY")
                ChipRow(items: difficultyChips, selection: difficulty) { difficulty = $0 }
            }
            .padding(.vertical, 12)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))

            // Its own card, the way the room is next door: who is in front of
            // you is the scenario, what grade they are is the setting.
            if personType == "student" {
                VStack(alignment: .leading, spacing: 10) {
                    fieldLabel("GRADE BAND")
                    ChipRow(items: practiceGradeBands, selection: gradeBand) { gradeBand = $0 ?? "6-8" }
                }
                .padding(.vertical, 12)
                .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            }

            if let activeSituation {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SITUATION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                    Text(activeSituation).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                }
                .padding(10)
                .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 6) {
                    Text("How would you respond?").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.textPrimary)
                    TextEditor(text: $responseText)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 110)
                        .padding(8)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(AppTheme.hairline))
                        .disabled(submitting)
                }

                ProgressRing(active: submitting, estimatedSeconds: 12, label: "Reading your response", hint: "Usually about fifteen seconds.")

                HStack {
                    Button("Try a different scenario") {
                        situationText = nil
                        responseText = ""
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.textSecondary)
                    .disabled(generating)

                    Spacer()

                    Button {
                        Task { await submit() }
                    } label: {
                        Text(submitting ? "Getting feedback..." : "Get Coaching Report")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(AppTheme.terracotta, in: Capsule())
                    }
                    .disabled(!canSubmit)
                }
            } else {
                VStack(spacing: 10) {
                    Text("No scenario loaded yet.").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    ProgressRing(active: generating, estimatedSeconds: 8, label: "Building a scenario", hint: "Usually under ten seconds.")
                    HStack {
                        Button {
                            Task { await generate() }
                        } label: {
                            Text(generating ? "Generating..." : "Generate a Scenario")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 10)
                                .background(AppTheme.terracotta, in: Capsule())
                        }
                        .disabled(!canGenerate)

                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func reportView(_ prep: ConversationPrep, _ report: CoachingReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("SITUATION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                Text(prep.situationText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                Text("YOUR RESPONSE").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary).padding(.top, 4)
                Text(prep.responseText).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
            }

            reportDimension("Clarity", report.clarity)
            reportDimension("Empathy", report.empathy)
            reportDimension("Use of evidence", report.evidence)
            reportDimension("Professional boundaries", report.boundaries)
            reportDimension("Collaboration", report.collaboration)
            reportDimension("Resolution and next steps", report.resolution)

            labeledBlock("WHAT YOU DID WELL", report.didWell, AppTheme.accent)
            labeledBlock("PRIORITY FOR IMPROVEMENT", report.priority, AppTheme.primary)
            labeledBlock("A STRONGER PHRASE", report.strongerPhrase, AppTheme.textSecondary)
            if !report.modelResponse.isEmpty {
                labeledBlock("A MODEL RESPONSE", report.modelResponse, AppTheme.primary)
            }
            labeledBlock("SUGGESTED NEXT STEP", report.nextStep, AppTheme.textSecondary)

            Button("Practice Again") { practiceAgain() }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(AppTheme.terracotta, in: Capsule())
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private func reportDimension(_ label: String, _ dimension: CoachingReportDimension) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Text(dimension.rating)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(AppTheme.mintTint, in: Capsule())
                    .foregroundStyle(AppTheme.primary)
            }
            Text(dimension.feedback).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .background(AppTheme.cream, in: RoundedRectangle(cornerRadius: 14))
    }

    private func labeledBlock(_ title: String, _ text: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption2.weight(.bold)).foregroundStyle(tint)
            Text(text).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((tint == AppTheme.textSecondary ? AppTheme.gold : tint).opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Actions

    private func generate() async {
        guard let challenge else { return }
        generating = true
        error = nil
        situationText = nil
        responseText = ""
        do {
            situationText = try await CommunicationsService.generateConversationScenario(
                category: challenge, gradeBand: gradeBand, personType: personType, difficulty: difficulty
            )
        } catch {
            self.error = "Could not generate a scenario. Please try again."
        }
        generating = false
    }

    private func submit() async {
        guard let activeSituation, canSubmit else { return }
        submitting = true
        error = nil
        do {
            prep = try await CommunicationsService.submitConversationPrep(
                situationText: activeSituation.trimmingCharacters(in: .whitespacesAndNewlines),
                responseText: responseText.trimmingCharacters(in: .whitespacesAndNewlines),
                source: "practice",
                category: challenge,
                gradeBand: personType == "student" ? gradeBand : nil,
                personType: personType,
                difficulty: difficulty
            )
        } catch {
            self.error = error.localizedDescription
        }
        submitting = false
    }

    private func practiceAgain() {
        prep = nil
        situationText = nil
        responseText = ""
        error = nil
    }
}

#Preview {
    NavigationStack { PracticeConversationView() }
}
