import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AnswerSection from '../components/AnswerSection'
import { BrainIcon, MicIcon, StarIcon, WarningIcon } from '../components/icons'
import ClassContextLine from '../components/ClassContextLine'
import SectionLabel from '../components/SectionLabel'
import { TOPICS, topicLabel } from '../lib/topics'
import { pickTopicStarters } from '../lib/starters'
import { handoffArrival, handoffContext, handoffOpeningMessage, setHandoff } from '../lib/handoff'
import { useHandoff } from '../hooks/useHandoff'
import { OFFER_COPY, isOfferKind } from '../lib/talkOffers'
import { DEFAULT_TEACHING_CONTEXT, type TeachingContext } from '../components/TeachingContextFields'
import { SUBJECTS } from '../lib/teachingContext'
import VoiceBars from '../components/VoiceBars'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import {
  generateTalkTakeaway,
  getDebriefs,
  dismissFollowUpForDebrief,
  getFollowUp,
  getProfile,
  makeFollowUpsDueNow,
  saveDebriefReflection,
  sendDebriefChat,
  setDebriefSaved,
  startTalkToMe,
  streamCoachReply,
  type ApiError,
  type CoachFollowUp,
  type ChatMessage,
  type Debrief,
  type TalkTakeaway,
  type TalkVoice,
} from '../lib/api'
import { isExperienced } from '../lib/experience'
import { endTurn, markTurn } from '../lib/turnTiming'
import { createPlaybackQueue, primeAudioElement, type PlaybackQueue } from '../lib/voicePlayback'

