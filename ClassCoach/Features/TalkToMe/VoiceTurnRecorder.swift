import Foundation
import AVFoundation

/// Native equivalent of `web/src/hooks/useVoiceTurn.ts` — records one
/// "turn" of speech and auto-stops on silence. Conceptually identical
/// turn-taking: a silence timer arms the moment listening starts and resets
/// every time the level crosses the speech threshold, ending the turn on the
/// first uninterrupted silence stretch — whether the teacher never spoke at
/// all or spoke and then paused.
///
/// The microphone stays open for the whole conversation, like web's single
/// `getUserMedia` stream whose track is only enabled per turn — audio is only
/// written to a file while a turn is being captured. This used to start and
/// stop an `AVAudioRecorder` every turn, which broke once the screen locked:
/// background audio only keeps the app running while audio is actually
/// playing or recording, so during transcription and Coach's thinking iOS
/// suspended the app, and a backgrounded app isn't allowed to re-open the
/// mic for the next turn ("Could not access your microphone").
@MainActor
final class VoiceTurnRecorder: NSObject, ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var level: Double = 0 // 0-100, for the UI's level ring
    @Published var fatalError: String?
    @Published private(set) var transcribing = false

    private let engine = AVAudioEngine()
    private let capture = TurnCapture()
    private var engineRunning = false
    private var silenceTimer: Timer?
    private var onTurnComplete: ((String) -> Void)?
    /// The live socket for the turn being recorded, when one opened. Nil
    /// means this turn takes the upload path, exactly as every turn used to.
    private var live: LiveTranscriber?
    /// Bumped per turn so a socket that finishes opening after its turn has
    /// ended is abandoned rather than attached to the next one.
    private var turnId = 0
    private var observers: [NSObjectProtocol] = []

    /// dBFS above which the mic is considered to be picking up speech, not
    /// ambient noise — same scale as `AVAudioRecorder.averagePower`, which
    /// this threshold was originally tuned against.
    private let speechThresholdDB: Float = -35

    /// How long to wait in silence before deciding the turn is over, as a
    /// function of how long the teacher has just been speaking — the native
    /// half of `web/src/lib/turnEndpointing.ts`, where the reasoning lives.
    /// In short: a long flowing answer that stops has usually finished, while
    /// a three-word fragment that stops is usually mid-thought, and cutting
    /// that off is the worst failure this feature has.
    ///
    /// This replaces a flat 1.4s for every turn. The floor is deliberately
    /// higher than web's 750ms: there, a turn that ends too early is
    /// recoverable, because the microphone keeps listening while Coach is
    /// thinking and a teacher who carries on cancels the reply and continues
    /// the same turn. The app has no such recovery yet, so it cannot afford
    /// web's shortest waits. Short fragments actually wait *longer* than they
    /// used to, which is the safer half of the same trade.
    private let silenceCurve: [(speechMs: Double, waitMs: Double)] = [
        (0, 1500),
        (1500, 1300),
        (4000, 1050),
        (9000, 950),
    ]

    /// How long someone has been talking is a weak signal, though. What they
    /// actually SAID is a much stronger one, and once live transcription is
    /// running we have it: the draft arrives punctuated.
    ///
    /// A finished question is the clearest handoff in conversation — "So what
    /// should I do?" — and sitting in silence after one is the most unnatural
    /// thing left in a spoken turn. The same signal works in reverse: a draft
    /// ending on "and", "because" or a comma is someone mid-thought, and
    /// deserves longer than the curve would give.
    ///
    /// The numbers are a little more cautious than the web's (which answers a
    /// question after 400ms) for the reason the curve above is: the app
    /// cannot yet recover from ending a turn too early. Kept otherwise in
    /// step with web/src/lib/turnEndpointing.ts.
    private static let questionWait: TimeInterval = 0.5
    private static let statementCeiling: TimeInterval = 0.95
    private static let midThoughtWait: TimeInterval = 2.0

    private enum Ending { case question, statement, midThought, unknown }

    /// Words that cannot end an English sentence: a draft ending on one is
    /// mid-thought whatever punctuation Deepgram put after it.
    private static let cannotEndASentence: Set<String> = [
        "and", "but", "or", "because", "cause", "since", "although", "though",
        "while", "whenever", "unless", "until", "as", "plus", "than", "that",
        "which", "the", "a", "an", "my", "his", "her", "their", "our", "your",
        "its", "these", "those", "to", "for", "with", "about", "at", "in",
        "on", "of", "from", "into", "onto", "is", "was", "were", "be", "been",
        "am", "are", "had", "has", "have", "very", "really",
    ]

    /// Words that can end a sentence, so they only count when Deepgram has
    /// not put a full stop there: "so what should I" is unfinished, where
    /// "That was me." plainly is not.
    private static let rarelyEndsASentence: Set<String> = [
        "i", "he", "she", "we", "they", "you", "it", "him", "them", "me",
        "us", "said", "says", "told", "tells", "asked", "asks", "goes",
        "went", "called", "wanted", "started", "keeps", "kept", "tried",
        "got", "so", "if", "when", "then", "also", "who", "like", "well",
        "um", "uh", "uhh", "erm", "er", "hmm", "basically", "actually",
        "literally", "mean", "know", "just", "kind", "sort", "maybe",
    ]

    private static func classify(_ transcript: String) -> Ending {
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .unknown }
        // An ellipsis is Deepgram transcribing a trailing off, not a stop.
        if text.hasSuffix("...") || text.hasSuffix("\u{2026}") || text.hasSuffix(",") { return .midThought }
        let words = text.lowercased()
            .components(separatedBy: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789'").inverted)
            .filter { !$0.isEmpty }
        let lastWord = words.last ?? ""
        if cannotEndASentence.contains(lastWord) { return .midThought }
        if text.hasSuffix("?") { return .question }
        if text.hasSuffix(".") || text.hasSuffix("!") { return .statement }
        // Unpunctuated, so Deepgram has not decided either — and these
        // endings mean it is very likely still coming. Leaning long here is
        // what makes leaning short on a finished question safe.
        if rarelyEndsASentence.contains(lastWord) { return .midThought }
        return .unknown
    }

    /// Time spent above the speech threshold this turn, not wall-clock time
    /// since it started — a teacher who opened the screen and sat quietly for
    /// ten seconds has not been talking for ten seconds.
    private var speechMs: Double = 0
    private var lastLevelAt: Date?
    /// When the teacher was last audible — the point the wait is measured
    /// from, since the decision is re-taken on every level callback.
    private var lastSpeechAt: Date?

    /// The longest any draft can ask for — what the backstop timer waits.
    private var longestSilenceInterval: TimeInterval {
        max(silenceCurve[0].waitMs / 1000, Self.midThoughtWait)
    }

    /// The window to wait out right now, given what the teacher has said so
    /// far. Read repeatedly while the silence runs, not once when it starts:
    /// the draft lags the voice by a couple of hundred milliseconds, so at
    /// the instant they stop it may still end on "what should I".
    private var silenceInterval: TimeInterval {
        let base = curveInterval
        switch Self.classify(live?.draft ?? "") {
        case .question: return Self.questionWait
        case .statement: return min(base, Self.statementCeiling)
        case .midThought: return max(base, Self.midThoughtWait)
        case .unknown: return base
        }
    }

    private var curveInterval: TimeInterval {
        guard speechMs > 0 else { return silenceCurve[0].waitMs / 1000 }
        for i in 1..<silenceCurve.count {
            let prev = silenceCurve[i - 1]
            let next = silenceCurve[i]
            if speechMs >= next.speechMs { continue }
            let ratio = (speechMs - prev.speechMs) / (next.speechMs - prev.speechMs)
            return (prev.waitMs + ratio * (next.waitMs - prev.waitMs)) / 1000
        }
        return silenceCurve[silenceCurve.count - 1].waitMs / 1000
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    func configure(onTurnComplete: @escaping (String) -> Void) {
        self.onTurnComplete = onTurnComplete
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        // A phone call, Siri, or an alarm stops the engine; a route change
        // (AirPods connecting) or a media-services reset invalidates it.
        // Either way, restart the input if a conversation is still going.
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init)
            Task { @MainActor in self?.handleInterruption(type) }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.restartEngineAfterReset() }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.restartEngineAfterReset() }
        })
    }

    func start() async {
        guard !listening else { return }
        fatalError = nil

        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard granted else {
            fatalError = "Microphone access was denied. Check your device settings and try again."
            return
        }

        // Checked against the engine itself, not engineRunning: an
        // interruption whose "ended" notice never arrives leaves the engine
        // stopped, and every turn would otherwise end in silence.
        if !engine.isRunning {
            do {
                try startEngine()
            } catch {
                fatalError = "Could not access your microphone. Check your device and try again."
                return
            }
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).m4a")
        do {
            try capture.begin(url: url, format: engine.inputNode.outputFormat(forBus: 0))
        } catch {
            fatalError = "Could not start recording. Please try again."
            return
        }

        stopWatchingWhileSpeaking()
        listening = true
        speechMs = 0
        lastLevelAt = nil
        turnId += 1
        scheduleSilenceEnd()

        // Opened alongside recording rather than before it: waiting for the
        // socket first would mean the microphone was not yet capturing while
        // it connected, so the teacher's opening words would be missing from
        // both the live stream and the fallback recording.
        let rate = engine.inputNode.outputFormat(forBus: 0).sampleRate
        let thisTurn = turnId
        Task { [weak self] in
            guard let token = await AuthManager.shared.token else { return }
            let session = await LiveTranscriber.open(sampleRate: rate, token: token)
            await MainActor.run {
                guard let self else { return }
                // Stop, Close, or simply a very short answer can all end the
                // turn before the socket is ready.
                guard let session, self.turnId == thisTurn, self.listening else {
                    session?.abandon()
                    return
                }
                self.live = session
                self.capture.streamTo(session)
            }
        }
    }

    /// Ends the current turn early; the mic itself stays open.
    func stop() {
        finishTurn()
    }

    /// Fully releases the mic — call when leaving Talk It Through or pausing,
    /// not between turns (mirrors `useVoiceTurn`'s `close()`).
    func close() {
        stopWatchingWhileSpeaking()
        silenceTimer?.invalidate()
        silenceTimer = nil
        turnId += 1
        capture.streamTo(nil)
        // Dropped without asking for a transcript: closing means the teacher
        // is done, so there is nothing left to transcribe and nothing to wait
        // for.
        live?.abandon()
        live = nil
        _ = capture.end()
        listening = false
        level = 0
        stopEngine()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: - Engine

    private func startEngine() throws {
        let session = AVAudioSession.sharedInstance()
        // .voiceChat turns on the system's echo cancellation, which is what
        // lets the microphone stay open while Coach is speaking without
        // hearing Coach. It routes to the receiver by default, hence
        // .defaultToSpeaker — a coaching conversation should come out of the
        // speaker like a speakerphone call, not be held to the ear.
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker])
        try session.setActive(true)

        let input = engine.inputNode
        input.removeTap(onBus: 0)
        // Must be set before the engine starts rendering. Best-effort: on a
        // device that refuses it, everything still works, and barge-in is
        // simply more likely to hear Coach and stop for nothing.
        try? input.setVoiceProcessingEnabled(true)
        capture.installTap(on: input) { [weak self] db in
            Task { @MainActor in self?.handleLevel(db) }
        }
        engine.prepare()
        try engine.start()
        engineRunning = true
    }

    private func stopEngine() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        engineRunning = false
    }

    private func handleInterruption(_ type: AVAudioSession.InterruptionType?) {
        guard engineRunning else { return }
        switch type {
        case .began:
            // The system has already stopped the engine; a turn cut off
            // mid-capture ends with whatever was said so far.
            if listening { finishTurn() }
        case .ended:
            restartEngineAfterReset()
        default:
            break
        }
    }

    private func restartEngineAfterReset() {
        guard engineRunning else { return }
        stopEngine()
        do {
            try startEngine()
        } catch {
            if listening { _ = capture.end() }
            listening = false
            fatalError = "Could not access your microphone. Check your device and try again."
        }
    }

    // MARK: - Turn

    private func handleLevel(_ db: Float) {
        guard listening else {
            if monitoringForBargeIn { checkForBargeIn(db) }
            return
        }
        level = Double(max(0, min(100, (db + 60) * (100.0 / 60.0))))
        let now = Date()
        let sinceLast = lastLevelAt.map { now.timeIntervalSince($0) * 1000 } ?? 0
        lastLevelAt = now
        if db > speechThresholdDB {
            // Capped per callback so a gap (the app suspended, the engine
            // restarted after an interruption) cannot be counted as speech.
            speechMs += min(sinceLast, 100)
            lastSpeechAt = now
            scheduleSilenceEnd()
        } else if let since = lastSpeechAt, now.timeIntervalSince(since) >= silenceInterval {
            // Silence, and the window to wait out depends on what was said.
            // Judged here rather than fixed when the silence began, so a
            // draft that becomes a question a moment later is answered at
            // once instead of waiting out the whole window.
            finishTurn()
        }
    }

    // MARK: - Interrupting Coach
    //
    // While Coach speaks the microphone stays open, and a teacher who starts
    // talking stops it. This has to clear a far higher bar than ordinary
    // speech does, because the microphone is also hearing Coach come back
    // through the speaker: echo cancellation removes most of that, but how
    // much depends on the device and how loud it is, so the level has to be
    // well above the threshold that ends a turn AND hold there. A word of
    // leaked echo must never cut Coach off mid-sentence.
    private let bargeInThresholdDB: Float = -22
    private let bargeInSustain: TimeInterval = 0.35

    private var monitoringForBargeIn = false
    private var onBargeIn: (() -> Void)?
    private var loudSince: Date?

    /// Starts listening for the teacher talking over Coach. The caller stops
    /// it when Coach finishes, or when a new turn begins.
    func watchWhileSpeaking(onBargeIn: @escaping () -> Void) {
        self.onBargeIn = onBargeIn
        // Each sentence of a reply arms this, and restarting the clock every
        // time would mean a teacher who starts talking as the next sentence
        // begins has to start over.
        if !monitoringForBargeIn { loudSince = nil }
        monitoringForBargeIn = true
    }

    func stopWatchingWhileSpeaking() {
        monitoringForBargeIn = false
        onBargeIn = nil
        loudSince = nil
    }

    private func checkForBargeIn(_ db: Float) {
        guard db > bargeInThresholdDB else {
            loudSince = nil
            return
        }
        let now = Date()
        guard let since = loudSince else {
            loudSince = now
            return
        }
        guard now.timeIntervalSince(since) >= bargeInSustain else { return }
        let fire = onBargeIn
        stopWatchingWhileSpeaking()
        fire?()
    }

    /// A backstop, not the decision — that is taken in `handleLevel`, which
    /// can see the draft as it grows. This covers the case where level
    /// callbacks stop arriving at all, so it waits out the longest window
    /// any draft could ask for rather than guessing with what is known now.
    private func scheduleSilenceEnd() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: longestSilenceInterval, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.finishTurn() }
        }
    }

    private func finishTurn() {
        guard listening else { return }
        silenceTimer?.invalidate()
        silenceTimer = nil
        listening = false
        lastLevelAt = nil
        lastSpeechAt = nil
        level = 0
        turnId += 1
        capture.streamTo(nil)
        let session = live
        live = nil
        guard let url = capture.end() else {
            session?.abandon()
            return
        }

        transcribing = true
        Task { @MainActor in
            defer { try? FileManager.default.removeItem(at: url) }

            // If the socket was running, the words are already there and the
            // recording never has to be uploaded at all. Anything short of a
            // usable transcript falls through to the upload below, which
            // still holds the complete turn.
            if let session {
                let transcript = await session.finish()
                if let transcript {
                    self.transcribing = false
                    self.onTurnComplete?(transcript)
                    return
                }
            }

            do {
                let transcript = try await TalkToMeService.transcribe(audioFileURL: url)
                self.transcribing = false
                self.onTurnComplete?(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
            } catch {
                // A transcription hiccup for one turn shouldn't end the
                // conversation — treat it the same as "nothing was said."
                self.transcribing = false
                self.onTurnComplete?("")
            }
        }
    }
}

