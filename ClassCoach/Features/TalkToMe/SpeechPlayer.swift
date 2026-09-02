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
    // sentence. Fixed by keeping one fetch in flight ahead of playback:
    // while sentence N plays, sentence N+1's audio is already downloading
    // in a background Task, so it's normally ready the instant N ends.
    func playQueue(_ sentences: [String]) async {
        guard !sentences.isEmpty else { return }
        var nextFetch = Task { try? await TalkToMeService.fetchSpeech(text: sentences[0]) }
        for index in sentences.indices {
            guard let data = await nextFetch.value else { continue }
            if index + 1 < sentences.count {
                nextFetch = Task { try? await TalkToMeService.fetchSpeech(text: sentences[index + 1]) }
            }
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
