import { useEffect, useState } from 'react'
import { ShareIcon, StarIcon } from '../components/icons'
import {
  generateLessonPlan,
  getLessonPlans,
  setLessonPlanSaved,
  shareLessonPlan,
  submitLessonPlanFeedback,
  type LessonPlan,
  type LessonPlanContext,
} from '../lib/api'

type ContextForm = {
  objective: string
  unitName: string
  essentialQuestion: string
  standard: string
  subject: string
  gradeLevel: string
}

const EMPTY_CONTEXT: ContextForm = {
  objective: '',
  unitName: '',
  essentialQuestion: '',
  standard: '',
  subject: '',
  gradeLevel: '',
}

function toApiContext(context: ContextForm): LessonPlanContext {
  return {
    objective: context.objective.trim(),
    unitName: context.unitName.trim() || undefined,
    essentialQuestion: context.essentialQuestion.trim() || undefined,
    standard: context.standard.trim() || undefined,
    subject: context.subject.trim() || undefined,
    gradeLevel: context.gradeLevel.trim() || undefined,
  }
}

export default function LessonPlanning() {
  const [tab, setTab] = useState<'generate' | 'feedback'>('generate')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Lesson Planning</h1>
        <p className="text-ink-soft">Get feedback on a plan you wrote, or generate a sample plan for ideas.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('generate')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'generate' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Generate Ideas
        </button>
        <button
          type="button"
          onClick={() => setTab('feedback')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'feedback' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Get Feedback
        </button>
      </div>

      {tab === 'generate' ? <GeneratePanel /> : <FeedbackPanel />}
    </div>
  )
}

function ContextFields({
  context,
  onChange,
  disabled,
}: {
  context: ContextForm
  onChange: (next: ContextForm) => void
  disabled?: boolean
}) {
  function set<K extends keyof ContextForm>(key: K, value: ContextForm[K]) {
    onChange({ ...context, [key]: value })
  }
  const inputClass =
    'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60'

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium text-ink">Objective (SWBAT)</span>
        <input
          value={context.objective}
          onChange={(e) => set('objective', e.target.value)}
          disabled={disabled}
          placeholder="e.g. SWBAT analyze how word choice affects tone in a poem"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Subject</span>
        <input
          value={context.subject}
          onChange={(e) => set('subject', e.target.value)}
          disabled={disabled}
          placeholder="e.g. English"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Grade level</span>
        <input
          value={context.gradeLevel}
          onChange={(e) => set('gradeLevel', e.target.value)}
          disabled={disabled}
          placeholder="e.g. 9th grade"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Standard</span>
        <input
          value={context.standard}
          onChange={(e) => set('standard', e.target.value)}
          disabled={disabled}
          placeholder="e.g. CCSS.RL.9.4"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Unit name</span>
        <input
          value={context.unitName}
          onChange={(e) => set('unitName', e.target.value)}
          disabled={disabled}
          placeholder="e.g. Poetry Unit"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium text-ink">Essential question</span>
        <input
          value={context.essentialQuestion}
          onChange={(e) => set('essentialQuestion', e.target.value)}
          disabled={disabled}
          placeholder="e.g. How does language shape meaning?"
          className={inputClass}
        />
      </label>
    </div>
  )
}

function PlanHeader({ plan }: { plan: LessonPlan }) {
  return (
    <div>
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
        {plan.mode === 'generated' ? 'Sample plan' : 'Feedback'}
        {plan.subject ? ` · ${plan.subject}` : ''}
        {plan.gradeLevel ? ` · ${plan.gradeLevel}` : ''}
      </span>
      <p className="mt-2 text-sm font-medium text-ink">{plan.objective}</p>
      {plan.standard && <p className="mt-0.5 text-xs text-ink-soft">Standard: {plan.standard}</p>}
    </div>
  )
}

function PlanSection({ label, value, accent }: { label: string; value: string | null; accent?: boolean }) {
  if (!value) return null
  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-brand-600' : 'text-ink-soft'}`}
      >
        {label}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  )
}

function SaveButton({ plan, onToggle }: { plan: LessonPlan; onToggle: (plan: LessonPlan) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(plan)}
      className={`flex items-center gap-1.5 text-sm font-medium ${
        plan.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
      }`}
    >
      <StarIcon className="h-4 w-4" filled={plan.saved} />
      {plan.saved ? 'Saved' : 'Save for later'}
    </button>
  )
}

