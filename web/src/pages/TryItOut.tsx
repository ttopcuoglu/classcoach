import { useEffect, useMemo, useState } from 'react'
import { StarIcon } from '../components/icons'
import {
  generateScenario,
  getAttempts,
  setAttemptSaved,
  submitAttempt,
  type ScenarioAttempt,
} from '../lib/api'

const CATEGORIES: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Defiance', value: 'defiance' },
  { label: 'Disengagement', value: 'disengagement' },
  { label: 'Peer conflict', value: 'peer_conflict' },
  { label: 'Disruption', value: 'disruption' },
  { label: 'Transitions', value: 'transitions' },
  { label: 'Technology misuse', value: 'technology_misuse' },
]

const GRADE_BANDS = ['6-8', '9-12'] as const

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export default function TryItOut() {
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [gradeBand, setGradeBand] = useState<(typeof GRADE_BANDS)[number]>('6-8')

  const [attempt, setAttempt] = useState<ScenarioAttempt | null>(null)
  const [responseText, setResponseText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allAttempts, setAllAttempts] = useState<ScenarioAttempt[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getAttempts()
      .then(setAllAttempts)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const savedAttempts = allAttempts.filter((a) => a.saved)

  const categoryTally = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of allAttempts) {
      counts.set(a.scenario.category, (counts.get(a.scenario.category) ?? 0) + 1)
    }
    return counts
  }, [allAttempts])

  async function handleNewScenario() {
    setGenerating(true)
    setError(null)
    setAttempt(null)
    setResponseText('')
    try {
      const scenario = await generateScenario(category, gradeBand)
      setAttempt({
        id: `draft-${scenario.id}`,
        scenarioId: scenario.id,
        responseText: '',
        feedback: null,
        modelResponse: null,
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

  const hasFeedback = attempt && (attempt.feedback || attempt.modelResponse)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Try It Out</h1>
        <p className="text-ink-soft">Practice realistic scenarios and get coaching on your approach.</p>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="flex gap-2">
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

      <div className="rounded-2xl border border-border bg-surface p-6">
        {!attempt ? (
          <div className="p-2 text-center">
            <p className="text-sm text-ink-soft">No scenario loaded yet.</p>
            <button
              type="button"
              onClick={handleNewScenario}
              disabled={generating}
              className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {generating ? 'Generating...' : 'New Scenario'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {categoryLabel(attempt.scenario.category)} · Grades {attempt.scenario.gradeBand}
              </span>
              <p className="mt-3 text-sm text-ink">{attempt.scenario.text}</p>
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
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleNewScenario}
                    disabled={generating}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Try a different scenario
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitResponse}
                    disabled={submitting || !responseText.trim()}
                    className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
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
                    onClick={handleNewScenario}
                    disabled={generating}
                    className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                  >
                    {generating ? 'Generating...' : 'New Scenario'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

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
        </div>
      )}
    </div>
  )
}
