import Foundation

/// Mirrors the safe `User` JSON shape returned by the server
/// (`SAFE_USER_OMIT`/`USER_INCLUDE_ORG` in server/src/lib/auth.ts) — only
/// the fields the app currently uses are decoded; unknown fields are
/// ignored by `Codable`.
struct User: Codable, Identifiable {
    let id: String
    let email: String
    let name: String?
    let role: String
    let plan: String
    let organization: Organization?
    /// Comma-separated free text, not arrays — the server stores these as
    /// plain strings (see server/src/routes/profile.ts).
    let gradeLevels: String?
    let subjects: String?
    let onboardingProgress: String?

    struct Organization: Codable {
        let name: String
    }
}

/// `POST /api/auth/google|login|signup` return the user plus a bearer
/// token (see server/src/routes/auth.ts) — decode both in one shot.
struct AuthResponse: Codable {
    let user: User
    let token: String

    private enum CodingKeys: String, CodingKey {
        case token
    }

    init(from decoder: Decoder) throws {
        user = try User(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        token = try container.decode(String.self, forKey: .token)
    }
}
