import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AnswerSection, { NumberedCard } from '../components/AnswerSection'
import PastList, { type PastItem } from '../components/PastList'
import { ShareIcon, StarIcon } from '../components/icons'
import CoachingChat from '../components/CoachingChat'
import ExportModal from '../components/ExportModal'
import { PanelHeader } from '../components/PanelHeader'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { Spinner } from '../components/Spinner'
import { UpgradeMessage } from '../components/UpgradeMessage'
import {
  applyLessonPlanRevision,
  extractPresentationText,
  generateLessonDeck,
  generatePresentation,
  generateLessonPlan,
  getLessonPlans,
  getPresentationFeedback,
  sendLessonPlanChat,
  setLessonPlanSaved,
  shareLessonPlan,
  submitLessonPlanFeedback,
  submitPresentationReview,
  type LessonPlan,
  type LessonPlanContext,
  type LessonPlanDeliveryCoaching,
  type LessonPlanPresentationReview,
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
  const [tab, setTab] = useState<'generate' | 'feedback' | 'presentation'>('generate')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Plan</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Lesson Planning<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">
          Get feedback on a plan you wrote, generate a sample plan for ideas, or get feedback on a presentation.
        </p>
        <Link
          to="/guide/lesson-planning"
          className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('generate')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'generate' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Generate Ideas
        </button>
        <button
          type="button"
          onClick={() => setTab('feedback')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'feedback' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Get Feedback
        </button>
        <button
          type="button"
          onClick={() => setTab('presentation')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'presentation' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Review a Presentation
        </button>
      </div>

      {tab === 'generate' ? <GeneratePanel /> : tab === 'feedback' ? <FeedbackPanel /> : <PresentationPanel />}
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
    'rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60'

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
    <div className="-mx-6 -mt-6 bg-forest px-6 py-6 text-cream sm:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
        {plan.mode === 'generated' ? 'Sample plan' : 'Feedback'}
        {plan.subject ? ` · ${plan.subject}` : ''}
        {plan.gradeLevel ? ` · ${plan.gradeLevel}` : ''}
      </p>
      {plan.objective && <p className="mt-2 font-heading text-xl font-bold leading-snug text-cream">{plan.objective}</p>}
      {plan.standard && <p className="mt-1 text-xs text-cream/70">Standard: {plan.standard}</p>}
    </div>
  )
}

// The sample plan's parts, in teaching order, each with what it's for.
const PLAN_PARTS: { key: 'doNow' | 'agenda' | 'closure' | 'hots' | 'homework'; title: string; subtitle: string }[] = [
  { key: 'doNow', title: 'Do Now', subtitle: 'How students start — the first few minutes' },
  { key: 'agenda', title: 'Agenda', subtitle: 'The main activities, in order' },
  { key: 'closure', title: 'Closure', subtitle: 'How the lesson wraps up and checks what students learned' },
  { key: 'hots', title: 'Higher-order thinking', subtitle: 'Where students analyze, evaluate or create' },
  { key: 'homework', title: 'Homework', subtitle: 'Practice after class' },
]

const REVIEW_PARTS: { key: keyof LessonPlanPresentationReview; title: string; subtitle: string }[] = [
  { key: 'gradeLevelFit', title: 'Grade-level fit', subtitle: 'Whether the content and language suit your students' },
  { key: 'visuals', title: 'Visuals', subtitle: 'How the slides look and read from the back of the room' },
  { key: 'ideas', title: 'Ideas', subtitle: 'The content, and how it builds from slide to slide' },
  { key: 'length', title: 'Length', subtitle: 'Whether it fits the time you have' },
  { key: 'implementation', title: 'Implementation', subtitle: 'How to run it in class' },
]

type Part = { title: string; subtitle: string; body: string }

function presentParts(parts: { title: string; subtitle: string; body: string | null }[]): Part[] {
  return parts.filter((part): part is Part => !!part.body)
}

function PartSections({ parts, start = 1 }: { parts: Part[]; start?: number }) {
  return (
    <>
      {parts.map((part, i) => (
        <AnswerSection key={part.title} n={start + i} title={part.title} subtitle={part.subtitle}>
          {part.body}
        </AnswerSection>
      ))}
    </>
  )
}

// Builds the lesson as a classroom-ready deck that follows the delivery
// coaching: preview first, then download as PowerPoint.
function LessonDeckButton({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-2.5 self-start rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest shadow-sm transition-colors hover:border-forest/50 hover:bg-cream"
      >
        <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-[#D24726] px-1 text-[11px] font-extrabold text-white">P</span>
        Create as PowerPoint
      </button>
      {open && (
        <ExportModal
          sessionId={planId}
          text="lesson-deck"
          initialFormat="pptx"
          slidesOnly
          chipLabel="Lesson presentation"
          changesLabel="How your delivery plan is built in"
          loader={() => generateLessonDeck(planId).then((result) => result.model)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function DeliveryCoachingCard({ n, coaching, planId }: { n: number; coaching: LessonPlanDeliveryCoaching; planId: string }) {
  const rows: [string, string | null][] = [
    ['Opening hook', coaching.openingHook],
    ['Pacing & timing', coaching.pacing],
    ['Engagement checkpoints', coaching.engagementCheckpoints],
    ['Explaining the hard part', coaching.explainingTheHardPart],
    ['Closing', coaching.closing],
  ]
  return (
    <NumberedCard n={n} title="Presentation & delivery" subtitle="How to teach it — opening, pacing, engagement and closing">
      <div className="flex flex-col gap-3">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{value}</p>
            </div>
          ) : null,
        )}
        <p className="text-xs text-ink-soft">Turn this into a slide deck you can project: your hook first, a timed agenda, checks for understanding, and your delivery notes in the speaker notes.</p>
        <LessonDeckButton planId={planId} />
      </div>
    </NumberedCard>
  )
}

function SuggestedRevisionCard({
  n,
  text,
  applying,
  onApply,
  onDismiss,
}: {
  n: number
  text: string
  applying: boolean
  onApply: () => void
  onDismiss: () => void
}) {
  return (
    <NumberedCard n={n} title="Suggested revision" subtitle="A rewritten version from your conversation — use it or dismiss it">
      <p className="whitespace-pre-wrap text-sm text-ink">{text}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
        >
          {applying ? (
            <span className="flex items-center gap-2">
              <Spinner /> Applying...
            </span>
          ) : (
            'Use this version'
          )}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={applying}
          className="text-sm font-medium text-ink-soft hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      <WorkingRing active={applying} estimatedMs={12000} label="Applying the revision" className="mt-3 text-forest" />
    </NumberedCard>
  )
}

function SaveButton({ plan, onToggle }: { plan: LessonPlan; onToggle: (plan: LessonPlan) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(plan)}
      className={`flex items-center gap-1.5 text-sm font-medium ${
        plan.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
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
      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
    >
      <ShareIcon className="h-4 w-4" />
      {copied ? 'Link copied' : url ? 'Copy link' : busy ? 'Sharing...' : 'Share'}
    </button>
  )
}

function toPastItem(plan: LessonPlan): PastItem {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    label: [plan.subject, plan.gradeLevel].filter(Boolean).join(' · ') || null,
    text: plan.objective || plan.fileName || plan.planText?.slice(0, 200) || 'Lesson plan',
    saved: plan.saved,
  }
}

function GeneratePanel() {
  const [context, setContext] = useState<ContextForm>(EMPTY_CONTEXT)
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const generateProgress = useSimulatedProgress(generating, 12000)
  const [error, setError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  useEffect(() => {
    getLessonPlans({ mode: 'generated' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  async function handlePresentationFeedback() {
    if (!plan || deliveryLoading) return
    setDeliveryLoading(true)
    setDeliveryError(null)
    try {
      const updated = await getPresentationFeedback(plan.id)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setDeliveryError((err as Error).message || 'Could not put together delivery feedback. Please try again.')
    } finally {
      setDeliveryLoading(false)
    }
  }

  async function handleGenerate() {
    if (!context.objective.trim() || generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateLessonPlan(toApiContext(context))
      setPlan(result)
      setAllPlans((prev) => [result, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a sample plan. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleNew() {
    setPlan(null)
    setError(null)
    setDeliveryError(null)
  }

  // Reopens an earlier plan in full, with everything that came after it.
  function handleOpenPast(id: string) {
    const past = allPlans.find((p) => p.id === id)
    if (!past) return
    setPlan(past)
    setError(null)
    setDeliveryError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const planParts = plan ? presentParts(PLAN_PARTS.map((part) => ({ ...part, body: plan[part.key] }))) : []

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Lesson Planning" title="Generate ideas">
              Give a clear objective and any context you have — get a sample single-day plan modeled on a
              gradual-release template, for ideas. Not a plan you have to follow.
            </PanelHeader>
            <ContextFields context={context} onChange={setContext} disabled={generating} />
            {generating && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={generateProgress} label="Drafting a sample day" hint="Usually about fifteen seconds." />
              </div>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !context.objective.trim()}
              className="self-end rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Generating...
                </span>
              ) : (
                'Generate Sample Plan'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PlanHeader plan={plan} />
            <PartSections parts={planParts} />

            <p className="text-xs text-ink-soft">This is a sample for ideas — adjust it to fit your class.</p>

            {plan.deliveryCoaching && <DeliveryCoachingCard n={planParts.length + 1} coaching={plan.deliveryCoaching} planId={plan.id} />}
            <WorkingRing
              active={deliveryLoading}
              estimatedMs={14000}
              label="Coaching how to teach it"
              hint="Opening, pacing, engagement, and closing."
              className="text-forest"
            />
            {deliveryError && <p className="text-sm text-terracotta-600">{deliveryError}</p>}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SaveButton plan={plan} onToggle={handleToggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
                <Link
                  to={`/lesson-planning/${plan.id}/export`}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600"
                >
                  Download
                </Link>
                <button
                  type="button"
                  onClick={handlePresentationFeedback}
                  disabled={deliveryLoading}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
                >
                  {deliveryLoading ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Getting feedback...
                    </span>
                  ) : plan.deliveryCoaching ? (
                    'Regenerate ↻'
                  ) : (
                    'Get presentation & delivery feedback'
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                New Sample Plan
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      <PastList
        title="Your sample plans"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Sample plans you generate will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}

function FeedbackPanel() {
  const [planText, setPlanText] = useState('')
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const feedbackProgress = useSimulatedProgress(submitting, 12000)
  const [error, setError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [applyingRevision, setApplyingRevision] = useState(false)
  const [revisionDismissed, setRevisionDismissed] = useState(false)

  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  useEffect(() => {
    getLessonPlans({ mode: 'feedback' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const canSubmit = planText.trim().length > 0

  async function handlePresentationFeedback() {
    if (!plan || deliveryLoading) return
    setDeliveryLoading(true)
    setDeliveryError(null)
    try {
      const updated = await getPresentationFeedback(plan.id)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setDeliveryError((err as Error).message || 'Could not put together delivery feedback. Please try again.')
    } finally {
      setDeliveryLoading(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitLessonPlanFeedback({ objective: '' }, planText.trim())
      setPlan(result)
      setAllPlans((prev) => [result, ...prev])
      setChatDraft('')
      setChatError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!plan || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendLessonPlanChat(plan.id, trimmed)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setRevisionDismissed(false)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  async function handleApplyRevision() {
    if (!plan || applyingRevision) return
    setApplyingRevision(true)
    try {
      const updated = await applyLessonPlanRevision(plan.id)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch {
      setChatError('Could not apply the revision. Please try again.')
    } finally {
      setApplyingRevision(false)
    }
  }

  function handleNew() {
    setPlan(null)
    setPlanText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
    setRevisionDismissed(false)
    setDeliveryError(null)
  }

  // Reopens an earlier plan in full, follow-up conversation included.
  function handleOpenPast(id: string) {
    const past = allPlans.find((p) => p.id === id)
    if (!past) return
    setPlan(past)
    setError(null)
    setChatDraft('')
    setChatError(null)
    setRevisionDismissed(false)
    setDeliveryError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const feedbackParts = plan
    ? presentParts([
        { title: 'Your plan', subtitle: 'What you shared', body: plan.planText },
        { title: 'Coaching', subtitle: "What's working, and what to try", body: plan.feedback },
      ])
    : []
  const showRevision = !!plan?.suggestedRevision && !revisionDismissed

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Lesson Planning" title="Get feedback">
              Paste or write a plan you already have and get coaching feedback on it.
            </PanelHeader>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Your lesson plan</span>
              <textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                disabled={submitting}
                rows={8}
                placeholder="Paste or write your plan — Do Now, main activities, closure, etc."
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
              />
            </label>

            {submitting && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={feedbackProgress} label="Reading your plan" hint="Usually about fifteen seconds." />
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}

              className="self-end rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Getting feedback...
                </span>
              ) : (
                'Get Feedback'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PlanHeader plan={plan} />
            <PartSections parts={feedbackParts} />
            <CoachingChat
              messages={plan.conversation.slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              placeholder="Ask a follow-up, or ask the coach to revise your plan..."
            />
            {showRevision && plan.suggestedRevision && (
              <SuggestedRevisionCard
                n={feedbackParts.length + 1}
                text={plan.suggestedRevision}
                applying={applyingRevision}
                onApply={handleApplyRevision}
                onDismiss={() => setRevisionDismissed(true)}
              />
            )}
            {plan.deliveryCoaching && (
              <DeliveryCoachingCard n={feedbackParts.length + (showRevision ? 2 : 1)} coaching={plan.deliveryCoaching} planId={plan.id} />
            )}
            <WorkingRing
              active={deliveryLoading}
              estimatedMs={14000}
              label="Coaching how to teach it"
              hint="Opening, pacing, engagement, and closing."
              className="text-forest"
            />
            {deliveryError && <p className="text-sm text-terracotta-600">{deliveryError}</p>}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SaveButton plan={plan} onToggle={handleToggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
                <Link
                  to={`/lesson-planning/${plan.id}/export`}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600"
                >
                  Download
                </Link>
                <button
                  type="button"
                  onClick={handlePresentationFeedback}
                  disabled={deliveryLoading}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
                >
                  {deliveryLoading ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Getting feedback...
                    </span>
                  ) : plan.deliveryCoaching ? (
                    'Regenerate ↻'
                  ) : (
                    'Get presentation & delivery feedback'
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                New Plan
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      <PastList
        title="Your plan feedback"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Plans you get feedback on will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}

function PresentationPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMs, setExtractMs] = useState(5000)
  const extractProgress = useSimulatedProgress(extracting, extractMs)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [slideCount, setSlideCount] = useState<number | null>(null)

  const [gradeLevel, setGradeLevel] = useState('')
  const [subject, setSubject] = useState('')
  const [objective, setObjective] = useState('')

  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const reviewProgress = useSimulatedProgress(submitting, 14000)
  const [error, setError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [generateOpen, setGenerateOpen] = useState(false)
  // The original upload, kept only in this browser tab so the improved deck can
  // copy the teacher's own pictures. It's tied to the plan it was reviewed for.
  const [originalFile, setOriginalFile] = useState<{ planId: string; file: File } | null>(null)
  const [applyingRevision, setApplyingRevision] = useState(false)
  const [revisionDismissed, setRevisionDismissed] = useState(false)

  useEffect(() => {
    getLessonPlans({ mode: 'presentation' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  async function handleFile(selected: File) {
    setFile(selected)
    // Reading a deck is an upload plus parsing, so a bigger file takes longer —
    // scale the estimate so the ring's pace looks honest.
    setExtractMs(Math.min(20000, 3000 + (selected.size / 1_048_576) * 1500))
    setExtracting(true)
    setExtractError(null)
    setExtractedText(null)
    setSlideCount(null)
    try {
      const result = await extractPresentationText(selected)
      setExtractedText(result.text)
      setSlideCount(result.slideCount)
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Could not read that file. Please try a different export.')
    } finally {
      setExtracting(false)
    }
  }

  function handleRemoveFile() {
    setFile(null)
    setExtractedText(null)
    setSlideCount(null)
    setExtractError(null)
  }

  async function handleSubmit() {
    if (!extractedText || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitPresentationReview({
        text: extractedText,
        fileName: file?.name,
        slideCount: slideCount ?? undefined,
        gradeLevel: gradeLevel.trim() || undefined,
        subject: subject.trim() || undefined,
        objective: objective.trim() || undefined,
      })
      setPlan(result)
      if (file) setOriginalFile({ planId: result.id, file })
      setAllPlans((prev) => [result, ...prev])
      setChatDraft('')
      setChatError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not review this presentation. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!plan || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendLessonPlanChat(plan.id, trimmed)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setRevisionDismissed(false)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  async function handleApplyRevision() {
    if (!plan || applyingRevision) return
    setApplyingRevision(true)
    try {
      const updated = await applyLessonPlanRevision(plan.id)
      setPlan(updated)
      setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch {
      setChatError('Could not apply the revision. Please try again.')
    } finally {
      setApplyingRevision(false)
    }
  }

  function handleNew() {
    setFile(null)
    setExtractedText(null)
    setSlideCount(null)
    setExtractError(null)
    setGradeLevel('')
    setSubject('')
    setObjective('')
    setPlan(null)
    setOriginalFile(null)
    setError(null)
    setChatDraft('')
    setChatError(null)
    setRevisionDismissed(false)
  }

  // Reopens an earlier plan in full, follow-up conversation included.
  function handleOpenPast(id: string) {
    const past = allPlans.find((p) => p.id === id)
    if (!past) return
    setPlan(past)
    setError(null)
    setChatDraft('')
    setChatError(null)
    setRevisionDismissed(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const originalForPlan = plan && originalFile?.planId === plan.id ? originalFile.file : null
  const review = plan?.presentationReview
  const reviewParts = review ? presentParts(REVIEW_PARTS.map((part) => ({ ...part, body: review[part.key] }))) : []
  const showRevision = !!plan?.suggestedRevision && !revisionDismissed

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Lesson Planning" title="Review a presentation">
              Upload a presentation you've already built — get feedback on grade-level fit, visuals, ideas, length,
              and how to actually run it in class.
            </PanelHeader>

            {!extractedText ? (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-terracotta/30 bg-peach-tint/30 px-4 py-8 text-center transition-colors hover:border-terracotta/40">
                {extracting ? (
                  <ProgressRing
                    progress={extractProgress}
                    size={84}
                    label="Reading your presentation"
                    hint="Pulling the text and slide images out — this only takes a moment."
                    className="text-forest"
                  />
                ) : (
                  <>
                    <span className="text-sm font-medium text-ink">Click to upload a .pptx or .pdf</span>
                    <span className="text-xs text-ink-soft">Export Google Slides or Keynote as PDF first if needed.</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pptx,.pdf"
                  className="hidden"
                  disabled={extracting}
                  onChange={(e) => {
                    const selected = e.target.files?.[0]
                    if (selected) void handleFile(selected)
                    e.target.value = ''
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-hairline bg-cream px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{file?.name}</p>
                  <p className="text-xs text-ink-soft">
                    {slideCount != null ? `${slideCount} slide${slideCount === 1 ? '' : 's'} read` : 'Ready'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={submitting}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            )}
            {extractError && <p className="text-sm text-terracotta-600">{extractError}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Grade level (optional)</span>
                <input
                  type="text"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. 9th grade"
                  className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Subject (optional)</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={submitting}
                  placeholder="e.g. Biology"
                  className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What's this presentation about? (optional)</span>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Introducing photosynthesis"
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
              />
            </label>

            {submitting && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={reviewProgress} label="Reading your presentation" hint="Usually about twenty seconds." />
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !extractedText}

              className="self-end rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Reviewing...
                </span>
              ) : (
                'Review Presentation'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="-mx-6 -mt-6 bg-forest px-6 py-6 text-cream sm:px-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                Presentation review
                {plan.subject ? ` · ${plan.subject}` : ''}
                {plan.gradeLevel ? ` · ${plan.gradeLevel}` : ''}
              </p>
              <p className="mt-2 font-heading text-xl font-bold leading-snug text-cream">
                {plan.objective || plan.fileName || 'Your presentation'}
              </p>
              {plan.slideCount != null && (
                <p className="mt-1 text-xs text-cream/70">
                  {plan.slideCount} slide{plan.slideCount === 1 ? '' : 's'}
                </p>
              )}
            </div>

            <PartSections parts={reviewParts} />

            <NumberedCard
              n={reviewParts.length + 1}
              title="Create an improved presentation"
              subtitle="Apply every recommendation above and build it as a new deck"
            >
              <p className="text-sm leading-relaxed text-ink-soft">
                Wivoza rebuilds your presentation with the clearer wording, visuals, pacing checks, and length changes recommended
                above, in a design that fits your subject. You'll preview it before you download.
              </p>
              {plan && originalForPlan ? (
                <p className="mt-3 text-sm font-medium text-forest">
                  ✓ Your own pictures from {originalForPlan.name} will be kept in the new deck.
                </p>
              ) : (
                <label className="mt-3 flex cursor-pointer flex-col gap-0.5 rounded-xl border border-dashed border-terracotta/40 bg-peach-tint/30 px-4 py-3 text-sm hover:border-terracotta/60">
                  <span className="font-semibold text-forest">Keep your own pictures — add your original file again</span>
                  <span className="text-xs text-ink-soft">
                    Optional. It's used only to copy your pictures into the new deck, and it isn't stored.
                  </span>
                  <input
                    type="file"
                    accept=".pptx,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0]
                      if (picked && plan) setOriginalFile({ planId: plan.id, file: picked })
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => setGenerateOpen(true)}
                className="mt-3 flex items-center gap-2.5 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest shadow-sm transition-colors hover:border-forest/50 hover:bg-cream"
              >
                <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-[#D24726] px-1 text-[11px] font-extrabold text-white">P</span>
                Create improved presentation
              </button>
            </NumberedCard>

            <CoachingChat
              messages={plan.conversation.slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              placeholder="Ask a follow-up, or ask the coach to revise a slide..."
            />
            {showRevision && plan.suggestedRevision && (
              <SuggestedRevisionCard
                n={reviewParts.length + 2}
                text={plan.suggestedRevision}
                applying={applyingRevision}
                onApply={handleApplyRevision}
                onDismiss={() => setRevisionDismissed(true)}
              />
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SaveButton plan={plan} onToggle={handleToggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
                <Link
                  to={`/lesson-planning/${plan.id}/export`}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600"
                >
                  Download
                </Link>
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                New Presentation
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      {generateOpen && plan && (
        <ExportModal
          sessionId={plan.id}
          text={originalForPlan ? `presentation:${originalForPlan.name}:${originalForPlan.size}` : 'presentation'}
          initialFormat="pptx"
          slidesOnly
          loader={() => generatePresentation(plan.id, originalForPlan ?? undefined).then((result) => result.model)}
          onClose={() => setGenerateOpen(false)}
        />
      )}

      <PastList
        title="Your presentation reviews"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Presentations you review will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}
