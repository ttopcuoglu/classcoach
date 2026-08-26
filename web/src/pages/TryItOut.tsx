import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpIcon, MicIcon, ShareIcon, StarIcon } from '../components/icons'
import { CATEGORIES, categoryLabel } from '../lib/categories'
import {
  generateScenario,
  getAttempts,
  getDebriefs,
  getProfile,
  setAttemptSaved,
  setDebriefSaved,
  shareAttempt,
  shareDebrief,
  submitAttempt,
  submitDebrief,
  type Debrief,
  type ScenarioAttempt,
} from '../lib/api'

const GRADE_BANDS = ['K-5', '6-8', '9-12'] as const

const DIFFICULTIES: { label: string; value?: string }[] = [
  { label: 'Any difficulty' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
]

const SESSION_LENGTH = 3

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const SpeechRecognitionCtor: (new () => SpeechRecognitionLike) | undefined =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined

function difficultyLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export default function TryItOut() {
  const [tab, setTab] = useState<'practice' | 'debrief'>('practice')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Try It Out</h1>
        <p className="text-ink-soft">Practice realistic scenarios and get coaching on your approach.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('practice')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'practice' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Practice
        </button>
        <button
          type="button"
          onClick={() => setTab('debrief')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'debrief' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Debrief a Real Moment
        </button>
      </div>

      {tab === 'practice' ? <PracticePanel /> : <DebriefPanel />}
    </div>
  )
}

function PracticePanel() {
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [gradeBand, setGradeBand] = useState<(typeof GRADE_BANDS)[number]>('6-8')
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined)
  const [subject, setSubject] = useState<string | undefined>(undefined)

  const [attempt, setAttempt] = useState<ScenarioAttempt | null>(null)
  const [responseText, setResponseText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const [sessionState, setSessionState] = useState<{ index: number; total: number; done: boolean } | null>(
    null,
  )

  const [allAttempts, setAllAttempts] = useState<ScenarioAttempt[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

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
      })
      .catch(() => {})

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

  async function handleNewScenario() {
    setGenerating(true)
    setError(null)
    setAttempt(null)
    setResponseText('')
    try {
      const scenario = await generateScenario(category, gradeBand, difficulty, subject)
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

  function toggleListening() {
    if (!SpeechRecognitionCtor) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript
      }
      if (finalTranscript.trim()) {
        setResponseText((prev) => (prev ? `${prev} ${finalTranscript.trim()}` : finalTranscript.trim()))
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
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
                  ? 'border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-border bg-surface text-ink-soft hover:border-brand-400 hover:text-brand-600'
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
              gradeBand === band ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:text-ink'
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
              difficulty === value ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        {sessionState?.done ? (
          <div className="p-2 text-center">
            <p className="text-lg font-semibold text-ink">Session complete!</p>
            <p className="mt-1 text-sm text-ink-soft">
              You practiced {sessionState.total} scenarios back to back. Nice work.
            </p>
            <button
              type="button"
              onClick={handleEndSession}
              className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Back to practice
            </button>
          </div>
        ) : !attempt ? (
          <div className="p-2 text-center">
            <p className="text-sm text-ink-soft">No scenario loaded yet.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleNewScenario}
                disabled={generating}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                {generating ? 'Generating...' : 'New Scenario'}
              </button>
              <button
                type="button"
                onClick={handleStartSession}
                disabled={generating}
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
              >
                Quick Session ({SESSION_LENGTH} scenarios)
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              {sessionState && (
                <p className="mb-1.5 text-xs font-semibold text-ink-soft">
                  Quick Session — scenario {sessionState.index} of {sessionState.total}
                </p>
              )}
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {categoryLabel(attempt.scenario.category)} · Grades {attempt.scenario.gradeBand} ·{' '}
                {difficultyLabel(attempt.scenario.difficulty)}
              </span>
              <p className="mt-3 text-sm text-ink">{attempt.scenario.text}</p>
              {attempt.scenario.fallback && (
                <p className="mt-2 text-xs text-ink-soft">
                  Couldn't reach your coach for a fresh scenario, so here's one from the practice bank.
                </p>
              )}
            </div>

            {!hasFeedback ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">How would you handle this?</span>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    disabled={submitting}
                    rows={4}
                    placeholder="Describe what you'd say or do..."
                    className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
                  />
                </label>
                {SpeechRecognitionCtor && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={submitting}
                    className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      listening
                        ? 'border-warm-500 bg-warm-100 text-warm-500'
                        : 'border-border text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    <MicIcon className="h-3.5 w-3.5" />
                    {listening ? 'Listening... tap to stop' : 'Speak your response'}
                  </button>
                )}
                <div className="flex items-center justify-between">
                  {!sessionState && (
                    <button
                      type="button"
                      onClick={handleNewScenario}
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
                    className="ml-auto rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    {submitting ? 'Getting feedback...' : 'Get Feedback'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Your response
                  </p>
                  <p className="mt-1.5 text-sm text-ink">{attempt.responseText}</p>
                </div>

                {attempt.feedback && (
                  <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{attempt.feedback}</p>
                  </div>
                )}

                {attempt.modelResponse && (
                  <div className="rounded-xl border border-border bg-brand-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                      A model response to compare against
                    </p>
                    <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{attempt.modelResponse}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleToggleSaved(attempt)}
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      attempt.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                    }`}
                  >
                    <StarIcon className="h-4 w-4" filled={attempt.saved} />
                    {attempt.saved ? 'Saved' : 'Save for later'}
                  </button>
                  <button
                    type="button"
                    onClick={sessionState ? handleSessionAdvance : handleNewScenario}
                    disabled={generating}
                    className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
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
            )}
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      {growthInsight && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <ArrowUpIcon className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm text-ink">
            <span className="font-semibold text-brand-600">You're showing growth</span> in{' '}
            {categoryLabel(growthInsight.category)} scenarios.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Saved scenarios</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : savedAttempts.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Scenarios you save will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {savedAttempts.map((a) => (
              <SavedAttemptCard key={a.id} attempt={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShareButton({
  type,
  onShare,
}: {
  type: 'attempt' | 'debrief'
  onShare: () => Promise<{ shareToken: string }>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (url) {
      await navigator.clipboard.writeText(url).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    }
    setBusy(true)
    try {
      const { shareToken } = await onShare()
      setUrl(`${window.location.origin}/shared/${type}/${shareToken}`)
    } catch {
      // silently ignore — share is a nice-to-have, not a critical path
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-600 disabled:opacity-60"
    >
      <ShareIcon className="h-4 w-4" />
      {copied ? 'Link copied' : url ? 'Copy link' : busy ? 'Sharing...' : 'Share'}
    </button>
  )
}

function SavedAttemptCard({ attempt }: { attempt: ScenarioAttempt }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
            {categoryLabel(attempt.scenario.category)}
          </span>
          <p className="mt-1.5 text-sm text-ink">{attempt.scenario.text}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your response</p>
            <p className="mt-1 text-sm text-ink">{attempt.responseText}</p>
          </div>
          {attempt.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{attempt.feedback}</p>
            </div>
          )}
          {attempt.modelResponse && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Model response
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{attempt.modelResponse}</p>
            </div>
          )}
          <ShareButton type="attempt" onShare={() => shareAttempt(attempt.id)} />
        </div>
      )}
    </div>
  )
}

function DebriefPanel() {
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [incidentText, setIncidentText] = useState('')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allDebriefs, setAllDebriefs] = useState<Debrief[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getDebriefs()
      .then(setAllDebriefs)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const savedDebriefs = allDebriefs.filter((d) => d.saved)

  async function handleSubmit() {
    if (!incidentText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitDebrief(incidentText.trim(), category)
      setDebrief(result)
      setAllDebriefs((prev) => [result, ...prev])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNewDebrief() {
    setDebrief(null)
    setIncidentText('')
    setError(null)
  }

  async function handleToggleSaved(target: Debrief) {
    const nextSaved = !target.saved
    setAllDebriefs((prev) => prev.map((d) => (d.id === target.id ? { ...d, saved: nextSaved } : d)))
    if (debrief?.id === target.id) setDebrief((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setDebriefSaved(target.id, nextSaved)
    } catch {
      setAllDebriefs((prev) => prev.map((d) => (d.id === target.id ? { ...d, saved: !nextSaved } : d)))
      if (debrief?.id === target.id) setDebrief((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!debrief ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              Describe something that actually happened in your classroom today — get the same kind of
              coaching Try It Out gives hypotheticals, but reflective and forward-looking.
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.value).map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCategory(category === value ? undefined : value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    category === value
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What happened?</span>
              <textarea
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder="Describe the incident and how you handled it..."
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !incidentText.trim()}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Getting feedback...' : 'Get Feedback'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              {debrief.category && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                  {categoryLabel(debrief.category)}
                </span>
              )}
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                What happened
              </p>
              <p className="mt-1 text-sm text-ink">{debrief.incidentText}</p>
            </div>

            {debrief.feedback && (
              <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.feedback}</p>
              </div>
            )}

            {debrief.followUp && (
              <div className="rounded-xl border border-border bg-brand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Following up
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.followUp}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleToggleSaved(debrief)}
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  debrief.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={debrief.saved} />
                {debrief.saved ? 'Saved' : 'Save for later'}
              </button>
              <button
                type="button"
                onClick={handleNewDebrief}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Debrief Another Moment
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Saved debriefs</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : savedDebriefs.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Debriefs you save will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {savedDebriefs.map((d) => (
              <SavedDebriefCard key={d.id} debrief={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SavedDebriefCard({ debrief }: { debrief: Debrief }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          {debrief.category && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
              {categoryLabel(debrief.category)}
            </span>
          )}
          <p className="mt-1.5 text-sm text-ink">{debrief.incidentText}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {debrief.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{debrief.feedback}</p>
            </div>
          )}
          {debrief.followUp && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Following up</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{debrief.followUp}</p>
            </div>
          )}
          <ShareButton type="debrief" onShare={() => shareDebrief(debrief.id)} />
        </div>
      )}
    </div>
  )
}
