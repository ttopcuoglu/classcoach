import { useRef, useState } from 'react'
import { analyzeDemoClip, type DemoAnalysisResult, type DemoAnalysisTag } from '../lib/api'
import { MicIcon } from './icons'

// Deliberately built from the exact phrase lists audioAnalysis.ts already
// uses for real session reports — "why do you think" is a literal
// HIGHER_ORDER_STARTERS entry, "nice thinking" a literal POSITIVE_PHRASES
// entry — so this demo's detection is genuinely real, not staged.
const DEMO_SCRIPT =
  "Okay, let's dig into this scene together. Why do you think the character decided to stay quiet instead of speaking up? ... Nice thinking — that's exactly the kind of connection I was hoping someone would make."

const TAG_LABELS: Record<DemoAnalysisTag, string> = {
  higher_order_question: 'Higher-order question',
  positive_language: 'Positive language',
}

type Phase = 'idle' | 'recording' | 'analyzing' | 'result' | 'error'

export default function DemoRecorder() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<DemoAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('')
  const streamRef = useRef<MediaStream | null>(null)

  async function handleRecord() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const supported = candidates.find((t) => MediaRecorder.isTypeSupported(t))
      mimeTypeRef.current = supported ?? ''
      const recorder = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleStopped
      recorder.start()
      recorderRef.current = recorder
      setPhase('recording')
    } catch {
      setError('Could not access the microphone. Check your browser/device settings and try again.')
      setPhase('error')
    }
  }

  function handleStop() {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  async function handleStopped() {
    setPhase('analyzing')
    try {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
      const analysis = await analyzeDemoClip(blob)
      setResult(analysis)
      setPhase('result')
    } catch (err) {
      setError((err as Error).message || 'Could not analyze the recording. Please try again.')
      setPhase('error')
    }
  }

  function handleTryAgain() {
    setResult(null)
    setError(null)
    setPhase('idle')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Read this aloud</p>
        <p className="mt-2 font-display text-lg italic leading-relaxed text-ink">"{DEMO_SCRIPT}"</p>
      </div>

      {(phase === 'idle' || phase === 'error') && (
        <button
          type="button"
          onClick={handleRecord}
          className="flex items-center justify-center gap-2 self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
        >
          <MicIcon className="h-4 w-4" />
          Start recording
        </button>
      )}

      {phase === 'recording' && (
        <button
          type="button"
          onClick={handleStop}
          className="flex items-center justify-center gap-2 self-start rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:opacity-90"
        >
          Stop recording
        </button>
      )}

      {phase === 'analyzing' && <p className="text-sm text-ink-soft">Listening for a moment...</p>}

      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      {phase === 'result' && result && (
        <div className="rounded-2xl bg-mint-tint/50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">Here's what we found</p>
          {result.tag && result.highlightedText ? (
            <>
              <p className="mt-2 text-sm text-ink">
                {result.transcript.split(result.highlightedText).map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && (
                      <mark className="rounded bg-peach-tint px-1 text-ink">{result.highlightedText}</mark>
                    )}
                  </span>
                ))}
              </p>
              <span className="mt-3 inline-block rounded-full bg-forest px-3 py-1 text-xs font-semibold text-cream">
                {TAG_LABELS[result.tag]}
              </span>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">
              We didn't catch a clean moment that time — that's alright. This is exactly the kind of moment Wivoza
              looks for across a full class recording.
            </p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleTryAgain}
              className="rounded-full border border-hairline bg-cream px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
