import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrainIcon, MicIcon, StarIcon, WarningIcon } from '../components/icons'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import {
  generateTalkTakeaway,
  getDebriefs,
  getProfile,
  saveDebriefReflection,
  sendDebriefChat,
  setDebriefSaved,
  startTalkToMe,
  streamCoachReply,
  type ApiError,
  type ChatMessage,
  type Debrief,
  type TalkTakeaway,
  type TalkVoice,
} from '../lib/api'
import { endTurn, markTurn } from '../lib/turnTiming'
import { createPlaybackQueue, primeAudioElement, type PlaybackQueue } from '../lib/voicePlayback'

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
// Reached from the "Debrief This Experience" button in the Talk It Through
// teacher's guide (/guide/talk-it-through) via ?mode=debrief. Same
// conversation engine, same backend — only the framing changes, because a
// debrief starts from a plan you already tried rather than from a problem
// you're still inside. The openers are first-person on purpose: they're
// sent verbatim as the teacher's first turn, so they have to be things a
// teacher would actually say.
const DEBRIEF_PROMPTS = [
  'I tried the plan and here\u2019s what happened.',
  'It went better than I expected.',
  'It didn\u2019t really work, and I\u2019m not sure why.',
  'Some of it landed and some of it didn\u2019t.',
]

const DEBRIEF_QUESTIONS = [
  'What did you try?',
  'What happened?',
  'What seemed to help?',
  'What would you adjust next time?',
  'What\u2019s your next step?',
]

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
// Mirrors TALK_TURN_CAP in server/src/lib/coachingChat.ts. Only used to mark
// a saved conversation as full before the teacher taps Continue on it; the
// server enforces the real limit either way, so if these ever drift apart
// the worst case is a Continue that ends with the length-limit message.
const TALK_TURN_CAP = 30

type VisualState = 'idle' | 'error' | 'listening' | 'thinking' | 'speaking'

// Listening, waiting and speaking share one colour. They used to be mint,
// gold and peach, which turned a two-second exchange into three full colour
// changes and made the machinery — rather than the conversation — the thing
// the eye tracked. A person you are talking to does not change colour when
// it is their turn. Only error still breaks the palette, because that one
// genuinely needs to interrupt.
const STATE_STYLES: Record<VisualState, { glow: string; orb: string; dot: string }> = {
  listening: { glow: 'bg-mint-tint', orb: 'border-mint-tint bg-mint-tint/80', dot: 'bg-forest' },
  thinking: { glow: 'bg-mint-tint/60', orb: 'border-mint-tint/70 bg-mint-tint/50', dot: 'bg-forest/60' },
  speaking: { glow: 'bg-mint-tint/80', orb: 'border-mint-tint bg-mint-tint/65', dot: 'bg-forest' },
  idle: { glow: 'bg-cream-card', orb: 'border-hairline bg-cream-card', dot: 'bg-ink-soft' },
  error: { glow: 'bg-warm-100', orb: 'border-warm-100 bg-warm-100', dot: 'bg-warm-500' },
}

