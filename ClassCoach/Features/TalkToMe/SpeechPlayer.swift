import Foundation
import AVFoundation

/// Plays a queue of TTS sentences back to back — the native analog of
/// `TalkToMe.tsx`'s `playQueue`, which reuses one persistent `<audio>`
/// element for mobile-Safari-autoplay reasons that don't apply natively;
/// here each sentence just gets its own short-lived `AVAudioPlayer`.
@MainActor
final class SpeechPlayer: NSObject, ObservableObject {
    private var player: AVAudioPlayer?
    private var continuation: CheckedContinuation<Void, Never>?

    // TTS synthesis takes real time per sentence — fetching each one only
    // after the last finished playing left an audible gap between every
    // sentence. A first attempt only started fetching sentence N+1 once
    // sentence N's audio arrived, giving it a head start equal to N's
    // playback duration — usually not enough, since synthesizing one
    // sentence typically takes about as long (or longer) than speaking
    // one. Fixed properly by firing off every sentence's fetch in
    // parallel up front, the moment the full reply is known, so all of
    // them are synthesizing concurrently while the first one plays.
    func playQueue(_ sentences: [String]) async {
        guard !sentences.isEmpty else { return }
        let fetches = sentences.map { sentence in
            Task { try? await TalkToMeService.fetchSpeech(text: sentence) }
        }
        for fetch in fetches {
            guard let data = await fetch.value else { continue }
            await playOne(data: data)
        }
    }

    private func playOne(data: Data) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            self.continuation = continuation
            do {
                let player = try AVAudioPlayer(data: data)
                player.delegate = self
                self.player = player
                player.play()
            } catch {
                self.continuation = nil
                continuation.resume()
            }
        }
    }

    func stop() {
        player?.stop()
        continuation?.resume()
        continuation = nil
    }
}

extension SpeechPlayer: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.continuation?.resume()
            self.continuation = nil
        }
    }
}

/// Ported from `TalkToMe.tsx`'s `splitIntoSentences`.
func splitIntoSentences(_ text: String) -> [String] {
    var sentences: [String] = []
    var current = ""
    for char in text {
        current.append(char)
        if ".!?".contains(char) {
            let trimmed = current.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { sentences.append(trimmed) }
            current = ""
        }
    }
    let remainder = current.trimmingCharacters(in: .whitespacesAndNewlines)
    if !remainder.isEmpty { sentences.append(remainder) }
    return sentences
}