/// The part of turn capture that runs on the audio tap's thread, kept off
/// the main actor: level metering for every buffer, and writing buffers to
/// the current turn's file only while a turn is open.
private final class TurnCapture: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private var url: URL?
    private var live: LiveTranscriber?

    /// Starts (or stops) forwarding every captured buffer to the live
    /// socket. The file keeps being written either way — it is the fallback.
    func streamTo(_ transcriber: LiveTranscriber?) {
        lock.lock()
        live = transcriber
        lock.unlock()
    }

    func installTap(on input: AVAudioInputNode, onLevel: @escaping @Sendable (Float) -> Void) {
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            onLevel(Self.rmsDecibels(buffer))
            self.lock.lock()
            let session = self.live
            try? self.file?.write(from: buffer)
            self.lock.unlock()
            session?.send(buffer)
        }
    }

    func begin(url: URL, format: AVAudioFormat) throws {
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        let newFile = try AVAudioFile(
            forWriting: url,
            settings: settings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        )
        lock.lock()
        file = newFile
        self.url = url
        lock.unlock()
    }

    /// Closes the turn's file (releasing it finalizes the AAC container) and
    /// returns its URL, or nil when no turn was open.
    func end() -> URL? {
        lock.lock()
        defer { lock.unlock() }
        let finished = file != nil ? url : nil
        file = nil
        url = nil
        return finished
    }

    private static func rmsDecibels(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return -160 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) {
            sum += channel[i] * channel[i]
        }
        let rms = (sum / Float(buffer.frameLength)).squareRoot()
        return rms > 0 ? 20 * log10(rms) : -160
    }
}

