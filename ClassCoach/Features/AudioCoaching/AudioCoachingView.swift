import SwiftUI

struct AudioCoachingView: View {
    /// Watched so the screen can refuse to be left mid-recording. The recorder
    /// outlives this view now, so leaving no longer destroys the lesson — but
    /// a teacher who walks out of Lesson Debrief still means to keep recording,
    /// and coming back to a panel reading 0:00 would say otherwise.
    @ObservedObject private var recorder = AudioRecorder.shared
    @State private var sessions: [AudioSession] = []
    @State private var active: AudioSessionWithSegments?
    @State private var speakers: [SpeakerSample] = []
    @State private var error: String?
    @State private var historyLoading = true
    @State private var loadingSessionId: String?

    /// A recording the app never reached Stop on — the phone died, iOS
    /// reclaimed the app, someone force-quit it. Its chunks are still on disk
    /// (see `RecordingStore`), and this is the only thing that will ever tell
    /// the teacher so.
    /// A recording the app never finished sending, and whether its file can
    /// actually be opened. The two are separate facts: the manifest counts the
    /// minutes that were recorded, while an .m4a killed before `stop()` has all
    /// of that audio and no index. Offering "24 minutes were saved, send it?"
    /// and only checking afterwards told a teacher they had their lesson back,
    /// then took it away again on the next tap.
    private struct Unfinished {
        let manifest: RecordingStore.Manifest
        let playable: Bool
        /// Read from the file, not from the manifest's clock — see
        /// RecordingStore.audioDuration.
        let seconds: Double
    }

    @State private var unfinished: Unfinished?
    @State private var recovering = false

    /// Anything the server is working on without this screen. Both waits end
    /// on their own, so both have to stop saying so without being asked.
    private var hasWorkInFlight: Bool {
        sessions.contains { $0.status == "transcribing" || $0.status == "analyzing" }
    }

