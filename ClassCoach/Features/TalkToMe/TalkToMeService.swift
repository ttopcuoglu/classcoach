import Foundation

/// Request builders for "Talk It Through" — mirrors
/// `web/src/lib/api.ts`'s `transcribeTalkToMeAudio`/`startTalkToMe`/
/// `sendDebriefChat`/`buildSpeechUrl` against the shared `/api/debriefs`
/// endpoints (`source: "talk_to_me"`) and `/api/tts`.
enum TalkToMeService {
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

    static func startTalkToMe(message: String) async throws -> Debrief {
        try await APIClient.shared.request("/api/debriefs/talk", method: "POST", body: MessageBody(message: message))
    }

    static func sendChat(debriefId: String, message: String) async throws -> Debrief {
        try await APIClient.shared.request("/api/debriefs/\(debriefId)/chat", method: "POST", body: MessageBody(message: message))
    }

    /// Fetches one sentence's speech as MP3 bytes — same 2000-char cap and
    /// per-sentence-fetch approach as web, just fully downloaded before
    /// playback instead of streamed into an `<audio>` tag, since
    /// `AVAudioPlayer` needs the complete data up front.
    static func fetchSpeech(text: String) async throws -> Data {
        try await APIClient.shared.rawGet("/api/tts", queryItems: [URLQueryItem(name: "text", value: text)])
    }
}
