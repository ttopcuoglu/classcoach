import Foundation
import Security

/// Holds the signed-in user and the bearer token that authenticates every
/// `APIClient` request. The token is the same signed JWT the web app keeps
/// in its session cookie (server/src/lib/auth.ts's `signSession`) — here
/// it's persisted in the Keychain instead, since a native app has no
/// browser cookie jar to rely on.
@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published private(set) var currentUser: User?
    @Published private(set) var isRestoringSession = true

    private(set) var token: String? {
        didSet {
            if let token {
                Keychain.save(token)
            } else {
                Keychain.delete()
            }
        }
    }

    private init() {
        token = Keychain.load()
    }

    /// Call once at app launch: if a token was persisted from a previous
    /// session, confirm it's still valid against the server before showing
    /// the signed-in UI.
    func restoreSession() async {
        defer { isRestoringSession = false }
        guard token != nil else { return }
        do {
            currentUser = try await APIClient.shared.request("/api/auth/me")
        } catch {
            token = nil
            currentUser = nil
        }
    }

    func signInWithGoogle(idToken: String) async throws {
        let response: AuthResponse = try await APIClient.shared.request(
            "/api/auth/google",
            method: "POST",
            body: ["credential": idToken]
        )
        token = response.token
        currentUser = response.user
    }

    func signOut() {
        token = nil
        currentUser = nil
    }

    /// Called after a successful `PUT /api/profile` or `/reset` so the
    /// rest of the app (e.g. the tab bar's signed-in state) reflects the
    /// change immediately, without a redundant `/auth/me` round-trip.
    func setCurrentUser(_ user: User) {
        currentUser = user
    }
}

/// Minimal Keychain read/write/delete for a single string value — no
/// third-party dependency needed for one item.
private enum Keychain {
    private static let account = "org.hampdencharter.classcoach.session-token"

    static func save(_ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
