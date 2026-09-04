import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrainIcon, MicIcon, StarIcon, WarningIcon } from '../components/icons'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import {
  buildSpeechUrl,
  generateTalkTakeaway,
  getDebriefs,
  getProfile,
  sendDebriefChat,
  setDebriefSaved,
  startTalkToMe,
  type ChatMessage,
  type Debrief,
  type TalkTakeaway,
  type TalkVoice,
} from '../lib/api'

// First-person, concrete — things a teacher could plausibly say out loud,
// not generic placeholders. Tapping one starts a real conversation
// immediately via the exact same path a spoken or typed turn uses.
const EXAMPLE_PROMPTS = [
  'My class talks over directions.',
  'I want to reflect on today’s lesson.',
  'A parent email is stressing me out.',
  'I’m feeling overwhelmed this week.',
]

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

function statusLabel(state: VisualState, level: number, hasConversation: boolean): string {
  switch (state) {
    case 'listening':
      return level > 8 ? 'Listening…' : "I'm listening — go ahead"
    case 'thinking':
      return 'Coach is thinking…'
    case 'speaking':
      return 'Coach is speaking'
    case 'idle':
      // Distinguishes "nothing has happened yet" from a genuine
      // mid-conversation pause — both used to read as the same bare
      // "Paused," which was confusing before any turn had happened.
      return hasConversation ? 'Paused' : 'Ready when you are'
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

// Fetches one sentence's TTS audio as a blob URL rather than handing the
// live /api/tts URL straight to the <audio> element — a plain fetch()
// isn't subject to mobile Safari's playback-gesture rules the way
// audio.play() is, so this can safely run in the background regardless
// of whose "turn" it is to play. Returns null (rather than throwing) on
// failure so a single bad segment doesn't take down the whole reply.
async function fetchSentenceAudio(sentence: string, voice: TalkVoice | null): Promise<string | null> {
  try {
    const res = await fetch(buildSpeechUrl(sentence, voice), { credentials: 'include' })
    if (!res.ok) {
      console.warn('[TalkToMe] TTS fetch failed', res.status, await res.text().catch(() => ''))
      return null
    }
    const blob = await res.blob()
    if (blob.size === 0) console.warn('[TalkToMe] TTS fetch returned an empty audio blob')
    return URL.createObjectURL(blob)
  } catch (err) {
    console.warn('[TalkToMe] TTS fetch threw', err)
    return null
  }
}

// Plays a queue of sentences back to back on ONE persistent <audio>
// element, reused for the whole conversation. This has to be the same
// element every time: mobile Safari only allows script-triggered
// playback on a media element that was previously played successfully
// from a real user gesture — a brand-new Audio() object created deep
// inside an async chain gets its play() silently rejected there, which
// .catch() then swallows as if the clip had simply finished, producing
// total silence with no visible error.
//
// TTS synthesis takes real time per sentence, so naively fetching each
// one only after the last finished playing left an audible gap between
// every sentence. A first attempt at fixing this only started fetching
// sentence N+1 once sentence N's audio arrived — giving it a head start
// equal to sentence N's playback duration, which usually isn't enough,
// since synthesizing one sentence typically takes about as long (or
// longer) than *speaking* one. Fixed properly by firing off every
// sentence's fetch in parallel up front, the moment the full reply is
// known, so all of them are synthesizing concurrently while the first
// one plays. This doesn't fight the single-<audio>-element constraint
// above — prefetching is just a network request; only the actual
// assigned `src`/`play()` needs to be the one persistent, gesture-
// unlocked element.
async function playQueue(audio: HTMLAudioElement, sentences: string[], voice: TalkVoice | null): Promise<void> {
  if (sentences.length === 0) return
  const audioUrls = sentences.map((sentence) => fetchSentenceAudio(sentence, voice))
  for (let i = 0; i < sentences.length; i++) {
    const url = await audioUrls[i]
    if (!url) continue // this segment failed to fetch — skip it, not fatal to the turn
    await new Promise<void>((resolve) => {
      // Chrome has a known quirk with streamed audio blobs (which is what
      // this pipeline always produces) where `ended` can simply never
      // fire, even though the file played and finished fine — Safari
      // doesn't share this quirk, which is exactly the "works on Safari,
      // gets stuck on Chrome" symptom this timeout exists to catch. A
      // single sentence's TTS clip should never legitimately run anywhere
      // near this long, so hitting it always means something's wrong,
      // not that the reply is genuinely still speaking.
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        resolve()
      }
      const timeoutId = window.setTimeout(() => {
        console.warn('[TalkToMe] audio playback timed out waiting for "ended" — advancing anyway')
        settle()
      }, 20000)
      audio.onended = () => settle()
      audio.onerror = () => {
        console.warn('[TalkToMe] <audio> element error', audio.error?.code, audio.error?.message)
        settle()
      }
      audio.src = url
      audio.play().catch((err) => {
        console.warn('[TalkToMe] audio.play() rejected', err?.name, err?.message)
        settle()
      })
    })
    URL.revokeObjectURL(url)
  }
}

export default function TalkToMe() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('idle')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [thinkingProgress, setThinkingProgress] = useState(0)
  // Set the instant transcription finishes, independent of `debrief` —
  // `debrief.conversation` only updates once the ENTIRE round trip
  // (transcribe -> reply) finishes, so deriving "what you said" from it
  // meant your own words appeared at the same moment as the coach's
  // reply, not right after you actually finished talking.
  const [userTranscript, setUserTranscript] = useState<string | null>(null)
  const [showTypeInput, setShowTypeInput] = useState(false)
  const [typedDraft, setTypedDraft] = useState('')
  const [takeaway, setTakeaway] = useState<TalkTakeaway | null>(null)
  const [takeawayLoading, setTakeawayLoading] = useState(false)
  const [takeawayError, setTakeawayError] = useState<string | null>(null)
  const [savedTalks, setSavedTalks] = useState<Debrief[]>([])
  const [talkVoice, setTalkVoice] = useState<TalkVoice | null>(null)
  const talkVoiceRef = useRef<TalkVoice | null>(null)
  talkVoiceRef.current = talkVoice

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
        .catch((err) => {
          console.warn('[TalkToMe] audio unlock (priming) rejected', err?.name, err?.message)
          audio.muted = false
        })
    }
    // pointerdown alone missed one real path: submitting "Type instead" by
    // pressing Enter in the text field fires no pointerdown at all (it's a
    // keyboard-only form submit), so that could be a teacher's very first
    // interaction with the page and the audio element would never unlock —
    // every reply for the rest of the session would then play silently.
    // keydown as a second trigger covers that; each listener removes itself
    // independently once fired, so firing both is harmless.
    document.addEventListener('pointerdown', primeAudio, { once: true })
    document.addEventListener('keydown', primeAudio, { once: true })
    return () => {
      document.removeEventListener('pointerdown', primeAudio)
      document.removeEventListener('keydown', primeAudio)
    }
  }, [])

  // There's no real signal from the reply request for "% done generating"
  // — this is a simulated estimate, not a measurement. It climbs quickly
  // at first and eases off, asymptotically approaching (but never
  // reaching) 92% on its own; the bar only ever hits 100% implicitly, by
  // disappearing the instant the real reply arrives and phase moves on.
  useEffect(() => {
    if (phase !== 'thinking') {
      setThinkingProgress(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      setThinkingProgress(92 * (1 - Math.exp(-elapsed / 1800)))
    }, 100)
    return () => clearInterval(interval)
  }, [phase])

  useEffect(() => {
    if (fatalError) {
      setError(fatalError)
      setPhase('error')
    }
  }, [fatalError])

  // Loaded once up front so a saved takeaway from a past session shows up
  // on the starting screen without waiting on anything else.
  useEffect(() => {
    getDebriefs({ source: 'talk_to_me' })
      .then((all) => setSavedTalks(all.filter((d) => d.saved)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    getProfile()
      .then((profile) => setTalkVoice(profile.talkVoice))
      .catch(() => {})
  }, [])

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
    setUserTranscript(text)
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
    await playQueue(audioRef.current, sentences, talkVoiceRef.current)
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

  // Shared entry point for both an example-prompt tap and a typed
  // submission — exactly the same path a real transcribed turn already
  // uses, so sendDebriefChat/startTalkToMe and speak() need no changes.
  function submitText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    sessionActiveRef.current = true
    setError(null)
    setShowTypeInput(false)
    setTypedDraft('')
    handleTurnComplete(trimmed)
  }

  function handleOpenTypeInput() {
    // Typing is just another way of ending the current mic turn — release
    // it first so an in-flight recording can't also fire a turn and race
    // the typed one.
    if (phase === 'listening') {
      sessionActiveRef.current = false
      close()
      setPhase('idle')
    }
    setShowTypeInput(true)
  }

  async function handleFinishSession() {
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    setShowTypeInput(false)
    if (!debrief) {
      navigate('/')
      return
    }
    setTakeawayLoading(true)
    setTakeawayError(null)
    try {
      const updated = await generateTalkTakeaway(debrief.id)
      setDebrief(updated)
      setTakeaway(updated.talkTakeaway)
    } catch (err) {
      setTakeawayError((err as Error).message || 'Could not summarize this conversation. Please try again.')
    } finally {
      setTakeawayLoading(false)
    }
  }

  async function handleToggleSaved() {
    if (!debrief) return
    const nextSaved = !debrief.saved
    setDebrief((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setDebriefSaved(debrief.id, nextSaved)
    } catch {
      setDebrief((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  const messages: ChatMessage[] = debrief?.conversation ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const finishing = takeawayLoading || takeaway != null || takeawayError != null

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* crossOrigin is required for the session cookie to ride along with
          this cross-subdomain GET (frontend/backend are on different
          origins) — without it, /api/tts's requireAuth would reject the
          audio element's own request. */}
      <audio ref={audioRef} crossOrigin="use-credentials" className="hidden" />

      <header className="flex items-center justify-between border-b border-hairline bg-cream-card px-4 py-3">
        <p className="font-heading text-base font-bold text-forest">Talk to Coach</p>
        {/* A fast, no-questions-asked way out — deliberately distinct from
            "Finish session" below: this skips the takeaway entirely. */}
        <button type="button" onClick={handleClose} className="text-sm font-medium text-ink-soft hover:text-ink">
          Exit
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
        ) : finishing ? (
          <div className="flex w-full max-w-md flex-col gap-5 text-left">
            {takeawayLoading ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <BrainIcon className="h-9 w-9 animate-pulse text-terracotta-600" />
                <p className="text-sm text-ink-soft">Wrapping up…</p>
              </div>
            ) : takeawayError ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <WarningIcon className="h-8 w-8 text-warm-500" />
                <p className="text-sm text-warm-500">{takeawayError}</p>
              </div>
            ) : takeaway ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="font-heading text-xl font-bold text-forest">Here's your takeaway</h1>
                  <button
                    type="button"
                    onClick={handleToggleSaved}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                      debrief?.saved
                        ? 'border-warm-500 bg-warm-100 text-warm-500'
                        : 'border-hairline bg-cream-card text-ink-soft hover:border-warm-500 hover:text-warm-500'
                    }`}
                  >
                    <StarIcon className="h-3.5 w-3.5" filled={debrief?.saved} />
                    {debrief?.saved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest">What we explored</p>
                    <p className="mt-1 text-sm text-ink">{takeaway.explored}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">What I'll try</p>
                    <p className="mt-1 text-sm text-ink">{takeaway.tryNext}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What I'll notice</p>
                    <p className="mt-1 text-sm text-ink">{takeaway.notice}</p>
                  </div>
                </div>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="self-center rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Done
            </button>
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
                {statusLabel(visualState, level, debrief != null)}
              </div>
              {visualState === 'thinking' && (
                // Simulated, not measured — see the thinkingProgress effect's
                // comment. Disappears the instant the real reply arrives.
                <div className="flex w-40 flex-col items-center gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gold-tint/50">
                    <div
                      className="h-full rounded-full bg-terracotta-600 transition-[width] duration-150 ease-out"
                      style={{ width: `${thinkingProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-terracotta-600">{Math.round(thinkingProgress)}%</span>
                </div>
              )}
            </div>

            {!debrief && phase === 'idle' && !showTypeInput ? (
              <div className="flex w-full max-w-md flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    A moment for your teaching
                  </p>
                  <h1 className="mt-1 font-heading text-2xl font-bold text-forest">What's on your mind today?</h1>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    Talk through a challenge, find the right words, or reflect on your day.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submitText(prompt)}
                      className="rounded-xl border border-hairline bg-cream-card px-4 py-3 text-left text-sm text-ink-soft transition-colors hover:border-terracotta/40 hover:text-ink"
                    >
                      "{prompt}"
                    </button>
                  ))}
                </div>

                {savedTalks.length > 0 && (
                  <div className="flex flex-col gap-2 text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Past conversations
                    </p>
                    <div className="flex flex-col gap-2">
                      {savedTalks.map((d) => (
                        <SavedTalkCard key={d.id} debrief={d} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex w-full max-w-md flex-col gap-3">
                {userTranscript && (
                  <div className="rounded-2xl border border-hairline bg-mint-tint/20 p-4 text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest">You</p>
                    <p className="mt-1.5 text-sm text-ink">{userTranscript}</p>
                  </div>
                )}
                {lastAssistant && (
                  <div className="rounded-2xl border border-hairline bg-cream-card p-4 text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coach</p>
                    <p className="mt-1.5 text-sm text-ink">{lastAssistant.text}</p>
                  </div>
                )}
                {error && <p className="text-sm text-warm-500">{error}</p>}
              </div>
            )}

            {showTypeInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitText(typedDraft)
                }}
                className="flex w-full max-w-md items-center gap-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={typedDraft}
                  onChange={(e) => setTypedDraft(e.target.value)}
                  placeholder="Type what's on your mind…"
                  className="flex-1 rounded-full border border-hairline bg-cream-card px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!typedDraft.trim()}
                  className="rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => setShowTypeInput(false)}
                  className="text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {phase === 'idle' || phase === 'error' ? (
                  <button
                    type="button"
                    onClick={beginListening}
                    className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                  >
                    <MicIcon className="h-4 w-4" />
                    {phase === 'error' ? 'Try Again' : debrief ? 'Resume' : 'Start Talking'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-full bg-forest px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                  >
                    Pause mic
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
                  {muted ? 'Unmute coach' : 'Mute coach'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenTypeInput}
                  className="rounded-full border-2 border-hairline bg-cream-card px-5 py-3 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                >
                  Type instead
                </button>
                {debrief && (
                  <button
                    type="button"
                    onClick={handleFinishSession}
                    className="rounded-full border-2 border-hairline bg-cream-card px-5 py-3 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                  >
                    Finish session
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <p className="px-6 pb-6 text-center text-xs text-ink-soft">
        Your voice is never saved — only the conversation text.
      </p>
    </div>
  )
}

// A saved conversation only ever gets bookmarked from its takeaway screen
// (see handleToggleSaved), so talkTakeaway is expected to be set here —
// still guarded defensively in case that ever changes.
function SavedTalkCard({ debrief }: { debrief: Debrief }) {
  const [expanded, setExpanded] = useState(false)
  const takeaway = debrief.talkTakeaway
  return (
    <div className="rounded-xl border border-hairline bg-cream-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <p className="text-sm text-ink">{debrief.incidentText}</p>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-hairline pt-3 text-left">
          {takeaway ? (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-forest">What we explored</p>
                <p className="mt-1 text-sm text-ink">{takeaway.explored}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">What I'll try</p>
                <p className="mt-1 text-sm text-ink">{takeaway.tryNext}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">What I'll notice</p>
                <p className="mt-1 text-sm text-ink">{takeaway.notice}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">No takeaway was saved for this conversation.</p>
          )}
        </div>
      )}
    </div>
  )
}
