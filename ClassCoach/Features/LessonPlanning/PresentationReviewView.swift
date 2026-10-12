import SwiftUI
import UniformTypeIdentifiers

/// "Review Slides" — mirrors the slides tab of
/// `web/src/pages/LessonPlanning.tsx`.
///
/// Two steps on purpose: the upload reads the deck and reports how many slides
/// came through, so a teacher sees that the right file landed before a review
/// is generated from it. Grade, subject and what the deck is about are asked
/// for alongside it — all optional, and all three genuinely change the review,
/// because the server prompt reads the slides against that grade rather than
/// guessing one from the vocabulary.
///
/// Delivery coaching is a third, opt-in step: the review is about the deck,
/// that is about standing up and teaching from it.
struct PresentationReviewContent: View {
    @State private var showImporter = false
    @State private var extracting = false
    @State private var reviewing = false
    @State private var loadingDelivery = false
    @State private var errorMessage: String?

    @State private var extracted: LessonPlanningService.ExtractedPresentation?
    @State private var plan: LessonPlan?

    @State private var gradeLevel = ""
    @State private var subject = ""
    @State private var objective = ""

    @State private var chatDraft = ""
    @State private var chatSending = false
    @State private var chatError: String?
    @State private var applyingRevision = false
    @State private var revisionDismissed = false

    @State private var buildingDeck = false
    @State private var deckURL: URL?
    @State private var deckError: String?

    @State private var allPlans: [LessonPlan] = []
    @State private var historyLoading = true

    private var savedPlans: [LessonPlan] { allPlans.filter(\.saved) }

    /// Google Slides and Keynote have no readable format here — exporting to
    /// PDF is the documented route, so only these two are offered.
    private var importTypes: [UTType] {
        var types: [UTType] = [.pdf]
        if let pptx = UTType(filenameExtension: "pptx") { types.append(pptx) }
        return types
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let plan, let review = plan.presentationReview {
                    resultView(plan: plan, review: review)
                } else {
                    PanelHeader(
                        eyebrow: "Planning Coach",
                        title: "Review slides",
                        subtitle: "Upload slides you've already built — get feedback on grade-level fit, visuals, ideas, length, and how to actually run them in class."
                    )
                    intakeCard
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.terracotta600)
                        .fixedSize(horizontal: false, vertical: true)
                }

