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

/// Mirrors `AudioCoaching.tsx`'s `TagSpeakersPanel` — a single tap resolves
/// the whole step; everyone else is auto-grouped "Student" server-side.
struct TagSpeakersView: View {
    let session: AudioSessionWithSegments
    let speakers: [SpeakerSample]
    let onTagged: (AudioSessionWithSegments) -> Void

    @State private var tagging: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Which voice is the teacher?").font(.title3.bold()).foregroundStyle(AppTheme.textPrimary)
            Text("Automatic diarization can tell voices apart, but it can't reliably tell who's the teacher. Pick it below — everyone else will be grouped as Student.")
                .font(.subheadline).foregroundStyle(AppTheme.textSecondary)

            if speakers.isEmpty {
                Text("No distinct speakers were detected.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else {
                ForEach(speakers, id: \.rawSpeakerTag) { speaker in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(speaker.rawSpeakerTag.uppercased())
                            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                        Text("\"\(speaker.sample)\"")
                            .font(.subheadline).foregroundStyle(AppTheme.textPrimary)
                        Button {
                            Task { await tag(speaker.rawSpeakerTag) }
                        } label: {
                            Text(tagging == speaker.rawSpeakerTag ? "Analyzing..." : "This is the Teacher")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                .background(AppTheme.primary, in: Capsule())
                        }
                        .disabled(tagging != nil)
                    }
                    .padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                }
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
    }

    private func tag(_ rawSpeakerTag: String) async {
        tagging = rawSpeakerTag
        error = nil
        do {
            let updated = try await AudioCoachingService.tagSpeaker(sessionId: session.id, rawSpeakerTag: rawSpeakerTag)
            onTagged(updated)
        } catch {
            self.error = "Could not tag that speaker. Please try again."
        }
        tagging = nil
    }
}
