import Foundation

/// Request builders for the Profile screen — mirrors the matching
/// functions in `web/src/lib/api.ts` against `/api/profile`.
enum ProfileService {
    static func getProfile() async throws -> User {
        try await APIClient.shared.request("/api/profile")
    }

    private struct UpdateBody: Encodable {
        let name: String
        let gradeLevels: String
        let subjects: String
    }

    static func updateProfile(name: String, gradeLevels: String, subjects: String) async throws -> User {
        try await APIClient.shared.request(
            "/api/profile",
            method: "PUT",
            body: UpdateBody(name: name, gradeLevels: gradeLevels, subjects: subjects)
        )
    }

    private struct OnboardingProgressBody: Encodable { let onboardingProgress: String }

    /// A separate, narrower call from `updateProfile` on purpose — sending
    /// only this one field (not name/gradeLevels/subjects too) means the
    /// server's per-field-optional PUT leaves everything else untouched,
    /// rather than risking overwriting them with stale/empty values.
    static func updateOnboardingProgress(_ progress: String) async throws -> User {
        try await APIClient.shared.request(
            "/api/profile",
            method: "PUT",
            body: OnboardingProgressBody(onboardingProgress: progress)
        )
    }

    /// Only the fields that are set get sent — Swift omits nil optionals when
    /// encoding — so the server's per-field PUT leaves everything else alone.
    struct SettingsBody: Encodable {
        var talkVoice: String?
        var coachMemoryEnabled: Bool?
        var clearCoachMemory: Bool?
        var joinCode: String?
    }

    static func updateSettings(_ body: SettingsBody) async throws -> User {
        try await APIClient.shared.request("/api/profile", method: "PUT", body: body)
    }

    private struct ResetResponse: Decodable {
        let status: String
    }

    static func resetData() async throws {
        let _: ResetResponse = try await APIClient.shared.request("/api/profile/reset", method: "POST")
    }

    private struct DeleteAccountResponse: Decodable {
        let status: String
    }

    /// Permanently deletes the signed-in user's account and everything
    /// tied to it — required by Apple Guideline 5.1.1(v) for any app that
    /// supports account creation.
    static func deleteAccount() async throws {
        let _: DeleteAccountResponse = try await APIClient.shared.request("/api/profile", method: "DELETE")
    }
}