function ShareButton({ onShare }: { onShare: () => Promise<{ shareToken: string }> }) {
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
      setUrl(`${window.location.origin}/shared/lesson-plan/${shareToken}`)
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

function HistoryList({
  title,
  loading,
  plans,
}: {
  title: string
  loading: boolean
  plans: LessonPlan[]
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      {loading ? (
        <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
      ) : plans.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Plans you save will show up here.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {plans.map((p) => (
            <SavedPlanCard key={p.id} plan={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function SavedPlanCard({ plan }: { plan: LessonPlan }) {
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
            {plan.mode === 'generated' ? 'Sample plan' : 'Feedback'}
          </span>
          <p className="mt-1.5 text-sm text-ink">{plan.objective}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {plan.mode === 'feedback' ? (
            <>
              {plan.planText && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Plan</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.planText}</p>
                </div>
              )}
              {plan.feedback && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.feedback}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {plan.doNow && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Do Now</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.doNow}</p>
                </div>
              )}
              {plan.agenda && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Agenda</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.agenda}</p>
                </div>
              )}
              {plan.closure && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Closure</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.closure}</p>
                </div>
              )}
              {plan.hots && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    Higher-order thinking
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.hots}</p>
                </div>
              )}
              {plan.homework && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Homework</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{plan.homework}</p>
                </div>
              )}
            </>
          )}
          <ShareButton onShare={() => shareLessonPlan(plan.id)} />
        </div>
      )}
    </div>
  )
}

function GeneratePanel() {
  const [context, setContext] = useState<ContextForm>(EMPTY_CONTEXT)
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getLessonPlans({ mode: 'generated' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const savedPlans = allPlans.filter((p) => p.saved)

  async function handleGenerate() {
    if (!context.objective.trim() || generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateLessonPlan(toApiContext(context))
      setPlan(result)
      setAllPlans((prev) => [result, ...prev])
    } catch {
      setError('Could not generate a sample plan. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleNew() {
    setPlan(null)
    setError(null)
  }

  async function handleToggleSaved(target: LessonPlan) {
    const nextSaved = !target.saved
    const apply = (p: LessonPlan) => (p.id === target.id ? { ...p, saved: nextSaved } : p)
    setAllPlans((prev) => prev.map(apply))
    if (plan?.id === target.id) setPlan((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setLessonPlanSaved(target.id, nextSaved)
    } catch {
      setAllPlans((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: !nextSaved } : p)))
      if (plan?.id === target.id) setPlan((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              Give a clear objective and any context you have — get a sample single-day plan modeled on a
              gradual-release template, for ideas. Not a plan you have to follow.
            </p>
            <ContextFields context={context} onChange={setContext} disabled={generating} />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !context.objective.trim()}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Sample Plan'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PlanHeader plan={plan} />
            <PlanSection label="Do Now" value={plan.doNow} />
            <PlanSection label="Agenda" value={plan.agenda} />
            <PlanSection label="Closure" value={plan.closure} />
            <PlanSection label="Higher-order thinking" value={plan.hots} accent />
            <PlanSection label="Homework" value={plan.homework} />

            <p className="text-xs text-ink-soft">This is a sample for ideas — adjust it to fit your class.</p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SaveButton plan={plan} onToggle={handleToggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                New Sample Plan
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <HistoryList title="Saved sample plans" loading={historyLoading} plans={savedPlans} />
    </div>
  )
}

function FeedbackPanel() {
  const [context, setContext] = useState<ContextForm>(EMPTY_CONTEXT)
  const [planText, setPlanText] = useState('')
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getLessonPlans({ mode: 'feedback' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const savedPlans = allPlans.filter((p) => p.saved)

  async function handleSubmit() {
    if (!context.objective.trim() || !planText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitLessonPlanFeedback(toApiContext(context), planText.trim())
      setPlan(result)
      setAllPlans((prev) => [result, ...prev])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNew() {
    setPlan(null)
    setPlanText('')
    setError(null)
  }

  async function handleToggleSaved(target: LessonPlan) {
    const nextSaved = !target.saved
    const apply = (p: LessonPlan) => (p.id === target.id ? { ...p, saved: nextSaved } : p)
    setAllPlans((prev) => prev.map(apply))
    if (plan?.id === target.id) setPlan((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setLessonPlanSaved(target.id, nextSaved)
    } catch {
      setAllPlans((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: !nextSaved } : p)))
      if (plan?.id === target.id) setPlan((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <ContextFields context={context} onChange={setContext} disabled={submitting} />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Your lesson plan</span>
              <textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                disabled={submitting}
                rows={8}
                placeholder="Paste or write your plan — Do Now, main activities, closure, etc."
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !context.objective.trim() || !planText.trim()}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Getting feedback...' : 'Get Feedback'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PlanHeader plan={plan} />
            <div className="rounded-xl border border-border bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your plan</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{plan.planText}</p>
            </div>
            {plan.feedback && (
              <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{plan.feedback}</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SaveButton plan={plan} onToggle={handleToggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                New Plan
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <HistoryList title="Saved feedback" loading={historyLoading} plans={savedPlans} />
    </div>
  )
}
