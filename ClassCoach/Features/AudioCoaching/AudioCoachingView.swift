import SwiftUI

struct AudioCoachingView: View {
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
    }

    @State private var unfinished: Unfinished?
    @State private var recovering = false

    private var hasTranscribing: Bool {
        sessions.contains { $0.status == "transcribing" }
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
            .task { await loadHistory() }
            // A row that says "Processing" has to stop saying it without being
            // asked. Only while something is actually running, so an idle list
            // makes no requests at all.
            .task(id: hasTranscribing) {
                guard hasTranscribing else { return }
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
        let minutes = max(1, Int((pending.manifest.accumulatedSec / 60).rounded()))
        let unit = "minute\(minutes == 1 ? "" : "s")"
        let when = pending.manifest.startedAt.formatted(date: .abbreviated, time: .shortened)
        if pending.playable {
            return "A recording from \(when) never finished sending — about \(minutes) \(unit) of it was saved. Send it now?"
        }
        // Say what was lost, not just that something was: "about 24 minutes"
        // is the difference between a mishap and a class the teacher needs to
        // know they have no record of.
        return "The recording from \(when) was cut off before it could be saved — about \(minutes) \(unit) of it, and none of it can be recovered. Recording stops being recoverable if the app is closed or the phone dies before you press Stop."
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
            try await AudioCoachingService.startTranscription(
                sessionId: manifest.sessionId,
                audioFileURL: RecordingStore.audioURL(for: manifest.sessionId),
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
            // Never touch the recording being made right now.
            if active?.id == manifest.sessionId, isRecordingPhase { continue }

            if manifest.startedAt < cutoff {
                RecordingStore.discard(sessionId: manifest.sessionId)
                continue
            }

            switch byId[manifest.sessionId]?.status {
            case "tagging", "analyzed", "locked":
                // Transcribed. The audio has done its job.
                RecordingStore.discard(sessionId: manifest.sessionId)
            case "transcribing":
                // In flight on the server. Hold the copy, say nothing.
                continue
            default:
                // Never arrived, failed, or the session is gone.
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
            let playable = await RecordingStore.isPlayable(sessionId: recoverable.sessionId)
            unfinished = Unfinished(manifest: recoverable, playable: playable)
        }
    }

    private func open(_ session: AudioSession) async {
        loadingSessionId = session.id
        do {
            let full = try await AudioCoachingService.getSession(id: session.id)
            // The cards used to arrive with the upload's response. Now the
            // upload returns long before they exist, so they are fetched when
            // the teacher actually opens the session to tag.
            if full.status == "tagging" {
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
                        (Text(session.classSubject ?? "New Recording")
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