/// Streams a turn's audio to the server (and on to Deepgram) while the
/// teacher is still talking, so the transcript is ready the moment they
/// stop instead of being requested then — the native half of
/// `web/src/lib/liveTranscription.ts`.
///
/// Strictly a fast path. `VoiceTurnRecorder` keeps recording the whole turn
/// to a file regardless, and every failure here returns nil, which means
/// "upload it the old way". The worst case is the latency the app always
/// had.
///
/// Audio goes up as mono 16-bit PCM at the engine's own sample rate rather
/// than the AAC file the fallback uses: a container split into chunks is
/// ambiguous to stream, while raw PCM at a declared rate has exactly one
/// interpretation.
final class LiveTranscriber: @unchecked Sendable {
    private let task: URLSessionWebSocketTask
    private let lock = NSLock()
    private var transcriptHandler: ((String?) -> Void)?
    private var latestDraft = ""

    /// The words so far, as Deepgram has them. Read from the main actor
    /// while a turn's silence is being judged, written from the socket's
    /// callback, so it goes through the same lock as everything else here.
    var draft: String {
        lock.lock()
        defer { lock.unlock() }
        return latestDraft
    }
    private var settled = false
    private var sendsInFlight = 0

    /// Opens the socket. Returns nil when there is nothing to open it with,
    /// or when the server does not answer "ready" in time — the caller then
    /// simply uploads the recording.
    static func open(sampleRate: Double, token: String) async -> LiveTranscriber? {
        let endpoint = APIClient.shared.uploadBaseURL.appendingPathComponent("/api/stt/live")
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return nil }
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.queryItems = [URLQueryItem(name: "sample_rate", value: String(Int(sampleRate)))]
        guard let url = components.url else { return nil }

