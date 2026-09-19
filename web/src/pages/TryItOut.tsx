import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import PastList from '../components/PastList'
import ReflectionTimeline from '../components/ReflectionTimeline'
import ShareButton from '../components/ShareButton'
import { ArrowUpIcon, MicIcon, StarIcon } from '../components/icons'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import { isExperienced } from '../lib/experience'
import { GRADE_BANDS } from '../lib/gradeBands'
import {
  generateScenario,
  getAttempts,
  getProfile,
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

type StarterScenario = { label: string; category: string }

const STARTER_SCENARIOS: StarterScenario[] = [
  { label: 'A student is checked out and not participating', category: 'disengagement' },
  { label: 'A student pushes back when you ask them to do something', category: 'defiance' },
  { label: 'The class is slow to settle into a routine', category: 'transitions' },
]

// Harder, less textbook moments for teachers six or more years in.
const EXPERIENCED_SCENARIOS: StarterScenario[] = [
  { label: 'A capable student has quietly stopped trying', category: 'disengagement' },
  { label: 'A student challenges you in front of the class — and has a point', category: 'defiance' },
  { label: 'A conflict between students has spilled in from outside class', category: 'peer_conflict' },
]

const SESSION_LENGTH = 3

function difficultyLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function TryItOut() {
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [gradeBand, setGradeBand] = useState<(typeof GRADE_BANDS)[number]>('6-8')
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined)
  const [subject, setSubject] = useState<string | undefined>(undefined)
  const [starterScenarios, setStarterScenarios] = useState<StarterScenario[] | null>(null)

  const [attempt, setAttempt] = useState<ScenarioAttempt | null>(null)
  const [responseText, setResponseText] = useState('')
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
  // The situation/grade/difficulty choices start open inside the start card,
  // so nobody misses that scenarios can be tailored; Hide folds them into
  // the one-line summary for anyone who prefers a tidier card.
  const [customizing, setCustomizing] = useState(true)

  const [allAttempts, setAllAttempts] = useState<ScenarioAttempt[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

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
      .finally(() => setHistoryLoading(false))

    getProfile()
      .then((profile) => {
        const levels = profile.gradeLevels?.toLowerCase() ?? ''
        if (/\b(9|10|11|12)\b|9-12|high ?school/.test(levels)) setGradeBand('9-12')
        else if (/\bk\b|kindergarten|\b[1-5](st|nd|rd|th)?\b|elementary|k-5/.test(levels)) setGradeBand('K-5')
        const firstSubject = profile.subjects?.split(',')[0]?.trim()
        if (firstSubject) setSubject(firstSubject)
        setStarterScenarios(isExperienced(profile.experienceLevel) ? EXPERIENCED_SCENARIOS : STARTER_SCENARIOS)
      })
      .catch(() => setStarterScenarios(STARTER_SCENARIOS))

    const suggested = sessionStorage.getItem('classcoach.suggestedCategory')
    if (suggested) setCategory(suggested)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryTally = useMemo(() => {
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

  async function handleNewScenario(categoryOverride?: string) {
    setGenerating(true)
    setError(null)
    setAttempt(null)
    setResponseText('')
    setChatDraft('')
    setChatError(null)
    try {
      const scenario = await generateScenario(categoryOverride ?? category, gradeBand, difficulty, subject)
      setAttempt({
        id: `draft-${scenario.id}`,
        scenarioId: scenario.id,
        responseText: '',
        feedback: null,
        modelResponse: null,
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

  const hasFeedback = attempt && (attempt.feedback || attempt.modelResponse)
  const difficultyText = (DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? 'Any difficulty').toLowerCase()
  const situationText = category ? categoryLabel(category).toLowerCase() : 'any situation'
  const sessionAttempts = sessionState?.done
    ? sessionState.attemptIds.map((id) => allAttempts.find((a) => a.id === id)).filter((a): a is ScenarioAttempt => !!a)
    : []
  const unsavedInSession = sessionAttempts.filter((a) => !a.saved)

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          !attempt && !sessionState?.done
            ? 'rounded-3xl bg-forest p-6 text-cream sm:p-8'
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
                    <span className="block text-xs font-semibold text-forest">{categoryLabel(a.scenario.category)}</span>
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
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Practice a scenario</p>
            <p className="mt-2 font-heading text-2xl font-bold text-cream">Ready when you are.</p>
            <p className="mt-1 text-sm text-cream/70">Pick a moment to rehearse, or let Wivoza build a new one for you.</p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(starterScenarios ?? []).map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setCategory(s.category)
                    handleNewScenario(s.category)
                  }}
                  disabled={generating}
                  className={`rounded-2xl p-4 text-left text-sm font-medium text-forest transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
                    ['bg-peach-tint', 'bg-gold-tint', 'bg-mint-tint'][i % 3]
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                    {categoryLabel(s.category)}
                  </span>
                  <p className="mt-1.5">{s.label}</p>
                </button>
              ))}
            </div>
            {(generating || submitting) && (
              <div className={`mt-4 flex justify-center ${attempt ? 'text-forest' : 'text-gold'}`}>
                <ProgressRing
                  progress={workingProgress}
                  label={generating ? 'Building a scenario' : 'Reading your response'}
                  hint="Usually under ten seconds."
                />
              </div>
            )}
            <div className="mt-5 rounded-2xl bg-cream/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-cream/80">
                  <span className="font-semibold text-cream">New scenarios:</span> {situationText} · grades {gradeBand} ·{' '}
                  {difficultyText}
                </p>
                <button
                  type="button"
                  onClick={() => setCustomizing((v) => !v)}
                  aria-expanded={customizing}
                  className="text-sm font-semibold text-gold hover:text-cream"
                >
                  {customizing ? 'Hide' : 'Change'}
                </button>
              </div>
              {customizing && (
                <div className="mt-4 flex flex-col gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Situation</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {CATEGORIES.map(({ label, value }) => {
                        const count = value ? categoryTally.get(value) : undefined
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setCategory(value)}
                            title={count ? `You've practiced this ${count === 1 ? 'once' : `${count} times`}` : undefined}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                              category === value ? 'bg-gold text-forest' : 'bg-cream/10 text-cream/80 hover:bg-cream/20 hover:text-cream'
                            }`}
                          >
                            {label === 'All' ? 'Any situation' : label}
                            {count ? ` · ${count} practiced` : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Grade band</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {GRADE_BANDS.map((band) => (
                        <button
                          key={band}
                          type="button"
                          onClick={() => setGradeBand(band)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            gradeBand === band ? 'bg-gold text-forest' : 'bg-cream/10 text-cream/80 hover:bg-cream/20 hover:text-cream'
                          }`}
                        >
                          Grades {band}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Difficulty</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {DIFFICULTIES.map(({ label, value }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setDifficulty(value)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            difficulty === value ? 'bg-gold text-forest' : 'bg-cream/10 text-cream/80 hover:bg-cream/20 hover:text-cream'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleNewScenario()}
                disabled={generating}
                className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90 disabled:opacity-60"
              >
                {generating ? 'Generating...' : 'New Scenario'}
              </button>
              <button
                type="button"
                onClick={handleStartSession}
                disabled={generating}
                className="rounded-full border border-cream/30 px-6 py-3 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10 disabled:opacity-60"
              >
                Quick Session ({SESSION_LENGTH} scenarios)
              </button>
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
                {categoryLabel(attempt.scenario.category)} · Grades {attempt.scenario.gradeBand} ·{' '}
                {difficultyLabel(attempt.scenario.difficulty)}
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
                    placeholder="Describe what you'd say or do..."
                    className="rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                  />
                </label>
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
                <div className="rounded-2xl bg-cream p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                    Your response
                  </p>
                  <p className="mt-1.5 text-sm text-ink">{attempt.responseText}</p>
                </div>

                {attempt.feedback && (
                  <div className="rounded-2xl bg-peach-tint/50 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Coaching</p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{attempt.feedback}</p>
                  </div>
                )}

                {attempt.modelResponse && (
                  <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                      A model response to compare against
                    </p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{attempt.modelResponse}</p>
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
              <span className="font-semibold text-forest">You're growing in {categoryLabel(growthInsight.category).toLowerCase()} scenarios.</span>{' '}
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

      <PastList
        title="Your practice"
        items={allAttempts.map((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          label: categoryLabel(a.scenario.category),
          text: a.scenario.text,
          saved: a.saved,
        }))}
        activeId={attempt && !attempt.id.startsWith('draft-') ? attempt.id : null}
        loading={historyLoading}
        emptyText="Nothing yet. Every scenario you respond to will be kept here, with its feedback."
        onOpen={handleOpenPast}
      />
    </div>
  )
}
