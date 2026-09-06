import { useEffect, useRef, useState } from 'react'
import CoachingChat from '../components/CoachingChat'
import { ChecklistIcon, KebabIcon, SparkleIcon, StarIcon, TargetIcon } from '../components/icons'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ASSIGNMENT_GRADE_LEVELS } from '../lib/assignmentGradeLevels'
import { ASSIGNMENT_SUBJECTS, ASSIGNMENT_TYPES, assignmentTypeLabel, TYPE_FIELDS } from '../lib/assignmentTypes'
import {
  deleteAssignmentCoachSession,
  finalizeAssignmentCoach,
  getAssignmentCoachSessions,
  reviewAssignmentCoach,
  sendAssignmentCoachChat,
  startAssignmentCoach,
  updateAssignmentCoachSession,
  type AssignmentCoachMode,
  type AssignmentCoachSession,
  type AssignmentType,
} from '../lib/api'

type Tool = 'review' | 'differentiate' | 'rubric' | 'ai_resilient' | 'student_view'

const TOOLS: { key: Tool; label: string; enabled: boolean }[] = [
  { key: 'review', label: 'Review', enabled: true },
  { key: 'differentiate', label: 'Differentiate', enabled: false },
  { key: 'rubric', label: 'Rubric', enabled: false },
  { key: 'ai_resilient', label: 'AI-resilient', enabled: false },
  { key: 'student_view', label: 'Student view', enabled: false },
]

const COACHING_DIRECTIONS = [
  { label: 'Strengthen the rigor', message: "Let's strengthen the rigor of this." },
  { label: 'Clarify student directions', message: "Let's clarify the student directions." },
  { label: 'Improve engagement', message: "Let's improve how engaging this is." },
  { label: 'Check workload', message: "Let's check whether the workload is reasonable." },
  { label: 'Check alignment with the objective', message: "Let's check how well this aligns with the objective." },
  { label: 'Review the entire assignment', message: "Let's review the entire assignment." },
]

const inputClass =
  'rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/50 focus:outline-none disabled:opacity-60'

