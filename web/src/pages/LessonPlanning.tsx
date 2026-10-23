import { useEffect, useRef, useState } from 'react'
import { canTakePhoto } from '../lib/device'
import { Link, useSearchParams } from 'react-router-dom'
import AssignmentCoach from './AssignmentCoach'
import AnswerSection, { NumberedCard } from '../components/AnswerSection'
import PastList, { type PastItem } from '../components/PastList'
import { CameraIcon, ClipboardIcon, CloseIcon, ShareIcon, StarIcon, UploadIcon } from '../components/icons'
import CoachingChat from '../components/CoachingChat'
import LessonWorkspace from '../components/LessonWorkspace'
import WeekWorkspace from '../components/WeekWorkspace'
import ExportModal from '../components/ExportModal'
import { PanelHeader } from '../components/PanelHeader'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { Spinner } from '../components/Spinner'
import { UpgradeMessage } from '../components/UpgradeMessage'
import {
  adaptLessonPlan,
  applyLessonAdaptation,
  applyLessonPlanRevision,
  discardLessonAdaptation,
  extractPresentationText,
  generateLessonDeck,
  generatePresentation,
  generateLessonPlan,
  getCoachHandoff,
  getLessonPlan,
  getLessonPlans,
  getPresentationFeedback,
  getProfile,
  inferLessonContext,
  revertLessonPlan,
  undoLessonAdaptation,
  sendLessonPlanChat,
  setLessonPlanSaved,
  shareLessonPlan,
  extractAssignmentText,
  submitLessonPlanFeedback,
  submitPresentationReview,
  startWeekPlan,
  type LessonAdaptation,
  type LessonPlan,
  type LessonPlanDeliveryCoaching,
  type LessonPlanPresentationReview,
  type WeekDayName,
} from '../lib/api'
import { takePlanningPrefill } from '../lib/communicationsPrefill'
import { DURATION_CHOICES } from '../lib/lessonCopy'

// Assignment Coach is the fourth chip rather than a seventh menu item. Every
// chip here is one planning job — start a lesson, strengthen one you have,
// read back something you already made — and a chip row puts them one tap
// apart instead of a tool apart. The tab lives in the URL so
// /assignment-coach can redirect straight into it and old links keep landing
// where a teacher expects.
//
// The values are unchanged ('generate', 'feedback', 'presentation',
// 'assignment') even though the labels are not: they are in links, redirects
// and bookmarks, and renaming a tab is no reason to break a URL a teacher
// saved.
type PlanningTab = 'generate' | 'feedback' | 'presentation' | 'assignment'

const TABS: { value: PlanningTab; label: string }[] = [
  { value: 'generate', label: 'Build a Lesson' },
  { value: 'feedback', label: 'Improve a Lesson' },
  { value: 'presentation', label: 'Review Slides' },
  { value: 'assignment', label: 'Review an Assignment' },
]

function isPlanningTab(value: string | null): value is PlanningTab {
  return TABS.some((t) => t.value === value)
}

const INPUT_CLASS =
  'rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60'
const PRIMARY_BUTTON =
  'rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft'
// Every format the shared document reader handles — see
// server/src/lib/documentText.ts. Scanned pages go through OCR.
const MATERIAL_ACCEPT = '.docx,.pdf,.pptx,.xlsx,.xls,.txt,.jpg,.jpeg,.png'
const MATERIAL_FORMATS = '.docx, .pdf, .pptx, .xlsx, .xls, .txt, .jpg, or .png'

export default function LessonPlanning() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: PlanningTab = isPlanningTab(raw) ? raw : 'generate'
  function setTab(next: PlanningTab) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Plan</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Planning Coach<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">
          Create a lesson, strengthen an existing plan, or review your materials before class.
        </p>
        <Link
          to="/guide/lesson-planning"
          className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === value ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'generate' ? (
        <BuildPanel />
      ) : tab === 'feedback' ? (
        <ImprovePanel />
      ) : tab === 'presentation' ? (
        <PresentationPanel />
      ) : (
        <AssignmentCoach embedded />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{children}</div>
    </div>
  )
}

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

// ---------------------------------------------------------------------------
// Adaptations
// ---------------------------------------------------------------------------

