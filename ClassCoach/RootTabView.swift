import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var update = UpdateChecker()
    @Environment(\.scenePhase) private var scenePhase
    /// Account ids that agreed to the AI-sharing consent on this phone.
    @AppStorage("aiConsentUserIds") private var consentedIds = ""

    var body: some View {
        Group {
            if authManager.isRestoringSession {
                ProgressView()
            } else if let user = authManager.currentUser, !consentedIds.split(separator: ",").contains(Substring(user.id)) {
                // Before anything goes to Anthropic or Deepgram.
                AIConsentView(
                    onAgree: { consentedIds = (consentedIds.isEmpty ? "" : consentedIds + ",") + user.id },
                    onDecline: { authManager.signOut() }
                )
            } else if authManager.currentUser != nil {
                // Five slots, the same five the web's bar settled on: Home,
                // Talk, Grow, Plan, You. Five is also the most a phone's
                // TabView shows before it sweeps the rest into "More".
                //
                // There were seven tabs. A phone's TabView shows four and sweeps
                // the rest into a system "More" list, so Planning Coach,
                // Communication Coach and Profile were all buried in it — and
                // Home had been growing extra cards to compensate for tools
                // nobody could find. Grouping is what fixes that; deleting more
                // Home cards was only ever treating the symptom.
                //
                // Grow and Plan are sections, not pages: each is a tab whose
                // root lists its tools (see SectionHubs). Not "Coaching" —
                // every tool here is coaching, including both of Plan's, which
                // are named Coach. Profile is "You", where every app puts it.
                TabView {
                    HomeView()
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    // Talk It Through is its own slot, not a row inside Grow.
                    // It is the only catch-all: any problem, no format, nothing
                    // to set up first. The others need a teacher to already know
                    // what they want, so burying the "I just need to think out
                    // loud" door behind a group label works against the thing
                    // they reach for when they are stuck at 3:40.
                    TalkToMeView()
                        .tabItem {
                            Label("Talk", systemImage: "waveform.circle.fill")
                        }

                    GrowHubView()
                        .tabItem {
                            Label("Grow", systemImage: "mic.fill")
                        }

                    PlanHubView()
                        .tabItem {
                            Label("Plan", systemImage: "doc.text.fill")
                        }

                    // ProfileView owns no NavigationStack — it used to get one
                    // from the system More list, which no longer exists here.
                    NavigationStack { ProfileView() }
                        .tabItem {
                            Label("You", systemImage: "person.crop.circle")
                        }
                }
                .tint(AppTheme.primary)
            } else {
                SignInView()
            }
        }
        // Above every screen, signed in or not, while a newer version is in
        // the App Store.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let version = update.available {
                UpdateBanner(version: version, onLater: { update.later(version) })
            }
        }
        .task { await update.check() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await update.check() } }
        }
    }
}

/// Whether the App Store has a newer Wivoza than the one running, read from
/// Apple's public listing (itunes.apple.com/lookup), so the banner turns on by
/// itself when a release goes live, with nothing to change on our server.
/// A TestFlight build ahead of the store never sees it. "Not now" hides that
/// version for a day.
@MainActor
final class UpdateChecker: ObservableObject {
    static let appStoreID = "6808223345"
    static let appStoreURL = URL(string: "itms-apps://apps.apple.com/app/id\(appStoreID)")!

    @Published private(set) var available: String?
    @AppStorage("updateLaterVersion") private var laterVersion = ""
    @AppStorage("updateLaterUntil") private var laterUntil: Double = 0
    private var lastChecked: Date?

    static var installed: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    func check() async {
        // Hourly, not every few hours: an app left signed in and running in
        // the background only checks again when it comes back to the front,
        // and a six-hour gap could hide a release for most of a school day.
        // Still never on every return to the app.
        if let lastChecked, Date().timeIntervalSince(lastChecked) < 3600 { return }
        lastChecked = Date()
        guard let store = await Self.storeVersion() else { return }
        let snoozed = store == laterVersion && Date().timeIntervalSince1970 < laterUntil
        available = Self.isNewer(store, than: Self.installed) && !snoozed ? store : nil
    }

    /// The version live on the App Store right now, or nil when Apple could
    /// not be reached. Shared by the banner and Profile's Check for Updates.
    static func storeVersion() async -> String? {
        // Cache-busting: the lookup is served through a CDN, and a teacher
        // who taps Check minutes after a release should not be told an hour-old
        // answer.
        guard let url = URL(string: "https://itunes.apple.com/lookup?id=\(appStoreID)&country=us&t=\(Int(Date().timeIntervalSince1970))"),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let reply = try? JSONDecoder().decode(Lookup.self, from: data)
        else { return nil }
        return reply.results.first?.version
    }

    func later(_ version: String) {
        laterVersion = version
        laterUntil = Date().addingTimeInterval(24 * 3600).timeIntervalSince1970
        available = nil
    }

    /// "1.4.10" is newer than "1.4.9": compared number by number, not as text.
    static func isNewer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0
            let q = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }

    private struct Lookup: Decodable {
        struct Result: Decodable { let version: String }
        let results: [Result]
    }
}

/// The notice itself: what is new is said plainly, with the way to get it
/// right there.
struct UpdateBanner: View {
    let version: String
    let onLater: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.down.circle.fill")
                .font(.title2).foregroundStyle(AppTheme.gold)
            VStack(alignment: .leading, spacing: 1) {
                Text("A new version of Wivoza is ready").font(.subheadline.weight(.semibold))
                Text("Version \(version)").font(.caption).opacity(0.8)
            }
            .foregroundStyle(.white)
            Spacer(minLength: 4)
            Button("Not now", action: onLater)
                .font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.8))
            Button("Update") { openURL(UpdateChecker.appStoreURL) }
                .font(.subheadline.weight(.bold)).foregroundStyle(AppTheme.forest)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(AppTheme.gold, in: Capsule())
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(AppTheme.forest)
    }
}

/// Profile's on-demand check, for a teacher who wants to know now rather than
/// wait for the banner — which checks at most every six hours and stays
/// quiet for a day after "Not now". This ignores both.
struct CheckForUpdatesRow: View {
    private enum Status: Equatable {
        case idle, checking, upToDate, available(String), failed
    }

    @State private var state: Status = .idle
    @Environment(\.openURL) private var openURL

    var body: some View {
        switch state {
        case .available(let version):
            Button {
                openURL(UpdateChecker.appStoreURL)
            } label: {
                Label("Update to Version \(version)", systemImage: "arrow.down.circle.fill")
                    .fontWeight(.semibold)
            }
        default:
            Button {
                Task { await check() }
            } label: {
                HStack {
                    Text("Check for Updates")
                    Spacer()
                    switch state {
                    case .checking: ProgressView()
                    case .upToDate: Text("Up to date").foregroundStyle(.secondary)
                    case .failed: Text("Couldn't reach the App Store").font(.caption).foregroundStyle(.secondary)
                    default: EmptyView()
                    }
                }
            }
            .disabled(state == .checking)
        }
    }

    private func check() async {
        state = .checking
        guard let store = await UpdateChecker.storeVersion() else {
            state = .failed
            return
        }
        state = UpdateChecker.isNewer(store, than: UpdateChecker.installed) ? .available(store) : .upToDate
    }
}

#Preview {
    RootTabView()
        .environmentObject(AuthManager.shared)
}