export default function AssignmentCoach() {
  const [pendingMode, setPendingMode] = useState<AssignmentCoachMode | null>(null)
  const [pendingType, setPendingType] = useState<AssignmentType | null>(null)
  const [session, setSession] = useState<AssignmentCoachSession | null>(null)

  const [sessions, setSessions] = useState<AssignmentCoachSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const myAssignmentsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getAssignmentCoachSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  function handleExit() {
    setSession(null)
    setPendingMode(null)
    setPendingType(null)
  }

  function handleUpdate(updated: AssignmentCoachSession) {
    setSession(updated)
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === updated.id)
      return exists ? prev.map((s) => (s.id === updated.id ? updated : s)) : [updated, ...prev]
    })
  }

  async function handleDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (session?.id === id) handleExit()
    try {
      await deleteAssignmentCoachSession(id)
    } catch {
      // best-effort — a stale row reappearing on next load is a minor inconvenience
    }
  }

  if (session) {
    return <Workspace session={session} onUpdate={handleUpdate} onExit={handleExit} />
  }

  if (pendingMode && pendingType) {
    return (
      <IntakeForm
        mode={pendingMode}
        assignmentType={pendingType}
        onBack={() => setPendingType(null)}
        onStarted={setSession}
      />
    )
  }

  if (pendingMode) {
    return <TypeSelect mode={pendingMode} onBack={() => setPendingMode(null)} onSelect={setPendingType} />
  }

  return (
    <div className="flex min-h-full flex-col gap-8 bg-cream px-1 py-2 text-ink">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold text-forest md:text-3xl">Assignment Coach</h1>
        <p className="text-ink-soft">Design, review, and refine meaningful student work—with a coach beside you.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setPendingMode('create')}
          className="group rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <SparkleIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Create something new</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Start with a learning objective, standard, topic, or assignment idea.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setPendingMode('improve')}
          className="group rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <ChecklistIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Improve an existing assignment</h2>
          <p className="mt-1 text-sm text-ink-soft">Paste it in, or describe it, and work through it together.</p>
        </button>
        <button
          type="button"
          onClick={() => myAssignmentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="group rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <TargetIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Continue recent work</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Reopen an assignment and keep reviewing, differentiating, or refining it.
          </p>
        </button>
      </div>

      <div ref={myAssignmentsRef}>
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink-soft">My Assignments</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
            Assignments you create or improve will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {sessions.map((s) => (
              <AssignmentRow key={s.id} session={s} onOpen={() => setSession(s)} onDelete={() => handleDelete(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AssignmentRow({
  session,
  onOpen,
  onDelete,
}: {
  session: AssignmentCoachSession
  onOpen: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleExport() {
    await navigator.clipboard.writeText(session.liveAssignmentText ?? '').catch(() => {})
    setMenuOpen(false)
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-cream-card p-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-peach-tint px-2 py-0.5 text-xs font-semibold text-terracotta-600">
            {assignmentTypeLabel(session.assignmentType)}
          </span>
          <span className="rounded-full bg-gold-tint px-2 py-0.5 text-xs font-semibold text-terracotta-600">
            {session.status === 'completed' ? 'Completed' : 'Draft'}
          </span>
          {session.reviewSummary && (
            <span className="text-xs font-medium text-ink-soft">Reviewed</span>
          )}
        </div>
        <p className="mt-1.5 truncate text-sm text-ink">
          {session.title || session.objective || session.originalText?.slice(0, 80) || 'Untitled assignment'}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {[session.gradeLevel, session.subject].filter(Boolean).join(' · ')}
          {session.gradeLevel || session.subject ? ' · ' : ''}
          Updated {new Date(session.updatedAt).toLocaleDateString()}
        </p>
      </button>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Assignment options"
          className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-cream hover:text-forest"
        >
          <KebabIcon className="h-5 w-5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-hairline bg-cream-card p-1.5 shadow-lg">
              <button
                type="button"
                onClick={onOpen}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream"
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm('Delete this assignment? This cannot be undone.')) onDelete()
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-cream hover:text-terracotta-600"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TypeSelect({
  mode,
  onBack,
  onSelect,
}: {
  mode: AssignmentCoachMode
  onBack: () => void
  onSelect: (type: AssignmentType) => void
}) {
  return (
    <div className="flex flex-col gap-6 bg-cream text-ink">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-forest">
        ← Back
      </button>
      <div>
        <h1 className="font-heading text-xl font-bold text-forest">What are you creating?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {mode === 'create' ? 'This shapes the questions Coach asks.' : 'This shapes how Coach reviews it.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ASSIGNMENT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            className="rounded-xl border border-hairline bg-cream-card p-4 text-left text-sm font-semibold text-forest transition-colors hover:border-terracotta/50"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function IntakeForm({
  mode,
  assignmentType,
  onBack,
  onStarted,
}: {
  mode: AssignmentCoachMode
  assignmentType: AssignmentType
  onBack: () => void
  onStarted: (session: AssignmentCoachSession) => void
}) {
  const [gradeLevel, setGradeLevel] = useState('')
  const [subject, setSubject] = useState('')
  const [objective, setObjective] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [standards, setStandards] = useState('')
  const [specificNeeds, setSpecificNeeds] = useState('')
  const [typeDetails, setTypeDetails] = useState<Record<string, string>>({})
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = TYPE_FIELDS[assignmentType]
  const canSubmit = mode === 'create' ? objective.trim().length > 0 : originalText.trim().length > 0

  const ctaLabel =
    mode === 'create'
      ? 'Help me create it'
      : assignmentType === 'assessment' || assignmentType === 'exit_ticket'
        ? 'Review this assignment'
        : 'Help me improve it'

  async function handleStart() {
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const session = await startAssignmentCoach({
        mode,
        assignmentType,
        typeDetails,
        gradeLevel: gradeLevel || undefined,
        subject: subject || undefined,
        objective: mode === 'create' ? objective.trim() : undefined,
        originalText: mode !== 'create' ? originalText.trim() : undefined,
        estimatedTime: estimatedTime.trim() || undefined,
        specificNeeds: [standards.trim() ? `Standards: ${standards.trim()}` : '', specificNeeds.trim()]
          .filter(Boolean)
          .join(' — ') || undefined,
      })
      onStarted(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this conversation. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 bg-cream text-ink">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-forest">
        ← Back
      </button>

      <div className="rounded-2xl border border-hairline bg-cream-card p-6">
        <h1 className="font-heading text-lg font-bold text-forest">
          {mode === 'create' ? 'Create a' : 'Improve a'} {assignmentTypeLabel(assignmentType).toLowerCase()}
        </h1>

        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Grade level</span>
              <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} disabled={starting} className={inputClass}>
                <option value="">Select a grade level</option>
                {ASSIGNMENT_GRADE_LEVELS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Subject</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={starting} className={inputClass}>
                <option value="">Select a subject</option>
                {ASSIGNMENT_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {fields.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-forest">{f.label}</span>
                  <input
                    value={typeDetails[f.key] ?? ''}
                    onChange={(e) => setTypeDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    disabled={starting}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          )}

          {mode === 'create' ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Learning objective, standard, or topic idea</span>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                disabled={starting}
                rows={3}
                placeholder="e.g. SWBAT explain how natural selection leads to adaptation"
                className={inputClass}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Paste or describe the assignment</span>
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                disabled={starting}
                rows={8}
                placeholder="Paste the assignment text, or describe it in your own words..."
                className={inputClass}
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Estimated student work time</span>
              <input
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                disabled={starting}
                placeholder="e.g. 20 minutes, or 2 weeks"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Standards (optional)</span>
              <input value={standards} onChange={(e) => setStandards(e.target.value)} disabled={starting} className={inputClass} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-forest">Specific learning needs (optional)</span>
            <input
              value={specificNeeds}
              onChange={(e) => setSpecificNeeds(e.target.value)}
              disabled={starting}
              className={inputClass}
            />
          </label>

          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !canSubmit}
            className="self-end rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {starting ? 'Starting...' : ctaLabel}
          </button>
        </div>
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>
    </div>
  )
}

function Workspace({
  session,
  onUpdate,
  onExit,
}: {
  session: AssignmentCoachSession
  onUpdate: (session: AssignmentCoachSession) => void
  onExit: () => void
}) {
  const [activeTool, setActiveTool] = useState<Tool>('review')
  const [mobilePane, setMobilePane] = useState<'coach' | 'assignment'>('coach')

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  const [text, setText] = useState(session.liveAssignmentText ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedRef = useRef(session.liveAssignmentText ?? '')
  const saveTimerRef = useRef<number | null>(null)

  // Reflects an external change (e.g. finalize drafting the assignment)
  // into the editor — never overwrites text the teacher is mid-typing
  // into, since this only fires when the prop actually changed.
  useEffect(() => {
    const incoming = session.liveAssignmentText ?? ''
    if (incoming !== lastSavedRef.current) {
      setText(incoming)
      lastSavedRef.current = incoming
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.liveAssignmentText])

  useEffect(() => {
    if (text === lastSavedRef.current) return
    setSaveStatus('saving')
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const updated = await updateAssignmentCoachSession(session.id, { liveAssignmentText: text })
        lastSavedRef.current = text
        setSaveStatus('saved')
        onUpdate(updated)
      } catch {
        setSaveStatus('error')
      }
    }, 1000)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendAssignmentCoachChat(session.id, trimmed)
      onUpdate(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  async function handleDirectionPill(message: string) {
    if (chatSending) return
    setChatSending(true)
    setChatError(null)
    try {
      const updated = await sendAssignmentCoachChat(session.id, message)
      onUpdate(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
    } finally {
      setChatSending(false)
    }
  }

  async function handleReview() {
    if (reviewing) return
    setReviewing(true)
    setReviewError(null)
    try {
      const updated = await reviewAssignmentCoach(session.id)
      onUpdate(updated)
    } catch (err) {
      setReviewError((err as Error).message || 'Could not put together a review. Please try again.')
    } finally {
      setReviewing(false)
    }
  }

  async function handleFinalize() {
    if (finalizing) return
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const updated = await finalizeAssignmentCoach(session.id)
      onUpdate(updated)
    } catch (err) {
      setFinalizeError((err as Error).message || 'Could not put together the assignment. Please try again.')
    } finally {
      setFinalizing(false)
    }
  }

  async function handleToggleSaved() {
    const nextSaved = !session.saved
    onUpdate({ ...session, saved: nextSaved })
    try {
      await updateAssignmentCoachSession(session.id, { saved: nextSaved })
    } catch {
      onUpdate({ ...session, saved: !nextSaved })
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(text).catch(() => {})
  }

  function handlePrint() {
    window.print()
  }

  const chips = [
    assignmentTypeLabel(session.assignmentType),
    session.gradeLevel,
    session.subject,
    session.estimatedTime,
    session.status === 'completed' ? 'Completed' : 'Draft',
  ].filter((c): c is string => Boolean(c))

  return (
    <div className="flex h-full flex-col gap-4 bg-cream text-ink">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm font-medium text-ink-soft hover:text-forest">
          ← Back to Assignment Coach
        </button>
        <button
          type="button"
          onClick={handleToggleSaved}
          className={`flex items-center gap-1.5 text-sm font-medium ${
            session.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
          }`}
        >
          <StarIcon className="h-4 w-4" filled={session.saved} />
          {session.saved ? 'Saved' : 'Save for later'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span key={chip} className="rounded-full border border-hairline bg-cream-card px-2.5 py-1 text-xs font-semibold text-forest">
            {chip}
          </span>
        ))}
      </div>

      {/* Mobile tab switcher — Coach and Assignment are separate tabs
          instead of squeezing a split screen into a narrow viewport. */}
      <div className="flex gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane('coach')}
          className={`flex-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            mobilePane === 'coach' ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft'
          }`}
        >
          Coach
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('assignment')}
          className={`flex-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            mobilePane === 'assignment' ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft'
          }`}
        >
          Assignment
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className={`flex min-w-0 flex-1 flex-col gap-4 lg:flex ${mobilePane === 'coach' ? '' : 'hidden lg:flex'}`}>
          <div className="flex flex-wrap gap-2">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTool(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTool === t.key
                    ? 'bg-forest text-cream'
                    : 'border border-hairline bg-cream-card text-ink-soft hover:text-forest'
                }`}
              >
                {t.label}
                {!t.enabled && <span className="ml-1 text-[10px] font-normal opacity-70">Soon</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-forest"
            >
              Export
            </button>
          </div>

          {activeTool === 'review' ? (
            <div className="flex flex-col gap-3">
              {!session.reviewSummary ? (
                <div className="rounded-2xl border border-hairline bg-cream-card p-5 text-center">
                  <p className="text-sm text-ink-soft">Get a concise coaching review of the assignment as it stands.</p>
                  <button
                    type="button"
                    onClick={handleReview}
                    disabled={reviewing || !text.trim()}
                    className="mt-3 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewing ? 'Reviewing...' : 'Get a coaching review'}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-hairline bg-cream-card p-5">
                  {session.reviewSummary.working && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-forest">What's already working</p>
                      <p className="mt-1 text-sm text-ink">{session.reviewSummary.working}</p>
                    </div>
                  )}
                  {session.reviewSummary.misunderstand && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
                        What students may misunderstand
                      </p>
                      <p className="mt-1 text-sm text-ink">{session.reviewSummary.misunderstand}</p>
                    </div>
                  )}
                  {session.reviewSummary.opportunity && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
                        Most important opportunity
                      </p>
                      <p className="mt-1 text-sm text-ink">{session.reviewSummary.opportunity}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleReview}
                    disabled={reviewing}
                    className="mt-4 text-xs font-semibold text-ink-soft hover:text-forest disabled:opacity-50"
                  >
                    {reviewing ? 'Refreshing...' : 'Refresh review ↻'}
                  </button>
                </div>
              )}
              {reviewError && <p className="text-sm text-terracotta-600">{reviewError}</p>}

              <div className="flex flex-wrap gap-2">
                {COACHING_DIRECTIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => handleDirectionPill(d.message)}
                    disabled={chatSending}
                    className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-hairline p-5 text-center text-sm text-ink-soft">
              {TOOLS.find((t) => t.key === activeTool)?.label} is coming soon.
            </div>
          )}

          <CoachingChat
            messages={session.conversation}
            sending={chatSending}
            error={chatError}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            onSend={handleSendChat}
            placeholder="Reply to your coach..."
          />
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-3 lg:flex ${mobilePane === 'assignment' ? '' : 'hidden lg:flex'}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold text-forest">Live Assignment</h2>
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              {saveStatus === 'saving' && <span>Saving…</span>}
              {saveStatus === 'saved' && <span>Saved</span>}
              {saveStatus === 'error' && <span className="text-terracotta-600">Couldn't save</span>}
              <button type="button" onClick={handlePrint} className="font-semibold hover:text-forest">
                Print
              </button>
            </div>
          </div>
          {!text.trim() && session.mode === 'create' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hairline p-8 text-center">
              <p className="text-sm text-ink-soft">
                Once you and Coach land on an approach, draft the assignment here.
              </p>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing || session.conversation.length === 0}
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {finalizing ? 'Drafting...' : 'Draft the assignment'}
              </button>
              {finalizeError && <p className="text-sm text-terracotta-600">{finalizeError}</p>}
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={20}
              className="flex-1 rounded-2xl border border-hairline bg-cream-card p-4 text-sm text-ink focus:border-terracotta/50 focus:outline-none"
            />
          )}
        </div>
      </div>
    </div>
  )
}
