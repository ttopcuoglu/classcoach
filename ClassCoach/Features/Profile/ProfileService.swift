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

    private struct ResetResponse: Decodable {
        let status: String
    }

    static func resetData() async throws {
        let _: ResetResponse = try await APIClient.shared.request("/api/profile/reset", method: "POST")
    }
}
