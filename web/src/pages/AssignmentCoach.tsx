import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AssignmentContent } from '../components/AssignmentDiagram'
import CoachingChat from '../components/CoachingChat'
import { BrainIcon, ChecklistIcon, KebabIcon, StarIcon } from '../components/icons'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ASSIGNMENT_GRADE_LEVELS } from '../lib/assignmentGradeLevels'
import { ASSIGNMENT_SUBJECTS, ASSIGNMENT_TYPES, assignmentTypeLabel, ESTIMATED_TIME_OPTIONS } from '../lib/assignmentTypes'
import {
  deleteAssignmentCoachSession,
  extractAssignmentText,
  getAssignmentCoachSessions,
  reviewAssignmentCoach,
  reviseAssignmentCoach,
  runAiResistant,
  sendAssignmentCoachChat,
  startAssignmentCoach,
  updateAssignmentCoachSession,
  type AssignmentAiUseLevel,
  type AssignmentCoachMode,
  type AssignmentCoachSession,
  type AssignmentType,
} from '../lib/api'

const AI_USE_LEVEL_OPTIONS: { value: AssignmentAiUseLevel; label: string; description: string }[] = [
  {
    value: 'thinking_partner',
    label: 'AI as a thinking partner',
    description: 'Students may use AI to question, brainstorm, receive feedback, or revise—but must show their own reasoning.',
  },
  {
    value: 'limited',
    label: 'Limited AI use',
    description: 'AI is permitted only for specific teacher-approved steps.',
  },
  {
    value: 'no_ai',
    label: 'No AI use',
    description: 'The task is completed without generative AI and includes authentic evidence of student thinking.',
  },
]

const REVIEW_AREA_PILLS = [
  { label: 'Purpose and clarity', message: "Let's improve the purpose and clarity of this assignment." },
  { label: 'Cognitive demand', message: "Let's strengthen the cognitive demand of this assignment." },
  { label: 'Student ownership and critical thinking', message: "Let's increase student ownership and critical thinking here." },
  { label: 'Accessibility and differentiation', message: "Let's improve accessibility and differentiation." },
  { label: 'Success criteria', message: "Let's clarify the success criteria." },
  { label: 'Potential AI shortcuts', message: "Let's address potential AI shortcuts in this assignment." },
]

const inputClass =
  'rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/50 focus:outline-none disabled:opacity-60'

function tabPillClass(active: boolean): string {
  return `flex-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft'
  }`
}

// Treats anything other than the two current modes (older rows may carry a
// retired 'create'/'improve' value) as Review — the workspace never breaks
// on a pre-redesign session, it just falls back to the closer display.
function modeLabel(mode: AssignmentCoachMode): string {
  return mode === 'redesign_ai' ? 'Redesign for AI' : 'Review'
}

