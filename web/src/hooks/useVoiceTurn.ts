import { useRef, useState } from 'react'
import { transcribeTalkToMeAudio } from '../lib/api'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

// Same "signal detected" threshold MicLevelMeter.tsx already uses.
const SPEECH_LEVEL_THRESHOLD = 8

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
// the speech threshold, ending the turn on the first uninterrupted
// silenceMs stretch, whether the teacher never spoke at all or spoke and
// then paused.
export function useVoiceTurn(onTurnComplete: (text: string) => void, silenceMs = 1400) {
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

  function scheduleEnd() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      recorderRef.current?.stop()
    }, silenceMs)
  }

  // Ends the current turn's level/silence-detection loop only — the
  // underlying stream stays open for the next turn.
  function stopTurnLoop() {
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
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        const name = (err as DOMException)?.name
        setFatalError(FATAL_ERROR_MESSAGES[name] ?? 'Could not access your microphone. Check your device and try again.')
        return
      }
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
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
      stopTurnLoop()
      // Disabling (not stopping) the track leaves the stream alive for the
      // next turn — no re-prompt for mic permission — while removing
      // whatever's keeping the mic "hot" for the entire transcribe/reply/
      // speak stretch that follows, when nothing is actually listening.
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false))
      setListening(false)
      setTranscribing(true)
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
      if (pct > SPEECH_LEVEL_THRESHOLD) scheduleEnd()
      rafIdRef.current = requestAnimationFrame(tick)
    }

    recorder.start()
    setListening(true)
    scheduleEnd()
    tick()
  }

  function stop() {
    recorderRef.current?.stop()
  }

  const supported =
    typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function'

  return { supported, listening, level, fatalError, transcribing, start, stop, close }
}
