import { useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: ((event: any) => void) | null
  start: () => void
  stop: () => void
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined

// Errors the teacher needs to actually see and act on (grant mic
// permission, plug in a mic) — auto-retrying these would either spam a
// permission prompt or silently fail forever. Anything else (e.g.
// "no-speech" when the silence timer fires before anyone talks) is
// benign and safe to silently restart from.
const FATAL_ERROR_CODES = new Set(['not-allowed', 'audio-capture', 'service-not-allowed'])

const FATAL_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Check your browser/device settings and try again.',
  'audio-capture': 'No microphone was found. Check your device and try again.',
  'service-not-allowed': 'Microphone access was denied. Check your browser/device settings and try again.',
}

// A dedicated, separate hook from useSpeechToText — that one fires per
// browser-"final" chunk with no silence-accumulation, which is right for
// "type into a box, submit yourself" dictation but wrong for a hands-free
// voice loop: fragmenting one longer thought into an early auto-submit
// would cut the teacher off mid-sentence. This hook accumulates interim +
// final chunks and only ends the turn after a real pause in speech, not
// per-fragment.
export function useVoiceTurn(onTurnComplete: (text: string) => void, silenceMs = 1400) {
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [fatalError, setFatalError] = useState<string | null>(null)
  const accumulatedRef = useRef('')
  const timerRef = useRef<number | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const lastErrorCodeRef = useRef<string | null>(null)

  function scheduleEnd() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      recognitionRef.current?.stop()
    }, silenceMs)
  }

  function start() {
    if (!SpeechRecognitionCtor || recognitionRef.current) return
    setFatalError(null)
    accumulatedRef.current = ''
    lastErrorCodeRef.current = null
    setInterimText('')
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk: string = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          accumulatedRef.current = (accumulatedRef.current ? `${accumulatedRef.current} ` : '') + chunk.trim()
        } else {
          interim += chunk
        }
      }
      setInterimText(interim)
      scheduleEnd()
    }
    // The spec has onerror fire, then onend fire right after it for the
    // same failure — onerror only records what happened; onend is the
    // single place that ever calls onTurnComplete, so a failure can never
    // trigger it twice.
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      if (timerRef.current) window.clearTimeout(timerRef.current)
      const text = accumulatedRef.current.trim()
      setInterimText('')
      const wasFatal = FATAL_ERROR_CODES.has(lastErrorCodeRef.current ?? '')
      if (!wasFatal) onTurnComplete(text)
    }
    recognition.onerror = (event: any) => {
      const code = typeof event?.error === 'string' ? event.error : 'unknown'
      lastErrorCodeRef.current = code
      if (FATAL_ERROR_CODES.has(code)) {
        setFatalError(FATAL_ERROR_MESSAGES[code] ?? 'Something went wrong with the microphone.')
      }
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
    scheduleEnd()
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  return { supported: !!SpeechRecognitionCtor, listening, interimText, fatalError, start, stop }
}
