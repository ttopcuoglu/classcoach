import Foundation

/// Request builders for Audio Coaching ("Lesson Debrief") — mirrors the
/// matching functions in `web/src/lib/api.ts` against `/api/audio-sessions`.
enum AudioCoachingService {
    static func getSessions() async throws -> [AudioSession] {
        try await APIClient.shared.request("/api/audio-sessions")
    }

    static func getSession(id: String) async throws -> AudioSessionWithSegments {
        try await APIClient.shared.request("/api/audio-sessions/\(id)")
    }

    private struct CreateBody: Encodable {
        let teacherName: String?
        let sessionDate: String
        let consentConfirmed: Bool
    }

    static func createSession(teacherName: String?) async throws -> AudioSession {
        try await APIClient.shared.request(
            "/api/audio-sessions",
            method: "POST",
            body: CreateBody(teacherName: teacherName, sessionDate: ISO8601DateFormatter().string(from: Date()), consentConfirmed: true)
        )
    }

    private struct UpdateBody: Encodable {
        var status: String?
        var durationSec: Double?
        var strengths: String?
        var growthAreas: String?
        var nextStep: String?
        var followUpDate: String?
    }

    static func updateSession(
        id: String, status: String? = nil, durationSec: Double? = nil,
        strengths: String? = nil, growthAreas: String? = nil, nextStep: String? = nil, followUpDate: String? = nil
    ) async throws -> AudioSession {
        try await APIClient.shared.request(
            "/api/audio-sessions/\(id)",
            method: "PATCH",
            body: UpdateBody(
                status: status, durationSec: durationSec, strengths: strengths,
                growthAreas: growthAreas, nextStep: nextStep, followUpDate: followUpDate
            )
        )
    }

    private struct TranscribeResponse: Decodable {
        let speakers: [SpeakerSample]
    }

    /// Uploads the recorded audio as multipart form data — same pattern as
    /// `web/src/lib/api.ts`'s `transcribeAudioSession` (field name `audio`).
    static func transcribe(sessionId: String, audioFileURL: URL) async throws -> [SpeakerSample] {
        let audioData = try Data(contentsOf: audioFileURL)
        let result: TranscribeResponse = try await APIClient.shared.upload(
            "/api/audio-sessions/\(sessionId)/transcribe",
            fileData: audioData,
            fieldName: "audio",
            filename: "session-audio.m4a",
            mimeType: "audio/m4a"
        )
        return result.speakers
    }

    private struct TagSpeakerBody: Encodable { let rawSpeakerTag: String }

    static func tagSpeaker(sessionId: String, rawSpeakerTag: String) async throws -> AudioSessionWithSegments {
        try await APIClient.shared.request(
            "/api/audio-sessions/\(sessionId)/tag-speaker",
            method: "POST",
            body: TagSpeakerBody(rawSpeakerTag: rawSpeakerTag)
        )
    }

    static func deleteSession(id: String) async throws {
        struct EmptyResponse: Decodable {}
        let _: EmptyResponse = try await APIClient.shared.request("/api/audio-sessions/\(id)", method: "DELETE")
    }

    private struct ReflectBody: Encodable {
        let message: String?
        let context: [String]
    }

    static func sendReflectMessage(sessionId: String, message: String?, context: [String]) async throws -> AudioSession {
        try await APIClient.shared.request(
            "/api/audio-sessions/\(sessionId)/reflect-chat",
            method: "POST",
            body: ReflectBody(message: message, context: context)
        )
    }

    struct ReflectSummary: Decodable {
        let strengths: String?
        let growthAreas: String?
        let nextStep: String?
    }

    static func summarizeReflectConversation(sessionId: String) async throws -> ReflectSummary {
        try await APIClient.shared.request("/api/audio-sessions/\(sessionId)/reflect-summary", method: "POST")
    }

    static func generateContentNotes(sessionId: String) async throws -> AudioSession {
        try await APIClient.shared.request("/api/audio-sessions/\(sessionId)/content-notes", method: "POST")
    }
}
