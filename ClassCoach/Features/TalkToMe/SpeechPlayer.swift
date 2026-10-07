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
        // Coach's opener is where it reacts to what the teacher just said.
        // If that reaction is a sympathetic one, this turn gets no jokes.
        if openingSentence {
            openingSentence = false
            let lowered = text.lowercased()
            if Self.sympathyMarkers.contains(where: lowered.contains) {
                noJokesThisTurn = true
                // A joke already started over what turns out to be a hard
                // moment: the reply does not wait for the punchline.
                if jokePlaying { currentHold = 0 }
            }
        }
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
                // The sentence exists but its audio may not be here yet.
                // Scheduling a sound costs nothing if it arrives in time —
                // `startGap` waits out its own delay first, and the hand-off
                // in `playOne` cancels it before anything is heard.
                self.startGap()
                guard let data = await next.value, gen == self.generation else { continue }
                self.sentencesPlayed += 1
                await self.playOne(data: data)
            }
            if let self, gen == self.generation {
                self.drainTask = nil
                // Out of sentences while Claude is still writing: the hole
                // this leaves in the middle of a reply is the one the
                // between-sentence sounds exist for.
                if self.replyStreaming { self.startGap() }
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
        replyStreaming = false
        sentencesPlayed = 0
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
    // with web/src/lib/voicePlayback.ts and the server's fillerPhrases.ts,
    // which is also where the breath in front of the longer ones is added.
    private static let shortFillers = [
        "Let me see...", "Well, let's see...", "Okay, let's see...",
        "Alright, let's see...", "So, let's see...", "Well, let me think...",
        "Okay, let me think...", "Hmm, let me think...", "Let me take a moment...",
        "Just a moment...", "Give me a second...", "Let me gather my thoughts...",
        "Let's think about this...", "Well, now...", "Okay, so...",
        "Alright, then...", "Hmm, okay...",
    ]
    /// And what Coach says BETWEEN its own sentences, when Claude has not
    /// finished writing the next one. A different job from an opener: the
    /// teacher is already mid-answer, so "Let me think..." would sound like
    /// Coach losing its place. These hold the floor instead of taking it.
    ///
    /// The leading "..." is deliberate — Coach comes in a beat late rather
    /// than jumping into its own pause. The server trims the dead air that
    /// produces and shortens the pauses between the words, so what arrives
    /// here runs 0.7s to 2.5s.
    private static let betweenFillers = [
        "...well... okay then...", "...hmm... alrighty...",
        "...so... yeah...", "...okay... well, well...",
        "...well... you know...", "...I mean... yeah...",
        "...hmm... okay, okay...", "...alrighty... so...",
        "...well... huh...", "...okay-dokey...",
        "...yeah... well...", "...so... um... yeah...",
        "...well... I mean...", "...hmm... right...",
        "...okay... well then...", "...ah... okay...",
        "...right... right...", "...oh... well...",
        "...okay... so, yeah...", "...well... hmm...",
    ]
    /// The same gaps, with a joke in them.
    ///
    /// These are the one kind that has to be heard to the end — "...my words
    /// took the scenic route..." faded after "...my words took the..." is
    /// worse than silence — so Coach's next sentence waits one out however
    /// long it runs. Which is also why they are rare: a joke Coach refuses
    /// to be interrupted out of is charming once and wearing by the fourth
    /// time.
    private static let wittyFillers = [
        "...well... the wheels are turning...",
        "...so... little mental pit stop...",
        "...hmm... a little traffic upstairs...",
        "...well... my words took the scenic route...",
        "...so... the gears are warming up...",
        "...hmm... just catching a wandering thought...",
        "...well... one brain cell at a time...",
        "...so... the mental hamster is running...",
        "...well... my brain and mouth are negotiating...",
    ]

    /// Roughly one turn in four, and never two running.
    ///
    /// Drawn mostly at the START of a turn, not between sentences, which is
    /// the opposite of where they were first put. A gap between Coach's
    /// sentences almost never opens: Claude writes a sentence in a few
    /// hundred milliseconds and Coach takes three or four seconds to say
    /// one, so the queue is never dry. The second of silence after the
    /// teacher stops talking is the only reliable gap there is — and "the
    /// gears are warming up" is a thinking-out-loud line anyway.
    private static let wittyGapChance = 0.25

    /// At the start of a turn there is no reply yet to read the mood from,
    /// so the teacher's own words are what decide. Deliberately broad:
    /// suppressing a joke that would have been fine costs nothing, and
    /// telling one over a teacher who just said they cried in their car is
    /// unforgivable. Kept in step with voicePlayback.ts.
    private static let hardMomentMarkers = [
        "cried", "crying", "in tears",
        "quit", "quitting", "resign",
        "burnt out", "burned out", "exhausted",
        "overwhelmed", "breaking point", "falling apart",
        "can't do this", "cant do this", "at my limit",
        "had enough", "lost it", "humiliated",
        "awful", "terrible", "the worst",
        "hate teaching", "panic", "anxiety",
        "depressed", "no idea what to do", "helpless",
        "hopeless",
    ]

    /// Coach has just reacted to something painful — "Ugh, that's rough." —
    /// and "the mental hamster is running" would be the worst thing this
    /// feature could do. Read off Coach's own first sentence, which is where
    /// the prompt puts its sympathy. Kept in step with voicePlayback.ts.
    private static let sympathyMarkers = [
        "oof", "ugh", "oh no", "i'm sorry",
        "im sorry", "that's rough", "that's hard", "that's awful",
        "that's a lot", "that's frustrating", "sounds hard", "sounds exhausting",
        "long day", "rough day", "exhausting", "overwhelming",
        "in tears", "crying", "burnt out", "burned out",
    ]

    private static let fillerDelay: Duration = .milliseconds(250)

    /// Not the whole list of either. Thirty-seven clips is a couple of
    /// megabytes of a teacher's cellular data for sounds they will hear
    /// perhaps ten of; a handful from each pool is all the variety one
    /// conversation can use, and it is a different handful next time.
    private static let clipsPerPool = 6

    /// Fewer still of the jokes: drawn a quarter as often, and three is more
    /// than one conversation will get through.
    private static let wittyClipCount = 3

    private var starterClips: [Data] = []
    private var gapClips: [Data] = []
    private var wittyClips: [Data] = []
    private var lastStarter = -1
    private var lastGap = -1
    private var lastWitty = -1
    /// Set for the rest of a turn when Coach's opener is sympathetic, and
    /// when a joke has just been told.
    private var noJokesThisTurn = false
    /// Whether the last clip Coach played was a joke — kept across turns,
    /// not reset with them, since a joke is drawn once per turn now.
    private var lastWasJoke = false
    /// The next sentence enqueued is the one Coach opens the turn with.
    private var openingSentence = true
    /// How long the clip now playing may hold the floor. A joke gets to
    /// finish; everything else gets the ordinary beat.
    private var currentHold: TimeInterval = 0
    private var jokePlaying = false
    /// Sentences played in the current turn. A gap sound belongs between
    /// sentences, so nothing happens until Coach has said one.
    private var sentencesPlayed = 0
    /// Whether Claude is still writing. An empty queue mid-reply is a gap to
    /// cover; an empty queue at the end of a reply is just the end.
    private var replyStreaming = false
    private var fillerPlayer: AVAudioPlayer?
    private var thinkingTask: Task<Void, Never>?

    /// Fetched once a conversation, in the teacher's own Coach voice. Doing
    /// this per turn would reintroduce exactly the delay they exist to cover.
    func loadFillers(voice: String?) async {
        guard starterClips.isEmpty, gapClips.isEmpty else { return }
        async let starters = Self.fetchAll(Self.shortFillers.shuffled().prefix(Self.clipsPerPool), voice: voice)
        async let gaps = Self.fetchAll(Self.betweenFillers.shuffled().prefix(Self.clipsPerPool), voice: voice)
        async let witty = Self.fetchAll(Self.wittyFillers.shuffled().prefix(Self.wittyClipCount), voice: voice)
        starterClips = await starters
        gapClips = await gaps
        wittyClips = await witty
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
    /// moment real speech plays.
    /// Starts the thinking sounds for a turn. Cancelled automatically the
    /// moment real speech plays. `teacherSaid` is what the teacher just
    /// said, which is the only thing available to judge whether this is a
    /// turn for a joke — Coach has not written a word yet.
    func startThinking(teacherSaid: String? = nil) {
        cancelThinking()
        sentencesPlayed = 0
        replyStreaming = true
        openingSentence = true
        let lowered = (teacherSaid ?? "").lowercased()
        noJokesThisTurn = Self.hardMomentMarkers.contains(where: lowered.contains)
        let joking = !noJokesThisTurn && !lastWasJoke && Double.random(in: 0..<1) < Self.wittyGapChance
        thinkingTask = Task { [weak self] in
            try? await Task.sleep(for: Self.fillerDelay)
            guard !Task.isCancelled else { return }
            await self?.playFiller(starter: true, joking: joking)
        }
    }

    /// The between-sentence sound. Coach has already started answering and
    /// has run out of written sentences, so this holds the floor rather than
    /// leaving a hole in the middle of the reply. Ended by the hand-off in
    /// `playOne`, like a thinking sound.
    func startGap() {
        guard sentencesPlayed > 0 else { return }
        cancelThinking()
        // A joke now and then, not every gap: often enough to be a
        // character trait, rarely enough to stay funny.
        let joking = !noJokesThisTurn && !lastWasJoke && Double.random(in: 0..<1) < Self.wittyGapChance
        thinkingTask = Task { [weak self] in
            try? await Task.sleep(for: Self.fillerDelay)
            guard !Task.isCancelled else { return }
            await self?.playFiller(starter: false, joking: joking)
        }
    }

    /// Claude has stopped writing: an empty queue from here on is the end of
    /// the reply, not a gap in it.
    func replyFinished() {
        replyStreaming = false
    }

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

    private func playFiller(starter: Bool, joking: Bool = false) {
        // Never over real speech: by the time a clip is due, the reply may
        // already have started.
        guard player?.isPlaying != true else { return }
        let clips = joking ? wittyClips : (starter ? starterClips : gapClips)
        guard !clips.isEmpty else { return }
        var index = Int.random(in: 0..<clips.count)
        let last = joking ? lastWitty : (starter ? lastStarter : lastGap)
        if clips.count > 1, index == last { index = (index + 1) % clips.count }
        if joking {
            lastWitty = index
        } else if starter {
            lastStarter = index
        } else {
            lastGap = index
        }
        lastWasJoke = joking
        jokePlaying = joking
        // A punchline is never faded for a sentence that is ready. A teacher
        // who starts talking still cuts it off at once — that is barge-in.
        currentHold = joking ? Self.letTheJokeFinish : Self.holdForFiller
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
