import SwiftUI

struct AudioCoachingView: View {
    @State private var sessions: [AudioSession] = []
    @State private var active: AudioSessionWithSegments?
    @State private var speakers: [SpeakerSample] = []
    @State private var error: String?
    @State private var historyLoading = true
    @State private var loadingSessionId: String?

    private var isRecordingPhase: Bool {
        guard let active else { return true }
        return ["setup", "recording", "paused"].contains(active.status)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Record a class period, get a transcript, and see a coaching report. Audio is never saved — only the text.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)

                    if isRecordingPhase {
                        RecordingPanelView(session: active, onSessionUpdate: { updated, spk in
                            active = updated
                            speakers = spk
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
                        Text(error).font(.footnote).foregroundStyle(.red)
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
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PAST SESSIONS").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.textSecondary)
            if historyLoading {
                Text("Loading...").font(.subheadline).foregroundStyle(AppTheme.textSecondary)
            } else if sessions.isEmpty {
                Text("Sessions you record will show up here.")
                    .font(.subheadline).foregroundStyle(AppTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center).padding()
                    .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
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

    private func loadHistory() async {
        do { sessions = try await AudioCoachingService.getSessions() } catch {}
        historyLoading = false
    }

    private func open(_ session: AudioSession) async {
        loadingSessionId = session.id
        do {
            active = try await AudioCoachingService.getSession(id: session.id)
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
        default: return "In progress"
        }
    }

    var body: some View {
        HStack {
            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(session.classSubject ?? "New Recording")\(session.period.map { " · \($0)" } ?? "")")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(AppTheme.textPrimary)
                    HStack(spacing: 4) {
                        Text(formattedDate(session.sessionDate))
                        Text("· \(statusLabel)")
                        if let pct = session.teacherTalkPct { Text("· \(Int(pct))% you") }
                    }
                    .font(.caption).foregroundStyle(AppTheme.textSecondary)
                }
            }
            .buttonStyle(.plain)
            Spacer()
            if isLoading {
                ProgressView()
            } else {
                Button("Delete", role: .destructive) { showDeleteConfirm = true }
                    .font(.caption.weight(.semibold))
            }
        }
        .padding()
        .background(AppTheme.surface, in: RoundedRectangle(cornerRadius: 12))
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
