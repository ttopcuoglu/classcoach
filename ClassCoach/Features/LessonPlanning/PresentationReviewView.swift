import SwiftUI
import UniformTypeIdentifiers

/// "Review a Presentation" — mirrors the presentation tab of
/// `web/src/pages/LessonPlanning.tsx`.
///
/// Two steps on purpose: the upload reads the deck and reports how many slides
/// came through, so a teacher sees that the right file landed before a review
/// is generated from it. Delivery coaching is a third, opt-in step — the review
/// is about the deck, that is about standing up and teaching from it.
struct PresentationReviewContent: View {
    @State private var showImporter = false
    @State private var extracting = false
    @State private var reviewing = false
    @State private var loadingDelivery = false
    @State private var errorMessage: String?

    @State private var extracted: LessonPlanningService.ExtractedPresentation?
    @State private var plan: LessonPlan?

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
                    intakeCard
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.terracotta600)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: importTypes) { result in
            if case .success(let url) = result { Task { await extract(url) } }
        }
    }

    // MARK: - Intake

    @ViewBuilder
    private var intakeCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if extracting {
                ProgressRing(active: true, estimatedSeconds: 8, label: "Reading your deck", hint: "Pulling the slides out — this only takes a moment.")
            } else if reviewing {
                ProgressRing(active: true, estimatedSeconds: 20, label: "Reviewing your presentation", hint: "Looking at fit, visuals, length and how it would run.")
            } else if let extracted {
                VStack(alignment: .leading, spacing: 10) {
                    Text(extracted.fileName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.textPrimary)
                    Text("\(extracted.slideCount) slide\(extracted.slideCount == 1 ? "" : "s") read")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                    HStack(spacing: 12) {
                        Button("Review it") { Task { await review() } }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.cream)
                            .padding(.horizontal, 20).padding(.vertical, 10)
                            .background(Capsule().fill(AppTheme.accent))
                        Button("Pick another") { self.extracted = nil }
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            } else {
                VStack(spacing: 10) {
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
                    Button("Choose a file") { showImporter = true }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.cream)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Capsule().fill(AppTheme.accent))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    // MARK: - Result

    @ViewBuilder
    private func resultView(plan: LessonPlan, review: LessonPlanPresentationReview) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(plan.fileName ?? "Your presentation")
                    .font(.heading(.title3))
                    .foregroundStyle(AppTheme.forest)
                if let slides = plan.slideCount {
                    Text("\(slides) slide\(slides == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }

            ForEach(review.sections, id: \.title) { section in
                sectionCard(section.title, section.body, tint: AppTheme.card)
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

            Button("Review another presentation") {
                self.plan = nil
                self.extracted = nil
            }
            .font(.subheadline)
            .foregroundStyle(AppTheme.textSecondary)
            .padding(.top, 4)
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
            plan = try await LessonPlanningService.submitPresentationReview(
                text: extracted.text,
                fileName: extracted.fileName,
                slideCount: extracted.slideCount
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadDelivery(_ id: String) async {
        errorMessage = nil
        loadingDelivery = true
        defer { loadingDelivery = false }
        do {
            plan = try await LessonPlanningService.presentationFeedback(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    PresentationReviewContent()
}
