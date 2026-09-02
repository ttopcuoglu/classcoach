import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrainIcon, MicIcon, WarningIcon } from '../components/icons'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import { buildSpeechUrl, sendDebriefChat, startTalkToMe, type ChatMessage, type Debrief } from '../lib/api'

// Flipped to false: auto-starting the mic on open meant a teacher could
// go through an entire hands-free conversation without ever tapping the
// screen, so the audio-unlock `pointerdown` listener below never fired —
// mobile Safari then silently rejects every `play()` call for the whole
// session (see playQueue's comment). Requiring one tap on "Start Talking"
// guarantees that unlock happens before the first reply tries to play.
const AUTO_START_ON_OPEN = false

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

// What the orb actually shows. Distinct from Phase: the STT wait (the
// `transcribing` window, which happens while `phase` is still 'listening')
// and the Claude-reply wait (`phase === 'thinking'`) both read as one
// continuous "Coach is thinking" moment from the teacher's side — she
// doesn't know or care that the first part is transcription and the
// second is the model call. Deriving one VisualState up front (see
// `visualState` below) means the orb, the dot, and the caption can never
// disagree about which state is showing, unlike before, when the icon and
// the caption text were computed by separate, inconsistent conditions.
type VisualState = 'idle' | 'error' | 'listening' | 'thinking' | 'speaking'

const STATE_STYLES: Record<VisualState, { glow: string; orb: string; pill: string; dot: string }> = {
  listening: { glow: 'bg-mint-tint', orb: 'border-mint-tint bg-mint-tint/80', pill: 'bg-mint-tint text-forest', dot: 'bg-forest' },
  thinking: { glow: 'bg-gold-tint', orb: 'border-gold-tint bg-gold-tint/80', pill: 'bg-gold-tint text-terracotta-600', dot: 'bg-terracotta-600' },
  speaking: { glow: 'bg-peach-tint', orb: 'border-peach-tint bg-peach-tint/80', pill: 'bg-peach-tint text-terracotta', dot: 'bg-terracotta' },
  idle: { glow: 'bg-cream-card', orb: 'border-hairline bg-cream-card', pill: 'border border-hairline bg-cream-card text-ink-soft', dot: 'bg-ink-soft' },
  error: { glow: 'bg-warm-100', orb: 'border-warm-100 bg-warm-100', pill: 'bg-warm-100 text-warm-500', dot: 'bg-warm-500' },
}

