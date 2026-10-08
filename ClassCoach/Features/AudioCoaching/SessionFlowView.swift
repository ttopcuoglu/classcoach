import SwiftUI

/// Routes a non-recording session to the right screen by status — mirrors
/// `AudioCoaching.tsx`'s `SessionFlow`.
struct SessionFlowView: View {
    let session: AudioSessionWithSegments
    let speakers: [SpeakerSample]
    let onUpdate: (AudioSessionWithSegments) -> Void
    let onExit: () -> Void

    /// Why the analysis we were waiting on never produced a report. Held here
    /// rather than read off the row: when this phone is the one that gave up
    /// waiting, the row still says "analyzing", and the teacher still needs
    /// the cards and the Analyze button back.
    @State private var analysisError: String?

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
        case "analyzing" where analysisError == nil:
            AnalyzingView(
                sessionId: session.id,
                onAnalyzed: { analysisError = nil; onUpdate($0) },
                onFailed: { analysisError = $0 }
            )
        case "tagging", "analyzing":
            // Pressing Analyze again starts a fresh wait, so the last run's
            // reason goes with the tap that replaces it.
            TagSpeakersView(
                session: session,
                speakers: speakers,
                initialError: analysisError,
                onTagged: { analysisError = nil; onUpdate($0) }
            )
        default:
            ReportView(session: session, onUpdate: onUpdate, onExit: onExit)
        }
    }
}

/// The wait while the server reads the transcript, and the poll that ends it.
///
/// Tagging the speakers used to answer with the finished report, which a long
/// lesson simply outlasts (see `AudioCoachingService.tagSpeakers`). The row's
/// status is what says when the report is ready now, so this asks for it —
/// the same shape as the list's five-second refresh while a session
/// transcribes.
private struct AnalyzingView: View {
    let sessionId: String
    let onAnalyzed: (AudioSessionWithSegments) -> Void
    let onFailed: (String) -> Void

    /// Also what the server writes on the row when its own sweep finds an
    /// analysis that lost its process.
    private static let retryMessage = "The analysis did not finish. Please try again."

    var body: some View {
        VStack(spacing: 12) {
            ProgressRing(
                active: true,
                estimatedSeconds: 45,
                label: "Reading your lesson",
                hint: "Usually under a minute.",
                size: 88
            )
            Text("This keeps going if you leave this screen — the report will be waiting under Past sessions.")
                .font(.caption)
                .foregroundStyle(AppTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        // `.task` is cancelled when this view goes away, so leaving the screen
        // stops the requests without stopping the analysis.
        .task { await poll() }
    }

    /// Four seconds is soon enough that a short lesson doesn't feel stalled
    /// and cheap enough for a fifty-minute one. The ceiling matches the
    /// server's own orphan sweep (ORPHANED_ANALYSIS_MINUTES), so a wait this
    /// long means the job is gone rather than slow — and the teacher gets the
    /// retry instead of a ring that spins all afternoon.
    private func poll() async {
        let deadline = Date().addingTimeInterval(20 * 60)
        while !Task.isCancelled, Date() < deadline {
            try? await Task.sleep(for: .seconds(4))
            if Task.isCancelled { return }
            // A dropped request is just one missed poll — the analysis is not
            // this phone's to lose.
            guard let latest = try? await AudioCoachingService.getSession(id: sessionId) else { continue }
            if latest.status == "analyzing" { continue }
            if latest.status == "analyzed" || latest.status == "locked" {
                onAnalyzed(latest)
            } else {
                // A failed analysis is put back to "tagging": the transcript
                // and the tags survive, so Analyze can simply be pressed again.
                onFailed(latest.failureReason ?? Self.retryMessage)
            }
            return
        }
        if !Task.isCancelled { onFailed(Self.retryMessage) }
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
    /// Why the last analysis came back empty-handed, when the teacher is here
    /// because one did. Shown until they press Analyze again.
    var initialError: String?
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
        .onAppear {
            preselect()
            if error == nil { error = initialError }
        }
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
            try await AudioCoachingService.tagSpeakers(sessionId: session.id, rawSpeakerTags: Array(selected))
            // The 202 carries no session and the waiting panel is chosen by
            // status, so read the row back — the server has already set it to
            // "analyzing" by the time it answers.
            onTagged(try await AudioCoachingService.getSession(id: session.id))
        } catch {
            // The work carries on server-side after a phone gives up waiting,
            // so ask what actually happened before saying it failed —
            // otherwise a teacher re-runs an analysis that already succeeded,
            // or one that is running right now.
            if let latest = try? await AudioCoachingService.getSession(id: session.id),
               ["analyzing", "analyzed", "locked"].contains(latest.status) {
                onTagged(latest)
            } else {
                self.error = "Could not tag those speakers. Please try again."
            }
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
