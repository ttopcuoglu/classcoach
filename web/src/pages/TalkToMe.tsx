import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AnswerSection from '../components/AnswerSection'
import { BrainIcon, MicIcon, StarIcon, WarningIcon } from '../components/icons'
import VoiceBars from '../components/VoiceBars'
import PastList from '../components/PastList'
import SectionLabel from '../components/SectionLabel'
import { SOMETHING_ELSE, TOPICS, kindLabel, kindsFor, topicLabel } from '../lib/topics'
import { pickTopicStarters } from '../lib/starters'
import { DEFAULT_TEACHING_CONTEXT, type TeachingContext } from '../components/TeachingContextFields'
import { SUBJECTS, bandFromProfile, subjectFromProfile } from '../lib/teachingContext'
import { useVoiceTurn } from '../hooks/useVoiceTurn'
import {
  deleteDebrief,
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
import { createPlaybackQueue, loadFillers, primeAudioElement, type Fillers, type PlaybackQueue } from '../lib/voicePlayback'

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
  const [searchParams] = useSearchParams()
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
  // The optional topic chips, and the second step inside a chosen topic. Local
  // rather than in the URL: this is a nudge toward a starting point, not a
  // place a teacher would bookmark or share.
  const [topic, setTopic] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [experienced, setExperienced] = useState(false)
  // Only used to narrow which starter prompts are worth showing — a K-2 room
  // and a 9-12 room are not stuck on the same things.
  const [room, setRoom] = useState<TeachingContext>(DEFAULT_TEACHING_CONTEXT)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [testCheckInError, setTestCheckInError] = useState<string | null>(null)
  // Per takeaway: the teacher opted out of the check-in on this one.
  const [checkInOff, setCheckInOff] = useState(false)
  const talkVoiceRef = useRef<TalkVoice | null>(null)
  talkVoiceRef.current = talkVoice
  // Read inside timers and audio callbacks, which capture the render they
  // were created in and would otherwise test a stale phase.
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  // Typing is a mode, not a one-off. While it is open, replies come back as
  // text and the microphone stays out of it — the async turn handler reads
  // this rather than the state, because it is mid-flight when this changes.
  const chatRef = useRef(showTypeInput)
  chatRef.current = showTypeInput
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
  // What the teacher said in a turn that ended too early, waiting to be sent
  // together with how they finished it. See handleTurnComplete.
  const carriedTextRef = useRef('')

  // True from the moment the teacher talks over Coach until the interrupted
  // reply has finished unwinding, so the usual "listen again when playback
  // ends" does not start a second turn on top of the one already listening.
  const bargedInRef = useRef(false)
  // Pre-made thinking sounds for the gap while Claude writes. Loaded once a
  // conversation, in the teacher's own Coach voice.
  const fillersRef = useRef<Fillers | null>(null)
  // Thinking sounds get their own element. Sharing one with Coach's speech
  // meant the reply's src assignment cut a filler dead mid-word; separate
  // elements let the filler fade under the reply instead, which is the
  // difference between a splice and a person trailing off.
  const fillerAudioRef = useRef<HTMLAudioElement | null>(null)
  const fillerTimerRef = useRef<number | null>(null)
  // Resolves when Coach may start speaking: immediately, or once a thinking
  // sound that was nearly finished has finished. Every sentence of the reply
  // waits on the same promise, so they still play in order.
  const thinkingHandoffRef = useRef<Promise<void> | null>(null)
  // The reply currently being streamed, whether or not it is still audible.
  // An interruption starts the next turn immediately, so that turn has to
  // wait for this to settle before it asks for anything — otherwise its
  // request can go out before the conversation it belongs to exists.
  const pendingReplyRef = useRef<Promise<unknown> | null>(null)
  const replyInFlightRef = useRef(false)

  // Remembers a reply while it is being streamed, so a turn that starts
  // before it has landed (which only happens when the teacher interrupts)
  // can wait for it rather than racing it.
  function trackReply<T>(reply: Promise<T>): Promise<T> {
    replyInFlightRef.current = true
    pendingReplyRef.current = reply
    void reply
      .catch(() => {})
      .finally(() => {
        if (pendingReplyRef.current === reply) {
          replyInFlightRef.current = false
          pendingReplyRef.current = null
        }
      })
    return reply
  }

  // A reply started during the pause at the end of a turn, before the turn
  // was officially over. Its sentences are held rather than spoken until the
  // turn actually ends and the draft it answered turns out to be what the
  // teacher said. See onSpeculate below.
  type Speculation = {
    text: string
    controller: AbortController
    buffered: string[]
    reply: Promise<Debrief>
    // Set when the turn ends and this reply is the one being played.
    queue: PlaybackQueue | null
    onPlaying: () => void
    // Set when this reply commits: pushes a sentence through the same hold
    // the first one waited on, so they cannot arrive out of order.
    speak: (sentence: string) => void
  }
  const speculationRef = useRef<Speculation | null>(null)

  const { supported, level, fatalError, transcribing, start, close, watchForResume, watchWhileSpeaking } = useVoiceTurn(
    handleTurnComplete,
    { onSpeculate: handleSpeculate, onSpeculationStale: dropSpeculation },
  )

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
      // Same unlock, same gesture: a filler is played programmatically too.
      const filler = fillerAudioRef.current
      if (filler) primeAudioElement(filler)
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

  // Teardown used to live only in Exit, the single way off a full-screen
  // page. Inside the Layout the sidebar is a second way out, and leaving
  // through it would have left the socket open, the microphone live and Coach
  // talking into an empty room.
  useEffect(() => {
    return () => {
      sessionActiveRef.current = false
      close()
      if (fillerTimerRef.current) window.clearTimeout(fillerTimerRef.current)
      fillersRef.current?.release()
      fillersRef.current = null
      // A reply started during a pause is in flight on its own; leaving the
      // page has to stop it too, or it finishes and saves a turn into a
      // conversation the teacher has walked away from.
      speculationRef.current?.controller.abort()
      speculationRef.current = null
      queueRef.current?.cancel()
      queueRef.current = null
      // Read at unmount deliberately: the playback queue is created part-way
      // through a session, so capturing it when the effect ran would tear down
      // the wrong object, or nothing at all.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      audioRef.current?.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        navigate('/talk-to-me', { replace: true })
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
        const mapped = subjectFromProfile(profile.subjects)
        setRoom((prev) => ({
          ...prev,
          gradeBand: bandFromProfile(profile.gradeLevels),
          subject: mapped,
          otherSubject: !!mapped && !(SUBJECTS as readonly string[]).includes(mapped),
        }))
      })
      .catch(() => {})
  }, [])

  // The fresh start screen: no conversation yet, nothing in flight, not
  // typing. The hero owns the two buttons here; every other state leaves them
  // to the row under the transcript.
  const onStartScreen = !debrief && phase === 'idle' && !showTypeInput

  function beginListening() {
    sessionActiveRef.current = true
    // Fetched once per conversation, while the teacher is drawing breath to
    // speak rather than while they wait for an answer.
    if (!fillersRef.current) {
      void loadFillers(talkVoiceRef.current).then((fillers) => {
        if (sessionActiveRef.current) fillersRef.current = fillers
        else fillers.release()
      })
    }
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
    // A chosen topic becomes the opening line, so Coach starts inside the
    // subject rather than opening by asking what it is about.
    if (topic && !debrief) {
      startFocused(topic, kind)
      return
    }
    const audio = audioRef.current
    if (debrief || mutedRef.current || !audio) {
      beginListening()
      return
    }
    sessionActiveRef.current = true
    setError(null)
    setPhase('thinking')
    // Held in an object rather than a plain variable: it is assigned inside
    // the playback callback, which the compiler cannot follow.
    const bargeIn: { stop: (() => void) | null } = { stop: null }
    const queue = createPlaybackQueue(audio, talkVoiceRef.current, () => {
      cancelThinkingSound()
      setPhase('speaking')
      phaseRef.current = 'speaking'
      bargeIn.stop = watchWhileSpeaking(handleBargeIn)
    })
    queueRef.current = queue
    try {
      const reply = streamCoachReply(
        null,
        null,
        (sentence) => {
          if (!sessionActiveRef.current) return
          queue.push(sentence)
        },
        followUpRef.current?.id,
      )
      const result = await trackReply(reply)
      setDebrief(result)
      queue.end()
      await queue.finished
      bargeIn.stop?.()
      queueRef.current = null
      if (bargedInRef.current) {
        // Already listening to the interruption.
        bargedInRef.current = false
        return
      }
      resumeListeningIfActive()
    } catch (err) {
      bargeIn.stop?.()
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

  // Coach makes a noise while it thinks, the way a colleague would, rather
  // than leaving the teacher with a second of silence after every sentence
  // they finish. Scheduled rather than immediate: a reply that arrives
  // quickly (a speculative one, usually) should just be spoken, with no
  // "hmm" in front of it.
  // Sooner than it was: at 400ms the pause had already registered as silence
  // before Coach made a sound, and starting earlier also leaves more of the
  // ~1.2s before the reply for the clip to play in.
  const FILLER_AFTER_MS = 250

  // Long enough not to click, short enough that Coach's first word is not
  // competing with a filler still trailing off underneath it.
  const FILLER_FADE_MS = 120

  function startThinkingSound() {
    cancelThinkingSound()
    fillerTimerRef.current = window.setTimeout(() => {
      const audio = fillerAudioRef.current
      const clip = fillersRef.current?.next()
      // Only into silence: once Coach is speaking, or the teacher is, a
      // thinking sound would be talking over one of them.
      if (!audio || !clip || !sessionActiveRef.current || phaseRef.current !== 'thinking') return
      audio.volume = 1
      audio.src = clip
      void audio.play().catch(() => {})
    }, FILLER_AFTER_MS)
  }

  // A thinking sound with this little left to play is worth waiting out:
  // Coach answering over the last syllable of its own "hmm" sounds worse
  // than a beat of silence, and a beat is all it costs.
  const HOLD_FOR_FILLER_MS = 400

  function cancelThinkingSound() {
    if (fillerTimerRef.current) window.clearTimeout(fillerTimerRef.current)
    fillerTimerRef.current = null
    fadeOutThinkingSound()
  }

  /// Called when Coach's first sentence exists. Resolves when it may be
  /// spoken — at once, having faded the filler under it, or after letting a
  /// nearly-finished one play out.
  function handOffFromThinkingSound(): Promise<void> {
    if (fillerTimerRef.current) window.clearTimeout(fillerTimerRef.current)
    fillerTimerRef.current = null

    const audio = fillerAudioRef.current
    if (!audio || audio.paused) return Promise.resolve()
    const remaining = (audio.duration || 0) - audio.currentTime
    if (Number.isFinite(remaining) && remaining > 0 && remaining <= HOLD_FOR_FILLER_MS / 1000) {
      return new Promise((resolve) => window.setTimeout(resolve, remaining * 1000))
    }
    fadeOutThinkingSound()
    return Promise.resolve()
  }

  function fadeOutThinkingSound() {
    // Fade rather than stop: a filler cut mid-word is the "chopped" sound
    // this feature is supposed to avoid. Coach's first word arrives over the
    // last of it, which is how one person stops as another starts.
    const audio = fillerAudioRef.current
    if (!audio || audio.paused) return
    const steps = 6
    let step = 0
    const fade = window.setInterval(() => {
      step += 1
      audio.volume = Math.max(0, 1 - step / steps)
      if (step < steps) return
      window.clearInterval(fade)
      audio.pause()
      audio.volume = 1
    }, FILLER_FADE_MS / steps)
  }

  /// Every sentence goes through here so they stay in order behind a hold.
  function speak(queue: PlaybackQueue, sentence: string) {
    const handoff = thinkingHandoffRef.current ?? (thinkingHandoffRef.current = handOffFromThinkingSound())
    void handoff.then(() => queue.push(sentence))
  }

  // The teacher started talking over Coach. Stop the speech, and start
  // listening at once so the first words of the interruption are captured.
  //
  // The reply itself is deliberately NOT cancelled. It is already written,
  // and letting it finish keeps the conversation (and what Coach remembers)
  // honest about what was said — a half-saved reply would have Coach
  // repeating the advice the teacher cut off. They simply stop hearing it.
  function handleBargeIn() {
    if (!sessionActiveRef.current || bargedInRef.current) return
    bargedInRef.current = true
    cancelThinkingSound()
    markTurn('barge_in')
    queueRef.current?.cancel()
    queueRef.current = null
    beginListening()
  }

  // Same words, ignoring the punctuation and capitalisation Deepgram only
  // settles on in the final result.
  function sameWords(a: string, b: string): boolean {
    const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
    return normalize(a) === normalize(b)
  }

  // The teacher has gone quiet but the turn is not over yet. Claude takes
  // over a second to write its first sentence, and the silence window is
  // most of another, so those two seconds can overlap instead of running one
  // after the other: the reply starts now and is held until the turn really
  // ends. If they were only drawing breath, it is thrown away — the server
  // saves nothing for a reply nobody heard (see streamCoachReply there).
  function handleSpeculate(draft: string) {
    if (!sessionActiveRef.current || mutedRef.current || chatRef.current) return
    if (speculationRef.current || !audioRef.current) return
    // A reply is still streaming (the teacher interrupted it). Speculating
    // now would ask on behalf of a conversation that may not exist yet.
    if (replyInFlightRef.current) return
    const controller = new AbortController()
    const spec: Speculation = {
      text: draft,
      controller,
      buffered: [],
      queue: null,
      onPlaying: () => {},
      speak: () => {},
      reply: null as unknown as Promise<Debrief>,
    }
    spec.reply = streamCoachReply(
      debriefRef.current?.id ?? null,
      draft,
      (sentence) => {
        if (spec.queue) {
          spec.onPlaying()
          spec.speak(sentence)
        } else {
          spec.buffered.push(sentence)
        }
      },
      followUpRef.current?.id,
      controller.signal,
    )
    // Nothing awaits this until the turn ends, and it may never be awaited at
    // all, so its rejection is absorbed here and re-read later if it matters.
    spec.reply.catch(() => {})
    speculationRef.current = spec
    markTurn('speculate')
  }

  function dropSpeculation() {
    const spec = speculationRef.current
    if (!spec) return
    speculationRef.current = null
    spec.controller.abort()
  }

  async function handleTurnComplete(newText: string) {
    // A turn that ended while the teacher was still mid-thought left its
    // words here; they belong to the same sentence, so they are sent as one.
    const carried = carriedTextRef.current
    carriedTextRef.current = ''
    // Either half can be empty: a resume that turned out to be a cough leaves
    // nothing new to add, and the carried half still has to be answered.
    const text = [carried, newText].filter(Boolean).join(' ')
    if (!text) {
      // Nothing was said after all, so a reply started during the pause is
      // answering a draft that no longer exists.
      dropSpeculation()
      // Silence timer fired with nothing said (or a benign recognition
      // hiccup) — just listen again rather than bothering the backend.
      resumeListeningIfActive()
      return
    }
    markTurn('transcribe')
    setUserTranscript(text)
    setPhase('thinking')

    phaseRef.current = 'thinking'
    thinkingHandoffRef.current = null
    startThinkingSound()

    // After an interruption the previous reply may still be arriving. It
    // carries the conversation this turn belongs to, so wait for it — on
    // every other turn it has long since settled and this costs nothing.
    if (pendingReplyRef.current) await pendingReplyRef.current.catch(() => {})

    // Nothing to speak, so nothing to overlap — take the plain request and
    // skip the streaming machinery entirely. True when muted, and true while
    // the teacher is typing: a written exchange that talked back would be
    // answering a question nobody asked out loud.
    if (mutedRef.current || chatRef.current) {
      try {
        const current = debriefRef.current
        const result = current
          ? await sendDebriefChat(current.id, text)
          : await startTalkToMe(text, followUpRef.current?.id)
        setDebrief(result)
        // A typed turn comes back to the keyboard, so settle to idle. Calling
        // resumeListeningIfActive here would no-op — there is no live session —
        // and leave the page stuck on "thinking" with Coach's reply already on
        // screen underneath it.
        if (chatRef.current) setPhase('idle')
        else resumeListeningIfActive()
      } catch (err) {
        // The guard below means "the teacher already left, drop it", and it is
        // right for a spoken turn. A typed one has no live session by design,
        // so without the chat exemption a failure would be swallowed whole: the
        // box clears, no reply arrives, and nothing says why.
        if (!sessionActiveRef.current && !chatRef.current) return
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
    // A reply started during the pause only counts if the draft it answered
    // is what the teacher actually said. Otherwise it answered half a
    // thought, and is dropped for a fresh request with the whole one.
    const pending = speculationRef.current
    speculationRef.current = null
    const committed = pending && sameWords(pending.text, text) ? pending : null
    if (pending && !committed) pending.controller.abort()
    if (committed) markTurn('speculation_used')

    // Held in an object rather than a plain variable: it is assigned inside
    // the playback callback, which the compiler cannot follow.
    const bargeIn: { stop: (() => void) | null } = { stop: null }
    const queue = createPlaybackQueue(audio, talkVoiceRef.current, () => {
      cancelThinkingSound()
      markTurn('speak')
      endTurn()
      setPhase('speaking')
      phaseRef.current = 'speaking'
      // Coach is audible now, so the microphone switches from "did they
      // carry on?" to the much harder-to-trigger "are they talking over
      // this?" — see watchWhileSpeaking.
      stopWatching()
      bargeIn.stop = watchWhileSpeaking(handleBargeIn)
    })
    queueRef.current = queue

    // The end of a turn is a guess from a silence timer, and the waits are
    // short (turnEndpointing.ts). So until Coach is actually audible, keep
    // listening: a teacher who was only drawing breath gets their reply
    // dropped and their turn continued, rather than being answered
    // mid-thought and losing what they said next.
    const resumption = committed ? committed.controller : new AbortController()
    let resumed = false
    const stopWatching = watchForResume(() => {
      resumed = true
      carriedTextRef.current = text
      resumption.abort()
    })

    try {
      const current = debriefRef.current
      let result: Debrief
      if (committed) {
        // Everything written during the pause is already in hand; it plays
        // immediately, and the rest of the reply streams into the same queue.
        committed.onPlaying = stopWatching
        committed.queue = queue
        committed.speak = (sentence) => speak(queue, sentence)
        for (const sentence of committed.buffered) {
          stopWatching()
          speak(queue, sentence)
        }
        committed.buffered = []
        result = await trackReply(committed.reply)
      } else {
        result = await trackReply(
          streamCoachReply(
            current ? current.id : null,
            text,
            (sentence) => {
              if (!sessionActiveRef.current) return
              // First sentence in hand means Coach is about to speak, so the
              // microphone stops listening for a continuation.
              stopWatching()
              queue.push(sentence)
            },
            followUpRef.current?.id,
            resumption.signal,
          ),
        )
      }
      setDebrief(result)
      queue.end()
      await queue.finished
      bargeIn.stop?.()
      queueRef.current = null
      if (bargedInRef.current) {
        // The teacher is already mid-turn; do not start another one.
        bargedInRef.current = false
        return
      }
      resumeListeningIfActive()
    } catch (err) {
      stopWatching()
      bargeIn.stop?.()
      queue.cancel()
      queueRef.current = null
      if (resumed) {
        // Not a failure: the teacher is still talking. Their words are held
        // in carriedTextRef and this turn simply carries on.
        resumeListeningIfActive()
        return
      }
      if (!sessionActiveRef.current) return
      handleTurnFailed(err as ApiError)
    } finally {
      stopWatching()
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
    cancelThinkingSound()
    dropSpeculation()
    queueRef.current?.cancel()
    queueRef.current = null
    audioRef.current?.pause()
    setPhase('idle')
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

  /// The opening line a chosen topic turns into.
  ///
  /// Sent as the teacher's own first message rather than tucked into a system
  /// prompt, for two reasons: being in the conversation means it still steers
  /// Coach ten turns later, where a one-off prompt tweak would have stopped
  /// counting; and the teacher can see exactly what Coach was told about them.
  function focusOpener(topicValue: string, kindValue: string | null): string {
    if (topicValue === SOMETHING_ELSE) return "I want to talk something through that doesn't fit a category."
    const label = topicLabel(topicValue)
    if (!label) return 'I want to talk something through.'
    const specific = kindValue ? kindLabel(kindValue) : null
    return specific
      ? `I want to focus on ${label.toLowerCase()} — specifically ${specific.toLowerCase()}.`
      : `I want to focus on ${label.toLowerCase()}.`
  }

  /// Starts the conversation already pointed at a topic. Used by the chips and
  /// by Start talking, so all three routes in behave the same way.
  function startFocused(topicValue: string, kindValue: string | null) {
    submitText(focusOpener(topicValue, kindValue))
  }

  /// A turn typed into the chat box.
  ///
  /// Unlike submitText — which an example prompt uses to *begin* a spoken
  /// conversation — this deliberately leaves sessionActiveRef false and the
  /// box open, so Coach answers in text and the turn comes back to the
  /// keyboard rather than to the microphone. That is what makes typing a
  /// conversation instead of a single message.
  function submitTyped(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setError(null)
    setTypedDraft('')
    handleTurnComplete(trimmed)
  }

  /// Leaves the chat and hands the turn back to voice.
  function handleBackToVoice() {
    setShowTypeInput(false)
    setTypedDraft('')
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
  async function handleDeletePast(id: string) {
    if (!confirm('Delete this conversation? Its takeaway and any check-in Coach scheduled from it go too. This cannot be undone.')) return
    try {
      await deleteDebrief(id)
      setPastTalks((talks) => talks.filter((t) => t.id !== id))
    } catch {
      alert('Could not delete that conversation. Please try again.')
    }
  }

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
    <div className="flex flex-col gap-6">
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
        ref={fillerAudioRef}
        crossOrigin="use-credentials"
        controls
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <audio
        ref={audioRef}
        crossOrigin="use-credentials"
        controls
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />


      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coach</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          {isDebrief ? 'Debrief with Coach' : 'Talk It Through'}
          <span className="text-gold">.</span>
        </h1>
      </div>

      <div className="flex flex-col items-center gap-6 text-center">
        {!supported ? (
          <div className="flex flex-col items-center gap-3">
            <WarningIcon className="h-8 w-8 text-terracotta-600" />
            <p className="max-w-sm text-sm text-ink-soft">
              Voice conversation isn't available in this browser. Try a different browser or device.
            </p>
          </div>
        ) : finishing ? (
          <div className="flex w-full max-w-3xl flex-col gap-5 text-left">
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
                      <span className="text-gold">.</span>
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
            <div className="relative flex w-full max-w-3xl flex-col items-center gap-4 rounded-3xl bg-forest px-6 py-8 text-cream shadow-sm">
              {/* Pinned to the top of the hero rather than sitting in the row
                  under the transcript: muting is something a teacher decides
                  before Coach starts talking, and hunting for it below the fold
                  while it is already speaking is too late to be useful. */}
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-pressed={muted}
                className={`absolute right-4 top-4 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  muted
                    ? 'border-gold bg-gold text-forest'
                    : 'border-cream/25 text-cream/70 hover:border-cream/50 hover:text-cream'
                }`}
              >
                {muted ? 'Unmute coach' : 'Mute coach'}
              </button>
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

              {onStartScreen && (
                <div className="mt-2">
                  {/* The kicker only earns its place when the page arrived with
                      a subject of its own. On a plain start screen it was
                      labelling the obvious. */}
                  {(followUp || isDebrief) && (
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                      {followUp ? 'Coach is checking in' : 'Debrief'}
                    </p>
                  )}
                  <h2 className="mt-2 font-heading text-3xl font-bold text-cream sm:text-4xl">
                    {followUp
                      ? followUp.checkInQuestion
                      : isDebrief
                        ? 'How did it go?'
                        : 'Hi. What would you like to talk about?'}
                  </h2>
                  <p className="mx-auto mt-2 max-w-xl text-base text-cream/70">
                    {followUp
                      ? 'Say how it went — good, bad, or not yet. Coach will take it from there.'
                      : isDebrief
                        ? 'Start wherever you like — Coach will walk through the rest with you.'
                        : 'Say whatever is on your mind and I will follow you. Pick a topic below only if you want me to start somewhere.'}
                  </p>
                </div>
              )}

              {/* Start talking and Type instead sit inside the hero, under the
                  mic: they are the two ways into the one thing this page does,
                  so they come before the optional topic chips rather than after
                  a scroll past them. Type instead is a real button beside the
                  primary, not a small link — typing is a first-class way to use
                  this, not a fallback. */}
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

            {onStartScreen ? (
              <div className="flex w-full max-w-3xl flex-col gap-5 text-left">
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

                {/* Genuinely optional, and said so: a teacher who skips it loses
                    nothing, because Coach reads the topic out of their own
                    words anyway. A check-in or a debrief already has its
                    subject, so the chips would be asking a question that is
                    already answered. */}
                {!isDebrief && !followUp && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel title="Want me focused on something?" hint="Optional — skip it and I'll just listen." />
                    <div className="flex flex-wrap gap-2.5">
                      {TOPICS.map(({ value, label }) => {
                        const selected = topic === value
                        const ghost = value === 'something_else'
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              if (selected) {
                                setTopic(null)
                                setKind(null)
                                return
                              }
                              setTopic(value)
                              setKind(null)
                              // Topics that have no second step have nothing
                              // left to ask, so they open the conversation
                              // immediately. The rest reveal their step first —
                              // starting here would put it out of reach.
                              if (kindsFor(value).length === 0) startFocused(value, null)
                            }}
                            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                              selected
                                ? 'bg-forest text-cream'
                                : ghost
                                  ? 'border border-dashed border-hairline text-ink-soft hover:text-ink'
                                  : 'bg-cream-card text-ink hover:text-terracotta-600'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* The second step, and only once the first is answered: naming
                    the corner of a topic gives Coach somewhere to start without
                    making anyone fill in a form before they can talk. */}
                {!isDebrief && !followUp && topic && kindsFor(topic).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel title="Anything more specific?" hint="Still optional." />
                    <div className="flex flex-wrap gap-2.5">
                      {kindsFor(topic).map(({ value, label }) => {
                        const selected = kind === value
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setKind(value)
                              startFocused(topic, value)
                            }}
                            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                              selected ? 'bg-terracotta text-cream' : 'bg-cream-card text-ink-soft hover:text-ink'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <SectionLabel title="Or start with one of these" kicker />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(followUp
                      ? CHECK_IN_PROMPTS
                      : isDebrief
                        ? DEBRIEF_PROMPTS
                        : pickTopicStarters(topic, room, experienced)
                    ).map((prompt, i) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitText(prompt)}
                        className={`group flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-medium text-forest transition-shadow hover:shadow-md ${
                          ['bg-peach-tint/60', 'bg-gold-tint/60', 'bg-mint-tint/60', 'bg-peach-tint/30'][i % 4]
                        }`}
                      >
                        {prompt}
                        <span aria-hidden="true" className="text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
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
              <div className="flex w-full max-w-3xl flex-col gap-3">
                {/* Spoken, the last exchange is enough: the teacher heard the
                    rest. Typed, the thread is the conversation — scrolling back
                    to what Coach said four turns ago is the whole point of
                    having it in writing. */}
                {showTypeInput ? (
                  messages.length === 0 ? (
                    <p className="text-sm text-ink-soft">Type below and Coach will answer here.</p>
                  ) : (
                    messages.map((message, i) => (
                      <div
                        key={i}
                        className={
                          message.role === 'user'
                            ? 'rounded-2xl border border-hairline bg-cream-card p-5 text-left'
                            : 'rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5 text-left'
                        }
                      >
                        <p
                          className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                            message.role === 'user' ? 'text-ink-soft' : 'text-terracotta-600'
                          }`}
                        >
                          {message.role === 'user' ? 'You' : 'Coach'}
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{message.text}</p>
                      </div>
                    ))
                  )
                ) : (
                  <>
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
                  </>
                )}
                {showTypeInput && phase === 'thinking' && (
                  <p aria-live="polite" className="text-left text-sm text-ink-soft">Coach is writing…</p>
                )}
                {error && <p className="text-sm text-terracotta-600">{error}</p>}
              </div>
            )}

            {showTypeInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submitTyped(typedDraft)
                }}
                className="flex w-full max-w-3xl flex-col gap-2.5"
              >
                <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={typedDraft}
                  onChange={(e) => setTypedDraft(e.target.value)}
                  placeholder={messages.length === 0 ? "Type what's on your mind…" : 'Keep going…'}
                  className="flex-1 rounded-full border border-hairline bg-cream-card px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!typedDraft.trim()}
                  className="rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                >
                  Send
                </button>
                </div>

                {/* The chat replaced the button row, and the row was where
                    finishing lived — so a teacher who typed the whole
                    conversation had no way to end it and get a takeaway. Both
                    ways out belong here: back to the microphone, and done. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleBackToVoice}
                    className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    <MicIcon className="h-4 w-4" />
                    Back to voice
                  </button>
                  {debrief && (
                    <button
                      type="button"
                      onClick={handleFinishSession}
                      className="rounded-full border-2 border-hairline bg-cream-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                    >
                      Finish session
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                {/* On a fresh start screen these two live in the hero, so this
                    row would be showing them twice. Here it covers the states
                    the hero does not: resuming, and retrying after an error. */}
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
              <div className="w-full max-w-3xl text-left">
                <PastList
                  title="Your conversations"
                  items={pastTalks.map((d) => ({
                    id: d.id,
                    createdAt: d.createdAt,
                    label: d.talkTakeaway ? 'Takeaway' : 'Not wrapped up',
                    text: d.incidentText,
                    saved: d.saved,
                  }))}
                  activeId={null}
                  loading={pastLoading}
                  emptyText="Your conversations will show up here."
                  onOpen={(id) => {
                    const past = pastTalks.find((d) => d.id === id)
                    if (past) handleOpenPast(past)
                  }}
                  onDelete={handleDeletePast}
                />
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-center text-xs text-ink-soft">
        Your voice is never saved — only the conversation text.
      </p>
    </div>
  )
}