function statusLabel(state: VisualState, level: number): string {
  switch (state) {
    case 'listening':
      return level > 8 ? 'Listening…' : "I'm listening — go ahead"
    case 'thinking':
      return 'Coach is thinking…'
    case 'speaking':
      return 'Coach is speaking'
    case 'idle':
      return 'Paused'
    case 'error':
      return 'Something went wrong'
  }
}

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
  // Guards against the turn loop resuming after Stop/Close: the record ->
  // transcribe -> reply -> speak chain is all async, so a tap on Stop
  // mid-turn doesn't cancel the in-flight chain — without this, it
  // finishes moments later and calls resumeListening() anyway, undoing
  // the tap. A ref (not state) so the current value is visible inside
  // async callbacks without waiting on a re-render.
  const sessionActiveRef = useRef(false)

  const { supported, level, fatalError, transcribing, start, close } = useVoiceTurn(handleTurnComplete)

  const visualState: VisualState =
    phase === 'error' ? 'error' : phase === 'idle' ? 'idle' : transcribing || phase === 'thinking' ? 'thinking' : phase === 'speaking' ? 'speaking' : 'listening'

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
    sessionActiveRef.current = true
    setError(null)
    setPhase('listening')
    start()
  }

  // Only resumes if Stop/Close wasn't triggered while this turn's
  // record -> transcribe -> reply -> speak chain was already in flight.
  function resumeListeningIfActive() {
    if (!sessionActiveRef.current) return
    beginListening()
  }

  async function handleTurnComplete(text: string) {
    if (!text) {
      // Silence timer fired with nothing said (or a benign recognition
      // hiccup) — just listen again rather than bothering the backend.
      resumeListeningIfActive()
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
      if (!sessionActiveRef.current) return
      setError((err as Error).message || 'Could not reach Coach. Please try again.')
      setPhase('error')
    }
  }

  async function speak(text: string) {
    if (!sessionActiveRef.current) return
    setPhase('speaking')
    if (mutedRef.current || !text) {
      resumeListeningIfActive()
      return
    }
    const sentences = splitIntoSentences(text)
    if (sentences.length === 0 || !audioRef.current) {
      resumeListeningIfActive()
      return
    }
    await playQueue(audioRef.current, sentences, 0)
    resumeListeningIfActive()
  }

  function handleStop() {
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    setPhase('idle')
  }

  function handleClose() {
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    navigate('/')
  }

  const messages: ChatMessage[] = debrief?.conversation ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* crossOrigin is required for the session cookie to ride along with
          this cross-subdomain GET (frontend/backend are on different
          origins) — without it, /api/tts's requireAuth would reject the
          audio element's own request. */}
      <audio ref={audioRef} crossOrigin="use-credentials" className="hidden" />

      <header className="flex items-center justify-between border-b border-hairline bg-cream-card px-4 py-3">
        <p className="font-heading text-base font-bold text-forest">Talk to Coach</p>
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
            <div className="flex flex-col items-center gap-4">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <span
                  aria-hidden="true"
                  className={`absolute inset-3 rounded-full blur-2xl transition-colors duration-500 ${STATE_STYLES[visualState].glow}`}
                />
                {visualState === 'listening' && (
                  <span
                    aria-hidden="true"
                    className="absolute h-28 w-28 rounded-full border-2 border-forest/30 transition-transform duration-150 ease-out"
                    style={{ transform: `scale(${1 + Math.min(level, 100) / 130})` }}
                  />
                )}
                <div
                  className={`relative flex h-28 w-28 items-center justify-center rounded-full border shadow-sm transition-colors duration-500 ${STATE_STYLES[visualState].orb}`}
                >
                  {visualState === 'listening' && <MicIcon className="h-10 w-10 text-forest" />}
                  {visualState === 'thinking' && (
                    <span className="flex flex-col items-center gap-2.5">
                      <BrainIcon className="h-9 w-9 animate-pulse text-terracotta-600" />
                      <span className="flex items-center gap-1" aria-hidden="true">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="h-1.5 w-1.5 animate-bounce rounded-full bg-terracotta-600/70"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    </span>
                  )}
                  {visualState === 'speaking' && (
                    <span className="flex h-9 items-end gap-1" aria-hidden="true">
                      {[10, 22, 14, 28, 16].map((barHeight, i) => (
                        <span
                          key={barHeight}
                          className="w-1.5 animate-pulse rounded-full bg-terracotta"
                          style={{ height: `${barHeight}px`, animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </span>
                  )}
                  {visualState === 'idle' && <MicIcon className="h-10 w-10 text-ink-soft" />}
                  {visualState === 'error' && <WarningIcon className="h-10 w-10 text-warm-500" />}
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-500 ${STATE_STYLES[visualState].pill}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${STATE_STYLES[visualState].dot} ${
                    visualState === 'thinking' || visualState === 'speaking' ? 'animate-pulse' : ''
                  }`}
                />
                {statusLabel(visualState, level)}
              </div>
            </div>

            <div className="flex w-full max-w-md flex-col gap-3">
              {lastAssistant && (
                <div className="rounded-2xl border border-hairline bg-cream-card p-4 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coach</p>
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
                  className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                >
                  <MicIcon className="h-4 w-4" />
                  {phase === 'error' ? 'Try Again' : 'Start Talking'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-full bg-forest px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
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
                    : 'border-hairline bg-cream-card text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
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
