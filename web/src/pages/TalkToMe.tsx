import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MicIcon, WarningIcon } from '../components/icons'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { sendDebriefChat, startTalkToMe, synthesizeSpeech, type ChatMessage, type Debrief } from '../lib/api'

// Flip to false if auto-starting the mic on open turns out to be too
// aggressive/error-prone in practice — no other code changes needed.
const AUTO_START_ON_OPEN = true

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export default function TalkToMe() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const debriefRef = useRef<Debrief | null>(null)
  debriefRef.current = debrief
  const startedRef = useRef(false)

  const { supported, level, fatalError, start, stop } = useVoiceTurn(handleTurnComplete)

  useEffect(() => {
    if (AUTO_START_ON_OPEN && supported && !startedRef.current) {
      startedRef.current = true
      beginListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  useEffect(() => {
    if (fatalError) {
      setError(fatalError)
      setPhase('error')
    }
  }, [fatalError])

  function beginListening() {
    setError(null)
    setPhase('listening')
    start()
  }

  async function handleTurnComplete(text: string) {
    if (!text) {
      // Silence timer fired with nothing said (or a benign recognition
      // hiccup) — just listen again rather than bothering the backend.
      beginListening()
      return
    }
    setPhase('thinking')
    try {
      const current = debriefRef.current
      const result = current ? await sendDebriefChat(current.id, text) : await startTalkToMe(text)
      setDebrief(result)
      const conv = result.conversation
      const reply = conv[conv.length - 1]?.text ?? ''
      await speak(reply)
    } catch (err) {
      setError((err as Error).message || 'Could not reach Coach. Please try again.')
      setPhase('error')
    }
  }

  async function speak(text: string) {
    setPhase('speaking')
    if (mutedRef.current || !text) {
      resumeListening()
      return
    }
    try {
      const blob = await synthesizeSpeech(text)
      const url = URL.createObjectURL(blob)
      const audio = audioRef.current
      if (!audio) {
        resumeListening()
        return
      }
      audio.src = url
      audio.onended = () => {
        URL.revokeObjectURL(url)
        resumeListening()
      }
      await audio.play().catch(() => resumeListening())
    } catch {
      // TTS failed — the reply text is already visible, just keep going without audio
      resumeListening()
    }
  }

  function resumeListening() {
    beginListening()
  }

  function handleStop() {
    stop()
    audioRef.current?.pause()
    setPhase('idle')
  }

  function handleClose() {
    stop()
    audioRef.current?.pause()
    navigate('/')
  }

  const messages: ChatMessage[] = debrief?.conversation ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <audio ref={audioRef} className="hidden" />

      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <p className="text-base font-semibold text-ink">Talk to Coach</p>
        <button type="button" onClick={handleClose} className="text-sm font-medium text-ink-soft hover:text-ink">
          Close
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        {!supported ? (
          <div className="flex flex-col items-center gap-3">
            <WarningIcon className="h-8 w-8 text-warm-500" />
            <p className="max-w-sm text-sm text-ink-soft">
              Voice conversation isn't available in this browser. Try a different browser or device.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-full transition-colors ${
                  phase === 'listening'
                    ? 'bg-brand-100'
                    : phase === 'thinking'
                      ? 'bg-canvas'
                      : phase === 'speaking'
                        ? 'bg-brand-50'
                        : 'bg-canvas'
                }`}
              >
                {phase === 'listening' && (
                  <span className="relative flex h-16 w-16 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-40" />
                    <MicIcon className="relative h-9 w-9 text-brand-600" />
                  </span>
                )}
                {phase === 'thinking' && <MicIcon className="h-9 w-9 animate-pulse text-ink-soft" />}
                {phase === 'speaking' && <MicIcon className="h-9 w-9 text-brand-500" />}
                {(phase === 'idle' || phase === 'error') && <MicIcon className="h-9 w-9 text-ink-soft" />}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {phase === 'listening' && (level > 8 ? 'Listening...' : "I'm listening — go ahead")}
                {phase === 'thinking' && 'Thinking...'}
                {phase === 'speaking' && 'Coach is speaking'}
                {phase === 'idle' && 'Paused'}
                {phase === 'error' && 'Something went wrong'}
              </p>
            </div>

            <div className="flex w-full max-w-md flex-col gap-3">
              {phase === 'listening' && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width]"
                    style={{ width: `${level}%` }}
                  />
                </div>
              )}
              {lastAssistant && (
                <div className="rounded-2xl border border-border bg-surface p-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Coach</p>
                  <p className="mt-1.5 text-sm text-ink">{lastAssistant.text}</p>
                </div>
              )}
              {error && <p className="text-sm text-warm-500">{error}</p>}
            </div>

            <div className="flex items-center gap-3">
              {phase === 'idle' || phase === 'error' ? (
                <button
                  type="button"
                  onClick={beginListening}
                  className="flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <MicIcon className="h-4 w-4" />
                  {phase === 'error' ? 'Try Again' : 'Start Talking'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className={`rounded-full border-2 px-5 py-3 text-sm font-semibold transition-colors ${
                  muted
                    ? 'border-warm-500 bg-warm-100 text-warm-500'
                    : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
          </>
        )}
      </main>

      <p className="px-6 pb-6 text-center text-xs text-ink-soft">
        Your voice is never saved — only the conversation text.
      </p>
    </div>
  )
}