                historySection
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .task { await loadHistory() }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await extract(url) } }
        }
    }

    // MARK: - Intake

    @ViewBuilder
    private var intakeCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            if extracting {
                ProgressRing(active: true, estimatedSeconds: 8, label: "Reading your deck", hint: "Pulling the slides out — this only takes a moment.")
            } else if let extracted {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Label(extracted.fileName, systemImage: "rectangle.on.rectangle.angled")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.textPrimary)
                            .lineLimit(1)
                        Spacer()
                        Button("Remove") { self.extracted = nil }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                    Text("\(extracted.slideCount) slide\(extracted.slideCount == 1 ? "" : "s") read")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AppTheme.hairline))
            } else {
                Button { showImporter = true } label: {
                    VStack(spacing: 8) {
                        Image(systemName: "rectangle.on.rectangle.angled")
                            .font(.largeTitle)
                            .foregroundStyle(AppTheme.terracotta)
                        Text("Upload a .pptx or .pdf")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.textPrimary)
                        Text("Export Google Slides or Keynote as PDF first.")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 28)
                    .background(AppTheme.peachTint.opacity(0.4), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(AppTheme.terracotta.opacity(0.35), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    )
                }
                .buttonStyle(.plain)
            }

            // All three optional, and all three change the review: the prompt
            // reads the slides against the grade it is given rather than
            // inferring one from the vocabulary.
            optionalField("Grade level (optional)", $gradeLevel, "e.g. 9th grade")
            optionalField("Subject (optional)", $subject, "e.g. Biology")
            optionalField("What are these slides about? (optional)", $objective, "e.g. Introducing photosynthesis")

            ProgressRing(active: reviewing, estimatedSeconds: 20, label: "Reviewing your slides", hint: "Looking at fit, visuals, length and how it would run.")

            Button {
                Task { await review() }
            } label: {
                Text(reviewing ? "Reviewing…" : "Review My Slides")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(extracted != nil && !reviewing ? AppTheme.terracotta : AppTheme.terracotta.opacity(0.4), in: Capsule())
            }
            .disabled(extracted == nil || reviewing)
        }
    }

    private func optionalField(_ title: String, _ text: Binding<String>, _ placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            TextField(placeholder, text: text).textFieldStyle(.roundedBorder)
        }
    }

    // MARK: - Result

    @ViewBuilder
    private func resultView(plan: LessonPlan, review: LessonPlanPresentationReview) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text((["Slide review"] + [plan.subject, plan.gradeLevel].compactMap { $0 })
                    .joined(separator: " · ").uppercased())
                    .font(.caption2.weight(.bold)).tracking(1.4)
                    .foregroundStyle(AppTheme.gold)
                Text(plan.objective ?? plan.fileName ?? "Your slides")
                    .font(.heading(.title3))
                    .foregroundStyle(.white)
                if let slides = plan.slideCount {
                    Text("\(slides) slide\(slides == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.72))
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 24))

            ForEach(review.sections, id: \.title) { section in
                sectionCard(section.title, section.body, tint: AppTheme.card)
            }

            improvedDeckCard(plan)

            followUpChat(plan)

            if let revision = plan.suggestedRevision, !revisionDismissed {
                VStack(alignment: .leading, spacing: 8) {
                    Text("SUGGESTED REVISION").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
                    Text(revision).font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                    HStack {
                        Button(applyingRevision ? "Applying…" : "Use this version") {
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
                .background(AppTheme.mintTint.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
            }

            if let delivery = plan.deliveryCoaching, !delivery.sections.isEmpty {
                Text("Delivering it")
                    .font(.heading(.subheadline))
                    .foregroundStyle(AppTheme.forest)
                ForEach(delivery.sections, id: \.title) { section in
                    sectionCard(section.title, section.body, tint: AppTheme.goldTint.opacity(0.5))
                }
            } else if loadingDelivery {
                ProgressRing(active: true, estimatedSeconds: 15, label: "Working out how to deliver it", hint: nil)
            } else {
                Button("How do I deliver this?") { Task { await loadDelivery(plan.id) } }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.forest)
            }

            HStack {
                Button {
                    Task { await toggleSaved(plan) }
                } label: {
                    Label(plan.saved ? "Saved" : "Save for later", systemImage: plan.saved ? "star.fill" : "star")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(plan.saved ? AppTheme.accent : AppTheme.textSecondary)

                Spacer()

                Button("Review other slides") { startOver() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .background(AppTheme.terracotta, in: Capsule())
            }
            .padding(.top, 4)
        }
    }

    /// Rebuilds the deck with every recommendation applied. The file comes
    /// back ready for the share sheet — on iOS that is how a teacher gets it
    /// into Keynote, Files, or their own mail.
    @ViewBuilder
    private func improvedDeckCard(_ plan: LessonPlan) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("CREATE IMPROVED SLIDES").font(.caption2.weight(.bold)).foregroundStyle(AppTheme.primary)
            Text("Wivoza rebuilds your slides with the clearer wording, visuals, pacing checks, and length changes recommended above, in a design that fits your subject.")
                .font(.caption).foregroundStyle(AppTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if let deckURL {
                ShareLink(item: deckURL) {
                    Label("Share the new deck", systemImage: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(AppTheme.terracotta, in: Capsule())
                }
            } else {
                Button {
                    Task { await buildDeck(plan) }
                } label: {
                    Text(buildingDeck ? "Building…" : "Create improved slides")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.forest)
                        .padding(.horizontal, 16).padding(.vertical, 9)
                        .background(AppTheme.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(AppTheme.hairline))
                }
                .disabled(buildingDeck)
            }

            ProgressRing(active: buildingDeck, estimatedSeconds: 30, label: "Rebuilding your deck", hint: "Applying every recommendation, then finding pictures.")

            if let deckError {
                Text(deckError).font(.caption).foregroundStyle(AppTheme.terracotta600)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 18))
    }

    private func followUpChat(_ target: LessonPlan) -> some View {
        let conversation = target.conversation ?? []
        let followUps = conversation.count > 2 ? Array(conversation.dropFirst(2)) : []
        return FollowUpChatView(
            messages: followUps, draft: $chatDraft, sending: chatSending, error: chatError,
            placeholder: "Ask a follow-up, or ask the coach to revise a slide..."
        ) {
            Task { await sendChat(target) }
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SAVED SLIDE REVIEWS").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.terracotta600)
            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if savedPlans.isEmpty {
                Text("Reviews you save will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding()
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
            } else {
                ForEach(savedPlans) { saved in
                    Button {
                        plan = saved
                        resetPerPlanState()
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(saved.objective ?? saved.fileName ?? "Slide review")
                                .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                            if let slides = saved.slideCount {
                                Text("\(slides) slide\(slides == 1 ? "" : "s")")
                                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func sectionCard(_ title: String, _ body: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold)).tracking(0.8)
                .foregroundStyle(AppTheme.terracotta600)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(tint, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Actions

    private func loadHistory() async {
        do { allPlans = try await LessonPlanningService.getLessonPlans(mode: "presentation") } catch {}
        historyLoading = false
    }

    private func extract(_ url: URL) async {
        errorMessage = nil
        extracting = true
        defer { extracting = false }
        // A file handed over by the picker is security-scoped; without this the
        // read fails with a permission error rather than anything descriptive.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            extracted = try await LessonPlanningService.extractPresentation(fileURL: url)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func review() async {
        guard let extracted else { return }
        errorMessage = nil
        reviewing = true
        defer { reviewing = false }
        do {
            let result = try await LessonPlanningService.submitPresentationReview(
                text: extracted.text,
                fileName: extracted.fileName,
                slideCount: extracted.slideCount,
                gradeLevel: gradeLevel.isEmpty ? nil : gradeLevel,
                subject: subject.isEmpty ? nil : subject,
                objective: objective.isEmpty ? nil : objective
            )
            plan = result
            allPlans.insert(result, at: 0)
            resetPerPlanState()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func buildDeck(_ target: LessonPlan) async {
        buildingDeck = true
        deckError = nil
        do {
            deckURL = try await LessonPlanningService.improvedSlides(id: target.id)
        } catch {
            deckError = error.localizedDescription
        }
        buildingDeck = false
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
            errorMessage = error.localizedDescription
        }
        applyingRevision = false
    }

    private func loadDelivery(_ id: String) async {
        errorMessage = nil
        loadingDelivery = true
        defer { loadingDelivery = false }
        do {
            replace(try await LessonPlanningService.presentationFeedback(id: id))
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func toggleSaved(_ target: LessonPlan) async {
        do {
            replace(try await LessonPlanningService.setSaved(id: target.id, saved: !target.saved))
        } catch {}
    }

    private func replace(_ updated: LessonPlan) {
        plan = updated
        if let index = allPlans.firstIndex(where: { $0.id == updated.id }) { allPlans[index] = updated }
    }

    /// The deck and the chat belong to one review, so opening another must not
    /// leave the last one's PowerPoint sitting under a different deck's card.
    private func resetPerPlanState() {
        chatDraft = ""
        chatError = nil
        revisionDismissed = false
        deckURL = nil
        deckError = nil
    }

    private func startOver() {
        plan = nil
        extracted = nil
        gradeLevel = ""
        subject = ""
        objective = ""
        errorMessage = nil
        resetPerPlanState()
    }
}

#Preview {
    PresentationReviewContent()
}
