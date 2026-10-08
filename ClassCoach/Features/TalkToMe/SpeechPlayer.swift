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
                // Only when the next sentence is already here. If the queue
                // has run dry the gap machinery owns that silence, and this
                // would be fighting it for the same moment.
                // A beat between Coach's own sentences, with nothing in it.
                if !self.pending.isEmpty {
                    try? await Task.sleep(for: .milliseconds(Self.sentenceGapMs))
                }
            }
            if let self, gen == self.generation {
                self.drainTask = nil
                // Out of sentences while Claude is still writing. Nothing
                // plays in that hole any more: the between-sentence sounds
                // it existed for are gone.
            }
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
    // They all end in "..." and run under ~2.15s, both measured: a clip
    // starts 250ms into the pause, the reply lands around 1.2s and then
    // waits out a filler with 1.2s or less left, and an ellipsis makes the
    // voice trail off where a full stop makes it stop dead. Kept in step
    // Acknowledgements, not thinking noises: two recordings of conversations
    // that sound right have the coach open with "Yeah." or "Right." there,
    // and the message is the opposite of "wait". They must fit ANY turn,
    // since the clip is picked before Claude has read a word the teacher
    // said. Kept in step with web/src/lib/voicePlayback.ts and the server's
    // fillerPhrases.ts.
    private static let shortFillers = [
        "Yeah.", "Right.", "Okay.",
        "Sure.", "Got it.", "I see.",
        "Oh, okay.", "Yeah, okay.", "Right, yeah.",
        "Ah, okay.", "Okay, sure.",
    ]
    // Nothing plays between Coach's own sentences. There was a pool of
    // twenty two-word phrases for that, then a quiet hum, and both are
    // gone — a sound there was asked for and then asked to be removed.
    /// The same gaps, with a joke in them.
    ///
    /// These are the one kind that has to be heard to the end — "...my words
    /// took the scenic route..." faded after "...my words took the..." is
    /// worse than silence — so Coach's next sentence waits one out however
    /// long it runs. Which is also why they are rare: a joke Coach refuses
    /// to be interrupted out of is charming once and wearing by the fourth
    /// time.
    /// And what Coach says when the teacher asked it something.
    ///
    /// An acknowledgement only fits when the teacher has TOLD Coach
    /// something. Answering "What do you recommend?" with "Yeah." agrees
    /// with a question, which is the wrong noise.
    private static let thinkingPhrases = [
        "Let me see...", "Let me think...",
        "Okay, let me think...", "Let me take a moment...",
        "Give me a second...", "Let's think about this...",
        "Okay, so...", "Right, so...",
    ]

    private static let fillerDelay: Duration = .milliseconds(250)

    /// For the opener, jittered rather than fixed: a hesitation that begins
    /// at exactly the same instant every single turn is a machine keeping
    /// time. A gap filler keeps the flat delay — it is covering a hole
    /// mid-reply, not deciding whether to speak.
    private static let fillerDelayRange = 180...400

    /// The beat between Coach's own sentences. The recordings that sound
    /// right have about this much silence between sentences inside an idea.
    private static let sentenceGapMs = 220

    /// And sometimes Coach makes no sound at all. A person thinking does not
    /// hum every time they think, and a noise on every single turn became
    /// its own tell.
    private static let silentTurnChance = 0.2

    /// Not the whole list of either. Thirty-seven clips is a couple of
    /// megabytes of a teacher's cellular data for sounds they will hear
    /// perhaps ten of; a handful from each pool is all the variety one
    /// conversation can use, and it is a different handful next time.
    private static let clipsPerPool = 6

    /// Fewer still of the jokes: drawn a quarter as often, and three is more
    /// than one conversation will get through.

    private var starterClips: [Data] = []
    private var thinkingClips: [Data] = []
    private var lastThinking = -1
    /// Whether the turn just ended on a question, which decides the pool.
    private var asked = false
    private var lastStarter = -1
    /// Set for the rest of a turn when Coach's opener is sympathetic, and
    /// when a joke has just been told.
    /// Whether the last clip Coach played was a joke — kept across turns,
    /// not reset with them, since a joke is drawn once per turn now.
    /// The next sentence enqueued is the one Coach opens the turn with.
    private var openingSentence = true
    /// How long the clip now playing may hold the floor. A joke gets to
    /// finish; everything else gets the ordinary beat.
    private var currentHold: TimeInterval = 0
    private var fillerPlayer: AVAudioPlayer?
    private var thinkingTask: Task<Void, Never>?

    /// Fetched once a conversation, in the teacher's own Coach voice. Doing
    /// this per turn would reintroduce exactly the delay they exist to cover.
    func loadFillers(voice: String?) async {
        guard starterClips.isEmpty else { return }
        async let starters = Self.fetchAll(Self.shortFillers.shuffled().prefix(Self.clipsPerPool), voice: voice)
        async let thinking = Self.fetchAll(Self.thinkingPhrases.shuffled().prefix(Self.clipsPerPool), voice: voice)
        starterClips = await starters
        thinkingClips = await thinking
    }

    private static func fetchAll(_ phrases: some Sequence<String>, voice: String?) async -> [Data] {
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
    /// moment real speech plays. `teacherSaid` is what the teacher just
    /// said, which is the only thing available to judge whether this is a
    /// turn for a joke — Coach has not written a word yet.
    /// `teacherSaid` decides which pool the filler comes from: a question
    /// gets a thinking sound, telling Coach something gets an
    /// acknowledgement.
    func startThinking(teacherSaid: String? = nil) {
        cancelThinking()
        asked = (teacherSaid ?? "").trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("?")
        // Sometimes nothing at all: a person thinking does not make a noise
        // every time they think.
        guard Double.random(in: 0..<1) >= Self.silentTurnChance else { return }
        let delay = Duration.milliseconds(Int.random(in: Self.fillerDelayRange))
        thinkingTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.playFiller()
        }
    }

    /// Kept so the view's call site stays valid; nothing depends on it now
    /// that no sound fills the gap between sentences.
    func replyFinished() {}

    /// Long enough not to click, short enough that Coach's first word is not
    /// competing with a filler still trailing off underneath it.
    private static let fillerFade: TimeInterval = 0.12

    /// A thinking sound with this little left is worth waiting out: Coach
    /// answering over the last syllable of its own "hmm" sounds worse than a
    /// beat of silence.
    ///
    /// Generous on purpose. At 0.4s only the shortest clips ever finished,
    /// and the ones that actually sound like someone considering a question
    /// were faded every turn. Matches HOLD_FOR_FILLER_MS on the web.
    private static let holdForFiller: TimeInterval = 1.2

    /// Longer than any clip the server will produce (gap fillers are capped
    /// at 2.4s, the ones with a joke at 3.0s, both plus 0.3s of trailing
    /// silence), which is the point.
    private static let letTheJokeFinish: TimeInterval = 4.0

    /// Called when Coach's first sentence is ready. Returns once it may be
    /// spoken — at once, having faded the filler, or after letting a
    /// nearly-finished one play out.
    func handOffFromThinking() async {
        thinkingTask?.cancel()
        thinkingTask = nil
        guard let playing = fillerPlayer, playing.isPlaying else { return }
        let remaining = playing.duration - playing.currentTime
        if remaining > 0, remaining <= currentHold {
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
        let clips = asked ? thinkingClips : starterClips
        guard !clips.isEmpty else { return }
        var index = Int.random(in: 0..<clips.count)
        let last = asked ? lastThinking : lastStarter
        if clips.count > 1, index == last { index = (index + 1) % clips.count }
        if asked { lastThinking = index } else { lastStarter = index }
        currentHold = Self.holdForFiller
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
