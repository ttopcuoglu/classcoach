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
    /// One of `ExperienceLevel.all`'s ids, or nil if never answered.
    let experienceLevel: String?
    let onboardingProgress: String?
    /// One of `TalkVoice.all`'s ids, or nil for the default voice.
    let talkVoice: String?
    /// Coach's short running note about the teacher — nil until built up.
    let coachMemory: String?
    /// Optional so an older server response without the field still decodes.
    let coachMemoryEnabled: Bool?

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

/// Mirrors `EXPERIENCE_OPTIONS` in web/src/lib/experience.ts. The server uses
/// the answer to adjust the coach's tone and depth; the app uses it to pick
/// starting points (see `isExperienced`).
enum ExperienceLevel {
    static let all: [(id: String, label: String)] = [
        ("first_year", "First year"),
        ("early", "2–5 years"),
        ("established", "6–15 years"),
        ("veteran", "15+ years"),
    ]

    /// Six or more years in — refinement-focused starters and no First 30
    /// Days. Anyone who hasn't answered keeps the original experience.
    static func isExperienced(_ id: String?) -> Bool {
        id == "established" || id == "veteran"
    }
}