/// The adapt / apply / discard / revert cycle, shared by the two panels that
/// own a lesson — generated and the teacher's own. Panels differ in what they
/// render; none of them differ in what these four calls do.
function useAdaptation(plan: LessonPlan | null, onUpdated: (plan: LessonPlan) => void) {
  const [busy, setBusy] = useState<LessonAdaptation | null>(null)
  const [applying, setApplying] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The adaptation just applied, for the "applied — Undo" note. Cleared by
  // the note itself, or by anything else that changes the lesson.
  const [justApplied, setJustApplied] = useState<string | null>(null)

  async function run(work: () => Promise<LessonPlan>, done: (busy: boolean) => void): Promise<boolean> {
    setError(null)
    done(true)
    try {
      onUpdated(await work())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revise the lesson. Please try again.')
      return false
    } finally {
      done(false)
    }
  }

  return {
    busy,
    applying,
    reverting,
    undoing,
    error,
    justApplied,
    clearApplied: () => setJustApplied(null),
    adapt: (action: LessonAdaptation, targetMinutes?: number) => {
      if (!plan || busy) return
      setJustApplied(null)
      void run(() => adaptLessonPlan(plan.id, action, targetMinutes), (active) => setBusy(active ? action : null))
    },
    apply: () => {
      if (!plan || applying) return
      const label = plan.pendingAdaptation?.label ?? 'The revision'
      void run(() => applyLessonAdaptation(plan.id), setApplying).then((ok) => ok && setJustApplied(label))
    },
    // One step back — the version the last applied adaptation replaced.
    undo: () => {
      if (!plan || undoing) return
      void run(() => undoLessonAdaptation(plan.id), setUndoing).then((ok) => ok && setJustApplied(null))
    },
    discard: () => {
      if (!plan) return
      void run(() => discardLessonAdaptation(plan.id), () => {})
    },
    revert: () => {
      if (!plan || reverting) return
      setJustApplied(null)
      void run(() => revertLessonPlan(plan.id), setReverting)
    },
  }
}

// ---------------------------------------------------------------------------
// Result-page furniture shared by every panel
// ---------------------------------------------------------------------------

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
        {rows.map(([label, value]) => (value ? <Labeled key={label} label={label}>{value}</Labeled> : null))}
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
    label: [plan.planKind === 'week' ? 'Week' : null, plan.subject, plan.gradeLevel].filter(Boolean).join(' · ') || null,
    text: plan.objective || plan.fileName || plan.planText?.slice(0, 200) || 'Lesson plan',
    saved: plan.saved,
  }
}

/// Toggling "saved" is the same four lines in every panel: optimistic, with
/// the flip put back if the write fails.
function useSavedToggle(
  setPlans: React.Dispatch<React.SetStateAction<LessonPlan[]>>,
  setPlan: React.Dispatch<React.SetStateAction<LessonPlan | null>>,
) {
  return async function toggle(target: LessonPlan) {
    const nextSaved = !target.saved
    const flip = (saved: boolean) => {
      setPlans((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved } : p)))
      setPlan((prev) => (prev && prev.id === target.id ? { ...prev, saved } : prev))
    }
    flip(nextSaved)
    try {
      await setLessonPlanSaved(target.id, nextSaved)
    } catch {
      flip(!nextSaved)
    }
  }
}

// ---------------------------------------------------------------------------
// Build a Lesson
// ---------------------------------------------------------------------------

type BuildForm = {
  topic: string
  subject: string
  gradeLevel: string
  durationMinutes: number
  standard: string
  unitName: string
  essentialQuestion: string
  additionalContext: string
  kind: 'full' | 'ideas' | 'week'
}

const DEFAULT_DURATION = 45

/// Plan a Week's days: which ones the class meets, and anything already fixed
/// on one (a quiz, a half day, an objective the teacher has).
const WEEKDAYS: WeekDayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
type WeekDayChoice = { on: boolean; note: string }
const EMPTY_WEEK: Record<WeekDayName, WeekDayChoice> = {
  Monday: { on: true, note: '' },
  Tuesday: { on: true, note: '' },
  Wednesday: { on: true, note: '' },
  Thursday: { on: true, note: '' },
  Friday: { on: true, note: '' },
  Saturday: { on: false, note: '' },
  Sunday: { on: false, note: '' },
}

const EMPTY_BUILD: BuildForm = {
  topic: '',
  subject: '',
  gradeLevel: '',
  durationMinutes: DEFAULT_DURATION,
  standard: '',
  unitName: '',
  essentialQuestion: '',
  additionalContext: '',
  kind: 'full',
}

