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

    /// Hands the recording to a background `URLSession` and returns at once.
    /// The system finishes the transfer even if the teacher locks the phone,
    /// and the server transcribes without us — mirrors `startTranscription` in
    /// `web/src/lib/api.ts`.
    static func startTranscription(sessionId: String, audioFileURL: URL, durationSec: Double) async throws {
        // Recording is uncompressed so an interrupted lesson survives; the
        // upload does not have to be. See AudioCompressor. Every upload goes
        // through here, so Stop and recovery both get it.
        let upload = AudioCompressor.compressedForUpload(audioFileURL)
        defer { AudioCompressor.discardCopy(upload, original: audioFileURL) }
        try BackgroundUploader.shared.startTranscription(
            sessionId: sessionId,
            audioFileURL: upload,
            durationSec: durationSec,
            token: await AuthManager.shared.token,
            baseURL: APIClient.shared.uploadBaseURL
        )
    }

    /// The speaker cards, once transcription has finished — the upload no
    /// longer waits around to return them.
    static func speakers(sessionId: String) async throws -> [SpeakerSample] {
        let result: TranscribeResponse = try await APIClient.shared.request("/api/audio-sessions/\(sessionId)/speakers")
        return result.speakers
    }

    /// Uploads the recorded audio as multipart form data — same pattern as
    /// `web/src/lib/api.ts`'s `transcribeAudioSession` (field name `audio`).
    static func transcribe(sessionId: String, audioFileURL: URL) async throws -> [SpeakerSample] {
        let audioData = try Data(contentsOf: audioFileURL)
        let result: TranscribeResponse = try await APIClient.shared.upload(
            "/api/audio-sessions/\(sessionId)/transcribe",
            fileData: audioData,
            fieldName: "audio",
            filename: "session-audio.\(audioFileURL.pathExtension)",
            mimeType: RecordingStore.mimeType(for: audioFileURL)
        )
        return result.speakers
    }

    private struct TagSpeakersBody: Encodable {
        let rawSpeakerTags: [String]
        /// Omitted, the server runs the analysis inside the request and
        /// answers with the finished session — which is what builds already
        /// in teachers' hands still do.
        var mode: String?
    }

    /// Tags the speakers and leaves the analysis running on the server.
    ///
    /// The synchronous form held one HTTP request open for the whole
    /// analysis. On a 22-minute lesson the two transcript reads alone took
    /// 12.6s and the request also wrote the class summary, so a full class
    /// period ran past URLSession's 60s timeout: the phone told the teacher
    /// it had failed while the server was finishing successfully. The server
    /// now answers 202 as soon as the row says "analyzing", so there is no
    /// session here to decode — the report arrives by polling
    /// `getSession(id:)` instead. Same `startTranscription` shape, where the
    /// upload stopped waiting for the transcript.
    static func tagSpeakers(sessionId: String, rawSpeakerTags: [String]) async throws {
        struct EmptyResponse: Decodable {}
        let _: EmptyResponse = try await APIClient.shared.request(
            "/api/audio-sessions/\(sessionId)/tag-speaker",
            method: "POST",
            body: TagSpeakersBody(rawSpeakerTags: rawSpeakerTags, mode: "async")
        )
    }

    static func deleteSession(id: String) async throws {
        struct EmptyResponse: Decodable {}
        let _: EmptyResponse = try await APIClient.shared.request("/api/audio-sessions/\(id)", method: "DELETE")
    }

    private struct ReflectBody: Encodable {
        let message: String?
        let context: [String]
        let spoken: Bool
    }

    /// `spoken` tells the coach it is being heard rather than read — one or
    /// two sentences, one question, no lists.
    static func sendReflectMessage(
        sessionId: String,
        message: String?,
        context: [String],
        spoken: Bool = false
    ) async throws -> AudioSession {
        try await APIClient.shared.request(
            "/api/audio-sessions/\(sessionId)/reflect-chat",
            method: "POST",
            body: ReflectBody(message: message, context: context, spoken: spoken)
        )
    }

    private struct ReflectStreamFrame: Decodable {
        let type: String
        let text: String?
        let session: AudioSession?
        let error: String?
    }

    /// The same turn, streamed a sentence at a time — mirrors
    /// `streamReflectMessage` in `web/src/lib/api.ts` and
    /// `TalkToMeService.streamReply`. Reflect made the teacher watch a
    /// progress ring until the whole reply existed while Talk It Through was
    /// already reading its first sentence aloud; the sentences handed to
    /// `onSentence` are exactly the text that ends up saved on the returned
    /// session. A locked report, the turn cap and the daily limit are all
    /// rejected before the stream starts, so they still arrive as the same
    /// status codes `sendReflectMessage` throws.
    static func streamReflectMessage(
        sessionId: String,
        message: String?,
        context: [String],
        spoken: Bool = false,
        onSentence: @MainActor @escaping (String) -> Void
    ) async throws -> AudioSession {
        var result: AudioSession?
        try await APIClient.shared.streamLines(
            "/api/audio-sessions/\(sessionId)/reflect-chat/stream",
            body: ReflectBody(message: message, context: context, spoken: spoken)
        ) { line in
            guard let data = line.data(using: .utf8),
                  let frame = try? JSONDecoder().decode(ReflectStreamFrame.self, from: data) else { return }
            switch frame.type {
            case "sentence":
                if let text = frame.text { await onSentence(text) }
            case "done":
                result = frame.session
            case "error":
                throw APIError.server(status: 502, message: frame.error ?? "Could not reach Coach. Please try again.")
            default:
                break
            }
        }
        guard let result else {
            throw APIError.server(status: 502, message: "Could not reach Coach. Please try again.")
        }
        return result
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

    static func generateRubricLens(sessionId: String) async throws -> AudioSessionWithSegments {
        try await APIClient.shared.request("/api/audio-sessions/\(sessionId)/rubric-lens", method: "POST")
    }

    /// The written summary and the four Insights narratives. The server now
    /// writes these at the end of analysis, so this only fires for a report
    /// made before it did — without it, those older sessions read differently
    /// here than on the website, which is exactly the bug it fixes.
    static func generateClassSummary(sessionId: String) async throws -> AudioSessionWithSegments {
        try await APIClient.shared.request("/api/audio-sessions/\(sessionId)/class-summary", method: "POST")
    }
}
