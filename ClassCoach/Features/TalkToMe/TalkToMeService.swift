import Foundation

/// Request builders for "Talk It Through" — mirrors
/// `web/src/lib/api.ts`'s `transcribeTalkToMeAudio`/`streamCoachReply`/
/// `generateTalkTakeaway`/`setDebriefSaved`/`buildSpeechUrl` against the
/// shared `/api/debriefs` endpoints (`source: "talk_to_me"`) and `/api/tts`.
enum TalkToMeService {
    /// Mirrors `TALK_TURN_CAP` in server/src/lib/coachingChat.ts. Only used to
    /// hide Continue on a conversation that is already full; the server
    /// enforces the real limit either way.
    static let turnCap = 30

    private struct TranscribeResponse: Decodable {
        let transcript: String
    }

    /// Same endpoint/shape as Audio Coaching's transcribe, but returns a
    /// plain transcript string rather than speaker samples.
    static func transcribe(audioFileURL: URL) async throws -> String {
        let audioData = try Data(contentsOf: audioFileURL)
        let result: TranscribeResponse = try await APIClient.shared.upload(
            "/api/debriefs/transcribe",
            fileData: audioData,
            fieldName: "audio",
            filename: "talk-audio.m4a",
            mimeType: "audio/m4a"
        )
        return result.transcript
    }

    private struct MessageBody: Encodable { let message: String }

    private struct StreamFrame: Decodable {
        let type: String
        let text: String?
        let debrief: Debrief?
        let error: String?
    }

    /// Streams Coach's reply one sentence at a time, so the first sentence can
    /// start playing while the rest is still being written. Starts a new
    /// conversation when `debriefId` is nil. Returns the saved conversation
    /// once the reply is complete; the sentences delivered along the way are
    /// exactly the text that ends up saved.
    static func streamReply(
        debriefId: String?,
        message: String,
        onSentence: @MainActor @escaping (String) -> Void
    ) async throws -> Debrief {
        let path = debriefId.map { "/api/debriefs/\($0)/chat/stream" } ?? "/api/debriefs/talk/stream"
        var result: Debrief?
        try await APIClient.shared.streamLines(path, body: MessageBody(message: message)) { line in
            guard let data = line.data(using: .utf8),
                  let frame = try? JSONDecoder().decode(StreamFrame.self, from: data) else { return }
            switch frame.type {
            case "sentence":
                if let text = frame.text { await onSentence(text) }
            case "done":
                result = frame.debrief
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

    /// Wraps up a conversation into what was explored, what to try, and what
    /// to notice.
    static func generateTakeaway(debriefId: String) async throws -> Debrief {
        try await APIClient.shared.request("/api/debriefs/\(debriefId)/takeaway", method: "POST")
    }

    private struct SavedBody: Encodable { let saved: Bool }

    static func setSaved(debriefId: String, saved: Bool) async throws -> Debrief {
        try await APIClient.shared.request("/api/debriefs/\(debriefId)", method: "PATCH", body: SavedBody(saved: saved))
    }

    /// Talk It Through conversations the teacher saved, newest first —
    /// the "Past conversations" list.
    static func savedConversations() async throws -> [Debrief] {
        let all: [Debrief] = try await APIClient.shared.request("/api/debriefs?source=talk_to_me")
        return all.filter(\.saved)
    }

    /// Fetches one sentence's speech as MP3 bytes, in the teacher's chosen
    /// voice — same per-sentence approach as web, just fully downloaded
    /// before playback, since `AVAudioPlayer` needs the complete data up front.
    static func fetchSpeech(text: String, voice: String? = nil) async throws -> Data {
        var query = [URLQueryItem(name: "text", value: text)]
        if let voice { query.append(URLQueryItem(name: "voice", value: voice)) }
        return try await APIClient.shared.rawGet("/api/tts", queryItems: query)
    }
}
