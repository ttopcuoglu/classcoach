import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AnswerSection from '../components/AnswerSection'
import CoachingChat from '../components/CoachingChat'
import ReflectionTimeline from '../components/ReflectionTimeline'
import ShareButton from '../components/ShareButton'
import { ArrowUpIcon, MicIcon, StarIcon } from '../components/icons'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { useSpeechToText } from '../hooks/useSpeechToText'
import {
  DESCRIBE_MY_OWN,
  TEACHING_AND_LEARNING,
  TOPICS,
  findTopic,
  harderDifficulty,
  hasHarderDifficulty,
  kindLabel,
  kindsFor,
  topicForKind,
} from '../lib/topics'
import { hintsFor } from '../lib/practiceHints'
import { useHandoff } from '../hooks/useHandoff'
import ClassContextLine from '../components/ClassContextLine'
import SectionLabel from '../components/SectionLabel'
import {
  DEFAULT_TEACHING_CONTEXT,
  type TeachingContext,
} from '../components/TeachingContextFields'
import { SUBJECTS, coursesFor } from '../lib/teachingContext'
import {
  createOwnScenario,
  generateScenario,
  getAttempts,
  markAttemptTried,
  saveAttemptReflection,
  sendAttemptChat,
  setAttemptSaved,
  shareAttempt,
  submitAttempt,
  type ScenarioAttempt,
} from '../lib/api'

const DIFFICULTIES: { label: string; value?: string }[] = [
  { label: 'Any difficulty' },
  { label: 'Guided', value: 'beginner' },
  { label: 'Independent', value: 'intermediate' },
  { label: 'Challenge', value: 'advanced' },
]

const SESSION_LENGTH = 3

function difficultyLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Practice is four rows, each driven by the one above it: topic, then the kind
// of moment within that topic, then the class it is set in, then how hard it
// should be. Unlike Talk It Through — where the coach infers the topic from
// the teacher's own words — here the topic is the primary control, because it
// decides what scenario they get handed.
//
// The rows replaced a collapsed "Scenarios: any situation · any difficulty"
// line with a Change link, plus a separate always-visible room panel. That
// shape hid the two choices that matter behind a fold while showing five room
// fields that mostly did not apply.
export default function TryItOut({
  topic: topicProp,
  onTopicChange,
}: {
  /// Set by the surrounding route so the chosen topic survives a reload. Left
  /// undefined when Practice is rendered somewhere that does not track it.
  topic?: string
  onTopicChange?: (next: string | undefined) => void
} = {}) {
  // Arriving from Talk It Through's "want to rehearse it?". The situation
  // the teacher described out loud becomes the scenario, which is why it
  // lands in "Describe my own" rather than being handed to generation:
  // rehearsing an approximation of what they just said would be worse than
  // rehearsing their own words for it.
  //
  // Read once on mount, so coming back to Practice next week does not
  // re-open a situation they already rehearsed.
  const arrivedWith = useHandoff('rehearse')

  const [localTopic, setLocalTopic] = useState<string | undefined>(arrivedWith?.topic ?? undefined)
  const focusArea = topicProp ?? localTopic
  function setTopic(next: string | undefined) {
    setLocalTopic(next)
    onTopicChange?.(next)
    // A kind belongs to one topic, so it cannot survive a topic change — and
    // "describe my own" is the one selection that can, because it belongs to
    // no topic at all.
    setCategory((prev) => (prev === DESCRIBE_MY_OWN ? prev : undefined))
  }

  const [category, setCategory] = useState<string | undefined>(
    arrivedWith ? DESCRIBE_MY_OWN : undefined,
  )
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined)
  /// "Describe my own" — the teacher's own situation, in their words.
  const [ownSituation, setOwnSituation] = useState(arrivedWith?.situation ?? '')
  /// The teacher's default class, and the content fields that only Teaching
  /// and Learning asks about.
  const [room, setRoom] = useState<TeachingContext>(DEFAULT_TEACHING_CONTEXT)
  const area = findTopic(focusArea)

  // A kind from a different topic would silently contradict the topic on the
  // next generate, so changing topic clears a mismatched one. Only when a
  // topic is actually selected: with none, a bare kind is still valid — the
  // server derives the topic from it (see scenarios.ts).
  //
  // "Describe my own" is exempt, and has to be. It belongs to no topic, so
  // `topicForKind` returns nothing for it and this would clear it on every
  // topic change — including the one `setTopic` deliberately preserves it
  // through, and the one a rehearse handoff arrives with.
  useEffect(() => {
    if (
      focusArea &&
      category &&
      category !== DESCRIBE_MY_OWN &&
      topicForKind(category)?.value !== focusArea
    ) {
      setCategory(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusArea])

  const [attempt, setAttempt] = useState<ScenarioAttempt | null>(null)
  const [responseText, setResponseText] = useState('')
  // Null until a teacher asks. Cycles rather than showing the whole list, so a
  // hint stays a nudge rather than becoming a menu to choose from.
  const [hintIndex, setHintIndex] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const workingProgress = useSimulatedProgress(generating || submitting, 8000)
  const [error, setError] = useState<string | null>(null)
  const { supported: speechSupported, listening, toggleListening } = useSpeechToText((text) =>
    setResponseText((prev) => (prev ? `${prev} ${text}` : text)),
  )

  // attemptIds: what this Quick Session produced, for the recap at the end.
  const [sessionState, setSessionState] = useState<{
    index: number
    total: number
    done: boolean
    attemptIds: string[]
  } | null>(null)

  const [allAttempts, setAllAttempts] = useState<ScenarioAttempt[]>([])

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Opened from Home's Recent work: go straight to that attempt.
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('open')

  useEffect(() => {
    getAttempts()
      .then((all) => {
        setAllAttempts(all)
        const opened = openId ? all.find((a) => a.id === openId) : undefined
        if (opened) setAttempt(opened)
        if (openId) {
          const next = new URLSearchParams(searchParams)
          next.delete('open')
          setSearchParams(next, { replace: true })
        }
      })
      .catch(() => {})

    const suggested = sessionStorage.getItem('classcoach.suggestedCategory')
    if (suggested) setCategory(suggested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const kindTally = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of allAttempts) {
      counts.set(a.scenario.category, (counts.get(a.scenario.category) ?? 0) + 1)
    }
    return counts
  }, [allAttempts])

  const growthInsight = useMemo(() => {
    const byCategory = new Map<string, ScenarioAttempt[]>()
    for (const a of allAttempts) {
      if (a.rating == null) continue
      const list = byCategory.get(a.scenario.category) ?? []
      list.push(a)
      byCategory.set(a.scenario.category, list)
    }

    let best: { category: string; delta: number; attempts: number } | null = null
    for (const [cat, attempts] of byCategory) {
      if (attempts.length < 2) continue
      const sorted = [...attempts].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      const mid = Math.max(1, Math.floor(sorted.length / 2))
      const firstHalf = sorted.slice(0, mid)
      const secondHalf = sorted.slice(mid)
      if (secondHalf.length === 0) continue
      const avg = (arr: ScenarioAttempt[]) => arr.reduce((sum, a) => sum + (a.rating ?? 0), 0) / arr.length
      const delta = avg(secondHalf) - avg(firstHalf)
      if (delta > 0 && (!best || delta > best.delta)) best = { category: cat, delta, attempts: attempts.length }
    }
    return best
  }, [allAttempts])

  async function handleNewScenario(categoryOverride?: string, difficultyOverride?: string) {
    setGenerating(true)
    setError(null)
    setAttempt(null)
    setResponseText('')
    setHintIndex(null)
    setChatDraft('')
    setChatError(null)
    try {
      const chosenKind = categoryOverride ?? category
      const request = {
        focusArea,
        category: chosenKind,
        difficulty: difficultyOverride ?? difficulty,
        gradeBand: room.gradeBand,
        // Subject, course and level are only asked for under Teaching and
        // Learning, so they're only sent from there.
        ...(focusArea === TEACHING_AND_LEARNING
          ? {
              subject: room.subject,
              course: room.course,
              topic: room.topic,
              courseLevel: room.courseLevel,
              classMakeup: room.classMakeup,
            }
          : {}),
      }
      // "Describe my own" skips generation entirely — the teacher already
      // wrote the situation, and asking a model to rewrite their own
      // classroom back at them would be both wasteful and presumptuous.
      const scenario =
        chosenKind === DESCRIBE_MY_OWN
          ? await createOwnScenario({ ...request, text: ownSituation })
          : await generateScenario(request)
      setAttempt({
        id: `draft-${scenario.id}`,
        scenarioId: scenario.id,
        responseText: '',
        feedback: null,
        modelResponse: null,
        coachingParts: null,
        rating: null,
        saved: false,
        createdAt: scenario.createdAt,
        scenario,
        conversation: [],
        triedAt: null,
        reflectionNote: null,
      })
    } catch {
      setError('Could not generate a scenario. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  /// The same situation again, one notch harder. A new scenario rather than a
  /// re-score of the old one: the teacher has already seen this exact wording
  /// and their second answer to it would be rehearsing the words, not the
  /// judgment. Keeps the topic, kind and class so only the difficulty moves.
  async function handleHarderRerun(from: ScenarioAttempt) {
    const next = harderDifficulty(from.scenario.difficulty)
    setDifficulty(next)
    await handleNewScenario(from.scenario.category, next)
  }

  async function handleStartSession() {
    setSessionState({ index: 1, total: SESSION_LENGTH, done: false, attemptIds: [] })
    await handleNewScenario()
  }

  async function handleSessionAdvance() {
    if (!sessionState) return
    if (sessionState.index >= sessionState.total) {
      setSessionState((s) => (s ? { ...s, done: true } : s))
      return
    }
    setSessionState((s) => (s ? { ...s, index: s.index + 1 } : s))
    await handleNewScenario()
  }

  function handleEndSession() {
    setSessionState(null)
    setAttempt(null)
    setResponseText('')
  }

  async function handleSubmitResponse() {
    if (!attempt || !responseText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitAttempt(attempt.scenarioId, responseText.trim())
      setAttempt(result)
      setAllAttempts((prev) => [result, ...prev])
      setSessionState((s) => (s && !s.done ? { ...s, attemptIds: [...s.attemptIds, result.id] } : s))
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleTryAgain() {
    if (!attempt) return
    setAttempt((prev) =>
      prev
        ? {
            ...prev,
            id: `draft-${prev.scenarioId}`,
            responseText: '',
            feedback: null,
            modelResponse: null,
            rating: null,
            conversation: [],
          }
        : prev,
    )
    setResponseText('')
    setChatDraft('')
    setChatError(null)
    setError(null)
  }

  async function handleToggleSaved(target: ScenarioAttempt) {
    const nextSaved = !target.saved
    const applySaved = (a: ScenarioAttempt) => (a.id === target.id ? { ...a, saved: nextSaved } : a)
    setAllAttempts((prev) => prev.map(applySaved))
    if (attempt?.id === target.id) setAttempt((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setAttemptSaved(target.id, nextSaved)
    } catch {
      setAllAttempts((prev) => prev.map((a) => (a.id === target.id ? { ...a, saved: !nextSaved } : a)))
      if (attempt?.id === target.id) setAttempt((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  async function handleMarkTried(id: string) {
    try {
      const updated = await markAttemptTried(id)
      setAllAttempts((prev) => prev.map((a) => (a.id === id ? updated : a)))
      setAttempt((prev) => (prev?.id === id ? updated : prev))
    } catch {
      // reflection timeline is a nice-to-have; a failed update just leaves the button as-is
    }
  }

  async function handleSaveReflection(id: string, note: string) {
    try {
      const updated = await saveAttemptReflection(id, note)
      setAllAttempts((prev) => prev.map((a) => (a.id === id ? updated : a)))
      setAttempt((prev) => (prev?.id === id ? updated : prev))
    } catch {
      // same as above — non-critical, silently ignored
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!attempt || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendAttemptChat(attempt.id, trimmed)
      setAttempt(updated)
      setAllAttempts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  // A past attempt opens like a fresh one: the scenario, your response, the
  // coaching and any follow-ups, with the chat to keep going.
  function handleOpenPast(id: string) {
    const past = allAttempts.find((a) => a.id === id)
    if (!past) return
    setSessionState(null)
    setAttempt(past)
    setResponseText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /// One chip style for all four rows. `ghost` marks the two opt-outs —
  /// "Something else" as a topic and "Describe my own" as a kind — which are
  /// dashed rather than solid because neither narrows anything.
  /// The selection panel sits on a light card now, so a chip is an outlined
  /// pill rather than a translucent one. Gold still means chosen, and a ghost
  /// chip stays dashed — it is the one that opts out of the row it is in.
  function chip(selected: boolean, ghost?: boolean) {
    const base =
      'rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60'
    if (selected) return `${base} border-gold bg-gold text-forest`
    if (ghost) return `${base} border-dashed border-ink-soft/40 text-ink-soft hover:border-terracotta/50 hover:text-terracotta-600`
    return `${base} border-hairline bg-cream text-ink hover:border-terracotta/50 hover:text-terracotta-600`
  }

  const describingOwn = category === DESCRIBE_MY_OWN
  /// Only Teaching and Learning asks what is being taught — a parent email
  /// does not get better for knowing it came from an honors section.
  const asksAboutContent = focusArea === TEACHING_AND_LEARNING
  const kinds = kindsFor(focusArea)
  const courses = coursesFor(room.gradeBand, room.subject)

  /// Pulls the teacher's default class into the room used for generation.
  /// Null (no class saved) deliberately changes nothing: the band keeps its
  /// default and generation proceeds, because missing context never blocks.
  function applyPrep(prep: { gradeBand: string; subject: string | null; course: string | null; courseLevel: string | null; classMakeup: string[] } | null) {
    if (!prep) return
    setRoom((prev) => ({
      ...prev,
      gradeBand: prep.gradeBand,
      subject: prep.subject ?? undefined,
      course: prep.course ?? undefined,
      courseLevel: prep.courseLevel ?? undefined,
      classMakeup: prep.classMakeup,
      otherSubject: !!prep.subject && !(SUBJECTS as readonly string[]).includes(prep.subject),
    }))
  }

  const hasFeedback = attempt && (attempt.coachingParts || attempt.feedback || attempt.modelResponse)
  // Sharpest first: the level knows most about the room, then the topic.
  const hints = hintsFor(focusArea, room.courseLevel, room.classMakeup)
  const sessionAttempts = sessionState?.done
    ? sessionState.attemptIds.map((id) => allAttempts.find((a) => a.id === id)).filter((a): a is ScenarioAttempt => !!a)
    : []
  const unsavedInSession = sessionAttempts.filter((a) => !a.saved)

  return (
    <div className="flex flex-col gap-6">
      {/* Practice had no title of its own — it was a tab inside Ask & Practice
          and inherited that page's. As a surface it says what it is. */}
      {!attempt && !sessionState?.done && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coach</p>
          <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
            Practice<span className="text-terracotta">.</span>
          </h1>
          <p className="max-w-2xl text-ink-soft">
            Rehearse it before it happens for real. Same topics as Talk It Through — pick one, get a scenario,
            make your move.
          </p>
        </div>
      )}

      <div
        className={
          !attempt && !sessionState?.done
            ? 'rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm sm:p-8'
            : 'rounded-2xl border border-hairline bg-cream-card p-6'
        }
      >
        {sessionState?.done ? (
          <div className="flex flex-col gap-4 p-2">
            <div>
              <p className="font-heading text-2xl font-bold text-forest">Session complete<span className="text-gold">!</span></p>
              <p className="mt-1 text-sm text-ink-soft">
                You practiced {sessionState.total} scenarios back to back. Here&rsquo;s what you worked through. Open
                any one to see its coaching again.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {sessionAttempts.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleOpenPast(a.id)}
                  className="flex items-start gap-3 rounded-xl border border-hairline bg-cream p-3.5 text-left transition-colors hover:border-terracotta/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-forest font-heading text-sm font-bold text-gold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-forest">{kindLabel(a.scenario.category)}</span>
                    <span className="mt-0.5 block line-clamp-2 text-sm text-ink">{a.scenario.text}</span>
                    <span className="mt-1 block line-clamp-1 text-xs text-ink-soft">You said: {a.responseText}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-forest">Open →</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sessionAttempts.length > 0 && (
                <button
                  type="button"
                  onClick={() => unsavedInSession.forEach((a) => handleToggleSaved(a))}
                  disabled={unsavedInSession.length === 0}
                  className="flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-60"
                >
                  <StarIcon className="h-4 w-4" filled={unsavedInSession.length === 0} />
                  {unsavedInSession.length === 0 ? 'All saved' : `Save all ${sessionAttempts.length}`}
                </button>
              )}
              <button
                type="button"
                onClick={handleStartSession}
                disabled={generating}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
              >
                Practice {SESSION_LENGTH} more
              </button>
              <button
                type="button"
                onClick={handleEndSession}
                className="px-2 py-2.5 text-sm font-semibold text-ink-soft hover:text-ink"
              >
                Back to practice
              </button>
            </div>
          </div>
        ) : !attempt ? (
          <div>
            {(generating || submitting) && (
              <div className="mb-4 flex justify-center text-forest">
                <ProgressRing
                  progress={workingProgress}
                  label={generating ? 'Building a scenario' : 'Reading your response'}
                  hint="Usually under ten seconds."
                />
              </div>
            )}
            {/* Four rows, each driven by the one above it. The collapsed
                "Scenarios: any situation · any difficulty" line this replaces
                hid the two choices that actually decide what a teacher gets,
                while a separate panel showed five room fields that mostly did
                not apply to the topic they were in. */}
            <div className="flex flex-col gap-5">
              {/* 1 — Topic. The same shared list Talk It Through uses. */}
              <div>
                <SectionLabel kicker title="What's this about?" />
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {TOPICS.map(({ value, label, ghost }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={generating}
                      onClick={() => setTopic(focusArea === value ? undefined : value)}
                      aria-pressed={focusArea === value}
                      className={chip(focusArea === value, ghost)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {area && <p className="mt-2 max-w-3xl text-sm text-ink-soft">{area.blurb}</p>}
              </div>

              {/* 2 — Kind, which changes with the topic above. "Describe my
                  own" is always offered: a teacher with a specific situation
                  in mind should not have to find the nearest category for it. */}
              <div>
                <SectionLabel title="What kind of moment?" />
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {kinds.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={generating}
                      onClick={() => setCategory(category === value ? undefined : value)}
                      aria-pressed={category === value}
                      title={
                        kindTally.get(value)
                          ? `You've practiced this ${kindTally.get(value) === 1 ? 'once' : `${kindTally.get(value)} times`}`
                          : undefined
                      }
                      className={chip(category === value)}
                    >
                      {label}
                      {kindTally.get(value) ? ` · ${kindTally.get(value)} practiced` : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => setCategory(describingOwn ? undefined : DESCRIBE_MY_OWN)}
                    aria-pressed={describingOwn}
                    className={chip(describingOwn, true)}
                  >
                    Describe my own
                  </button>
                </div>
                {!area && !describingOwn && (
                  <p className="mt-2 text-sm text-ink-soft">
                    Pick a topic to narrow this — otherwise your coach chooses, weighted toward what
                    you&rsquo;ve practiced least.
                  </p>
                )}
                {describingOwn && arrivedWith && (
                  <p className="mt-2 rounded-xl bg-gold-tint/60 px-3 py-2 text-xs text-ink">
                    From what you were just talking through. Edit it if it is not quite right.
                  </p>
                )}
                {describingOwn && (
                  <textarea
                    value={ownSituation}
                    onChange={(e) => setOwnSituation(e.target.value)}
                    disabled={generating}
                    rows={3}
                    placeholder="What happened, or what are you about to walk into?"
                    className="mt-2 w-full rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                  />
                )}
              </div>

              {/* 3 — The class. One line for every topic; Teaching and
                  Learning additionally asks what is being taught, because its
                  scenarios have to be about the teacher's actual content
                  rather than about delivery technique in the abstract. */}
              <div>
                <SectionLabel title="Your class" hint="A content scenario only works if the content is yours." />
                <div className="mt-2 rounded-xl border border-hairline bg-cream px-4 py-3">
                  <ClassContextLine compact onChange={applyPrep} />
                </div>

                {asksAboutContent && (
                  <div className="mt-2.5 flex flex-col gap-2.5">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                        Subject
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2.5">
                        {SUBJECTS.map((subject) => (
                          <button
                            key={subject}
                            type="button"
                            disabled={generating}
                            onClick={() =>
                              setRoom((prev) => ({
                                ...prev,
                                subject: prev.subject === subject ? undefined : subject,
                                otherSubject: false,
                                course: undefined,
                              }))
                            }
                            aria-pressed={room.subject === subject}
                            className={chip(room.subject === subject)}
                          >
                            {subject}
                          </button>
                        ))}
                      </div>
                    </div>

                    {courses.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                          Course
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2.5">
                          {courses.map((course) => (
                            <button
                              key={course}
                              type="button"
                              disabled={generating}
                              onClick={() =>
                                setRoom((prev) => ({
                                  ...prev,
                                  course: prev.course === course ? undefined : course,
                                }))
                              }
                              aria-pressed={room.course === course}
                              className={chip(room.course === course)}
                            >
                              {course}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* The only room field that changes weekly, and the one
                        that decides what the scenario is actually about — so
                        it is asked every time and never remembered. */}
                    <label className="flex flex-col gap-2">
                      <span>
                        <span className="font-heading text-base font-bold text-forest">
                          What are you teaching right now?
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-soft">
                          This is what makes the scenario about your content, not teaching in general.
                        </span>
                      </span>
                      <input
                        type="text"
                        value={room.topic ?? ''}
                        onChange={(e) => setRoom((prev) => ({ ...prev, topic: e.target.value }))}
                        disabled={generating}
                        placeholder="Photosynthesis, the Federalist papers, factoring quadratics..."
                        className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* 4 — Difficulty, labelled so nobody reads it as a judgment
                  about the teacher. */}
              <div>
                <SectionLabel
                  title="How tough should it be?"
                  hint="This is the scenario's difficulty, not yours. Start below where the real one sits."
                />
                <div className="mt-2 flex flex-wrap gap-2.5">
                  {DIFFICULTIES.map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={generating}
                      onClick={() => setDifficulty(value)}
                      aria-pressed={difficulty === value}
                      className={chip(difficulty === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleNewScenario()}
                disabled={generating || (describingOwn && !ownSituation.trim())}
                className="rounded-full bg-terracotta px-7 py-3.5 text-base font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
              >
                {generating ? 'Generating...' : describingOwn ? 'Use my situation' : 'New Scenario'}
              </button>
              {/* Hidden while describing your own: a three-scenario session
                  built from one situation the teacher wrote would just be the
                  same situation three times. */}
              {!describingOwn && (
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={generating}
                  className="rounded-full border border-hairline px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-terracotta/50 hover:text-terracotta-600 disabled:opacity-60"
                >
                  Quick Session ({SESSION_LENGTH} scenarios)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-forest p-6 text-cream">
              {sessionState && (
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                  Quick Session — scenario {sessionState.index} of {sessionState.total}
                </p>
              )}
              <span className="rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">
                {[
                  kindLabel(attempt.scenario.category),
                  `Grades ${attempt.scenario.gradeBand}`,
                  attempt.scenario.course ?? attempt.scenario.subject,
                  attempt.scenario.courseLevel,
                  difficultyLabel(attempt.scenario.difficulty),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <p className="mt-4 text-base leading-relaxed text-cream">{attempt.scenario.text}</p>
              {attempt.scenario.fallback && (
                <p className="mt-2 text-xs text-cream/60">
                  Couldn't reach your coach for a fresh scenario, so here's one from the practice bank.
                </p>
              )}
            </div>

            {!hasFeedback ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="font-heading text-xl font-bold text-forest">How would you handle this?</span>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    disabled={submitting}
                    rows={4}
                    placeholder="Your first move — what do you say, and what do you do?"
                    className="rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                  />
                </label>

                {/* A question, never an answer. Picking from options and
                    composing a response under pressure are different skills,
                    and only the second one happens in a real classroom — so the
                    hint scaffolds the thinking and leaves the words to them. */}
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHintIndex((i) => (i === null ? 0 : (i + 1) % hints.length))}
                    disabled={submitting}
                    className="w-fit text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
                  >
                    {hintIndex === null ? 'Not sure where to start?' : 'Another way in'}
                  </button>
                  {hintIndex !== null && (
                    <p
                      aria-live="polite"
                      className="rounded-2xl bg-gold-tint/50 px-4 py-3 text-sm italic text-ink"
                    >
                      {hints[hintIndex]}
                    </p>
                  )}
                </div>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={submitting}
                    className={`flex w-fit items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                      listening
                        ? 'border-terracotta bg-peach-tint text-terracotta-600'
                        : 'border-mint-tint bg-mint-tint/60 text-forest hover:border-terracotta/40 hover:bg-mint-tint'
                    }`}
                  >
                    <MicIcon className="h-5 w-5" />
                    {listening ? 'Listening... tap to stop' : 'Speak your response'}
                  </button>
                )}
                {/* The hero's ring isn't on screen once a scenario is showing. */}
                <WorkingRing
                  active={generating || submitting}
                  estimatedMs={8000}
                  label={generating ? 'Building a scenario' : 'Reading your response'}
                  hint="Usually under ten seconds."
                  className="text-forest"
                />
                <div className="flex items-center justify-between">
                  {!sessionState && (
                    <button
                      type="button"
                      onClick={() => handleNewScenario()}
                      disabled={generating}
                      className="text-sm font-medium text-ink-soft hover:text-ink"
                    >
                      Try a different scenario
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmitResponse}
                    disabled={submitting || !responseText.trim()}
                    className="ml-auto rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                  >
                    {submitting ? 'Getting feedback...' : 'Get Feedback'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Three named parts rather than a block of coaching plus a
                    model answer. Attempts made before this shape existed have
                    no coachingParts and fall back to what they stored, so a
                    teacher's own history keeps rendering. */}
                {[
                  { title: 'Your response', subtitle: 'What you said you would do.', body: attempt.responseText },
                  ...(attempt.coachingParts
                    ? [
                        {
                          title: 'What your move did',
                          subtitle: 'The effect it would actually have.',
                          body: attempt.coachingParts.did,
                        },
                        {
                          title: 'What it left on the table',
                          subtitle: 'One thing, not a list.',
                          body: attempt.coachingParts.left,
                        },
                        ...(attempt.coachingParts.keep
                          ? [
                              {
                                title: 'One line worth keeping',
                                subtitle: 'Something you could carry into the real version.',
                                body: attempt.coachingParts.keep,
                              },
                            ]
                          : []),
                      ]
                    : [
                        attempt.feedback && {
                          title: 'Coaching',
                          subtitle: 'What worked, and what to strengthen.',
                          body: attempt.feedback,
                        },
                        attempt.modelResponse && {
                          title: 'A model response',
                          subtitle: 'One way to handle it, to compare with yours.',
                          body: attempt.modelResponse,
                        },
                      ]),
                ]
                  .filter((part): part is { title: string; subtitle: string; body: string } => !!part)
                  .map((part, i) => (
                    <AnswerSection key={part.title} n={i + 1} title={part.title} subtitle={part.subtitle}>
                      {part.body}
                    </AnswerSection>
                  ))}

                {/* The same scenario, one notch harder. Offered rather than
                    imposed, and only while there is a notch left — advanced is
                    the ceiling, and wrapping back to beginner would read as the
                    app losing track of where the teacher is. */}
                {hasHarderDifficulty(attempt.scenario.difficulty) && !sessionState && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gold-tint/60 px-4 py-3">
                    <p className="text-sm text-ink">
                      Want the same situation, one notch harder?
                    </p>
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => handleHarderRerun(attempt)}
                      className="rounded-full bg-terracotta px-4 py-2 text-xs font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:opacity-60"
                    >
                      Run it {difficultyLabel(harderDifficulty(attempt.scenario.difficulty)).toLowerCase()}
                    </button>
                  </div>
                )}

                <CoachingChat
                  messages={attempt.conversation.slice(2)}
                  sending={chatSending}
                  error={chatError}
                  draft={chatDraft}
                  onDraftChange={setChatDraft}
                  onSend={handleSendChat}
                  placeholder="Ask a follow-up about this feedback..."
                />

                <ReflectionTimeline
                  triedAt={attempt.triedAt}
                  reflectionNote={attempt.reflectionNote}
                  onMarkTried={() => handleMarkTried(attempt.id)}
                  onSaveReflection={(note) => handleSaveReflection(attempt.id, note)}
                />
                <ShareButton type="attempt" onShare={() => shareAttempt(attempt.id)} />

                <WorkingRing active={generating} estimatedMs={8000} label="Building a scenario" hint="Usually under ten seconds." className="text-forest" />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleToggleSaved(attempt)}
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      attempt.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
                    }`}
                  >
                    <StarIcon className="h-4 w-4" filled={attempt.saved} />
                    {attempt.saved ? 'Saved' : 'Save for later'}
                  </button>
                  <Link
                    to={`/ask-practice/practice/${attempt.id}/export`}
                    className="text-sm font-medium text-ink-soft transition-colors hover:text-terracotta-600"
                  >
                    Export / Print
                  </Link>
                  <div className="flex items-center gap-2">
                    {!sessionState && (
                      <button
                        type="button"
                        onClick={handleTryAgain}
                        className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                      >
                        Try again
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={sessionState ? handleSessionAdvance : () => handleNewScenario()}
                      disabled={generating}
                      className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                    >
                      {generating
                        ? 'Generating...'
                        : sessionState
                          ? sessionState.index < sessionState.total
                            ? `Next (${sessionState.index + 1} of ${sessionState.total})`
                            : 'Finish Session'
                          : 'New Scenario'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className={`mt-4 text-center text-sm ${!attempt && !sessionState?.done ? 'text-peach-tint' : 'text-terracotta-600'}`}>
            {error}
          </p>
        )}
      </div>

      {growthInsight && (
        <div className="flex items-start gap-3 rounded-2xl bg-mint-tint/50 p-5">
          <ArrowUpIcon className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
          <div className="text-sm text-ink">
            <p>
              <span className="font-semibold text-forest">You're growing in {(kindLabel(growthInsight.category) ?? growthInsight.category).toLowerCase()} scenarios.</span>{' '}
              Across your {growthInsight.attempts} tries, your more recent responses were stronger than your first ones.
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              After each response, Wivoza privately notes how well it handled the moment. It&rsquo;s never shown as a
              grade, and no one else sees it; it&rsquo;s only used to compare your earlier and later tries at the same
              kind of situation.
            </p>
            <button
              type="button"
              onClick={() => {
                setCategory(growthInsight.category)
                handleNewScenario(growthInsight.category)
              }}
              disabled={generating}
              className="mt-2 text-sm font-semibold text-forest hover:text-terracotta-600 disabled:opacity-60"
            >
              Practice another one →
            </button>
          </div>
        </div>
      )}

      <Link
                  to="/work?surface=practice"
                  className="inline-block text-sm font-semibold text-terracotta-600 hover:text-terracotta"
                >
                  All your work →
                </Link>
    </div>
  )
}
