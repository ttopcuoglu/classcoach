import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
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

  const [sessionState, setSessionState] = useState<{ index: number; total: number; done: boolean } | null>(
    null,
  )

  const [allAttempts, setAllAttempts] = useState<ScenarioAttempt[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  useEffect(() => {
    getAttempts()
      .then(setAllAttempts)
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
  }, [])

  const savedAttempts = allAttempts.filter((a) => a.saved)

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

    let best: { category: string; delta: number } | null = null
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
      if (delta > 0 && (!best || delta > best.delta)) best = { category: cat, delta }
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
    setSessionState({ index: 1, total: SESSION_LENGTH, done: false })
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
    } catch {
      // reflection timeline is a nice-to-have; a failed update just leaves the button as-is
    }
  }

  async function handleSaveReflection(id: string, note: string) {
    try {
      const updated = await saveAttemptReflection(id, note)
      setAllAttempts((prev) => prev.map((a) => (a.id === id ? updated : a)))
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
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  const hasFeedback = attempt && (attempt.feedback || attempt.modelResponse)
  const filtersLocked = !!sessionState && !sessionState.done

  return (
    <div className="flex flex-col gap-6">
      <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
        {CATEGORIES.map(({ label, value }) => {
          const isActive = category === value
          const count = value ? categoryTally.get(value) : undefined
          return (
            <button
              key={label}
              type="button"
              onClick={() => setCategory(value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-forest bg-forest text-cream'
                  : 'border-hairline bg-cream-card text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
              }`}
            >
              {label}
              {count ? ` · ${count}` : ''}
            </button>
          )
        })}
      </div>

      <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
        {GRADE_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setGradeBand(band)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              gradeBand === band ? 'bg-gold text-forest' : 'bg-gold-tint/50 text-ink-soft hover:text-forest'
            }`}
          >
            Grades {band}
          </button>
        ))}
      </div>

      <div className={`flex flex-wrap gap-2 ${filtersLocked ? 'pointer-events-none opacity-50' : ''}`}>
        {DIFFICULTIES.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            onClick={() => setDifficulty(value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              difficulty === value ? 'bg-terracotta text-cream' : 'bg-peach-tint/50 text-ink-soft hover:text-forest'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={
          !attempt && !sessionState?.done
            ? 'rounded-3xl bg-forest p-6 text-cream sm:p-8'
            : 'rounded-2xl border border-hairline bg-cream-card p-6'
        }
      >
        {sessionState?.done ? (
          <div className="p-2 text-center">
            <p className="font-heading text-2xl font-bold text-forest">Session complete<span className="text-gold">!</span></p>
            <p className="mt-1 text-sm text-ink-soft">
              You practiced {sessionState.total} scenarios back to back. Nice work.
            </p>
            <button
              type="button"
              onClick={handleEndSession}
              className="mt-4 rounded-lg bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta/90"
            >
              Back to practice
            </button>
          </div>
        ) : !attempt ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Practice a scenario</p>
            <p className="mt-2 font-heading text-2xl font-bold text-cream">Ready when you are.</p>
            <p className="mt-1 text-sm text-cream/70">Pick a moment to rehearse, or let Wivoza build one from the filters above.</p>
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
        <div className="flex items-center gap-3 rounded-2xl bg-mint-tint/50 p-5">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-forest" />
          <p className="text-sm text-ink">
            <span className="font-semibold text-forest">You're showing growth</span> in{' '}
            {categoryLabel(growthInsight.category)} scenarios.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Saved scenarios</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : savedAttempts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing saved yet. Tap "Save for later" after feedback to keep a scenario here.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {savedAttempts.map((a) => (
              <SavedAttemptCard key={a.id} attempt={a} onMarkTried={handleMarkTried} onSaveReflection={handleSaveReflection} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SavedAttemptCard({
  attempt,
  onMarkTried,
  onSaveReflection,
}: {
  attempt: ScenarioAttempt
  onMarkTried: (id: string) => void
  onSaveReflection: (id: string, note: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-hairline bg-cream-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <span className="rounded-full bg-mint-tint/60 px-2 py-0.5 text-xs font-semibold text-forest">
            {categoryLabel(attempt.scenario.category)}
          </span>
          <p className="mt-1.5 text-sm text-ink">{attempt.scenario.text}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-hairline pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your response</p>
            <p className="mt-1 text-sm text-ink">{attempt.responseText}</p>
          </div>
          {attempt.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Coaching</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{attempt.feedback}</p>
            </div>
          )}
          {attempt.modelResponse && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-forest">
                Model response
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{attempt.modelResponse}</p>
            </div>
          )}
          <ShareButton type="attempt" onShare={() => shareAttempt(attempt.id)} />
          <ReflectionTimeline
            triedAt={attempt.triedAt}
            reflectionNote={attempt.reflectionNote}
            onMarkTried={() => onMarkTried(attempt.id)}
            onSaveReflection={(note) => onSaveReflection(attempt.id, note)}
          />
        </div>
      )}
    </div>
  )
}
