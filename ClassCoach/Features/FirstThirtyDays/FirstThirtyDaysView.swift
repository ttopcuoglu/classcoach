import SwiftUI

private struct OnboardingStep {
    let id: String
    let title: String
    let description: String
    /// Web deep-links each step into a specific tab (and, for a few steps,
    /// pre-fills a suggested category via sessionStorage) — this app has
    /// no cross-tab prefill plumbing yet, so this is just a plain pointer
    /// to which tab to visit rather than an active link.
    let hint: String?
}

/// Ported from `web/src/lib/onboardingTrack.ts`.
private let onboardingTrack: [OnboardingStep] = [
    OnboardingStep(
        id: "day-one-expectations",
        title: "Write your day-one expectations",
        description: "Before students arrive, write down 3-5 clear, positively-framed expectations you'll introduce on day one.",
        hint: nil
    ),
    OnboardingStep(
        id: "practice-defiance",
        title: "Practice a defiance scenario",
        description: "Try a beginner-level defiance scenario in Practice to build a starting playbook.",
        hint: "Ask & Practice → Practice → Defiance"
    ),
    OnboardingStep(
        id: "practice-peer-conflict",
        title: "Practice a peer conflict scenario",
        description: "Two students arguing is one of the most common first-month moments — get a rep in now.",
        hint: "Ask & Practice → Practice → Peer conflict"
    ),
    OnboardingStep(
        id: "first-parent-message",
        title: "Draft your first parent message",
        description: "Practice drafting a message before you need one for real.",
        hint: "Communication Coach → Write a Message"
    ),
    OnboardingStep(
        id: "practice-disengagement",
        title: "Practice a disengagement scenario",
        description: "A student who checks out is a different challenge than one who acts out — practice both.",
        hint: "Ask & Practice → Practice → Disengagement"
    ),
    OnboardingStep(
        id: "first-debrief",
        title: "Ask about your first real moment",
        description: "Once something real happens, use Ask & Practice to reflect on it.",
        hint: "Ask & Practice → Ask"
    ),
    OnboardingStep(
        id: "review-cheat-sheet",
        title: "Review your cheat sheet",
        description: "Check in on the go-to phrases you've built up so far.",
        hint: "Profile → Cheat Sheet"
    ),
]

struct FirstThirtyDaysView: View {
    @State private var completed: Set<String> = []
    @State private var loading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PanelHeader(
                    eyebrow: "Wivoza · Grow",
                    title: "Your First 30 Days",
                    subtitle: "A short guided track to help you get grounded early."
                ) {
                    if !loading {
                        let fraction = Double(completed.count) / Double(max(onboardingTrack.count, 1))
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(completed.count) of \(onboardingTrack.count) steps complete")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color.white.opacity(0.12))
                                    Capsule().fill(AppTheme.gold).frame(width: geo.size.width * fraction)
                                }
                            }
                            .frame(height: 10)
                        }
                        .padding(.top, 10)
                    }
                }

                if loading {
                    Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                } else {

                    ForEach(onboardingTrack, id: \.id) { step in
                        let done = completed.contains(step.id)
                        HStack(alignment: .top, spacing: 12) {
                            Button {
                                Task { await toggleStep(step.id) }
                            } label: {
                                Image(systemName: "checkmark")
                                    .opacity(done ? 1 : 0)
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(AppTheme.gold)
                                    .frame(width: 34, height: 34)
                                    .background(done ? AppTheme.forest : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(done ? .clear : AppTheme.textSecondary.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [4])))
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 2)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(step.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(AppTheme.forest)
                                    .strikethrough(done, color: AppTheme.forest.opacity(0.3))
                                Text(step.description)
                                    .font(.subheadline)
                                    .foregroundStyle(AppTheme.textSecondary)
                                if let hint = step.hint {
                                    Text(hint)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(AppTheme.terracotta600)
                                }
                            }
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(done ? AppTheme.mintTint.opacity(0.6) : AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Your First 30 Days")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let profile = try? await ProfileService.getProfile() {
                let ids = profile.onboardingProgress?.split(separator: ",").map(String.init) ?? []
                completed = Set(ids)
            }
            loading = false
        }
    }

    private func toggleStep(_ id: String) async {
        var next = completed
        if next.contains(id) { next.remove(id) } else { next.insert(id) }
        completed = next
        do {
            _ = try await ProfileService.updateOnboardingProgress(next.sorted().joined(separator: ","))
        } catch {
            // Best-effort — local state already reflects the intended change.
        }
    }
}

#Preview {
    NavigationStack { FirstThirtyDaysView() }
}
