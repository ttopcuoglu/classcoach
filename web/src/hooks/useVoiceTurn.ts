import { useRef, useState } from 'react'
import { transcribeTalkToMeAudio } from '../lib/api'
import { liveTranscriptionEnabled, openLiveSession, type LiveSession } from '../lib/liveTranscription'
import { silenceWindowFor } from '../lib/turnEndpointing'
import { beginTurn, markTurn } from '../lib/turnTiming'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

// Same "signal detected" threshold MicLevelMeter.tsx already uses.
const SPEECH_LEVEL_THRESHOLD = 8

// Interrupting Coach has to clear a far higher bar than simply speaking into
// a quiet room, because echo cancellation leaves some of Coach's own voice in
// the microphone. Two defences: a louder level, and holding it long enough
// that a word or two of leaked echo cannot stop a reply. A real interruption
// is someone talking continuously, so a third of a second costs the teacher
// nothing they would notice.
const BARGE_IN_LEVEL_THRESHOLD = 20
const BARGE_IN_SUSTAIN_MS = 350

// Off until it has been heard on real machines, because it reopens a bug
// this file already fixed once: the microphone track is deliberately
// disabled while Coach is speaking, since Chrome's audio processing on a
// live getUserMedia track interferes with separate <audio> playback (see
// start()). Barge-in cannot work without that track live, so the two are in
// direct tension and only listening can say whether it matters here.
//
//   localStorage.wivozaBargeIn = '1'    (or open the page with ?bargein=1)
export function bargeInEnabled(): boolean {
  try {
    const query = new URLSearchParams(location.search).get('bargein')
    if (query === '1') return true
    if (query === '0') return false
    return localStorage.getItem('wivozaBargeIn') === '1'
  } catch {
    return false
  }
}

const FATAL_ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Microphone access was denied. Check your browser/device settings and try again.',
  SecurityError: 'Microphone access was denied. Check your browser/device settings and try again.',
  NotFoundError: 'No microphone was found. Check your device and try again.',
  OverconstrainedError: 'No microphone was found. Check your device and try again.',
}

// Records audio with MediaRecorder and transcribes it server-side (Deepgram,
// via transcribeTalkToMeAudio) instead of relying on the browser's Web
// Speech API — iOS Safari never implements SpeechRecognition for web
// content, in any browser, so that approach was silently unusable on
// iPhone/iPad. Turn-boundary detection (knowing the teacher stopped
// talking) moves to a live volume reading via Web Audio's AnalyserNode,
// the same RMS technique MicLevelMeter.tsx already uses — a silence timer
// arms the moment listening starts and resets every time the level crosses
// the speech threshold, ending the turn on the first uninterrupted stretch
// of quiet, whether the teacher never spoke at all or spoke and then
// paused. How long that stretch has to be is not fixed: see
// silenceWindowFor, which reads it off how long they have just been
// talking.
// A reply started this early is a bet on the teacher being finished, so it
// has to be cheap to lose: 400ms is long enough that it does not fire inside
// every comma-length pause, short enough to cover most of the silence window
// that follows it (750-1500ms, see turnEndpointing.ts).
const SPECULATE_AFTER_SILENCE_MS = 400
// Two words, so a cough or a stray "um" does not buy a Claude call.
const SPECULATE_MIN_WORDS = 2