export default function AssignmentCoach() {
  const [pendingMode, setPendingMode] = useState<'review' | 'redesign_ai' | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [session, setSession] = useState<AssignmentCoachSession | null>(null)

  const [sessions, setSessions] = useState<AssignmentCoachSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getAssignmentCoachSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  function handleExit() {
    setSession(null)
    setPendingMode(null)
    setPendingText(null)
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

  if (pendingMode && pendingText != null) {
    return (
      <ContextForm
        mode={pendingMode}
        originalText={pendingText}
        onBack={() => setPendingText(null)}
        onStarted={setSession}
      />
    )
  }

  if (pendingMode) {
    return (
      <AddAssignmentScreen
        mode={pendingMode}
        onBack={() => setPendingMode(null)}
        onNext={setPendingText}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-8 bg-cream px-1 py-2 text-ink">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold text-forest md:text-3xl">Assignment Coach</h1>
        <p className="text-ink-soft">Design, review, and refine meaningful student work—with a coach beside you.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPendingMode('review')}
          className="group rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <ChecklistIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Review an assignment</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Get coaching feedback on clarity, rigor, student thinking, accessibility, differentiation, and
            assessment alignment.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setPendingMode('redesign_ai')}
          className="group rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <BrainIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Redesign for meaningful AI use</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Adapt an assignment so students must demonstrate their own thinking—whether AI is allowed, limited, or
            not allowed.
          </p>
        </button>
      </div>

      <div>
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-ink-soft">My Assignments</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
            Assignments you review or redesign will show up here.
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

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-cream-card p-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-mint-tint px-2 py-0.5 text-xs font-semibold text-forest">
            {modeLabel(session.mode)}
          </span>
          {session.assignmentType && (
            <span className="rounded-full bg-peach-tint px-2 py-0.5 text-xs font-semibold text-terracotta-600">
              {assignmentTypeLabel(session.assignmentType)}
            </span>
          )}
          <span className="rounded-full bg-gold-tint px-2 py-0.5 text-xs font-semibold text-terracotta-600">
            {session.status === 'completed' ? 'Completed' : 'Draft'}
          </span>
        </div>
        <p className="mt-1.5 truncate text-sm text-ink">
          {session.title || session.originalText?.slice(0, 80) || 'Untitled assignment'}
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
              <Link
                to={`/assignment-coach/${session.id}/export`}
                onClick={() => setMenuOpen(false)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cream"
              >
                Export
              </Link>
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

function AddAssignmentScreen({
  mode,
  onBack,
  onNext,
}: {
  mode: 'review' | 'redesign_ai'
  onBack: () => void
  onNext: (text: string) => void
}) {
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setExtracting(true)
    setError(null)
    try {
      const { text: extracted } = await extractAssignmentText(file)
      setText(extracted)
      setInputMode('paste')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file. Please try pasting the text instead.')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 bg-cream text-ink">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-forest">
        ← Back
      </button>
      <div>
        <h1 className="font-heading text-xl font-bold text-forest">Add the assignment</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {mode === 'review'
            ? "Paste or upload the assignment you'd like feedback on."
            : "Paste or upload the assignment you'd like to redesign."}
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setInputMode('paste')} className={tabPillClass(inputMode === 'paste')}>
          Paste text
        </button>
        <button type="button" onClick={() => setInputMode('upload')} className={tabPillClass(inputMode === 'upload')}>
          Upload a file
        </button>
      </div>

      {inputMode === 'paste' ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste the assignment text here..."
          className={inputClass}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-hairline bg-cream-card p-8 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <p className="text-sm text-ink-soft">Upload a .docx, .pdf, or .txt file.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            className="mt-3 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {extracting ? 'Reading file...' : 'Choose a file'}
          </button>
          {text.trim() && !extracting && (
            <p className="mt-4 text-xs font-semibold text-forest">
              File read successfully — switch to "Paste text" to review it before continuing.
            </p>
          )}
        </div>
      )}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      <button
        type="button"
        onClick={() => onNext(text.trim())}
        disabled={!text.trim()}
        className="self-end rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  )
}

function ContextForm({
  mode,
  originalText,
  onBack,
  onStarted,
}: {
  mode: 'review' | 'redesign_ai'
  originalText: string
  onBack: () => void
  onStarted: (session: AssignmentCoachSession) => void
}) {
  const [assignmentType, setAssignmentType] = useState<AssignmentType | ''>('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [subject, setSubject] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [estimatedTimeCustom, setEstimatedTimeCustom] = useState(false)
  const [aiUseLevel, setAiUseLevel] = useState<AssignmentAiUseLevel | ''>('')
  const [showMoreFields, setShowMoreFields] = useState(false)
  const [objective, setObjective] = useState('')
  const [standards, setStandards] = useState('')
  const [specificNeeds, setSpecificNeeds] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = mode === 'review' || aiUseLevel !== ''
  const ctaLabel = mode === 'review' ? 'Review this assignment' : 'Redesign this assignment'

  async function handleStart() {
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const session = await startAssignmentCoach({
        mode,
        aiUseLevel: mode === 'redesign_ai' ? (aiUseLevel as AssignmentAiUseLevel) : undefined,
        assignmentType: assignmentType || undefined,
        gradeLevel: gradeLevel || undefined,
        subject: subject || undefined,
        estimatedTime: estimatedTime.trim() || undefined,
        objective: objective.trim() || undefined,
        specificNeeds:
          [standards.trim() ? `Standards: ${standards.trim()}` : '', specificNeeds.trim()].filter(Boolean).join(' — ') ||
          undefined,
        originalText,
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
          {mode === 'review' ? 'A little context before we review' : 'A little context before we redesign'}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Assignment type</span>
              <select
                value={assignmentType}
                onChange={(e) => setAssignmentType(e.target.value as AssignmentType)}
                disabled={starting}
                className={inputClass}
              >
                <option value="">Select a type</option>
                {ASSIGNMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-forest">Estimated student work time</span>
              <select
                value={estimatedTimeCustom ? 'Other' : estimatedTime}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'Other') {
                    setEstimatedTimeCustom(true)
                    setEstimatedTime('')
                  } else {
                    setEstimatedTimeCustom(false)
                    setEstimatedTime(v)
                  }
                }}
                disabled={starting}
                className={inputClass}
              >
                <option value="">Select an estimate</option>
                {ESTIMATED_TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {estimatedTimeCustom && (
            <input
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(e.target.value)}
              disabled={starting}
              placeholder="Describe the estimated time..."
              className={inputClass}
            />
          )}

          {mode === 'redesign_ai' && (
            <div>
              <p className="text-sm font-medium text-forest">How should students use AI?</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {AI_USE_LEVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAiUseLevel(opt.value)}
                    disabled={starting}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      aiUseLevel === opt.value
                        ? 'border-forest bg-mint-tint'
                        : 'border-hairline bg-cream-card hover:border-terracotta/40'
                    }`}
                  >
                    <p className="text-sm font-semibold text-forest">{opt.label}</p>
                    <p className="mt-1 text-xs text-ink-soft">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMoreFields((v) => !v)}
            className="self-start text-xs font-semibold text-ink-soft hover:text-forest"
          >
            {showMoreFields ? '− Hide extra details' : '+ Add more details (optional)'}
          </button>

          {showMoreFields && (
            <div className="flex flex-col gap-4 border-t border-hairline pt-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-forest">Learning objective or standard</span>
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  disabled={starting}
                  rows={2}
                  className={inputClass}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-forest">Standards</span>
                  <input value={standards} onChange={(e) => setStandards(e.target.value)} disabled={starting} className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-forest">Specific learning needs</span>
                  <input
                    value={specificNeeds}
                    onChange={(e) => setSpecificNeeds(e.target.value)}
                    disabled={starting}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

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
  const navigate = useNavigate()
  const isRedesign = session.mode === 'redesign_ai'
  const [mobilePane, setMobilePane] = useState<'coach' | 'assignment'>('coach')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const [aiResisting, setAiResisting] = useState(false)
  const [aiResistError, setAiResistError] = useState<string | null>(null)

  const [revising, setRevising] = useState(false)
  const [reviseError, setReviseError] = useState<string | null>(null)

  const [text, setText] = useState(session.liveAssignmentText ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedRef = useRef(session.liveAssignmentText ?? '')
  const saveTimerRef = useRef<number | null>(null)

  // Reflects an external change (e.g. revising the whole assignment) into
  // the editor — never overwrites text the teacher is mid-typing into,
  // since this only fires when the prop actually changed.
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

  async function handleAreaPill(message: string) {
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

  async function handleAiResistant() {
    if (aiResisting) return
    setAiResisting(true)
    setAiResistError(null)
    try {
      const updated = await runAiResistant(session.id)
      onUpdate(updated)
    } catch (err) {
      setAiResistError((err as Error).message || 'Could not put this together. Please try again.')
    } finally {
      setAiResisting(false)
    }
  }

  function handleApplyAiResistant() {
    if (session.aiResistant?.revisedAssignment) setText(session.aiResistant.revisedAssignment)
  }

  async function handleRevise() {
    if (revising) return
    setRevising(true)
    setReviseError(null)
    try {
      const updated = await reviseAssignmentCoach(session.id)
      onUpdate(updated)
    } catch (err) {
      setReviseError((err as Error).message || 'Could not revise the assignment. Please try again.')
    } finally {
      setRevising(false)
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

  const chips = [
    modeLabel(session.mode),
    session.assignmentType ? assignmentTypeLabel(session.assignmentType) : null,
    session.gradeLevel,
    session.subject,
    session.estimatedTime,
    isRedesign && session.aiUseLevel
      ? `AI use: ${AI_USE_LEVEL_OPTIONS.find((o) => o.value === session.aiUseLevel)?.label ?? session.aiUseLevel}`
      : null,
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
        <button type="button" onClick={() => setMobilePane('coach')} className={tabPillClass(mobilePane === 'coach')}>
          Coach
        </button>
        <button type="button" onClick={() => setMobilePane('assignment')} className={tabPillClass(mobilePane === 'assignment')}>
          Assignment
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <div className={`flex min-w-0 flex-1 flex-col gap-4 lg:flex ${mobilePane === 'coach' ? '' : 'hidden lg:flex'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-semibold text-forest">
              {isRedesign ? 'Redesign for meaningful AI use' : 'Review'}
            </h2>
            <button
              type="button"
              onClick={() => navigate(`/assignment-coach/${session.id}/export`)}
              className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-forest"
            >
              Export
            </button>
          </div>

          {isRedesign ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-hairline bg-cream-card p-5">
                {session.aiResistant?.strategies && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-forest">Strategies</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.aiResistant.strategies}</p>
                  </div>
                )}
                {session.aiResistant?.guidelines && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Student AI guidelines</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.aiResistant.guidelines}</p>
                  </div>
                )}
                {session.aiResistant?.revisedAssignment && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Revised assignment (preview)</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.aiResistant.revisedAssignment}</p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {session.aiResistant?.revisedAssignment && (
                    <button
                      type="button"
                      onClick={handleApplyAiResistant}
                      className="rounded-lg bg-forest px-4 py-2 text-xs font-semibold text-cream transition-opacity hover:opacity-90"
                    >
                      Apply to assignment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAiResistant}
                    disabled={aiResisting || !text.trim()}
                    className="text-xs font-semibold text-ink-soft hover:text-forest disabled:opacity-50"
                  >
                    {aiResisting ? 'Regenerating...' : 'Regenerate ↻'}
                  </button>
                </div>
              </div>
              {aiResistError && <p className="text-sm text-terracotta-600">{aiResistError}</p>}
            </div>
          ) : (
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
                  {session.reviewSummary.needsAttention && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">What may need attention</p>
                      <p className="mt-1 text-sm text-ink">{session.reviewSummary.needsAttention}</p>
                    </div>
                  )}
                  {session.reviewSummary.suggestions && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Suggested improvements</p>
                      <p className="mt-1 text-sm text-ink">{session.reviewSummary.suggestions}</p>
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
                {REVIEW_AREA_PILLS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => handleAreaPill(d.message)}
                    disabled={chatSending}
                    className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRevise}
                disabled={revising || session.conversation.length === 0}
                className="self-start rounded-xl border border-forest/40 bg-mint-tint px-4 py-2 text-xs font-semibold text-forest transition-colors hover:bg-mint-tint/70 disabled:opacity-50"
              >
                {revising ? 'Revising...' : 'Revise the whole assignment'}
              </button>
              {reviseError && <p className="text-sm text-terracotta-600">{reviseError}</p>}
            </div>
          )}

          <CoachingChat
            messages={session.conversation}
            sending={chatSending}
            error={chatError}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            onSend={handleSendChat}
            placeholder="Discuss this with your coach..."
          />
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-3 lg:flex ${mobilePane === 'assignment' ? '' : 'hidden lg:flex'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-heading text-sm font-semibold text-forest">Live Assignment</h2>
              <div className="flex rounded-full border border-hairline bg-cream-card p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                    viewMode === 'edit' ? 'bg-forest text-cream' : 'text-ink-soft'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                    viewMode === 'preview' ? 'bg-forest text-cream' : 'text-ink-soft'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              {saveStatus === 'saving' && <span>Saving…</span>}
              {saveStatus === 'saved' && <span>Saved</span>}
              {saveStatus === 'error' && <span className="text-terracotta-600">Couldn't save</span>}
              <button type="button" onClick={handleCopy} className="font-semibold hover:text-forest">
                Copy
              </button>
            </div>
          </div>
          {viewMode === 'preview' ? (
            <div className="flex-1 overflow-y-auto rounded-2xl border border-hairline bg-cream-card p-4">
              <AssignmentContent text={text} />
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
