import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AssignmentContent } from '../components/AssignmentDiagram'
import CoachingChat from '../components/CoachingChat'
import { BrainIcon, ChecklistIcon, ClipboardIcon, KebabIcon, StarIcon, UploadIcon } from '../components/icons'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ASSIGNMENT_GRADE_LEVELS } from '../lib/assignmentGradeLevels'
import { ASSIGNMENT_SUBJECTS, ASSIGNMENT_TYPES, assignmentTypeLabel, ESTIMATED_TIME_OPTIONS } from '../lib/assignmentTypes'
import {
  deleteAssignmentCoachSession,
  extractAssignmentText,
  getAssignmentCoachSessions,
  refineAssignmentCoach,
  reviewAssignmentCoach,
  reviseAssignmentCoach,
  runAiResistant,
  sendAssignmentCoachChat,
  startAssignmentCoach,
  updateAssignmentCoachSession,
  type AssignmentAiUseLevel,
  type AssignmentClarifyingQuestion,
  type AssignmentCoachMode,
  type AssignmentCoachSession,
  type AssignmentReviewSnapshot,
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

const REVIEW_QUICK_ACTIONS = [
  { label: 'Address the biggest issue', message: "Let's address the biggest issue with this assignment." },
  { label: 'Make it AI-resilient', message: "Let's make this more resistant to being fully outsourced to AI." },
  { label: 'Strengthen the rigor', message: "Let's strengthen the rigor of this assignment." },
  { label: 'Remove low-value work', message: "Let's remove any low-value or busywork steps." },
  { label: 'Clarify student directions', message: "Let's clarify the student directions." },
  { label: 'Adjust the workload', message: "Let's adjust the workload for this assignment." },
  { label: 'Review everything with the coach', message: "Let's review the entire assignment together." },
]

const GRADE_FIT_LABELS: Record<string, string> = {
  below: 'Likely below the intended level',
  appropriate: 'Appears grade-level appropriate',
  above: 'May be above the intended level',
  need_more_context: 'More context needed',
}
const MEANINGFUL_WORK_LABELS: Record<string, string> = {
  clear_value: 'Clear learning value',
  some_repetition: 'Some low-value repetition',
  purpose_unclear: 'Purpose needs clarification',
  mostly_completion: 'Mostly completion-focused',
}
const AI_RISK_LABELS: Record<string, string> = { high: 'High', moderate: 'Moderate', low: 'Low' }

type Tone = 'good' | 'warn' | 'concern' | 'neutral'

// Restrained status colors, no numeric scores anywhere: soft green for
// aligned, soft gold for worth reviewing, soft terracotta for a genuine
// concern, neutral cream for informational/not-yet-determined.
function toneStyles(tone: Tone): { badge: string; text: string; glyph: string } {
  switch (tone) {
    case 'good':
      return { badge: 'bg-mint-tint', text: 'text-forest', glyph: '✓' }
    case 'warn':
      return { badge: 'bg-gold-tint', text: 'text-terracotta-600', glyph: '◇' }
    case 'concern':
      return { badge: 'bg-peach-tint', text: 'text-terracotta-600', glyph: '!' }
    default:
      return { badge: 'bg-cream', text: 'text-ink-soft', glyph: '·' }
  }
}
function gradeFitTone(rating: string | null): Tone {
  return rating === 'appropriate' ? 'good' : 'neutral'
}
function meaningfulWorkTone(rating: string | null): Tone {
  if (rating === 'clear_value') return 'good'
  if (rating === 'some_repetition') return 'warn'
  if (rating === 'mostly_completion') return 'concern'
  return 'neutral'
}
function aiRiskTone(rating: string | null): Tone {
  if (rating === 'low') return 'good'
  if (rating === 'moderate') return 'warn'
  if (rating === 'high') return 'concern'
  return 'neutral'
}

const REVIEW_ANALYZING_STEPS = [
  'Reading the assignment…',
  'Identifying the learning goal…',
  'Checking rigor and grade-level fit…',
  'Examining AI completion risk…',
]
const REDESIGN_ANALYZING_STEPS = [
  'Reading the assignment…',
  'Identifying where AI could shortcut the thinking…',
  'Building strategies to keep reasoning visible…',
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

  if (pendingMode) {
    return <AddAssignmentScreen mode={pendingMode} onBack={() => setPendingMode(null)} onStarted={setSession} />
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

// The only step before analysis: what the assignment is, and — for
// Redesign only — how students should use AI (a real policy choice, not
// something to infer). Everything else (grade/subject/type/estimated
// time) is detected from the text itself once "Analyze assignment" runs.
function AddAssignmentScreen({
  mode,
  onBack,
  onStarted,
}: {
  mode: 'review' | 'redesign_ai'
  onBack: () => void
  onStarted: (session: AssignmentCoachSession) => void
}) {
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [aiUseLevel, setAiUseLevel] = useState<AssignmentAiUseLevel | ''>('')
  const [starting, setStarting] = useState(false)
  const [analyzingStep, setAnalyzingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit = text.trim().length > 0 && (mode === 'review' || aiUseLevel !== '')
  const analyzingSteps = mode === 'review' ? REVIEW_ANALYZING_STEPS : REDESIGN_ANALYZING_STEPS

  // Cycles a short, honestly-labeled sequence while the request is in
  // flight — never claims to be a real progress measurement, matching
  // this app's established pattern for unmeasurable waits.
  useEffect(() => {
    if (!starting) return
    setAnalyzingStep(0)
    const id = window.setInterval(() => {
      setAnalyzingStep((s) => (s + 1 < analyzingSteps.length ? s + 1 : s))
    }, 1300)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting])

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

  async function handleAnalyze() {
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const session = await startAssignmentCoach({
        mode,
        aiUseLevel: mode === 'redesign_ai' ? (aiUseLevel as AssignmentAiUseLevel) : undefined,
        originalText: text.trim(),
      })
      onStarted(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze this assignment. Please try again.')
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 bg-cream text-ink">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-forest">
        ← Back
      </button>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-xl font-bold text-forest">
            {mode === 'review' ? 'Review an assignment' : 'Redesign for meaningful AI use'}
          </h1>
          <p className="text-sm text-ink-soft">
            Add what students will receive. Wivoza will identify the context and{' '}
            {mode === 'review' ? 'review the learning value.' : 'redesign it for meaningful AI use.'}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-cream-card">
          <div className="flex gap-1.5 border-b border-hairline p-2">
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                inputMode === 'paste' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-forest'
              }`}
            >
              <ClipboardIcon className="h-4 w-4" />
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                inputMode === 'upload' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-forest'
              }`}
            >
              <UploadIcon className="h-4 w-4" />
              Upload file
            </button>
          </div>

          <div className="p-4">
            {inputMode === 'paste' ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={starting}
                rows={9}
                placeholder="Paste the assignment here…"
                className="w-full rounded-xl border border-hairline bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/50 focus:outline-none disabled:opacity-60"
              />
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFile(file)
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                  dragOver ? 'border-terracotta bg-peach-tint/40' : 'border-hairline'
                }`}
              >
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
                <UploadIcon className="h-6 w-6 text-terracotta" />
                <p className="text-sm text-ink-soft">Drag a file here, or</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extracting}
                  className="rounded-xl bg-forest px-4 py-2 text-xs font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {extracting ? 'Reading file...' : 'Choose a file'}
                </button>
                <p className="text-xs text-ink-soft">Supports .docx, .pdf, and .txt</p>
                {text.trim() && !extracting && (
                  <p className="text-xs font-semibold text-forest">
                    File read successfully — switch to "Paste text" to review it.
                  </p>
                )}
              </div>
            )}

            {mode === 'redesign_ai' && (
              <div className="mt-4">
                <p className="text-sm font-medium text-forest">How should students use AI?</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  {AI_USE_LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAiUseLevel(opt.value)}
                      disabled={starting}
                      className={`rounded-xl border p-3.5 text-left transition-colors ${
                        aiUseLevel === opt.value
                          ? 'border-forest bg-mint-tint'
                          : 'border-hairline bg-cream hover:border-terracotta/40'
                      }`}
                    >
                      <p className="text-sm font-semibold text-forest">{opt.label}</p>
                      <p className="mt-1 text-xs text-ink-soft">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-terracotta-600">
                <UpgradeMessage text={error} />
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-cream px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
              <span>Do not include student names.</span>
              <span>{text.length.toLocaleString()} characters</span>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canSubmit || starting}
              className="rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {starting ? analyzingSteps[analyzingStep] : 'Analyze assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewCard({
  title,
  tone,
  statusLabel,
  explanation,
  detail,
  note,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string
  tone: Tone
  statusLabel: string
  explanation: string | null
  detail?: string | null
  note?: string | null
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
}) {
  const t = toneStyles(tone)
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-cream-card p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.badge} ${t.text}`}>
          {t.glyph}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{title}</p>
          <p className={`text-sm font-semibold ${t.text}`}>{statusLabel}</p>
        </div>
      </div>
      {explanation && <p className="mt-2 line-clamp-3 text-sm text-ink">{explanation}</p>}
      {detail && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{detail}</p>}
      {note && <p className="mt-1 text-xs italic text-terracotta-600">{note}</p>}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="mt-2 self-start text-xs font-semibold text-ink-soft hover:text-forest disabled:opacity-50"
        >
          {actionLabel ?? 'Improve this'}
        </button>
      )}
    </div>
  )
}

