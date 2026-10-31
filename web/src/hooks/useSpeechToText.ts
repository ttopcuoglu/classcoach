import { useRef, useState } from 'react'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined

// Wraps the browser's Web Speech API — extracted from its original inline
// home in TryItOut.tsx's PracticePanel so the same mic behavior can be
// reused elsewhere (e.g. the Ask tab) without duplicating this logic.
// `onFinalTranscript` fires once per recognized final chunk (can be more
// than once within a single listening session); the caller decides how to
// merge it into their own text field.
export function useSpeechToText(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  function start() {
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
      }
      if (finalTranscript.trim()) {
        onFinalTranscript(finalTranscript.trim())
      }
    }
    // A stopped session can end after a new one has started; only the
    // current one decides whether the mic reads as listening.
    const ended = () => {
      if (recognitionRef.current === recognition) setListening(false)
    }
    recognition.onend = ended
    recognition.onerror = ended
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  function toggleListening() {
    if (listening) stop()
    else start()
  }

  return { supported: !!SpeechRecognitionCtor, listening, toggleListening, start, stop }
}