// First-person, concrete — things a teacher could plausibly say out loud,
// not generic placeholders. Tapping one starts a real conversation
// immediately via the exact same path a spoken or typed turn uses.
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
// Answers to Coach's check-in question — tapping one starts the conversation
// exactly like any other prompt, with the check-in's plan as context.
const CHECK_IN_PROMPTS = [
  'It went well.',
  'It went okay, but not quite how I planned.',
  "It didn't work.",
  "I haven't had a chance to try it yet.",
]

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
// The orb sits on the dark green stage card, so the one shared colour is gold.
const STATE_STYLES: Record<VisualState, { glow: string; orb: string; dot: string }> = {
  listening: { glow: 'bg-gold/30', orb: 'border-gold/50 bg-gold/20', dot: 'bg-gold' },
  thinking: { glow: 'bg-gold/15', orb: 'border-gold/30 bg-gold/10', dot: 'bg-gold/70' },
  speaking: { glow: 'bg-gold/25', orb: 'border-gold/50 bg-gold/15', dot: 'bg-gold' },
  idle: { glow: 'bg-cream/5', orb: 'border-cream/15 bg-cream/5', dot: 'bg-cream/50' },
  error: { glow: 'bg-terracotta/30', orb: 'border-terracotta/60 bg-terracotta/20', dot: 'bg-terracotta' },
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
  const [searchParams, setSearchParams] = useSearchParams()
  const isDebrief = searchParams.get('mode') === 'debrief'
  const followUpId = searchParams.get('followUp')
  // A past conversation opened from Home's Recent work.
  const openId = searchParams.get('open')
  // The check-in this conversation answers, when opened from Home. Only
  // passed with the first turn; later turns continue that same conversation.
  const [followUp, setFollowUp] = useState<CoachFollowUp | null>(null)
  const followUpRef = useRef<CoachFollowUp | null>(null)
  followUpRef.current = followUp
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
  // The topic chip, held in the URL so a reload or a back-button return keeps
  // the teacher where they were rather than silently dropping their choice.
  // Null means they skipped the chips, which is a first-class answer.
  const topic = searchParams.get('topic')
  // The optional second step, within the chosen topic.
  const kind = searchParams.get('kind')
  // The teacher's default class, used only to pick which starter prompts to
  // show. Null until it loads, and null forever for a teacher who has none —
  // the starters still fill from the general list either way.
  const [room, setRoom] = useState<TeachingContext>(DEFAULT_TEACHING_CONTEXT)
  // A handoff from another surface — today only Lesson Debrief, which hands
  // over a lesson's report instead of opening a conversation of its own.
  //
  // Read once on mount and cleared in the same breath, so coming back here
  // next week does not re-open a lesson the teacher finished talking about.
  // Two kinds land here: a lesson report from Lesson Debrief, and a document
  // review from Look It Over.
  const fromDebrief = useHandoff('debrief_report')
  const fromReview = useHandoff('review_context')
  const arrivedWith = fromDebrief ?? fromReview
  const handoffRef = useRef(arrivedWith)
  const arrival = arrivedWith ? handoffArrival(arrivedWith) : null
  const [showTypeInput, setShowTypeInput] = useState(false)
  const [typedDraft, setTypedDraft] = useState('')
  const [takeaway, setTakeaway] = useState<TalkTakeaway | null>(null)
  const [takeawayLoading, setTakeawayLoading] = useState(false)
  const [takeawayError, setTakeawayError] = useState<string | null>(null)
  const [pastTalks, setPastTalks] = useState<Debrief[]>([])
  const [pastLoading, setPastLoading] = useState(true)
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
  const [experienced, setExperienced] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [testCheckInError, setTestCheckInError] = useState<string | null>(null)
  // Per takeaway: the teacher opted out of the check-in on this one.
  const [checkInOff, setCheckInOff] = useState(false)
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

  useEffect(() => {
    if (!followUpId) {
      setFollowUp(null)
      return
    }
    getFollowUp(followUpId)
      .then((f) => setFollowUp(f.status === 'dismissed' ? null : f))
      .catch(() => setFollowUp(null))
  }, [followUpId])

  // Loaded once up front so a saved takeaway from a past session shows up
  // on the starting screen without waiting on anything else.
  //
  // Opened from Recent work, the page goes straight to that conversation
  // instead of the start screen: its takeaway if it was finished, otherwise
  // paused on the last exchange. Never with the mic on — nobody asked to
  // talk yet, and browsers won't start one without a tap anyway.
  useEffect(() => {
    getDebriefs({ source: 'talk_to_me' })
      .then((all) => {
        setPastTalks(all)
        const opened = openId ? all.find((d) => d.id === openId) : undefined
        if (!opened) return
        handleOpenPast(opened)
        // Once open, the link has done its job — Start over shouldn't land
        // back in the same conversation on the next render or a refresh.
        navigate('/talk', { replace: true })
      })
      .catch(() => {})
      .finally(() => setPastLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setTalkVoice(profile.talkVoice)
        setIsSuperadmin(profile.role === 'superadmin')
        setExperienced(isExperienced(profile.experienceLevel))
      })
      .catch(() => {})
  }, [])

  // Starter prompts, recomputed on every chip tap. No API call by design —
  // a teacher tapping through topics should not wait on anything, and these
  // are the thing that tells a brand-new account where to start, which is the
  // job First 30 Days used to do.
  //
  // With no topic chosen the list spans every topic, so the page is never
  // empty and never pre-supposes a subject the teacher has not picked.
  const examplePrompts = useMemo(() => {
    const picked = pickTopicStarters(topic, room, experienced)
    if (!arrivedWith) return picked
    // Arriving from a report, the first thing offered is the thing they
    // pressed Discuss on. The rest still follow, so a teacher who changed
    // their mind on the way over is not stuck with it.
    return [handoffOpeningMessage(arrivedWith), ...picked].slice(0, picked.length)
  }, [topic, room, experienced, arrivedWith])

  // Read inside the async record -> transcribe -> reply chain, which outlives
  // the render that started it — a ref so the in-flight turn sees the topic
  // that was selected when the teacher began, not a stale closure copy.
  // The chosen topic's own kinds. "Something else" has none by design — it is
  // the chip a teacher taps to say "do not assume anything", so offering it a
  // list of assumptions to pick from would invert its meaning.
  const topicKinds = useMemo(() => TOPICS.find((t) => t.value === topic)?.kinds ?? [], [topic])
  const kindLabel = topicKinds.find((k) => k.value === kind)?.label ?? null

  const topicRef = useRef(topic)
  topicRef.current = topic
  const kindRef = useRef(kind)
  kindRef.current = kind


  // The fresh start screen: no conversation yet, mic idle, not typing. The
  // hero owns the two primary actions in this state, so the lower button row
  // must not repeat them.
  const onStartScreen = !debrief && phase === 'idle' && !showTypeInput

  /// Sets or clears the topic chip. Clearing removes the param rather than
  /// writing an empty one, so a shared or bookmarked URL reads cleanly.
  function setTopic(next: string | null) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('topic', next)
    else params.delete('topic')
    // The sub-options belong to the topic above them, so changing topic drops
    // a narrowing that no longer has anything left to narrow.
    params.delete('kind')
    setSearchParams(params, { replace: true })
  }

  /// Which kind of moment, within the chosen topic. Optional in the same way
  /// the topic is: it moves where Coach opens and nothing else.
  function setKind(next: string | null) {
    const params = new URLSearchParams(searchParams)
    if (next) params.set('kind', next)
    else params.delete('kind')
    setSearchParams(params, { replace: true })
  }

  function beginListening() {
    sessionActiveRef.current = true
    setError(null)
    setPhase('listening')
    start()
  }

  // Coach opens the conversation rather than waiting to be spoken to: a
  // greeting by name, then the mic. A teacher who has just pressed Start
  // Talking should hear a colleague say hello, not silence they have to fill.
  // Resuming an existing conversation, or a muted one with nothing to hear,
  // still goes straight to the mic.
  async function handleStartTalking() {
    const audio = audioRef.current
    if (debrief || mutedRef.current || !audio) {
      beginListening()
      return
    }
    sessionActiveRef.current = true
    setError(null)
    setPhase('thinking')
    const queue = createPlaybackQueue(audio, talkVoiceRef.current, () => setPhase('speaking'))
    queueRef.current = queue
    try {
      const result = await streamCoachReply(
        null,
        null,
        (sentence) => {
          if (!sessionActiveRef.current) return
          queue.push(sentence)
        },
        followUpRef.current?.id,
        topicRef.current,
        handoffRef.current ? handoffContext(handoffRef.current) : null,
        kindRef.current,
      )
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
        const result = current
          ? await sendDebriefChat(current.id, text)
          : await startTalkToMe(text, followUpRef.current?.id, topicRef.current, kindRef.current)
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
      const result = await streamCoachReply(
        current ? current.id : null,
        text,
        (sentence) => {
          if (!sessionActiveRef.current) return
          queue.push(sentence)
        },
        followUpRef.current?.id,
        // Only read on the opening turn; once a conversation exists the server
        // reads the topic back off the stored row.
        topicRef.current,
        // Same: context is background for the first reply, not every turn.
        current ? null : handoffRef.current ? handoffContext(handoffRef.current) : null,
        kindRef.current,
      )
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

  /// Taking an inline offer. Releases the mic first — the teacher is leaving
  /// this page, and a recording left open would keep listening into the next
  /// surface.
  function handleTakeOffer(kind: 'rehearse' | 'document') {
    const situation = [...messages].find((m) => m.role === 'user')?.text ?? ''
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    if (kind === 'rehearse') {
      setHandoff({
        kind: 'rehearse',
        debriefId: debrief?.id ?? '',
        // The teacher's own words, not a summary of them. Rehearsing an
        // approximation of what they just said would be worse than
        // rehearsing their own description of it.
        situation,
        topic: debrief?.focusArea ?? topic,
      })
      navigate('/practice')
      return
    }
    setHandoff({ kind: 'review_document', debriefId: debrief?.id ?? '', about: situation })
    navigate('/look-it-over')
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

  async function handleCheckInOff() {
    if (!debrief) return
    setCheckInOff(true)
    try {
      await dismissFollowUpForDebrief(debrief.id)
    } catch {
      setCheckInOff(false)
    }
  }

  // Superadmin test switch: skip the three-day wait and go see the card.
  async function handleTestCheckInNow() {
    setTestCheckInError(null)
    try {
      const { count } = await makeFollowUpsDueNow()
      if (count === 0) {
        setTestCheckInError('No check-in was scheduled for this session.')
        return
      }
      sessionActiveRef.current = false
      close()
      audioRef.current?.pause()
      navigate('/')
    } catch (err) {
      setTestCheckInError((err as Error).message)
    }
  }

  // Reopens a past conversation in full: its takeaway if it was wrapped up,
  // otherwise paused on the last exchange with Resume. Never with the mic
  // on — reading an old takeaway shouldn't start a conversation.
  // Deleting takes the conversation and its check-in with it, so it asks
  // first; the row disappears as soon as the server confirms.

  function handleOpenPast(past: Debrief) {
    const lastUser = [...(past.conversation ?? [])].reverse().find((m) => m.role === 'user')
    setDebrief(past)
    setUserTranscript(lastUser?.text ?? null)
    setTakeaway(past.talkTakeaway ?? null)
    setCheckInOff(false)
    setTakeawayError(null)
    setError(null)
    setNextStepOpen(false)
    setConversationFull(false)
    window.scrollTo({ top: 0 })
  }

  function handleStartOver() {
    sessionActiveRef.current = false
    close()
    audioRef.current?.pause()
    setDebrief(null)
    setTakeaway(null)
    setTakeawayError(null)
    setUserTranscript(null)
    setCheckInOff(false)
    setConversationFull(false)
    setError(null)
    setNextStepOpen(false)
    setNextStepDraft('')
    setFollowUp(null)
    setPhase('idle')
    // The saved list was loaded when the page opened. A conversation resumed
    // since then has more turns and possibly a newer takeaway, and a stale
    // copy would offer Continue on one that is actually full.
    getDebriefs({ source: 'talk_to_me' })
      .then(setPastTalks)
      .catch(() => {})
    // Also clears ?mode=debrief: starting over from a debrief means an
    // ordinary new conversation, not another debrief of the same plan.
    navigate('/talk', { replace: true })
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
  // Only the latest turn's offer. One from two turns back has been talked
  // past, and re-showing it would be the app pressing a suggestion the
  // teacher already moved on from.
  const offer = isOfferKind(lastAssistant?.offer) ? lastAssistant.offer : null
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

      <header className="flex items-center justify-between bg-forest px-4 py-3 text-cream sm:px-6">
        <p className="font-heading text-base font-bold text-cream">
          {isDebrief ? 'Debrief with Coach' : 'Talk to Coach'}
          <span className="text-terracotta">.</span>
        </p>
        {/* A fast, no-questions-asked way out — deliberately distinct from
            "Finish session" below: this skips the takeaway entirely. */}
        <button type="button" onClick={handleClose} className="text-sm font-medium text-cream/70 hover:text-cream">
          Exit
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        {!supported ? (
          <div className="flex flex-col items-center gap-3">
            <WarningIcon className="h-8 w-8 text-terracotta-600" />
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
                <WarningIcon className="h-8 w-8 text-terracotta-600" />
                <p className="text-sm text-terracotta-600">{takeawayError}</p>
              </div>
            ) : takeaway ? (
              <>
                <div className="flex items-start justify-between gap-3 rounded-3xl bg-forest p-6 text-cream">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                      {isDebrief ? 'Lesson Debrief · Reflect' : 'Talk It Through'}
                    </p>
                    <h1 className="mt-2 font-heading text-2xl font-bold text-cream">
                      {isDebrief ? "Here's your debrief" : "Here's your takeaway"}
                      <span className="text-terracotta">.</span>
                    </h1>
                  </div>
                  <button
                    type="button"
                    hidden={isDebrief}
                    onClick={handleToggleSaved}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                      debrief?.saved
                        ? 'border-gold bg-gold text-forest'
                        : 'border-cream/25 text-cream/80 hover:border-cream hover:text-cream'
                    }`}
                  >
                    <StarIcon className="h-3.5 w-3.5" filled={debrief?.saved} />
                    {debrief?.saved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <AnswerSection n={1} title="What we explored" subtitle="What the conversation was about">
                    {takeaway.explored}
                  </AnswerSection>
                  <AnswerSection n={2} title="What I'll try" subtitle="One step to take into your next lesson">
                    {takeaway.tryNext}
                  </AnswerSection>
                  <AnswerSection n={3} title="What I'll notice" subtitle="How you'll know whether it's working">
                    {takeaway.notice}
                  </AnswerSection>
                  {!isDebrief && (
                    <p className="text-center text-xs text-ink-soft">
                      {checkInOff ? (
                        'Okay — no check-in for this one.'
                      ) : (
                        <>
                          Coach will check in with you about this in a few days ·{' '}
                          <button
                            type="button"
                            onClick={handleCheckInOff}
                            className="font-medium underline decoration-hairline underline-offset-2 hover:text-terracotta-600"
                          >
                            Don't check in on this
                          </button>
                        </>
                      )}
                    </p>
                  )}
                  {!isDebrief && isSuperadmin && !checkInOff && (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={handleTestCheckInNow}
                        className="rounded-full border border-dashed border-terracotta/50 px-3 py-1 text-xs font-medium text-terracotta-600 hover:bg-peach-tint/40"
                      >
                        Admin test: make this check-in due now
                      </button>
                      {testCheckInError && <p className="text-xs text-terracotta-600">{testCheckInError}</p>}
                    </div>
                  )}
                </div>
              </>
            ) : null}
            {isDebrief && takeaway ? (
              <div className="flex flex-col gap-3 border-t border-hairline pt-4">
                {nextStepOpen ? (
                  <div className="flex flex-col gap-2 text-left">
                    <label htmlFor="next-step" className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
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
                        className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
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
                          ? 'border-terracotta bg-peach-tint text-terracotta-600'
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
                  <div className="rounded-2xl bg-mint-tint/50 p-5 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">Your next step</p>
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
            ) : takeaway ? (
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  hidden={atCap}
                  onClick={handleContinueTalking}
                  className="flex items-center gap-2 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                >
                  <MicIcon className="h-4 w-4" />
                  Continue This Conversation
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                >
                  Start a New One
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-3 text-sm font-medium text-ink-soft hover:text-ink"
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
            <div className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl bg-forest px-6 py-12 text-cream shadow-sm sm:px-10">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <span
                  aria-hidden="true"
                  className={`absolute inset-3 rounded-full blur-2xl transition-colors duration-500 ${STATE_STYLES[visualState].glow}`}
                />
                {visualState === 'listening' && (
                  <span
                    aria-hidden="true"
                    className="absolute h-28 w-28 rounded-full border-2 border-gold/40 transition-transform duration-150 ease-out"
                    style={{ transform: `scale(${1 + Math.min(level, 100) / 130})` }}
                  />
                )}
                <div
                  className={`relative flex h-28 w-28 items-center justify-center rounded-full border shadow-sm transition-colors duration-500 ${STATE_STYLES[visualState].orb}`}
                >
                  {/* One live voice signal in place of the mic icon: it follows the
                      teacher's voice while listening, moves like speech while
                      Coach talks, and settles to a calm line when idle. */}
                  {visualState === 'error' ? null : (
                    <VoiceBars
                      mode={visualState}
                      level={level}
                      className={visualState === 'idle' ? 'text-cream/70' : 'text-gold'}
                    />
                  )}
                  {visualState === 'error' && <WarningIcon className="h-10 w-10 text-peach-tint" />}
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
                  visualState === 'error' ? 'text-peach-tint' : 'text-cream/70'
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

              {!debrief && phase === 'idle' && !showTypeInput && (
                <div className="mt-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                    {followUp ? 'Coach is checking in' : isDebrief ? 'Debrief' : 'A moment for your teaching'}
                  </p>
                  <h1 className="mt-2 font-heading text-3xl font-bold text-cream sm:text-4xl">
                    {followUp
                      ? followUp.checkInQuestion
                      : isDebrief
                        ? 'How did it go?'
                        : 'Hi. What would you like to talk about?'}
                  </h1>
                  <p className="mx-auto mt-2 max-w-xl text-base text-cream/70">
                    {followUp
                      ? 'Say how it went — good, bad, or not yet. Coach will take it from there.'
                      : isDebrief
                        ? "Start wherever you like — Coach will walk through the rest with you."
                        : experienced
                          ? 'Think something through out loud, or ask. No wrong place to start.'
                          : 'Talk it through out loud, or ask a question. No wrong place to start.'}
                  </p>
                </div>
              )}

              {/* Start talking and Type instead sit INSIDE the hero, directly
                  under the mic — they are the two ways into the one thing this
                  page does, so they come before the optional topic chips
                  rather than after a scroll past them. Type instead is a real
                  button beside the primary, not a small link: typing is a
                  first-class way to use this, not a fallback. */}
              {onStartScreen && !atCap && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartTalking}
                    className="flex items-center gap-2.5 rounded-full bg-terracotta px-8 py-4 text-base font-semibold text-cream transition-opacity hover:opacity-90"
                  >
                    <MicIcon className="h-5 w-5" />
                    Start talking
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenTypeInput}
                    className="rounded-full border-2 border-cream/25 px-7 py-3.5 text-base font-semibold text-cream/90 transition-colors hover:border-cream/50 hover:text-cream"
                  >
                    Type instead
                  </button>
                </div>
              )}
            </div>

            {!debrief && phase === 'idle' && !showTypeInput ? (
              <div className="flex w-full max-w-3xl flex-col gap-5">
                {followUp && (
                  <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">What you planned to try</p>
                    <p className="mt-1.5 text-sm text-ink">{followUp.plan}</p>
                  </div>
                )}
                {isDebrief && (
                  <ul className="flex flex-col gap-1.5 rounded-2xl bg-mint-tint/50 p-5 text-left">
                    {DEBRIEF_QUESTIONS.map((question) => (
                      <li key={question} className="text-sm text-forest">
                        {question}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Says where they arrived from, so the coach already knowing
                    about their lesson is explained rather than uncanny. */}
                {arrival && (
                  <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-4 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                      {arrival.from}
                    </p>
                    {arrival.label && <p className="mt-1 text-sm text-ink">{arrival.label}</p>}
                    <p className="mt-1 text-xs text-ink-soft">
                      I already have what it found — you do not need to explain it.
                    </p>
                  </div>
                )}

                {/* The topic chips. Below the hero, and labelled as optional
                    in so many words, because the mic is the point and this is
                    a nudge — a teacher who skips it loses nothing. A check-in
                    or a lesson debrief already has its subject, so the chips
                    would be asking a question that is already answered. */}
                {!isDebrief && !followUp && (
                  <div className="flex flex-col gap-2 text-left">
                    <SectionLabel
                      title="Want me focused on something?"
                      hint="Optional — skip it and I'll just listen."
                    />
                    <div className="flex flex-wrap gap-2.5">
                      {TOPICS.map(({ value, label, ghost }) => {
                        const selected = topic === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTopic(selected ? null : value)}
                            aria-pressed={selected}
                            className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors ${
                              selected
                                ? 'border-forest bg-forest text-cream'
                                : ghost
                                  ? 'border-dashed border-ink-soft/40 text-ink-soft hover:border-terracotta/50 hover:text-terracotta-600'
                                  : 'border-hairline bg-cream-card text-ink hover:border-terracotta/50 hover:text-terracotta-600'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>

                    {/* The second step, and the reason it sits here rather
                        than below the starters: it narrows what Coach opens
                        on, so it belongs beside the chip it narrows and above
                        the prompts it changes the meaning of. Still optional,
                        and tapping a selected one clears it. */}
                    {topicKinds.length > 0 && (
                      <div className="mt-1 flex flex-col gap-2">
                        <SectionLabel
                          title="Anything more specific?"
                          hint="Still optional — it only moves where Coach opens."
                        />
                        <div className="flex flex-wrap gap-2">
                        {topicKinds.map(({ value, label }) => {
                          const picked = kind === value
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setKind(picked ? null : value)}
                              aria-pressed={picked}
                              className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                                picked
                                  ? 'border-terracotta bg-terracotta text-cream'
                                  : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/50 hover:text-terracotta-600'
                              }`}
                            >
                              {label}
                            </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Says what the chip will and will not do. "Say anything
                        and it will follow you from there" is the promise the
                        prompt actually keeps — the chip decides sentence one
                        and nothing after it. */}
                    {topic && (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gold-tint/60 px-3 py-2 text-xs">
                        <span className="text-ink">
                          Coach will start from {topicLabel(topic)}
                          {kindLabel ? ` · ${kindLabel}` : ''} — say anything and it will follow you from there.
                        </span>
                        <button
                          type="button"
                          onClick={() => setTopic(null)}
                          className="font-semibold text-terracotta-600 hover:text-terracotta"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Above the starter prompts, because it is the room those
                    prompts are written for — read it before choosing one, not
                    after. Still never a question that has to be answered
                    first: it reports null for a teacher with no class saved,
                    which only changes which prompts get picked. */}
                {!isDebrief && !followUp && (
                  <div className="flex flex-col gap-2 text-left">
                    <SectionLabel title="Your class" hint="What Coach assumes about your room. Change it any time." />
                    <ClassContextLine
                      compact
                      onChange={(prep) =>
                        setRoom((prev) =>
                          prep == null
                            ? prev
                            : {
                                ...prev,
                                gradeBand: prep.gradeBand,
                                subject: prep.subject ?? undefined,
                                course: prep.course ?? undefined,
                                courseLevel: prep.courseLevel ?? undefined,
                                classMakeup: prep.classMakeup,
                                otherSubject:
                                  !!prep.subject && !(SUBJECTS as readonly string[]).includes(prep.subject),
                              },
                        )
                      }
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  {!isDebrief && !followUp && (
                    <SectionLabel
                      title="Or start with one of these"
                      hint="Tap one to begin — you can say anything else instead."
                    />
                  )}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(followUp ? CHECK_IN_PROMPTS : isDebrief ? DEBRIEF_PROMPTS : examplePrompts).map((prompt, i) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitText(prompt)}
                        className={`group flex items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left text-sm font-medium text-forest transition-shadow hover:shadow-md ${
                          ['bg-peach-tint/60', 'bg-gold-tint/60', 'bg-mint-tint/60', 'bg-peach-tint/30'][i % 4]
                        }`}
                      >
                        {prompt}
                        <span aria-hidden="true" className="shrink-0 text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!isDebrief && !followUp && (
                  <Link
                    to="/guide/talk-it-through"
                    className="text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta-600"
                  >
                    New to this? Read the teacher's guide
                  </Link>
                )}

              </div>
            ) : (
              <div className="flex w-full max-w-md flex-col gap-3">
                {userTranscript && (
                  <div className="rounded-2xl border border-hairline bg-cream-card p-5 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">You</p>
                    <p className="mt-1.5 text-sm text-ink">{userTranscript}</p>
                  </div>
                )}
                {lastAssistant && (
                  <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Coach</p>
                    <p className="mt-1.5 text-sm text-ink">{lastAssistant.text}</p>
                  </div>
                )}

                {/* Offered inline, beside the reply, once. Taking it is a
                    choice; ignoring it costs nothing and the conversation
                    carries on — the coach is told to behave as though it had
                    not offered. */}
                {offer && (
                  <button
                    type="button"
                    onClick={() => handleTakeOffer(offer)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-hairline bg-cream-card px-4 py-3 text-left text-sm font-semibold text-forest transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                  >
                    {OFFER_COPY[offer].label}
                    <span aria-hidden="true" className="text-terracotta">
                      {OFFER_COPY[offer].action} →
                    </span>
                  </button>
                )}
                {error && <p className="text-sm text-terracotta-600">{error}</p>}
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
                  className="rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
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
                {/* On a fresh start screen, Start talking and Type instead
                    live in the hero beside the mic, so this row would be
                    showing them a second time. Here it covers the states the
                    hero does not: resuming a conversation, and retrying after
                    an error. */}
                {atCap ? null : phase === 'idle' || phase === 'error' ? (
                  onStartScreen ? null : (
                    <button
                      type="button"
                      onClick={handleStartTalking}
                      className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
                    >
                      <MicIcon className="h-4 w-4" />
                      {phase === 'error' ? 'Try Again' : debrief ? 'Resume' : 'Start talking'}
                    </button>
                  )
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
                      ? 'border-terracotta bg-peach-tint text-terracotta-600'
                      : 'border-hairline bg-cream-card text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                  }`}
                >
                  {muted ? 'Unmute coach' : 'Mute coach'}
                </button>
                <button
                  type="button"
                  hidden={atCap || onStartScreen}
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

            {!debrief && phase === 'idle' && !showTypeInput && !isDebrief && !followUp && (pastLoading || pastTalks.length > 0) && (
              <div className="w-full max-w-md text-left">
                <Link
                  to="/work?surface=talk_it_through"
                  className="inline-block text-sm font-semibold text-terracotta-600 hover:text-terracotta"
                >
                  All your work →
                </Link>
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
