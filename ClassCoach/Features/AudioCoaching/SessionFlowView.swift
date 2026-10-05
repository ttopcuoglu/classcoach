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
    /// Who to show as the teacher when the view opens. Empty means "nobody
    /// yet", and the loudest voice gets picked instead; the re-tag sheet
    /// passes the tags already on the transcript so it opens on the answer
    /// it is correcting.
    var preselected: Set<String> = []
    var confirmTitle = "Analyze session"
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
                Text("The voice that spoke the most is usually the teacher, so it's already selected. Check the minutes and the quote on each card, and change it if that isn't you.")
                    .font(.footnote).foregroundStyle(AppTheme.textSecondary)

                ForEach(speakers, id: \.rawSpeakerTag) { speaker in
                    let isTeacher = selected.contains(speaker.rawSpeakerTag)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(speaker.rawSpeakerTag.uppercased())
                            .font(.caption2.weight(.bold)).foregroundStyle(AppTheme.textSecondary)
                        if let talk = speaker.talkSummary {
                            Text(talk)
                                .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.forest)
                        }
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
                    Text(tagging ? "Analyzing..." : confirmTitle)
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
        .onAppear(perform: preselect)
    }

    /// One tap for the common case. The teacher who mis-tagged had to choose
    /// between two bare speaker numbers with nothing to choose on, and the
    /// 35-second voice was as likely a pick as the seven-minute one.
    private func preselect() {
        guard selected.isEmpty else { return }
        if !preselected.isEmpty {
            selected = preselected
        } else if let loudest = speakers.first {
            selected = [loudest.rawSpeakerTag]
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

private extension SpeakerSample {
    /// "7 min 7 s · 113 turns", or "45 s · 9 turns" under a minute.
    ///
    /// Not `ReportConfidence.formatDuration`: its "7:07" is a timestamp
    /// format, and on a card about how long someone talked it reads as the
    /// moment they said it. nil when the server predates these counts, so
    /// the card simply goes back to the quote alone.
    var talkSummary: String? {
        guard let totalSec else { return nil }
        let whole = max(0, Int(totalSec.rounded()))
        let minutes = whole / 60
        let seconds = whole % 60
        var parts: [String] = []
        if minutes > 0 {
            parts.append(seconds > 0 ? "\(minutes) min \(seconds) s" : "\(minutes) min")
        } else {
            parts.append("\(seconds) s")
        }
        if let utteranceCount {
            parts.append("\(utteranceCount) turn\(utteranceCount == 1 ? "" : "s")")
        }
        return parts.joined(separator: " · ")
    }
}

/// "Fix who's who", from inside a report whose talk numbers came out
/// backwards. The cards aren't in hand here — this session was opened, not
/// tagged — so they're fetched when the sheet appears.
struct RetagSpeakersView: View {
    let session: AudioSessionWithSegments
    let onTagged: (AudioSessionWithSegments) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var speakers: [SpeakerSample] = []
    @State private var loading = true
    @State private var error: String?

    private var currentTeacherTags: Set<String> {
        Set(session.segments.filter { $0.speakerLabel == "Teacher" }.map(\.rawSpeakerTag))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(40)
                    } else if speakers.isEmpty {
                        Text(error ?? "This recording's voices are no longer available to re-tag.")
                            .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    } else {
                        TagSpeakersView(
                            session: session,
                            speakers: speakers,
                            preselected: currentTeacherTags,
                            confirmTitle: "Update the report",
                            onTagged: onTagged
                        )
                    }
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Fix who's who")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                speakers = (try? await AudioCoachingService.speakers(sessionId: session.id)) ?? []
                if speakers.isEmpty { error = "Couldn't load the voices from this recording. Please try again." }
                loading = false
            }
        }
    }
}