    private var isRecordingPhase: Bool {
        guard let active else { return true }
        return ["setup", "recording", "paused"].contains(active.status)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if active == nil {
                        Text("Record a class period, get a transcript, and see a coaching report. Audio is never saved — only the text.")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                    }

                    if isRecordingPhase {
                        RecordingPanelView(session: active, onSessionUpdate: { updated, spk in
                            active = updated
                            speakers = spk
                        }, onUploadStarted: {
                            // Nothing to wait for on this screen any more — the
                            // upload is the system's job and the transcription
                            // is the server's.
                            active = nil
                            Task { await loadHistory() }
                        }, onExit: {
                            active = nil
                        })
                    } else if let active {
                        SessionFlowView(session: active, speakers: speakers, onUpdate: { updated in
                            self.active = updated
                        }, onExit: {
                            self.active = nil
                            speakers = []
                            Task { await loadHistory() }
                        })
                    }

                    if let error {
                        Text(error).font(.footnote).foregroundStyle(AppTheme.terracotta600)
                    }

                    if active == nil {
                        historySection
                    }
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("Lesson Debrief")
            // Pushed from Home, this screen has a system back button. Leaving
            // mid-recording is survivable now but never intended, so while the
            // mic is live the way out is Stop.
            .navigationBarBackButtonHidden(recorder.phase == .recording || recorder.phase == .paused)
            .task { await loadHistory() }
            // A row that says "Processing" has to stop saying it without being
            // asked. Only while something is actually running, so an idle list
            // makes no requests at all.
            .task(id: hasWorkInFlight) {
                guard hasWorkInFlight else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(5))
                    if Task.isCancelled { return }
                    await loadHistory()
                }
            }
            // The background upload can land while this view is on screen, or
            // in a process launched purely to be told. Either way the answer
            // comes from the server, not from the notification.
            // `presenting:` hands each button the manifest, which matters:
            // dismissing the alert clears `unfinished` before the button's
            // action runs, so an action that read the state instead would find
            // nil and do nothing at all — silently.
            .alert(
                unfinished?.playable == false ? "Recording lost" : "Unfinished recording",
                isPresented: Binding(
                    get: { unfinished != nil },
                    set: { if !$0 { unfinished = nil } }
                ),
                presenting: unfinished
            ) { pending in
                if pending.playable {
                    Button("Send it") { Task { await recoverUnfinished(pending.manifest) } }
                    Button("Discard", role: .destructive) {
                        RecordingStore.discard(sessionId: pending.manifest.sessionId)
                    }
                    Button("Later", role: .cancel) {}
                } else {
                    // Nothing to offer, but the teacher still has to be told —
                    // a lesson they recorded is gone, and finding that out by
                    // noticing it never appeared is worse than being told.
                    Button("OK", role: .cancel) {
                        RecordingStore.discard(sessionId: pending.manifest.sessionId)
                    }
                }
            } message: { pending in
                Text(unfinishedMessage(pending))
            }
            .onReceive(NotificationCenter.default.publisher(for: BackgroundUploader.didFinishUpload)) { note in
                if let message = note.userInfo?["message"] as? String,
                   (note.userInfo?["success"] as? Bool) == false {
                    error = message
                }
                Task { await loadHistory() }
            }
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PAST SESSIONS").font(.caption.weight(.bold)).tracking(1.1).foregroundStyle(AppTheme.terracotta600)
            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if sessions.isEmpty {
                Text("Sessions you record will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding()
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
            } else {
                ForEach(sessions) { session in
                    SessionCardView(
                        session: session,
                        isLoading: loadingSessionId == session.id,
                        onOpen: { Task { await open(session) } },
                        onDelete: { Task { await delete(session) } }
                    )
                }
            }
        }
    }

    private func unfinishedMessage(_ pending: Unfinished) -> String {
        // Thirty seconds used to round up to "about 1 minute", which read as a
        // whole minute of a lesson lost when it was a few seconds of nothing.
        let seconds = pending.seconds
        let minutes = Int((seconds / 60).rounded())
        let amount = seconds < 30 ? "less than a minute" : "about \(max(1, minutes)) minute\(minutes == 1 ? "" : "s")"
        let when = pending.manifest.startedAt.formatted(date: .abbreviated, time: .shortened)
        if pending.playable {
            return "A recording from \(when) never finished sending — \(amount) of it was saved. Send it now?"
        }
        // Say what was lost, not just that something was: "about 24 minutes"
        // is the difference between a mishap and a class the teacher needs to
        // know they have no record of.
        return "The recording from \(when) was cut off before it could be saved — \(amount) of it, and none of it can be recovered. Recording stops being recoverable if the app is closed or the phone dies before you press Stop."
    }

    /// Merges whatever chunks survived and hands them to the same background
    /// upload a normal Stop uses. The last chunk is usually the damaged one;
    /// `RecordingStore.merge` skips what it cannot open rather than losing the
    /// rest of the class with it.
    private func recoverUnfinished(_ manifest: RecordingStore.Manifest) async {
        recovering = true
        defer { recovering = false }
        do {
            // Checked again rather than trusted: the alert settled this before
            // it appeared, but a file can go between then and the tap.
            guard await RecordingStore.isPlayable(sessionId: manifest.sessionId) else {
                RecordingStore.discard(sessionId: manifest.sessionId)
                self.error = "That recording was cut off before it could be saved and can't be recovered."
                return
            }
            // The session this was recorded under may be gone — deleted from
            // the list, or never created because an earlier bug had two
            // recordings share one. Uploading to it then returns "Session not
            // found" and the recording is stranded on the phone forever. A
            // fresh session gives it somewhere to land, and the local copy
            // moves with it so it stops being offered back.
            var sessionId = manifest.sessionId
            if !sessions.contains(where: { $0.id == sessionId }) {
                let replacement = try await AudioCoachingService.createSession(teacherName: nil)
                try RecordingStore.rekey(from: sessionId, to: replacement.id)
                sessionId = replacement.id
            }
            try await AudioCoachingService.startTranscription(
                sessionId: sessionId,
                audioFileURL: RecordingStore.audioURL(for: sessionId),
                durationSec: manifest.accumulatedSec
            )
            // Not discarded here either: this upload is queued, exactly like
            // the first one was. `reconcileLocalAudio` clears it once the
            // server reports a transcript.
            await loadHistory()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadHistory() async {
        do { sessions = try await AudioCoachingService.getSessions() } catch {}
        historyLoading = false
        reconcileLocalAudio()
    }

    /// Decides, from what the server actually reports, which recordings on
    /// this phone are still the only copy.
    ///
    /// A background upload returns when it is queued, so "sent" means nothing
    /// on its own: the server can reject it, and a restart can kill the
    /// transcription with the audio only in its memory. The phone therefore
    /// keeps the merged file until a session has a transcript — reaching
    /// `tagging` is the first moment the lesson exists somewhere else.
    private func reconcileLocalAudio() {
        let byId = Dictionary(uniqueKeysWithValues: sessions.map { ($0.id, $0) })
        let cutoff = Date().addingTimeInterval(-Double(RecordingStore.keepLocalAudioDays) * 24 * 60 * 60)
        var recoverable: RecordingStore.Manifest?

        for manifest in RecordingStore.stored() {
            // Never touch the recording being made right now. Asked of the
            // store rather than of `active`, which is nil for a recording the
            // panel started itself — so this guard never fired, and a WAV with
            // half a second in it was judged unrecoverable and deleted while it
            // was still being written to.
            if RecordingStore.activeSessionId == manifest.sessionId { continue }
            if active?.id == manifest.sessionId, isRecordingPhase { continue }

            // Already on its way. The server only learns a recording exists
            // when it arrives, so for the length of a large upload its status
            // still reads "setup" — which used to be read as "never sent" and
            // offered back. Each "Send it" then queued another copy of the same
            // file, and they competed for the same connection.
            //
            // Only when it can actually land, though. An upload aimed at a
            // session the server does not have will retry for days and never
            // arrive, and skipping it left the recording neither sent nor
            // offered back — invisible. Those get abandoned so recovery can
            // give the recording a session that exists.
            if BackgroundUploader.shared.isUploading(sessionId: manifest.sessionId) {
                if byId[manifest.sessionId] != nil { continue }
                BackgroundUploader.shared.cancelUploads(sessionId: manifest.sessionId)
            }

            if manifest.startedAt < cutoff {
                RecordingStore.discard(sessionId: manifest.sessionId)
                continue
            }

            switch byId[manifest.sessionId]?.status {
            case "tagging", "analyzing", "analyzed", "locked":
                // Transcribed. The audio has done its job.
                RecordingStore.discard(sessionId: manifest.sessionId)
            case "transcribing":
                // In flight on the server. Hold the copy, say nothing.
                continue
            case nil where manifest.deliveredAt != nil:
                // The server had this recording and no longer does: it threw it
                // away after finding no speech in it, or the teacher deleted the
                // session. Offering it back would upload the same bytes to a
                // fresh session, reach the same end, and offer it again — a
                // loop the teacher cannot get out of except by discarding.
                RecordingStore.discard(sessionId: manifest.sessionId)
            default:
                // Never arrived, failed, or the session is gone without this
                // phone ever having got it there.
                if recoverable == nil { recoverable = manifest }
            }
        }
        guard let recoverable else {
            unfinished = nil
            return
        }
        // Whether the file opens decides which of two different things the
        // teacher is told, so it is settled before the alert appears rather
        // than after they have tapped Send.
        Task {
            let captured = await RecordingStore.audioDuration(sessionId: recoverable.sessionId)
            unfinished = Unfinished(
                manifest: recoverable,
                playable: captured != nil,
                seconds: captured ?? recoverable.accumulatedSec
            )
        }
    }

    /// Why this row cannot be opened yet, or nil when it can.
    ///
    /// A session whose upload is still climbing out sits at "setup", which is
    /// the same status a session being recorded right now has — and
    /// `isRecordingPhase` sends that to the record panel. Opening one
    /// therefore armed the panel with a session id that already had a lesson
    /// in it, and the next Record truncated the recording still on its way to
    /// the server. "Back" then looked like it had lost the lesson, because the
    /// next tap was about to.
    private func inFlightReason(for session: AudioSession) -> String? {
        if session.status == "transcribing" {
            return "That lesson is still being transcribed. It will open as soon as it is ready."
        }
        guard ["setup", "recording", "paused"].contains(session.status) else { return nil }
        if BackgroundUploader.shared.uploadingSessionIds.contains(session.id) {
            return "That lesson is still being sent. It will open once the server has it."
        }
        if RecordingStore.hasRecording(sessionId: session.id) {
            return "That lesson has not been sent yet. Reopen Lesson Debrief to finish sending it."
        }
        return nil
    }

    private func open(_ session: AudioSession) async {
        // Nothing may be opened while a recording is running.
        //
        // Opening a session that is past the recording phases makes
        // isRecordingPhase false, which swaps RecordingPanelView out of the
        // view tree — and takes its @StateObject AudioRecorder, and the
        // AVAudioRecorder writing the lesson, with it. The panel is rendered
        // inline precisely so it never unmounts mid-capture; this was the one
        // path around that. The lesson died mid-sentence, the panel came back
        // reading 0:00 READY TO RECORD, and activeSessionId stayed set, so
        // reconcileLocalAudio skipped the file forever and never offered it
        // back either.
        if let recordingId = RecordingStore.activeSessionId {
            error = recordingId == session.id
                ? "That lesson is recording right now."
                : "You're recording right now. Stop that recording before opening another lesson."
            return
        }
        if let reason = inFlightReason(for: session) {
            error = reason
            return
        }
        // Clears the note above when the teacher goes on to open a row that
        // does work, rather than leaving "still being sent" sitting under a
        // session that opened fine.
        error = nil
        loadingSessionId = session.id
        do {
            let full = try await AudioCoachingService.getSession(id: session.id)
            // The cards used to arrive with the upload's response. Now the
            // upload returns long before they exist, so they are fetched when
            // the teacher actually opens the session to tag. "analyzing" too:
            // that analysis can still come back needing another go, and the
            // cards have to already be here when it does.
            if full.status == "tagging" || full.status == "analyzing" {
                speakers = (try? await AudioCoachingService.speakers(sessionId: session.id)) ?? []
            }
            active = full
        } catch {
            self.error = error.localizedDescription
        }
        loadingSessionId = nil
    }

    private func delete(_ session: AudioSession) async {
        do {
            try await AudioCoachingService.deleteSession(id: session.id)
            sessions.removeAll { $0.id == session.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct SessionCardView: View {
    let session: AudioSession
    let isLoading: Bool
    let onOpen: () -> Void
    let onDelete: () -> Void
    @State private var showDeleteConfirm = false

    private var statusLabel: String {
        switch session.status {
        case "locked": return "Locked"
        case "analyzed": return "Ready to review"
        case "transcribing": return "Processing · \(Int(transcriptionProgress.rounded()))%"
        case "failed": return "Couldn't process"
        // Split out of the catch-all below: "In progress" was shown both for a
        // session still being sent and for one waiting to be tagged, so a
        // teacher tapping it to pick their voice could land on either, and the
        // one they wanted was the only one that worked.
        case "tagging": return "Identify your voice"
        // The analysis runs on the server now, so a teacher can leave this
        // behind and come back to it — and "In progress" would read like the
        // lesson was still being sent.
        case "analyzing": return "Analyzing"
        default: return "In progress"
        }
    }

    /// The same curve and the same 0.15x factor the web uses, read from the
    /// row rather than from anything local — so the number is the same here,
    /// on the web, and after the app has been killed and relaunched.
    ///
    /// Recomputed whenever the row re-renders, which the five-second refresh
    /// of the list already causes. No separate timer: a percentage that moves
    /// every five seconds is enough to look alive, and a per-row clock in a
    /// list is not worth what it costs.
    private var transcriptionProgress: Double {
        guard let started = session.transcribeStartedAtDate else { return 0 }
        let tau = max(3, Double(session.durationSec ?? 0) * 0.15)
        return 92 * (1 - exp(-Date().timeIntervalSince(started) / tau))
    }

    private var statusStyle: (fill: Color, ink: Color) {
        switch session.status {
        case "locked": return (AppTheme.cream, AppTheme.textSecondary)
        case "analyzed": return (AppTheme.mintTint, AppTheme.forest)
        case "failed": return (AppTheme.peachTint, AppTheme.terracotta600)
        default: return (AppTheme.goldTint, AppTheme.forest)
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    Image(systemName: "mic.fill")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.gold)
                        .frame(width: 40, height: 40)
                        .background(AppTheme.forest, in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 5) {
                        (Text(session.displayTitle)
                            + Text(session.period.map { " · \($0)" } ?? "").foregroundColor(AppTheme.terracotta))
                            .font(.heading(.subheadline)).foregroundStyle(AppTheme.forest)
                        Text(formattedDate(session.sessionDate))
                            .font(.caption).foregroundStyle(AppTheme.textSecondary)
                        HStack(spacing: 6) {
                            Text(statusLabel)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(statusStyle.ink)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(statusStyle.fill, in: Capsule())
                            if let pct = session.teacherTalkPct {
                                Text("\(Int(pct))% you").font(.caption).foregroundStyle(AppTheme.textSecondary)
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer()
            if isLoading {
                ProgressView()
            } else {
                Button("Delete") { showDeleteConfirm = true }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(AppTheme.terracotta600)
            }
        }
        .padding(14)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(AppTheme.hairline))
        .alert("Delete this recording?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive, action: onDelete)
        } message: {
            Text("Permanently delete this recording's transcript and report? This cannot be undone.")
        }
    }
}

func formattedDate(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    let display = DateFormatter()
    display.dateStyle = .medium
    display.timeStyle = .short
    return display.string(from: date)
}

#Preview {
    AudioCoachingView()
}