function statusLabel(state: VisualState, hasConversation: boolean): string {
  switch (state) {
    case 'listening':
      // One stable string rather than swapping on volume — the caption used
      // to flicker between two phrasings every time the teacher paused for
      // breath, which drew the eye to the label instead of the conversation.
      return "I'm listening"
    case 'thinking':
      return 'One moment'
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

export default function TalkToMe() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDebrief = searchParams.get('mode') === 'debrief'
  const [phase, setPhase] = useState<Phase>('idle')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
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
  // Set when the server refuses a turn because this conversation is at its
  // length limit (see TALK_TURN_CAP) — distinct from an error, see
  // handleTurnFailed.
  const [conversationFull, setConversationFull] = useState(false)
  // Debrief-mode only: the "Set a Next Step" note, persisted as the
  // conversation's reflectionNote (the same field Ask and Practice already
  // use for "what happened when you tried it").
  const [nextStepOpen, setNextStepOpen] = useState(false)
  const [nextStepDraft, setNextStepDraft] = useState('')
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
  // The in-flight reply's playback queue, so Stop/Close can silence a reply
  // that is still arriving sentence by sentence — pausing the <audio>
  // element alone would only stop the clip currently playing, and the next
  // queued sentence would start moments later.
  const queueRef = useRef<PlaybackQueue | null>(null)

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
      if (audio) primeAudioElement(audio)
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
    markTurn('transcribe')
    setUserTranscript(text)
    setPhase('thinking')

    // Muted: there is nothing to speak, so there is nothing to overlap —
    // take the plain request and skip the streaming machinery entirely.
    if (mutedRef.current) {
      try {
        const current = debriefRef.current
        const result = current ? await sendDebriefChat(current.id, text) : await startTalkToMe(text)
        setDebrief(result)
        resumeListeningIfActive()
      } catch (err) {
        if (!sessionActiveRef.current) return
        handleTurnFailed(err as ApiError)
      }
      return
    }

    const audio = audioRef.current
    if (!audio) {
      resumeListeningIfActive()
      return
    }
    // Each sentence starts synthesizing the instant Claude finishes writing
    // it, so Coach starts speaking while the rest of the reply is still
    // being generated rather than after all of it is.
    const queue = createPlaybackQueue(audio, talkVoiceRef.current, () => {
      markTurn('speak')
      endTurn()
      setPhase('speaking')
    })
    queueRef.current = queue
    try {
      const current = debriefRef.current
      const result = await streamCoachReply(current ? current.id : null, text, (sentence) => {
        if (!sessionActiveRef.current) return
        queue.push(sentence)
      })
      setDebrief(result)
      queue.end()
      await queue.finished
      queueRef.current = null
      resumeListeningIfActive()
    } catch (err) {
      queue.cancel()
      queueRef.current = null
      if (!sessionActiveRef.current) return
      handleTurnFailed(err as ApiError)
    }
  }

  // A full conversation is an expected ending, not a fault. Showing it as an
  // error offered "Try Again", which could only ever hit the same limit, so
  // it stops the mic instead and leaves Finish as the obvious next step.
  function handleTurnFailed(err: ApiError) {
    if (err.status === 409) {
      sessionActiveRef.current = false
      close()
      setConversationFull(true)
      setError(err.message)
      setPhase('idle')
      return
    }
    setError(err.message || 'Could not reach Coach. Please try again.')
    setPhase('error')
  }

  function handleStop() {
    sessionActiveRef.current = false
    close()
    queueRef.current?.cancel()
    queueRef.current = null
    audioRef.current?.pause()
    setPhase('idle')
  }

  function handleClose() {
    sessionActiveRef.current = false
    close()
    queueRef.current?.cancel()
    queueRef.current = null
    audioRef.current?.pause()
    navigate('/')
  }

  // Shared entry point for both an example-prompt tap and a typed
  // submission — exactly the same path a real transcribed turn already
  // uses, streamed reply and all.
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

  // "Continue This Conversation" — drop back out of the takeaway screen into
  // the live session rather than starting over, so the whole conversation
  // stays intact and Coach keeps its context.
  function handleContinueTalking() {
    setTakeaway(null)
    setTakeawayError(null)
    setNextStepOpen(false)
    beginListening()
  }

  // Picks a saved conversation back up. It becomes the live conversation, so
  // every turn from here goes to the same record and Coach receives the whole
  // history — the same path "Continue This Conversation" above already takes
  // from the takeaway screen, entered from the start screen instead.
  //
  // The teacher's last line is put back on screen next to Coach's (which
  // shows on its own, from the conversation), so it is obvious where they
  // left off before they start speaking.
  function handleContinuePast(past: Debrief) {
    const lastUser = [...(past.conversation ?? [])].reverse().find((m) => m.role === 'user')
    setDebrief(past)
    setUserTranscript(lastUser?.text ?? null)
    setTakeaway(null)
    setTakeawayError(null)
    setNextStepOpen(false)
    setConversationFull(false)
    beginListening()
  }

  function handleStartOver() {
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    setDebrief(null)
    setTakeaway(null)
    setTakeawayError(null)
    setUserTranscript(null)
    setConversationFull(false)
    setError(null)
    setNextStepOpen(false)
    setNextStepDraft('')
    setPhase('idle')
    // The saved list was loaded when the page opened. A conversation resumed
    // since then has more turns and possibly a newer takeaway, and a stale
    // copy would offer Continue on one that is actually full.
    getDebriefs({ source: 'talk_to_me' })
      .then((all) => setSavedTalks(all.filter((d) => d.saved)))
      .catch(() => {})
    // Also clears ?mode=debrief: starting over from a debrief means an
    // ordinary new conversation, not another debrief of the same plan.
    navigate('/talk-to-me', { replace: true })
  }

  async function handleSaveNextStep() {
    const note = nextStepDraft.trim()
    if (!debrief || !note) return
    try {
      const updated = await saveDebriefReflection(debrief.id, note)
      setDebrief(updated)
      setNextStepOpen(false)
    } catch {
      setError('Could not save that next step. Please try again.')
    }
  }

  const messages: ChatMessage[] = debrief?.conversation ?? []
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  // Full either because the server just said so, or because the count says
  // so already — a conversation can be resumed from its takeaway screen
  // without ever having hit the refusal in this session.
  const atCap = conversationFull || messages.filter((m) => m.role === 'user').length >= TALK_TURN_CAP
  const finishing = takeawayLoading || takeaway != null || takeawayError != null

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* Must render as a genuinely laid-out element, not display:none —
          Chromium's own UA stylesheet has `audio:not([controls]) {
          display: none !important }`, which no inline/author style can
          override (confirmed: setting display:block inline still computed
          to none until `controls` was added). Without a real layout box,
          Chrome's background-media power-saving policy also suspends the
          element, rejecting play() with "video-only background media was
          paused to save power" the moment it's called — the exact,
          confirmed cause of this playing fine on Safari (no such policy)
          and silently failing on Chrome. The `controls` attribute escapes
          that UA rule; opacity/size/position then hide the native player
          UI without display:none ever coming back into play. */}
      <audio
        ref={audioRef}
        crossOrigin="use-credentials"
        controls
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />

      <header className="flex items-center justify-between border-b border-hairline bg-cream-card px-4 py-3">
        <p className="font-heading text-base font-bold text-forest">
          {isDebrief ? 'Debrief with Coach' : 'Talk to Coach'}
        </p>
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
                  <h1 className="font-heading text-xl font-bold text-forest">
                    {isDebrief ? "Here's your debrief" : "Here's your takeaway"}
                  </h1>
                  <button
                    type="button"
                    hidden={isDebrief}
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
            {isDebrief && takeaway ? (
              <div className="flex flex-col gap-3 border-t border-hairline pt-4">
                {nextStepOpen ? (
                  <div className="flex flex-col gap-2 text-left">
                    <label htmlFor="next-step" className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
                      Your next step
                    </label>
                    <textarea
                      id="next-step"
                      autoFocus
                      rows={2}
                      value={nextStepDraft}
                      onChange={(e) => setNextStepDraft(e.target.value)}
                      placeholder="The one thing I'll do next..."
                      className="rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/40 focus:outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSaveNextStep}
                        disabled={!nextStepDraft.trim()}
                        className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        Save next step
                      </button>
                      <button
                        type="button"
                        onClick={() => setNextStepOpen(false)}
                        className="text-sm font-medium text-ink-soft hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      hidden={atCap}
                      onClick={handleContinueTalking}
                      className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                    >
                      Continue This Conversation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Seeded with what Coach heard you commit to, so the
                        // common case is confirming a sentence, not writing one.
                        setNextStepDraft((draft) => draft || takeaway.tryNext)
                        setNextStepOpen(true)
                      }}
                      className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                    >
                      {debrief?.reflectionNote ? 'Edit My Next Step' : 'Set a Next Step'}
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSaved}
                      className={`flex items-center gap-1.5 rounded-full border-2 px-5 py-2.5 text-sm font-semibold transition-colors ${
                        debrief?.saved
                          ? 'border-warm-500 bg-warm-100 text-warm-500'
                          : 'border-hairline bg-cream-card text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                      }`}
                    >
                      <StarIcon className="h-3.5 w-3.5" filled={debrief?.saved} />
                      {debrief?.saved ? 'Reflection Saved' : 'Save My Reflection'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                    >
                      Start a New Talk It Through
                    </button>
                    {debrief && (
                      <Link
                        to={`/talk-to-me/${debrief.id}/export`}
                        className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                      >
                        Export / Print
                      </Link>
                    )}
                  </div>
                )}
                {debrief?.reflectionNote && !nextStepOpen && (
                  <div className="rounded-xl bg-mint-tint/40 p-4 text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest">Your next step</p>
                    <p className="mt-1 text-sm text-ink">{debrief.reflectionNote}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="self-center text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="self-center rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
              >
                Done
              </button>
            )}
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
                    // Three settling dots, the same shape every messaging app
                    // uses for "they are typing" — it reads as the other side
                    // of a conversation composing a reply. The brain icon it
                    // replaces read as a machine processing a job.
                    <span className="flex items-center gap-1.5" aria-hidden="true">
                      {[0, 160, 320].map((delay) => (
                        <span
                          key={delay}
                          className="h-2 w-2 animate-bounce rounded-full bg-forest/50"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                  )}
                  {visualState === 'speaking' && (
                    <span className="flex h-9 items-end gap-1" aria-hidden="true">
                      {[10, 22, 14, 28, 16].map((barHeight, i) => (
                        <span
                          key={barHeight}
                          className="w-1.5 animate-pulse rounded-full bg-forest/70"
                          style={{ height: `${barHeight}px`, animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </span>
                  )}
                  {visualState === 'idle' && <MicIcon className="h-10 w-10 text-ink-soft" />}
                  {visualState === 'error' && <WarningIcon className="h-10 w-10 text-warm-500" />}
                </div>
              </div>
              {/* A filled chip that changed colour on every turn was competing
                  with the orb for attention. Quiet text carries the same
                  information and stops the status from being the loudest
                  thing on screen. aria-live keeps it doing the job it was
                  silently already doing for sighted users only: saying whose
                  turn it is. */}
              <div
                aria-live="polite"
                className={`flex items-center gap-2 text-xs font-medium transition-colors duration-500 ${
                  visualState === 'error' ? 'text-warm-500' : 'text-ink-soft'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${STATE_STYLES[visualState].dot} ${
                    visualState === 'thinking' || visualState === 'speaking' ? 'animate-pulse' : ''
                  }`}
                />
                {statusLabel(visualState, debrief != null)}
              </div>

            </div>

            {!debrief && phase === 'idle' && !showTypeInput ? (
              <div className="flex w-full max-w-md flex-col gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {isDebrief ? 'Debrief' : 'A moment for your teaching'}
                  </p>
                  <h1 className="mt-1 font-heading text-2xl font-bold text-forest">
                    {isDebrief ? 'How did it go?' : "What's on your mind today?"}
                  </h1>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    {isDebrief
                      ? "Start wherever you like — Coach will walk through the rest with you."
                      : 'Talk through a challenge, find the right words, or reflect on your day.'}
                  </p>
                </div>
                {isDebrief && (
                  <ul className="flex flex-col gap-1.5 rounded-xl bg-mint-tint/40 p-4 text-left">
                    {DEBRIEF_QUESTIONS.map((question) => (
                      <li key={question} className="text-sm text-forest">
                        {question}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  {(isDebrief ? DEBRIEF_PROMPTS : EXAMPLE_PROMPTS).map((prompt) => (
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

                {!isDebrief && (
                  <Link
                    to="/guide/talk-it-through"
                    className="text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta-600"
                  >
                    New to this? Read the teacher's guide
                  </Link>
                )}

                {savedTalks.length > 0 && (
                  <div className="flex flex-col gap-2 text-left">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      Past conversations
                    </p>
                    <div className="flex flex-col gap-2">
                      {savedTalks.map((d) => (
                        <SavedTalkCard key={d.id} debrief={d} onContinue={() => handleContinuePast(d)} />
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
                {atCap ? null : phase === 'idle' || phase === 'error' ? (
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
                  hidden={atCap}
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
function SavedTalkCard({ debrief, onContinue }: { debrief: Debrief; onContinue: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const takeaway = debrief.talkTakeaway
  const turnsUsed = (debrief.conversation ?? []).filter((m) => m.role === 'user').length
  const full = turnsUsed >= TALK_TURN_CAP
  return (
    <div className="rounded-xl border border-hairline bg-cream-card p-4">
      <div className="flex w-full items-start justify-between gap-3 text-left">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex-1 text-left">
          <p className="text-sm text-ink">{debrief.incidentText}</p>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {/* Two separate actions rather than one card-wide tap target:
              reading a takeaway should never accidentally switch the
              microphone on. */}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-ink-soft hover:text-ink"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
          {full ? (
            <span className="text-xs font-medium text-ink-soft" title="This conversation has reached its length limit.">
              Full
            </span>
          ) : (
            <button
              type="button"
              onClick={onContinue}
              className="flex items-center gap-1 rounded-full bg-terracotta px-3 py-1 text-xs font-semibold text-cream transition-opacity hover:opacity-90"
            >
              <MicIcon className="h-3 w-3" />
              Continue
            </button>
          )}
        </div>
      </div>
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
