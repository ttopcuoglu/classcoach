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
                    if active == nil {
                        Text("Record a class period, get a transcript, and see a coaching report. Audio is never saved — only the text.")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                    }

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

    private var statusStyle: (fill: Color, ink: Color) {
        switch session.status {
        case "locked": return (AppTheme.cream, AppTheme.textSecondary)
        case "analyzed": return (AppTheme.mintTint, AppTheme.forest)
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