export function useVoiceTurn(
  onTurnComplete: (text: string) => void,
  // Fired once per turn, during the pause, with the draft transcript so far:
  // "they have probably finished, start writing". onSpeculationStale fires if
  // they turn out to have been mid-breath, and the caller drops that reply.
  speculation?: { onSpeculate: (draft: string) => void; onSpeculationStale: () => void },
) {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)

  // The stream/AudioContext/analyser persist across turns within one
  // conversation — re-requesting getUserMedia every turn made the browser
  // re-show its "microphone access" indicator on every single turn instead
  // of once per conversation.
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  // Bumped per turn so a socket that opens after its turn ended is dropped
  // rather than attached to the next one.
  const turnIdRef = useRef(0)
  // Live transcription, when it is switched on: a ScriptProcessor tap on the
  // same AudioContext the level meter already uses, feeding PCM to the
  // server while the teacher talks. Both are null when it is off or failed,
  // and the batch upload below then runs exactly as it always has.
  const liveRef = useRef<LiveSession | null>(null)
  const tapRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  // How long this turn has actually been speech, accumulated frame by frame
  // — the signal the wait length is derived from.
  const speechMsRef = useRef(0)
  // Whether any frame this turn was loud enough to be speech. Kept separately
  // from speechMsRef, which can legitimately still read 0 after a single
  // loud first frame (there is no previous frame to measure a gap from).
  const heardSpeechRef = useRef(false)

  // Set when a speculative reply is already in flight for this turn.
  const speculatedRef = useRef(false)
  const speculateTimerRef = useRef<number | null>(null)

  function scheduleEnd() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      recorderRef.current?.stop()
    }, silenceWindowFor(speechMsRef.current))

    // The teacher is audible again, so any reply started during the last
    // pause was answering half a thought.
    if (speculatedRef.current) {
      speculatedRef.current = false
      speculation?.onSpeculationStale()
    }
    if (speculateTimerRef.current) window.clearTimeout(speculateTimerRef.current)
    if (!speculation) return
    speculateTimerRef.current = window.setTimeout(() => {
      const draft = liveRef.current?.draft()?.trim()
      if (!draft || draft.split(/\s+/).length < SPECULATE_MIN_WORDS) return
      speculatedRef.current = true
      speculation.onSpeculate(draft)
    }, SPECULATE_AFTER_SILENCE_MS)
  }

  // Ends the current turn's level/silence-detection loop only — the
  // underlying stream stays open for the next turn.
  function stopLiveTap() {
    if (tapRef.current) {
      tapRef.current.onaudioprocess = null
      tapRef.current.disconnect()
      tapRef.current = null
    }
  }

  function stopTurnLoop() {
    stopLiveTap()
    if (speculateTimerRef.current) window.clearTimeout(speculateTimerRef.current)
    speculateTimerRef.current = null
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = null
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    recorderRef.current = null
    setLevel(0)
  }

  // Fully releases the microphone. Call when leaving Talk It Through
  // entirely (closing/stopping the conversation), not between turns.
  function close() {
    stopTurnLoop()
    // Dropped without asking for a transcript: closing means the teacher is
    // done, so there is nothing left to transcribe and nothing to wait for.
    liveRef.current?.abandon()
    liveRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    sourceRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    setListening(false)
  }

  async function start() {
    if (recorderRef.current) return
    setFatalError(null)
    chunksRef.current = []

    let stream = streamRef.current
    const streamIsLive = stream != null && stream.getTracks().some((t) => t.readyState === 'live')
    if (!streamIsLive) {
      try {
        // Echo cancellation is what makes barge-in possible: without it the
        // microphone hears Coach through the speakers and the teacher
        // "interrupts" with Coach's own voice. Chrome applies these for a
        // bare `{ audio: true }`; Safari is less consistent, so they are
        // asked for by name.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch (err) {
        const name = (err as DOMException)?.name
        setFatalError(FATAL_ERROR_MESSAGES[name] ?? 'Could not access your microphone. Check your device and try again.')
        return
      }
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      sourceRef.current = source
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
    }

    // The track gets disabled (not stopped — the stream itself stays open
    // across turns, see the comment on streamRef above) the instant a turn
    // finishes recording, and only re-enabled here. Chrome's default audio
    // processing on a getUserMedia stream (echo cancellation etc., implied
    // by the bare `{ audio: true }` constraint) can otherwise keep
    // interfering with separate <audio> playback for as long as the track
    // stays live and enabled, well past the point where anything is
    // actually being recorded from it.
    stream!.getAudioTracks().forEach((t) => (t.enabled = true))

    const analyser = analyserRef.current!
    const data = new Uint8Array(analyser.frequencyBinCount)

    const supportedMime = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
    mimeTypeRef.current = supportedMime ?? ''
    const recorder = supportedMime ? new MediaRecorder(stream!, { mimeType: supportedMime }) : new MediaRecorder(stream!)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = async () => {
      markTurn('silence_wait')
      // Any live socket still opening belongs to a turn that is now over;
      // bumping the id makes it abandon itself rather than linger open.
      turnIdRef.current += 1
      stopTurnLoop()
      // Disabling (not stopping) the track leaves the stream alive for the
      // next turn — no re-prompt for mic permission — while removing
      // whatever's keeping the mic "hot" for the entire transcribe/reply/
      // speak stretch that follows, when nothing is actually listening.
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false))
      setListening(false)

      const live = liveRef.current
      liveRef.current = null

      // Nothing crossed the speech threshold this turn, so there is nothing
      // to transcribe. Skip both paths entirely.
      //
      // This is most turns, not an edge case: while a teacher is gathering
      // their thoughts the silence timer ends a turn every couple of seconds
      // and immediately starts another. Every one of those used to be
      // uploaded and transcribed — paying Deepgram to confirm silence the
      // level meter had already measured. Live transcription made it worse:
      // an empty live transcript deliberately falls back to the upload (see
      // the next block), so each silent turn was billed twice.
      //
      // The threshold is low enough that any real speech crosses it, and it
      // is the same one that decides when a turn ends — a teacher who never
      // crossed it would already have been cut off regardless.
      if (!heardSpeechRef.current) {
        live?.abandon()
        onTurnComplete('')
        return
      }

      setTranscribing(true)
      // If live transcription was running, the words are already there and
      // the recording never has to be uploaded at all. Anything less than a
      // usable transcript falls through to the batch path below, which still
      // holds the complete turn.
      if (live) {
        const transcript = await live.finish()
        live.abandon()
        if (transcript) {
          markTurn('transcribe_live')
          setTranscribing(false)
          onTurnComplete(transcript.trim())
          return
        }
        console.warn('[useVoiceTurn] live transcription returned nothing — falling back to the upload')
      }

      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
      try {
        const { transcript } = await transcribeTalkToMeAudio(blob)
        setTranscribing(false)
        onTurnComplete(transcript.trim())
      } catch {
        // A transcription hiccup for one turn shouldn't end the
        // conversation — treat it the same as "nothing was said."
        setTranscribing(false)
        onTurnComplete('')
      }
    }
    recorderRef.current = recorder

    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128
        sumSquares += normalized * normalized
      }
      const pct = Math.min(100, Math.round(Math.sqrt(sumSquares / data.length) * 300))
      setLevel(pct)
      const now = performance.now()
      const sinceLastFrame = lastFrameRef.current ? now - lastFrameRef.current : 0
      lastFrameRef.current = now
      if (pct > SPEECH_LEVEL_THRESHOLD) {
        // Capped per frame so a backgrounded tab, where rAF stops firing,
        // cannot come back and count the whole gap as speech.
        speechMsRef.current += Math.min(sinceLastFrame, 100)
        heardSpeechRef.current = true
        scheduleEnd()
        // Restarted on every frame the teacher is still audible, so the
        // clock ends up starting at the last instant they were actually
        // speaking — which is when the wait starts from their side.
        beginTurn()
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }

    speechMsRef.current = 0
    heardSpeechRef.current = false
    speculatedRef.current = false
    lastFrameRef.current = 0
    turnIdRef.current += 1

    recorder.start()
    setListening(true)
    scheduleEnd()
    tick()

    // Opened alongside recording rather than before it. Waiting for the
    // socket first would mean the microphone was not yet recording while it
    // connected, so the teacher's opening words would be missing from both
    // the live stream and the fallback recording. Audio captured before the
    // socket is ready is held and flushed the moment it opens, so the live
    // transcript starts at the same word the recording does.
    if (liveTranscriptionEnabled() && sourceRef.current && audioCtxRef.current) {
      const ctx = audioCtxRef.current
      const turnId = turnIdRef.current
      const backlog: Float32Array[] = []
      let live: LiveSession | null = null

      // ScriptProcessorNode is deprecated in favour of AudioWorklet, but it
      // needs no separately served module file and is supported everywhere
      // this app runs, including iOS Safari. One mono channel does little
      // enough work per block to stay off the main thread's critical path.
      const tap = ctx.createScriptProcessor(4096, 1, 1)
      tap.onaudioprocess = (event) => {
        const block = event.inputBuffer.getChannelData(0)
        if (live) live.send(block)
        // The buffer behind that view is reused for the next block, so
        // anything held rather than sent immediately has to be copied.
        else backlog.push(new Float32Array(block))
      }
      sourceRef.current.connect(tap)
      // A ScriptProcessor only runs while it is connected to a destination.
      // Routing it through a silent gain node keeps it processing without
      // the teacher hearing their own microphone played back at them.
      const sink = ctx.createGain()
      sink.gain.value = 0
      tap.connect(sink)
      sink.connect(ctx.destination)
      tapRef.current = tap

      void openLiveSession(ctx.sampleRate).then((session) => {
        // The turn can easily end before the socket finishes opening —
        // Stop, Close, or simply a very short answer.
        if (!session) {
          stopLiveTap()
          return
        }
        if (turnId !== turnIdRef.current) {
          session.abandon()
          return
        }
        for (const block of backlog) session.send(block)
        backlog.length = 0
        live = session
        liveRef.current = session
      })
    }
  }

  // Watches the microphone for the teacher speaking when no turn is being
  // recorded. Used twice, with very different sensitivity:
  //
  // - After a turn ended but before Coach is audible (watchForResume): the
  //   room is quiet, so a hair trigger is right — the end-of-turn guess may
  //   have been wrong and the cost of catching it is nothing.
  // - While Coach is speaking (watchWhileSpeaking): the microphone is also
  //   hearing Coach through the speakers. Echo cancellation removes most of
  //   that, but not all of it on every device, so this needs a much higher
  //   bar — a louder level, held for long enough that leaked echo or a cough
  //   cannot cut Coach off mid-sentence.
  function watchLevel(threshold: number, sustainMs: number, onSpeech: () => void): () => void {
    const analyser = analyserRef.current
    const stream = streamRef.current
    if (!analyser || !stream) return () => {}

    stream.getAudioTracks().forEach((t) => (t.enabled = true))
    const data = new Uint8Array(analyser.frequencyBinCount)
    let rafId: number | null = null
    let loudSince = 0
    let stopped = false

    const stopWatching = () => {
      if (stopped) return
      stopped = true
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
      // Only quieten the microphone if a new turn has not already claimed it.
      if (!recorderRef.current) streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false))
    }

    const watch = () => {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128
        sumSquares += normalized * normalized
      }
      const pct = Math.min(100, Math.round(Math.sqrt(sumSquares / data.length) * 300))
      const now = performance.now()
      if (pct > threshold) {
        if (!loudSince) loudSince = now
        if (now - loudSince >= sustainMs) {
          stopWatching()
          onSpeech()
          return
        }
      } else {
        loudSince = 0
      }
      rafId = requestAnimationFrame(watch)
    }
    watch()
    return stopWatching
  }

  // The teacher carried on after the turn was called, and before Coach said
  // anything. The caller MUST stop this the moment Coach becomes audible —
  // past that point watchWhileSpeaking is the right tool, because the
  // microphone is hearing the room with Coach playing into it.
  function watchForResume(onResume: () => void): () => void {
    // ~50ms at 60fps: a chair creak is a spike, speech is not.
    return watchLevel(SPEECH_LEVEL_THRESHOLD, 50, onResume)
  }

  // The teacher started talking over Coach. Deliberately hard to trigger.
  function watchWhileSpeaking(onBargeIn: () => void): () => void {
    if (!bargeInEnabled()) return () => {}
    return watchLevel(BARGE_IN_LEVEL_THRESHOLD, BARGE_IN_SUSTAIN_MS, onBargeIn)
  }

  function stop() {
    recorderRef.current?.stop()
  }

  const supported =
    typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function'

  return { supported, listening, level, fatalError, transcribing, start, stop, close, watchForResume, watchWhileSpeaking }
}
