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

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
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

  function cleanup() {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = null
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    recorderRef.current = null
    setLevel(0)
  }

  async function start() {
    if (recorderRef.current) return
    setFatalError(null)
    chunksRef.current = []

    let stream: MediaStream
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
    const data = new Uint8Array(analyser.frequencyBinCount)

    const supportedMime = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
    mimeTypeRef.current = supportedMime ?? ''
    const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = async () => {
      cleanup()
      setListening(false)
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
      try {
        const { transcript } = await transcribeTalkToMeAudio(blob)
        onTurnComplete(transcript.trim())
      } catch {
        // A transcription hiccup for one turn shouldn't end the
        // conversation — treat it the same as "nothing was said."
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

  return { supported, listening, level, fatalError, start, stop }
}