/// A profile field like "7th,8th" is a list of what this teacher teaches.
/// One value prefills; several become chips, because guessing which of a
/// teacher's three preps a lesson is for is exactly the guess that makes a
/// prefilled form worse than an empty one.
function profileList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function ChoiceChips({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string
  options: string[]
  value: string
  onPick: (next: string) => void
  disabled?: boolean
}) {
  if (options.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          aria-pressed={value === option}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function BuildPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [form, setForm] = useState<BuildForm>(EMPTY_BUILD)
  // Which fields Coach filled in from a chat, named for the teacher.
  const [fromChat, setFromChat] = useState<string[]>([])
  // The lesson a Debrief finding was carried over from, when there is one.
  const [fromDebrief, setFromDebrief] = useState<string | null>(null)
  // The latest form, for the arriving handoff below: it merges onto
  // whatever the profile defaults have already put there, without having to
  // wait for a render.
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])
  const [customDuration, setCustomDuration] = useState(false)
  const [gradeOptions, setGradeOptions] = useState<string[]>([])
  const [subjectOptions, setSubjectOptions] = useState<string[]>([])

  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const generateProgress = useSimulatedProgress(generating, form.kind === 'ideas' ? 10000 : form.kind === 'week' ? 8000 : 22000)
  const [weekDays, setWeekDays] = useState(EMPTY_WEEK)
  const [openingDay, setOpeningDay] = useState<number | null>(null)
  const [dayError, setDayError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Optional starting material: slides, a reading, a worksheet, an activity.
  const [material, setMaterial] = useState<{ name: string; text: string } | null>(null)
  const [reading, setReading] = useState(false)
  const [readMs, setReadMs] = useState(5000)
  const readProgress = useSimulatedProgress(reading, readMs)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<string[]>([])
  const [followUp, setFollowUp] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const adaptation = useAdaptation(plan, (updated) => {
    setPlan(updated)
    setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  })
  const toggleSaved = useSavedToggle(setAllPlans, setPlan)

  useEffect(() => {
    getLessonPlans({ mode: 'generated', includeWeeks: true })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  // Grade and subject come from the profile so the common case is already
  // filled in — both stay editable, and a teacher with several assignments
  // picks rather than being picked for.
  useEffect(() => {
    getProfile()
      .then((profile) => {
        const grades = profileList(profile.gradeLevels)
        const subjects = profileList(profile.subjects)
        setGradeOptions(grades)
        setSubjectOptions(subjects)
        setForm((prev) => ({
          ...prev,
          gradeLevel: prev.gradeLevel || grades[0] || '',
          subject: prev.subject || subjects[0] || '',
        }))
      })
      .catch(() => {})
  }, [])

  // Arriving from a Lesson Debrief's "Plan the next lesson around this". The
  // room wins over the profile default — it is the class that was recorded —
  // and the finding lands in "Anything else", where the teacher can read and
  // change it before anything is built.
  useEffect(() => {
    const prefill = takePlanningPrefill()
    if (!prefill) return
    setForm((prev) => ({
      ...prev,
      subject: prefill.subject || prev.subject,
      gradeLevel: prefill.gradeLevel || prev.gradeLevel,
      additionalContext: prefill.additionalContext,
    }))
    setFromDebrief(prefill.source)
  }, [])

  function set<K extends keyof BuildForm>(key: K, value: BuildForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleMaterial(file: File) {
    setMaterial(null)
    setSuggested([])
    setFollowUp(null)
    setMaterialError(null)
    setReadMs(Math.min(20000, 3000 + (file.size / 1_048_576) * 1500))
    setReading(true)
    try {
      const { text } = await extractAssignmentText(file)
      setMaterial({ name: file.name, text })

      // What the file appears to be about, offered as a filled-in field the
      // teacher can change — not an assumption applied behind their back, and
      // never overwriting something they already typed.
      const inferred = await inferLessonContext(text).catch(() => null)
      if (inferred) {
        const filled: string[] = []
        setForm((prev) => {
          const next = { ...prev }
          if (inferred.topic && !prev.topic.trim()) {
            next.topic = inferred.topic
            filled.push('topic')
          }
          if (inferred.subject && !prev.subject.trim()) {
            next.subject = inferred.subject
            filled.push('subject')
          }
          if (inferred.gradeLevel && !prev.gradeLevel.trim()) {
            next.gradeLevel = inferred.gradeLevel
            filled.push('grade level')
          }
          return next
        })
        setSuggested(filled)
        setFollowUp(inferred.followUp)
      }
    } catch (e) {
      setMaterialError(e instanceof Error ? e.message : 'Could not read that file. You can still type the topic instead.')
    } finally {
      setReading(false)
    }
  }

  function removeMaterial() {
    setMaterial(null)
    setSuggested([])
    setFollowUp(null)
    setMaterialError(null)
  }

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

  const week = form.kind === 'week'
  const chosenDays = WEEKDAYS.filter((d) => weekDays[d].on)
  const canGenerate = (!!form.topic.trim() || !!material) && (!week || chosenDays.length > 0)

  function handleGenerate() {
    if (!canGenerate) return
    void generateFrom(form)
  }

  // Takes the values explicitly rather than reading `form`, so the arriving
  // handoff below can build from what it just filled in without waiting for
  // a render to land first.
  async function generateFrom(values: BuildForm) {
    if (generating || (!values.topic.trim() && !material)) return
    setGenerating(true)
    setError(null)
    try {
      if (values.kind === 'week') {
        const result = await startWeekPlan({
          objective: values.topic.trim(),
          subject: values.subject.trim() || undefined,
          gradeLevel: values.gradeLevel.trim() || undefined,
          standard: values.standard.trim() || undefined,
          unitName: values.unitName.trim() || undefined,
          essentialQuestion: values.essentialQuestion.trim() || undefined,
          additionalContext: values.additionalContext.trim() || undefined,
          sourceMaterial: material?.text,
          durationMinutes: values.durationMinutes,
          days: WEEKDAYS.filter((d) => weekDays[d].on).map((label) => ({ label, note: weekDays[label].note.trim() || undefined })),
        })
        setPlan(result)
        setAllPlans((prev) => [result, ...prev])
        return
      }
      const result = await generateLessonPlan({
        objective: values.topic.trim(),
        subject: values.subject.trim() || undefined,
        gradeLevel: values.gradeLevel.trim() || undefined,
        standard: values.standard.trim() || undefined,
        unitName: values.unitName.trim() || undefined,
        essentialQuestion: values.essentialQuestion.trim() || undefined,
        additionalContext: values.additionalContext.trim() || undefined,
        sourceMaterial: material?.text,
        durationMinutes: values.durationMinutes,
        kind: values.kind === 'ideas' ? 'ideas' : 'full',
      })
      setPlan(result)
      setAllPlans((prev) => [result, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the lesson. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  function handleNew() {
    setPlan(null)
    setError(null)
    setDeliveryError(null)
    setDayError(null)
  }

  function replacePlan(updated: LessonPlan) {
    setPlan((prev) => (prev && prev.id === updated.id ? updated : prev))
    setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  // A day of a week, opened as a full lesson: the one already built from it,
  // or a new one built with the week around it as context.
  async function handleOpenDay(weekPlan: LessonPlan, index: number) {
    const day = weekPlan.week?.days[index]
    if (!day || openingDay != null) return
    setDayError(null)
    setOpeningDay(index)
    try {
      let lesson: LessonPlan
      if (day.lessonPlanId) {
        lesson = allPlans.find((p) => p.id === day.lessonPlanId) ?? (await getLessonPlan(day.lessonPlanId))
      } else {
        lesson = await generateLessonPlan({
          objective: day.objective,
          subject: weekPlan.subject ?? undefined,
          gradeLevel: weekPlan.gradeLevel ?? undefined,
          standard: weekPlan.standard ?? undefined,
          unitName: weekPlan.unitName ?? undefined,
          essentialQuestion: weekPlan.essentialQuestion ?? undefined,
          additionalContext: weekPlan.additionalContext ?? undefined,
          durationMinutes: day.minutes,
          kind: 'full',
          weekPlanId: weekPlan.id,
          weekDay: index,
        })
        const refreshed = await getLessonPlan(weekPlan.id).catch(() => null)
        setAllPlans((prev) => [lesson, ...prev.map((p) => (refreshed && p.id === refreshed.id ? refreshed : p))])
      }
      setPlan(lesson)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setDayError(e instanceof Error ? e.message : 'Could not build that lesson. Please try again.')
    } finally {
      setOpeningDay(null)
    }
  }

  async function handleBackToWeek(weekPlanId: string) {
    try {
      const weekPlan = allPlans.find((p) => p.id === weekPlanId && p.week) ?? (await getLessonPlan(weekPlanId))
      setPlan(weekPlan)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // The week was deleted or is out of reach; the lesson stays open.
    }
  }

  // Coach offered Planning Coach in a chat and the teacher tapped "Build
  // this lesson" — fill in what they already told it, rather than making
  // them say it a second time. Suggestions exactly like an uploaded file's:
  // every field stays editable, and nothing is generated until they tap
  // Build. The id is left in the URL so a reload refills rather than
  // emptying the form.
  const handoffId = searchParams.get('handoff')
  // The teacher tapped a button that said "Build this lesson", so build it
  // — the tap is the answer to a question Coach asked in the chat, and
  // making them tap a second button here would make a liar of the first.
  const buildOnArrival = searchParams.get('build') === '1'
  // Survives React's double-invoke in development, so one arrival can never
  // mean two generations.
  const built = useRef(false)
  useEffect(() => {
    if (!handoffId) return
    let cancelled = false
    getCoachHandoff(handoffId)
      .then(({ details }) => {
        // A handoff from another tool's offer isn't ours to read.
        if (cancelled || !details || !('topic' in details) || !details.topic) return
        const patch: Partial<BuildForm> = { topic: details.topic }
        const filled = ['topic']
        if (details.subject) {
          patch.subject = details.subject
          filled.push('subject')
        }
        if (details.gradeLevel) {
          patch.gradeLevel = details.gradeLevel
          filled.push('grade level')
        }
        if (details.durationMinutes) {
          patch.durationMinutes = details.durationMinutes
          filled.push('length')
          // A length that isn't one of the chips has to show in the box, or
          // the form would say 45 while the plan is built for 55.
          if (!DURATION_CHOICES.includes(details.durationMinutes)) setCustomDuration(true)
        }
        if (details.kind) patch.kind = details.kind
        const next = { ...formRef.current, ...patch }
        setForm(next)
        setFromChat(filled)
        if (buildOnArrival && !built.current) {
          built.current = true
          // Out of the URL before it runs: a reload is a reload, not a
          // second lesson billed to the same tap. The plan itself is saved
          // server-side, so it is in Your lessons either way.
          const params = new URLSearchParams(searchParams)
          params.delete('handoff')
          params.delete('build')
          setSearchParams(params, { replace: true })
          void generateFrom(next)
        }
      })
      // An expired handoff needs no apology: the form in front of them
      // works, it is just empty.
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Only the arriving id should re-run this: everything else is read
    // once, as it lands, and re-running on a keystroke would refill the
    // form under the teacher's hands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffId])

  // Reopens an earlier lesson in full, with everything that came after it.
  function handleOpenPast(id: string) {
    const past = allPlans.find((p) => p.id === id)
    if (!past) return
    setPlan(past)
    setError(null)
    setDeliveryError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const ideas = form.kind === 'ideas'

  return (
    <div className="flex flex-col gap-6">
      {plan?.planKind === 'week' ? (
        <WeekWorkspace
          plan={plan}
          onPlan={replacePlan}
          onNew={handleNew}
          onOpenDay={(index) => void handleOpenDay(plan, index)}
          openingDay={openingDay}
          dayError={dayError}
          onToggleSaved={() => toggleSaved(plan)}
        />
      ) : plan ? (
        // Three shapes can come back here: a Planning Coach lesson, a list of
        // teaching ideas, and — reopened from history — one of the old
        // five-slot sample plans. The workspace draws all three.
        <LessonWorkspace
          plan={plan}
          adaptation={adaptation}
          delivery={{ loading: deliveryLoading, error: deliveryError, onRequest: handlePresentationFeedback }}
          deliveryCard={
            plan.deliveryCoaching || deliveryLoading ? (
              <div className="flex flex-col gap-3">
                {plan.deliveryCoaching && <DeliveryCoachingCard n={1} coaching={plan.deliveryCoaching} planId={plan.id} />}
                <WorkingRing
                  active={deliveryLoading}
                  estimatedMs={14000}
                  label="Coaching how to teach it"
                  hint="Opening, pacing, engagement, and closing."
                  className="text-forest"
                />
              </div>
            ) : null
          }
          onToggleSaved={() => toggleSaved(plan)}
          onShare={() => shareLessonPlan(plan.id)}
          onNew={handleNew}
          onFormatChange={(patch) => setPlan((prev) => (prev && prev.id === plan.id ? { ...prev, ...patch } : prev))}
          onBackToWeek={plan.weekPlanId ? () => void handleBackToWeek(plan.weekPlanId!) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Planning Coach" title={week ? 'Plan a week' : 'Build a lesson'}>
              {week
                ? 'Start with what the class is learning this week. You check the daily objectives before anything else is written.'
                : 'Start with a topic, or the material you already have. Everything else is optional.'}
            </PanelHeader>

            {fromDebrief && (
              <p className="rounded-2xl bg-peach-tint/40 px-4 py-3 text-xs text-forest">
                Carried over from your Lesson Debrief ({fromDebrief}): what you chose to build in is under More
                details, and you can edit it there. Add the topic for the next lesson, then build it.
              </p>
            )}

            {fromChat.length > 0 && (
              <p className="rounded-2xl bg-peach-tint/40 px-4 py-3 text-xs text-forest">
                Filled in the {fromChat.join(', ')} from your chat with Coach — change anything that isn't right, then build it.
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{week ? 'What is the class learning this week?' : 'Topic or learning goal'}</span>
              <span className="text-xs text-ink-soft">
                {week
                  ? 'One goal for the whole week. Wivoza writes an objective for each day, and you check them before the week is filled in.'
                  : 'What are you teaching? Enter a topic, learning goal, or paste material.'}
              </span>
              <textarea
                value={form.topic}
                onChange={(e) => set('topic', e.target.value)}
                disabled={generating}
                rows={3}
                placeholder={week ? 'e.g. calculating and interpreting key values of polynomial functions' : 'e.g. introducing cells'}
                className={INPUT_CLASS}
              />
            </label>

            {/* Starting material — slides, a reading, a worksheet, an activity. */}
            {reading ? (
              <div className="flex justify-center rounded-2xl border-2 border-dashed border-terracotta/30 bg-peach-tint/30 px-4 py-8">
                <ProgressRing
                  progress={readProgress}
                  size={84}
                  label="Reading your file"
                  hint="Pulling the text out, then filling in what it's about."
                  className="text-forest"
                />
              </div>
            ) : material ? (
              <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-cream px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-peach-tint text-terracotta-600">
                      <ClipboardIcon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{material.name}</p>
                      <p className="text-xs text-ink-soft">The lesson will be built around this.</p>
                    </div>
                  </div>
                  <button type="button" onClick={removeMaterial} aria-label="Remove file" className="shrink-0 text-ink-soft hover:text-forest">
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                {suggested.length > 0 && (
                  <p className="text-xs text-forest">
                    Filled in the {suggested.join(', ')} from your file — change anything that isn't right.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 self-start">
                <label className="flex cursor-pointer items-start gap-2 text-left hover:text-forest">
                  <UploadIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  <span className="flex flex-col">
                    <span className="text-xs font-semibold text-ink-soft">
                      Upload materials — start from slides, a reading, a worksheet or an activity
                    </span>
                    <span className="text-[11px] text-ink-soft/80">{MATERIAL_FORMATS}</span>
                  </span>
                  <input
                    type="file"
                    accept={MATERIAL_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0]
                      if (selected) void handleMaterial(selected)
                      e.target.value = ''
                    }}
                  />
                </label>
                {/* Its own input: `capture` belongs on an image-only one,
                    since putting it on the picker above would take the
                    documents away. Shown only where it does something —
                    see canTakePhoto. */}
                {canTakePhoto() && (
                <label className="flex cursor-pointer items-center gap-2 text-left hover:text-forest">
                  <CameraIcon className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  <span className="text-xs font-semibold text-ink-soft">
                    Or photograph it — the worksheet on your desk, what's on the board
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0]
                      if (selected) void handleMaterial(selected)
                      e.target.value = ''
                    }}
                  />
                </label>
                )}
              </div>
            )}
            {materialError && <p className="text-sm text-terracotta">{materialError}</p>}
            {followUp && (
              <p className="rounded-xl border border-gold/40 bg-gold-tint/50 px-4 py-3 text-sm text-ink">
                <span className="font-semibold text-terracotta-600">One question: </span>
                {followUp}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Grade level</span>
                <ChoiceChips
                  label="Yours"
                  options={gradeOptions}
                  value={form.gradeLevel}
                  onPick={(next) => set('gradeLevel', next)}
                  disabled={generating}
                />
                <input
                  value={form.gradeLevel}
                  onChange={(e) => set('gradeLevel', e.target.value)}
                  disabled={generating}
                  placeholder="e.g. 7th grade"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Subject</span>
                <ChoiceChips
                  label="Yours"
                  options={subjectOptions}
                  value={form.subject}
                  onPick={(next) => set('subject', next)}
                  disabled={generating}
                />
                <input
                  value={form.subject}
                  onChange={(e) => set('subject', e.target.value)}
                  disabled={generating}
                  placeholder="e.g. Science"
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">{week ? 'How long is each class?' : 'How much time do you have?'}</span>
              <div className="flex flex-wrap items-center gap-2">
                {DURATION_CHOICES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    disabled={generating}
                    onClick={() => {
                      setCustomDuration(false)
                      set('durationMinutes', minutes)
                    }}
                    aria-pressed={!customDuration && form.durationMinutes === minutes}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      !customDuration && form.durationMinutes === minutes
                        ? 'bg-forest text-cream'
                        : 'bg-cream text-ink-soft hover:text-ink'
                    }`}
                  >
                    {minutes} min
                  </button>
                ))}
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setCustomDuration(true)}
                  aria-pressed={customDuration}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    customDuration ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
                  }`}
                >
                  Custom
                </button>
                {customDuration && (
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={form.durationMinutes}
                      aria-label="Lesson length in minutes"
                      onChange={(e) => set('durationMinutes', Math.max(5, Math.min(240, Number(e.target.value) || DEFAULT_DURATION)))}
                      disabled={generating}
                      className="w-24 rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
                    />
                    <span className="text-sm text-ink-soft">minutes</span>
                  </span>
                )}
              </div>
            </div>

            {week && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-ink">Which days do you teach this class?</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      disabled={generating}
                      aria-pressed={weekDays[day].on}
                      onClick={() => setWeekDays((prev) => ({ ...prev, [day]: { ...prev[day], on: !prev[day].on } }))}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        weekDays[day].on ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
                <details className="rounded-xl border border-hairline bg-cream/40 px-3.5 py-2.5">
                  <summary className="cursor-pointer text-xs font-semibold text-forest">Anything already set on a day? — optional</summary>
                  <p className="mt-1.5 text-xs text-ink-soft">A quiz, a lab, a half day, or an objective you already have. Wivoza plans the week around it.</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {chosenDays.map((day) => (
                      <label key={day} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-xs font-semibold text-ink">{day.slice(0, 3)}</span>
                        <input
                          id={`week-note-${day}`}
                          value={weekDays[day].note}
                          onChange={(e) => setWeekDays((prev) => ({ ...prev, [day]: { ...prev[day], note: e.target.value } }))}
                          disabled={generating}
                          maxLength={300}
                          placeholder={day === 'Friday' ? 'e.g. quiz' : ''}
                          className="min-w-0 flex-1 rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </details>
              </fieldset>
            )}

            <details open={fromDebrief != null} className="rounded-2xl border border-hairline bg-cream/60 px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-semibold text-forest marker:hidden">
                More details — optional
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">Standard</span>
                  <input
                    value={form.standard}
                    onChange={(e) => set('standard', e.target.value)}
                    disabled={generating}
                    placeholder="e.g. MS-LS1-1"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">Unit name</span>
                  <input
                    value={form.unitName}
                    onChange={(e) => set('unitName', e.target.value)}
                    disabled={generating}
                    placeholder="e.g. Cells & Systems"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-ink">Essential question</span>
                  <input
                    value={form.essentialQuestion}
                    onChange={(e) => set('essentialQuestion', e.target.value)}
                    disabled={generating}
                    placeholder="e.g. What makes something alive?"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium text-ink">Anything else</span>
                  <span className="text-xs text-ink-soft">Student needs, what you have in the room, where the class is coming from.</span>
                  <textarea
                    value={form.additionalContext}
                    onChange={(e) => set('additionalContext', e.target.value)}
                    disabled={generating}
                    rows={fromDebrief ? 8 : 3}
                    placeholder="e.g. six students on IEPs, no lab space this week"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </details>

            {/* Two genuinely different outputs, one tab. Full Lesson is the
                default because it is what most teachers opening this page
                want; Quick Ideas is for the plan they are already writing. */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink">What do you want back?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ['full', 'Full Lesson', 'A complete lesson you can teach and edit'],
                  ['ideas', 'Quick Ideas', '3-5 practical teaching ideas, briefly explained'],
                  ['week', 'Plan a Week', 'An objective for each day, then the week filled in'],
                ] as const).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      form.kind === value ? 'border-forest bg-mint-tint/40' : 'border-hairline bg-cream hover:border-forest/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="lesson-output"
                      value={value}
                      checked={form.kind === value}
                      onChange={() => set('kind', value)}
                      disabled={generating}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#C4663A]"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-forest">{label}</span>
                      <span className="text-xs text-ink-soft">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {generating && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing
                  progress={generateProgress}
                  label={ideas ? 'Putting together ideas' : week ? 'Planning your week' : 'Building your lesson'}
                  hint={ideas ? 'Usually about ten seconds.' : week ? 'An objective for each day, in a few seconds.' : 'Usually about twenty seconds.'}
                />
              </div>
            )}
            <button type="button" onClick={handleGenerate} disabled={generating || !canGenerate} className={`self-end ${PRIMARY_BUTTON}`}>
              {generating ? (
                <span className="flex items-center gap-2">
                  <Spinner /> {ideas ? 'Generating...' : week ? 'Planning...' : 'Building...'}
                </span>
              ) : ideas ? (
                'Generate Ideas'
              ) : week ? (
                'Plan My Week'
              ) : (
                'Build My Lesson'
              )}
            </button>
          </div>
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
        </div>
      )}

      <PastList
        title="Your lessons"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Lessons and ideas you build will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Improve a Lesson
// ---------------------------------------------------------------------------

function ImprovePanel() {
  const [planText, setPlanText] = useState('')
  const [plan, setPlan] = useState<LessonPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const feedbackProgress = useSimulatedProgress(submitting, 12000)
  const [error, setError] = useState<string | null>(null)

  // Upload as an alternative to pasting — the extracted text lands in the same
  // editable textarea, so a rough OCR/parse can still be fixed before submitting.
  const [fileName, setFileName] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMs, setExtractMs] = useState(5000)
  const extractProgress = useSimulatedProgress(extracting, extractMs)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [allPlans, setAllPlans] = useState<LessonPlan[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [applyingRevision, setApplyingRevision] = useState(false)
  const [revisionDismissed, setRevisionDismissed] = useState(false)

  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const adaptation = useAdaptation(plan, (updated) => {
    setPlan(updated)
    setAllPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  })
  const toggleSaved = useSavedToggle(setAllPlans, setPlan)

  useEffect(() => {
    getLessonPlans({ mode: 'feedback' })
      .then(setAllPlans)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const canSubmit = planText.trim().length > 0

  async function handleFile(file: File) {
    setFileName(file.name)
    setExtractMs(Math.min(20000, 3000 + (file.size / 1_048_576) * 1500))
    setExtracting(true)
    setUploadError(null)
    try {
      const { text } = await extractAssignmentText(file)
      setPlanText(text)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read that file. Please try pasting the text instead.')
      setFileName(null)
    } finally {
      setExtracting(false)
    }
  }

  function handleRemoveFile() {
    setFileName(null)
    setPlanText('')
    setUploadError(null)
  }

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
      setFileName(null)
      setUploadError(null)
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

  const showRevision = !!plan?.suggestedRevision && !revisionDismissed

  return (
    <div className="flex flex-col gap-6">
      {plan ? (
        // The same workspace a built lesson opens in: Coach's feedback and the
        // plan as copyable sections, the tools beside them, and the follow-up
        // chat under the plan it is about.
        <LessonWorkspace
          plan={plan}
          adaptation={adaptation}
          delivery={{ loading: deliveryLoading, error: deliveryError, onRequest: handlePresentationFeedback }}
          onFormatChange={(patch) => setPlan((prev) => (prev && prev.id === plan.id ? { ...prev, ...patch } : prev))}
          extras={
            <div className="flex flex-col gap-3">
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
                  n={1}
                  text={plan.suggestedRevision}
                  applying={applyingRevision}
                  onApply={handleApplyRevision}
                  onDismiss={() => setRevisionDismissed(true)}
                />
              )}
            </div>
          }
          deliveryCard={
            plan.deliveryCoaching || deliveryLoading ? (
              <div className="flex flex-col gap-3">
                {plan.deliveryCoaching && <DeliveryCoachingCard n={showRevision ? 2 : 1} coaching={plan.deliveryCoaching} planId={plan.id} />}
                <WorkingRing
                  active={deliveryLoading}
                  estimatedMs={14000}
                  label="Coaching how to teach it"
                  hint="Opening, pacing, engagement, and closing."
                  className="text-forest"
                />
              </div>
            ) : null
          }
          onToggleSaved={() => toggleSaved(plan)}
          onShare={() => shareLessonPlan(plan.id)}
          onNew={handleNew}
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Planning Coach" title="Improve a lesson">
              Paste or upload a plan you already have — a finished one, a partial one, or rough notes. Your learning
              goal and the parts that work stay as they are.
            </PanelHeader>

            {extracting ? (
              <div className="flex justify-center rounded-2xl border-2 border-dashed border-terracotta/30 bg-peach-tint/30 px-4 py-8">
                <ProgressRing
                  progress={extractProgress}
                  size={84}
                  label="Reading your file"
                  hint="Pulling the text out — this only takes a moment."
                  className="text-forest"
                />
              </div>
            ) : fileName ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-cream px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-peach-tint text-terracotta-600">
                    <ClipboardIcon className="h-4.5 w-4.5" />
                  </span>
                  <p className="truncate text-sm font-medium text-ink">{fileName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="cursor-pointer text-xs font-semibold text-ink-soft hover:text-forest">
                    Replace
                    <input
                      type="file"
                      accept={MATERIAL_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files?.[0]
                        if (selected) void handleFile(selected)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button type="button" onClick={handleRemoveFile} aria-label="Remove file" className="text-ink-soft hover:text-forest">
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            {!extracting && !fileName && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Your lesson plan</span>
                <span className="text-xs text-ink-soft">A full plan, a half-written one, or the notes you were going to teach from.</span>
                <textarea
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  disabled={submitting}
                  rows={8}
                  placeholder="Paste or write your plan — activities, questions, timings, whatever you have."
                  className={INPUT_CLASS}
                />
              </label>
            )}
            {!extracting && !fileName && (
              <label className="flex cursor-pointer items-center gap-1.5 self-start text-xs font-semibold text-ink-soft hover:text-forest">
                <UploadIcon className="h-3.5 w-3.5" />
                Or upload a {MATERIAL_FORMATS} file
                <input
                  type="file"
                  accept={MATERIAL_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0]
                    if (selected) void handleFile(selected)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            {fileName && !extracting && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Edit before submitting, if needed</span>
                <textarea
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  disabled={submitting}
                  rows={8}
                  className={INPUT_CLASS}
                />
              </label>
            )}
            {uploadError && <p className="text-sm text-terracotta">{uploadError}</p>}

            {submitting && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={feedbackProgress} label="Reading your plan" hint="Usually about fifteen seconds." />
              </div>
            )}

            <button type="button" onClick={handleSubmit} disabled={submitting || !canSubmit} className={`self-end ${PRIMARY_BUTTON}`}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Reading your plan...
                </span>
              ) : (
                'Improve My Lesson'
              )}
            </button>
          </div>
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
        </div>
      )}

      <PastList
        title="Plans you've improved"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Plans you bring here will show up in this list."
        onOpen={handleOpenPast}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review Slides
// ---------------------------------------------------------------------------

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

  const toggleSaved = useSavedToggle(setAllPlans, setPlan)

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
      setError(e instanceof Error ? e.message : 'Could not review these slides. Please try again.')
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

  // Reopens an earlier review in full, follow-up conversation included.
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

  const originalForPlan = plan && originalFile?.planId === plan.id ? originalFile.file : null
  const review = plan?.presentationReview
  const reviewParts = review ? presentParts(REVIEW_PARTS.map((part) => ({ ...part, body: review[part.key] }))) : []
  const showRevision = !!plan?.suggestedRevision && !revisionDismissed

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <PanelHeader eyebrow="Planning Coach" title="Review slides">
              Upload slides you've already built — get feedback on grade-level fit, visuals, ideas, length,
              and how to actually run them in class.
            </PanelHeader>

            {!extractedText ? (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-terracotta/30 bg-peach-tint/30 px-4 py-8 text-center transition-colors hover:border-terracotta/40">
                {extracting ? (
                  <ProgressRing
                    progress={extractProgress}
                    size={84}
                    label="Reading your slides"
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
                  className={INPUT_CLASS}
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
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What are these slides about? (optional)</span>
              <input
                type="text"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Introducing photosynthesis"
                className={INPUT_CLASS}
              />
            </label>

            {submitting && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={reviewProgress} label="Reading your slides" hint="Usually about twenty seconds." />
              </div>
            )}

            <button type="button" onClick={handleSubmit} disabled={submitting || !extractedText} className={`self-end ${PRIMARY_BUTTON}`}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Reviewing...
                </span>
              ) : (
                'Review My Slides'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="-mx-6 -mt-6 bg-forest px-6 py-6 text-cream sm:px-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                Slide review
                {plan.subject ? ` · ${plan.subject}` : ''}
                {plan.gradeLevel ? ` · ${plan.gradeLevel}` : ''}
              </p>
              <p className="mt-2 font-heading text-xl font-bold leading-snug text-cream">
                {plan.objective || plan.fileName || 'Your slides'}
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
              title="Create improved slides"
              subtitle="Apply every recommendation above and build them as a new deck"
            >
              <p className="text-sm leading-relaxed text-ink-soft">
                Wivoza rebuilds your slides with the clearer wording, visuals, pacing checks, and length changes recommended
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
                Create improved slides
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <SaveButton plan={plan} onToggle={toggleSaved} />
                <ShareButton onShare={() => shareLessonPlan(plan.id)} />
                <Link
                  to={`/lesson-planning/${plan.id}/export`}
                  className="text-sm font-medium text-ink-soft hover:text-terracotta-600"
                >
                  Download
                </Link>
              </div>
              <button type="button" onClick={handleNew} className={PRIMARY_BUTTON}>
                New Slides
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
        title="Your slide reviews"
        items={allPlans.map(toPastItem)}
        activeId={plan?.id ?? null}
        loading={historyLoading}
        emptyText="Slides you review will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}