function ReviewDashboard({
  snapshot,
  chatSending,
  onAction,
  onRevise,
  revising,
  reviseError,
  conversationEmpty,
}: {
  snapshot: AssignmentReviewSnapshot
  chatSending: boolean
  onAction: (message: string) => void
  onRevise: () => void
  revising: boolean
  reviseError: string | null
  conversationEmpty: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const hasOpportunity = Boolean(snapshot.mainOpportunity.title || snapshot.mainOpportunity.description)

  return (
    <div className="flex flex-col gap-3">
      {hasOpportunity && (
        <div className="rounded-2xl border border-forest/30 bg-mint-tint p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-forest">Most important opportunity</p>
          {snapshot.mainOpportunity.title && <p className="mt-1 text-sm font-semibold text-forest">{snapshot.mainOpportunity.title}</p>}
          {snapshot.mainOpportunity.description && <p className="mt-1 text-sm text-ink">{snapshot.mainOpportunity.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onAction(`Let's work on this: ${snapshot.mainOpportunity.title ?? 'the main opportunity'}.`)}
              disabled={chatSending}
              className="rounded-lg bg-forest px-4 py-2 text-xs font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Improve this with Coach
            </button>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-forest hover:opacity-80">
              {showAll ? 'Hide recommendations' : 'See all recommendations'}
            </button>
          </div>
        </div>
      )}

      {showAll && (
        <div className="flex flex-wrap gap-2">
          {REVIEW_QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onAction(a.message)}
              disabled={chatSending}
              className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600 disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ReviewCard
          title="Grade-Level Fit"
          tone={gradeFitTone(snapshot.gradeFit.rating)}
          statusLabel={GRADE_FIT_LABELS[snapshot.gradeFit.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.gradeFit.explanation}
          onAction={() => onAction("Let's talk about whether this fits the intended grade level.")}
          disabled={chatSending}
        />
        <ReviewCard
          title="Thinking & Rigor"
          tone="neutral"
          statusLabel={snapshot.rigor.label ?? 'Not enough evidence yet'}
          explanation={snapshot.rigor.explanation}
          onAction={() => onAction("Let's strengthen the rigor of this assignment.")}
          disabled={chatSending}
        />
        <ReviewCard
          title="Meaningful Work"
          tone={meaningfulWorkTone(snapshot.meaningfulWork.rating)}
          statusLabel={MEANINGFUL_WORK_LABELS[snapshot.meaningfulWork.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.meaningfulWork.explanation}
          note={snapshot.meaningfulWork.suggestion}
          onAction={() => onAction("Let's remove any low-value or busywork steps.")}
          disabled={chatSending}
        />
        <ReviewCard
          title="AI Completion Risk"
          tone={aiRiskTone(snapshot.aiRisk.rating)}
          statusLabel={AI_RISK_LABELS[snapshot.aiRisk.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.aiRisk.explanation}
          detail={snapshot.aiRisk.reasons}
          onAction={() => onAction("Let's make student thinking more visible so this is harder to fully outsource to AI.")}
          disabled={chatSending}
        />
      </div>

      {snapshot.workloadSummary && (
        <div className="rounded-2xl border border-hairline bg-cream-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Workload &amp; clarity</p>
          <p className="mt-1 text-sm text-ink">{snapshot.workloadSummary}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onRevise}
        disabled={revising || conversationEmpty}
        className="self-start rounded-xl border border-forest/40 bg-mint-tint px-4 py-2 text-xs font-semibold text-forest transition-colors hover:bg-mint-tint/70 disabled:opacity-50"
      >
        {revising ? 'Revising...' : 'Revise the whole assignment'}
      </button>
      {reviseError && <p className="text-sm text-terracotta-600">{reviseError}</p>}
    </div>
  )
}

// Replaces the old always-required intake form's four fields: shown as a
// plain summary line with an optional inline edit row, never a blocking
// step. Saving is a plain field overwrite — no Claude call.
function DetectedContextBar({
  session,
  onSave,
}: {
  session: AssignmentCoachSession
  onSave: (fields: { assignmentType?: AssignmentType; gradeLevel?: string; subject?: string; estimatedTime?: string }) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [assignmentType, setAssignmentType] = useState<AssignmentType | ''>(session.assignmentType ?? '')
  const [gradeLevel, setGradeLevel] = useState(session.gradeLevel ?? '')
  const [subject, setSubject] = useState(session.subject ?? '')
  const [estimatedTime, setEstimatedTime] = useState(session.estimatedTime ?? '')
  const [saving, setSaving] = useState(false)

  const parts = [
    session.gradeLevel,
    session.subject,
    session.assignmentType ? assignmentTypeLabel(session.assignmentType) : null,
    session.estimatedTime,
  ].filter((p): p is string => Boolean(p))

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        assignmentType: assignmentType || undefined,
        gradeLevel: gradeLevel || undefined,
        subject: subject || undefined,
        estimatedTime: estimatedTime || undefined,
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>{parts.length > 0 ? `Likely ${parts.join(' · ')}` : 'Add a few details to help Coach tailor its review'}</span>
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-forest hover:opacity-80">
          Edit details
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-hairline bg-cream-card p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} className={inputClass}>
          <option value="">Grade level</option>
          {ASSIGNMENT_GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass}>
          <option value="">Subject</option>
          {ASSIGNMENT_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as AssignmentType)} className={inputClass}>
          <option value="">Assignment type</option>
          {ASSIGNMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} className={inputClass}>
          <option value="">Estimated time</option>
          {ESTIMATED_TIME_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-ink-soft hover:text-forest">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ClarifyingBanner({
  question,
  onAnswer,
  onSkip,
  answering,
}: {
  question: AssignmentClarifyingQuestion
  onAnswer: (answer: string) => void
  onSkip: () => void
  answering: boolean
}) {
  return (
    <div className="rounded-2xl border border-terracotta/30 bg-peach-tint p-4">
      <p className="text-sm font-semibold text-forest">{question.question}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {question.options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onAnswer(o)}
            disabled={answering}
            className="rounded-full border border-terracotta/40 bg-cream-card px-3 py-1.5 text-xs font-semibold text-terracotta-600 hover:bg-cream disabled:opacity-50"
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          disabled={answering}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-forest disabled:opacity-50"
        >
          Skip
        </button>
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

  const [refining, setRefining] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)
  const [clarifyingDismissed, setClarifyingDismissed] = useState(false)

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

  async function handleRefine(answer: string) {
    if (refining) return
    setRefining(true)
    setRefineError(null)
    try {
      const updated = await refineAssignmentCoach(session.id, answer)
      onUpdate(updated)
    } catch (err) {
      setRefineError((err as Error).message || 'Could not refine this. Please try again.')
    } finally {
      setRefining(false)
    }
  }

  async function handleSaveDetails(fields: {
    assignmentType?: AssignmentType
    gradeLevel?: string
    subject?: string
    estimatedTime?: string
  }) {
    const updated = await updateAssignmentCoachSession(session.id, fields)
    onUpdate(updated)
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

          <DetectedContextBar session={session} onSave={handleSaveDetails} />

          {session.clarifyingQuestion && !clarifyingDismissed && (
            <ClarifyingBanner
              question={session.clarifyingQuestion}
              onAnswer={handleRefine}
              onSkip={() => setClarifyingDismissed(true)}
              answering={refining}
            />
          )}
          {refineError && <p className="text-sm text-terracotta-600">{refineError}</p>}

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
          ) : session.reviewSnapshot ? (
            <ReviewDashboard
              snapshot={session.reviewSnapshot}
              chatSending={chatSending}
              onAction={handleAreaPill}
              onRevise={handleRevise}
              revising={revising}
              reviseError={reviseError}
              conversationEmpty={session.conversation.length === 0}
            />
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
                {REVIEW_QUICK_ACTIONS.map((d) => (
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

        <div
          className={`flex min-w-0 flex-1 flex-col gap-3 lg:sticky lg:top-4 lg:flex ${
            mobilePane === 'assignment' ? '' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-heading text-sm font-semibold text-forest">Original Assignment</h2>
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
