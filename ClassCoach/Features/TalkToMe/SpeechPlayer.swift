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
        // The reply is here. Whatever Coach was humming either finishes, if
        // it is nearly done, or fades under this.
        await handOffFromThinking()
        PlaybackSession.activate()
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            self.continuation = continuation
            do {
                let player = try AVAudioPlayer(data: data)
                player.delegate = self
                player.isMeteringEnabled = true
                self.player = player
                player.play()
            } catch {
                self.continuation = nil
                continuation.resume()
            }
        }
    }

    // MARK: - Streaming queue
    //
    // For replies that arrive a sentence at a time: each sentence's speech
    // starts synthesizing the moment it's enqueued, and playback walks the
    // queue in order. The first sentence can be speaking while Coach is
    // still writing the third.

    private var pending: [Task<Data?, Never>] = []
    private var drainTask: Task<Void, Never>?
    /// Bumped by `stop()`, so a drain loop from before the stop can't keep
    /// playing sentences that arrive after it.
    private var generation = 0

    func enqueue(_ sentence: String, voice: String?) {
        let text = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        pending.append(Task { try? await TalkToMeService.fetchSpeech(text: text, voice: voice) })
        if drainTask == nil { startDrain() }
    }

    /// Waits until everything enqueued so far has finished playing.
    func waitUntilDone() async {
        while let task = drainTask {
            await task.value
            if drainTask == task { drainTask = nil }
        }
    }

    private func startDrain() {
        let gen = generation
        drainTask = Task { [weak self] in
            while let self, gen == self.generation, !self.pending.isEmpty {
                let next = self.pending.removeFirst()
                guard let data = await next.value, gen == self.generation else { continue }
                await self.playOne(data: data)
            }
            if let self, gen == self.generation { self.drainTask = nil }
        }
    }

    /// How loud Coach is right now, 0–100 — drives Talk It Through's voice
    /// bars while Coach speaks. Reads the playing sentence's own meter, so it
    /// costs nothing extra; 0 between sentences and when nothing is playing.
    func outputLevel() -> Double {
        guard let player, player.isPlaying else { return 0 }
        player.updateMeters()
        let db = Double(player.averagePower(forChannel: 0))
        return max(0, min(100, (db + 50) * 2))
    }

    func stop() {
        generation += 1
        pending.forEach { $0.cancel() }
        pending.removeAll()
        drainTask = nil
        cancelThinking()
        player?.stop()
        continuation?.resume()
        continuation = nil
    }

    // MARK: - Thinking sounds
    //
    // Claude takes about a second to write its first sentence, and that is
    // the model thinking rather than anything that can be tuned away. What it
    // does not have to be is silence, so Coach makes the noise a colleague
    // makes while considering what you just said. The native half of the
    // fillers in `web/src/lib/voicePlayback.ts`.
    //
    // One sound per pause, not a running commentary. A second, longer one
    // for slow turns was tried on 2026-10-06 and taken back out: it covered
    // the silence, but two thinking noises in a row sounded less like a
    // colleague considering something and more like a machine filling air.
    //
    // Every clip must fit ANY turn, because they are fetched before anyone
    // knows what the teacher said — so nothing that reads the news ("Oof"
    // belongs in Coach's real replies, where it knows what happened) and
    // nothing that invites them to keep talking.
    //
    // They are also all under ~0.9s and end in "...", both measured: the
    // filler starts 250ms into the pause and the reply lands around 1.2s, so
    // anything longer is cut mid-word, and an ellipsis makes the voice trail
    // off where a full stop makes it stop dead. Kept in step with
    // web/src/lib/voicePlayback.ts and the server's fillerPhrases.ts.
    private static let shortFillers = [
        "Hmm...", "Mm-hmm.", "Mm, mm...", "Hmm, hmm...",
        "Yeah...", "Yep...", "Ah...", "Okay...",
        "Right...", "Sure...", "Uh-huh...", "Got it...",
        "Well...", "So...", "Alright...", "Well, hmm...",
        "So, hmm...", "Right, hmm...", "Let me see...", "Well, let me think...",
    ]
    private static let fillerDelay: Duration = .milliseconds(250)

    private var clips: [Data] = []
    private var lastPlayed = -1
    private var fillerPlayer: AVAudioPlayer?
    private var thinkingTask: Task<Void, Never>?

    /// Fetched once a conversation, in the teacher's own Coach voice. Doing
    /// this per turn would reintroduce exactly the delay they exist to cover.
    func loadFillers(voice: String?) async {
        guard clips.isEmpty else { return }
        clips = await Self.fetchAll(Self.shortFillers, voice: voice)
    }

    private static func fetchAll(_ phrases: [String], voice: String?) async -> [Data] {
        await withTaskGroup(of: Data?.self) { group in
            for phrase in phrases {
                group.addTask { try? await TalkToMeService.fetchSpeech(text: phrase, voice: voice) }
            }
            var clips: [Data] = []
            for await clip in group {
                if let clip { clips.append(clip) }
            }
            return clips
        }
    }

    /// Starts the thinking sounds for a turn. Cancelled automatically the
    /// moment real speech plays.
    func startThinking() {
        cancelThinking()
        thinkingTask = Task { [weak self] in
            try? await Task.sleep(for: Self.fillerDelay)
            guard !Task.isCancelled else { return }
            await self?.playFiller()
        }
    }

    /// Long enough not to click, short enough that Coach's first word is not
    /// competing with a filler still trailing off underneath it.
    private static let fillerFade: TimeInterval = 0.12

    /// A thinking sound with this little left is worth waiting out: Coach
    /// answering over the last syllable of its own "hmm" sounds worse than a
    /// beat of silence, and a beat is all it costs.
    private static let holdForFiller: TimeInterval = 0.4

    /// Called when Coach's first sentence is ready. Returns once it may be
    /// spoken — at once, having faded the filler, or after letting a
    /// nearly-finished one play out.
    func handOffFromThinking() async {
        thinkingTask?.cancel()
        thinkingTask = nil
        guard let playing = fillerPlayer, playing.isPlaying else { return }
        let remaining = playing.duration - playing.currentTime
        if remaining > 0, remaining <= Self.holdForFiller {
            try? await Task.sleep(for: .milliseconds(Int(remaining * 1000)))
            fillerPlayer = nil
            return
        }
        cancelThinking()
    }

    func cancelThinking() {
        thinkingTask?.cancel()
        thinkingTask = nil
        // Faded, not stopped: a thinking sound cut mid-word is the chopped
        // sound this feature exists to avoid. Coach's first word arrives over
        // the last of it, the way one person stops as another starts.
        guard let fading = fillerPlayer, fading.isPlaying else {
            fillerPlayer = nil
            return
        }
        fillerPlayer = nil
        fading.setVolume(0, fadeDuration: Self.fillerFade)
        Task {
            try? await Task.sleep(for: .milliseconds(Int(Self.fillerFade * 1000) + 20))
            fading.stop()
        }
    }

    private func playFiller() {
        // Never over real speech: by the time a clip is due, the reply may
        // already have started.
        guard player?.isPlaying != true else { return }
        guard !clips.isEmpty else { return }
        var index = Int.random(in: 0..<clips.count)
        if clips.count > 1, index == lastPlayed { index = (index + 1) % clips.count }
        lastPlayed = index
        PlaybackSession.activate()
        fillerPlayer = try? AVAudioPlayer(data: clips[index])
        fillerPlayer?.play()
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
