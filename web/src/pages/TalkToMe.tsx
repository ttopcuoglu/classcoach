import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MicIcon, WarningIcon } from '../components/icons'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { buildSpeechUrl, sendDebriefChat, startTalkToMe, type ChatMessage, type Debrief } from '../lib/api'

// Flip to false if auto-starting the mic on open turns out to be too
// aggressive/error-prone in practice — no other code changes needed.
const AUTO_START_ON_OPEN = true

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Plays a queue of sentences back to back on ONE persistent <audio>
// element, reused for the whole conversation. This has to be the same
// element every time: mobile Safari only allows script-triggered
// playback on a media element that was previously played successfully
// from a real user gesture — a brand-new Audio() object created deep
// inside an async chain (as every earlier version of this function did)
// gets its play() silently rejected there, which .catch() then swallowed
// as if the clip had simply finished, producing total silence with no
// visible error. The cost of reusing one element is that a later
// sentence's audio can no longer start loading while an earlier one is
// still playing (only one <audio> can have one active source) — worth it
// for audio that actually plays on a real phone.
function playQueue(audio: HTMLAudioElement, sentences: string[], index: number): Promise<void> {
  return new Promise((resolve) => {
    if (index >= sentences.length) {
      resolve()
      return
    }
    const advance = () => resolve(playQueue(audio, sentences, index + 1))
    audio.onended = advance
    audio.onerror = advance // a bad segment is skipped, not fatal to the turn
    audio.src = buildSpeechUrl(sentences[index])
    audio.play().catch(advance)
  })
}

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

  const { supported, level, fatalError, transcribing, start, close } = useVoiceTurn(handleTurnComplete)

  useEffect(() => {
    if (AUTO_START_ON_OPEN && supported && !startedRef.current) {
      startedRef.current = true
      beginListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  // Release the microphone if the teacher navigates away (back button, tab
  // close) without using the in-app Close button. Empty deps deliberately —
  // close() only reads refs, so this closure never goes stale, and this
  // must run only on unmount, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => close, [])

  // Mobile browsers only allow script-triggered playback on a media
  // element that has previously played successfully from a direct user
  // gesture. The mic auto-starts on open (no tap involved), and a reply's
  // first play() call happens well after any tap anyway (deep in an async
  // record -> transcribe -> reply chain) — so without this, the very first
  // reply of a session could still fail to play even on the same
  // persistent <audio> element. Priming (a silent, immediately-paused
  // play) on the first tap anywhere on the page "unlocks" that element for
  // every later programmatic play() in this session.
  useEffect(() => {
    function primeAudio() {
      const audio = audioRef.current
      if (!audio) return
      audio.muted = true
      audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
        })
        .catch(() => {
          audio.muted = false
        })
    }
    document.addEventListener('pointerdown', primeAudio, { once: true })
    return () => document.removeEventListener('pointerdown', primeAudio)
  }, [])

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
    const sentences = splitIntoSentences(text)
    if (sentences.length === 0 || !audioRef.current) {
      resumeListening()
      return
    }
    await playQueue(audioRef.current, sentences, 0)
    resumeListening()
  }

  function resumeListening() {
    beginListening()
  }

  function handleStop() {
    close()
    audioRef.current?.pause()
    setPhase('idle')
  }

  function handleClose() {
    close()
    audioRef.current?.pause()
    navigate('/')
  }

  const messages: ChatMessage[] = debrief?.conversation ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {/* crossOrigin is required for the session cookie to ride along with
          this cross-subdomain GET (frontend/backend are on different
          origins) — without it, /api/tts's requireAuth would reject the
          audio element's own request. */}
      <audio ref={audioRef} crossOrigin="use-credentials" className="hidden" />

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
                {transcribing && 'Transcribing...'}
                {!transcribing && phase === 'listening' && (level > 8 ? 'Listening...' : "I'm listening — go ahead")}
                {!transcribing && phase === 'thinking' && 'Thinking...'}
                {!transcribing && phase === 'speaking' && 'Coach is speaking'}
                {!transcribing && phase === 'idle' && 'Paused'}
                {!transcribing && phase === 'error' && 'Something went wrong'}
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