        var request = URLRequest(url: url)
        // Unlike a browser, a native WebSocket can carry headers, so the
        // session token travels the same way it does on every other call
        // instead of in the query string.
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let transcriber = LiveTranscriber(task: URLSession.shared.webSocketTask(with: request))
        return await transcriber.start() ? transcriber : nil
    }

    private init(task: URLSessionWebSocketTask) {
        self.task = task
    }

    private func start() async -> Bool {
        task.resume()
        return await withCheckedContinuation { continuation in
            var resumed = false
            let finish: (Bool) -> Void = { ok in
                guard !resumed else { return }
                resumed = true
                continuation.resume(returning: ok)
            }
            receive(onReady: { finish(true) })
            // The turn is already being recorded; a socket that has not said
            // "ready" within this is not worth waiting on.
            DispatchQueue.global().asyncAfter(deadline: .now() + 2.5) { finish(false) }
        }
    }

    private func receive(onReady: (() -> Void)? = nil) {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.deliver(nil)
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let frame = try? JSONDecoder().decode(Frame.self, from: data) {
                    switch frame.type {
                    case "ready":
                        onReady?()
                    case "transcript":
                        self.deliver(frame.transcript)
                    case "unavailable":
                        self.deliver(nil)
                    case "draft":
                        if let draft = frame.transcript {
                            self.lock.lock()
                            self.latestDraft = draft
                            self.lock.unlock()
                        }
                    default:
                        break
                    }
                }
                self.receive(onReady: onReady)
            }
        }
    }

    private struct Frame: Decodable {
        let type: String
        let transcript: String?
    }

    /// Feeds one buffer. Safe to call from the audio tap's thread.
    func send(_ buffer: AVAudioPCMBuffer) {
        guard let data = Self.pcm16(from: buffer) else { return }
        lock.lock()
        let done = settled
        if !done { sendsInFlight += 1 }
        lock.unlock()
        guard !done else { return }
        task.send(.data(data)) { [weak self] _ in
            guard let self else { return }
            self.lock.lock()
            self.sendsInFlight -= 1
            self.lock.unlock()
        }
    }

    /// Asks the server to finalize. Returns the transcript, or nil when the
    /// caller should fall back to uploading the recording.
    func finish() async -> String? {
        let transcript = await withCheckedContinuation { (continuation: CheckedContinuation<String?, Never>) in
            lock.lock()
            if settled {
                lock.unlock()
                continuation.resume(returning: nil)
                return
            }
            transcriptHandler = { continuation.resume(returning: $0) }
            lock.unlock()

            task.send(.string("{\"type\":\"finish\"}")) { [weak self] error in
                if error != nil { self?.deliver(nil) }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [weak self] in self?.deliver(nil) }
        }
        abandon()
        let trimmed = transcript?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty ?? true) ? nil : trimmed
    }

    func abandon() {
        deliver(nil)
        task.cancel(with: .goingAway, reason: nil)
    }

    private func deliver(_ transcript: String?) {
        lock.lock()
        let handler = transcriptHandler
        transcriptHandler = nil
        settled = true
        lock.unlock()
        handler?(transcript)
    }

    /// Mono 16-bit little-endian, which is what the server tells Deepgram to
    /// expect. Only channel 0 is taken: a second channel would double the
    /// bytes without adding anything a transcript can use.
    private static func pcm16(from buffer: AVAudioPCMBuffer) -> Data? {
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return nil }
        var samples = [Int16]()
        samples.reserveCapacity(Int(buffer.frameLength))
        for i in 0..<Int(buffer.frameLength) {
            let clamped = max(-1, min(1, channel[i]))
            samples.append(Int16(clamped * Float(clamped < 0 ? 32768 : 32767)))
        }
        return samples.withUnsafeBufferPointer { Data(buffer: $0) }
    }
}
