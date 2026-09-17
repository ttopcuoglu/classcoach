import SwiftUI

/// Routes a non-recording session to the right screen by status — mirrors
/// `AudioCoaching.tsx`'s `SessionFlow`.
struct SessionFlowView: View {
    let session: AudioSessionWithSegments
    let speakers: [SpeakerSample]
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onExit: () -> Void

    var body: some View {
        switch session.status {
        case "transcribing":
            VStack {
                ProgressView()
                Text("Transcribing your session...").font(.subheadline).foregroundStyle(AppTheme.textSecondary).padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(40)
            .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        case "tagging":
            TagSpeakersView(session: session, speakers: speakers, onTagged: onUpdate)
        default:
            ReportView(session: session, onUpdate: onUpdate, onExit: onExit)
        }
    }
}

/// Mirrors `AudioCoaching.tsx`'s `TagSpeakersPanel` — select every voice
/// that's the teacher (diarization sometimes splits one person into two),
/// then analyze; everyone else is auto-grouped "Student" server-side.
struct TagSpeakersView: View {
    let session: AudioSessionWithSegments
    let speakers: [SpeakerSample]
    let onTagged: (AudioSessionWithSegments) -> Void

    @State private var selected: Set<String> = []
    @State private var tagging = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Which voice is the teacher?").font(.title3.bold()).foregroundStyle(AppTheme.textPrimary)
            Text("Automatic diarization can tell voices apart, but it can't reliably tell who's the teacher — and it sometimes splits one teacher into two voices. Select every voice that's you; everyone else will be grouped as Student.")
                .font(.subheadline).foregroundStyle(AppTheme.textSecondary)

            if speakers.isEmpty {
                Text("No distinct speakers were detected.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(speakers, id: \.rawSpeakerTag) { speaker in
                    let isTeacher = selected.contains(speaker.rawSpeakerTag)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(speaker.rawSpeakerTag.uppercased())
                            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                        Text("\"\(speaker.sample)\"")
                            .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        Button {
                            if isTeacher { selected.remove(speaker.rawSpeakerTag) } else { selected.insert(speaker.rawSpeakerTag) }
                        } label: {
                            Label(isTeacher ? "Teacher" : "This is the Teacher", systemImage: isTeacher ? "checkmark" : "person")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(isTeacher ? .white : AppTheme.primary)
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                .background(isTeacher ? AppTheme.primary : Color.clear, in: Capsule())
                                .overlay(Capsule().stroke(AppTheme.primary, lineWidth: 1.5))
                        }
                        .disabled(tagging)
                        .accessibilityAddTraits(isTeacher ? .isSelected : [])
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(isTeacher ? AppTheme.primary : Color.clear, lineWidth: 2))
                }

                Button {
                    Task { await analyze() }
                } label: {
                    Text(tagging ? "Analyzing..." : "Analyze session")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(selected.isEmpty || tagging ? AppTheme.textSecondary.opacity(0.4) : AppTheme.primary, in: Capsule())
                }
                .disabled(selected.isEmpty || tagging)

                ProgressRing(active: tagging, estimatedSeconds: 4, label: "Analyzing your session")
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
            }
        }
    }

    private func analyze() async {
        tagging = true
        error = nil
        do {
            let updated = try await AudioCoachingService.tagSpeakers(sessionId: session.id, rawSpeakerTags: Array(selected))
            onTagged(updated)
        } catch {
            self.error = "Could not tag those speakers. Please try again."
        }
        tagging = false
    }
}
