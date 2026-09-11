import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AssignmentContent } from '../components/AssignmentDiagram'
import CoachingChat from '../components/CoachingChat'
import {
  ArrowRightIcon,
  BrainIcon,
  ChatBubbleIcon,
  CheckCircleIcon,
  CheckIcon,
  ChecklistIcon,
  ClipboardIcon,
  ClockIcon,
  CloseIcon,
  GraduationCapIcon,
  KebabIcon,
  RobotIcon,
  ShieldIcon,
  SparkleIcon,
  StarIcon,
  TargetIcon,
  UploadIcon,
  WarningIcon,
} from '../components/icons'
import { ProgressRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ASSIGNMENT_GRADE_LEVELS } from '../lib/assignmentGradeLevels'
import { ASSIGNMENT_SUBJECTS, ASSIGNMENT_TYPES, assignmentTypeLabel, ESTIMATED_TIME_OPTIONS } from '../lib/assignmentTypes'
import { setAssignmentRedesignPrefill, takeAssignmentRedesignPrefill } from '../lib/communicationsPrefill'
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
// concern, neutral for informational/not-yet-determined.
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
  'Identifying the learning goal…',
  'Examining AI-completion risk…',
  'Protecting student thinking…',
  'Creating the revised assignment…',
]

const inputClass =
  'rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/50 focus:outline-none disabled:opacity-60'

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

  // From a Review session's "Make this assignment AI-ready" banner — hands
  // the original text plus the review's own AI-risk finding to the
  // redesign intake screen (via the same sessionStorage prefill mechanism
  // other Wivoza tools already use), so the teacher never has to re-upload
  // or re-paste what's already on file.
  function handleRedesignFromReview(reviewSession: AssignmentCoachSession) {
    const snapshot = reviewSession.reviewSnapshot
    const extraNote = snapshot
      ? `This assignment was already reviewed. Detected AI completion risk: ${snapshot.aiRisk.rating ?? 'unknown'}. ${
          snapshot.aiRisk.explanation ?? ''
        } ${snapshot.aiRisk.reasons ?? ''}`.trim()
      : undefined
    setAssignmentRedesignPrefill({ originalText: reviewSession.originalText ?? '', extraNote })
    setSession(null)
    setPendingMode('redesign_ai')
  }

  if (session) {
    return (
      <Workspace session={session} onUpdate={handleUpdate} onExit={handleExit} onRedesignFromReview={handleRedesignFromReview} />
    )
  }

  if (pendingMode) {
    return <AddAssignmentScreen mode={pendingMode} onBack={() => setPendingMode(null)} onStarted={setSession} />
  }

  return (
    <div className="flex min-h-full flex-col gap-8 bg-cream px-1 py-2 text-ink">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-bold text-forest md:text-3xl">Assignment Coach</h1>
        <p className="text-ink-soft">Design, review, and refine meaningful student work—with a coach beside you.</p>
        <Link
          to="/guide/assignment-coach"
          className="w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setPendingMode('review')}
          className="group relative rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <ChecklistIcon className="h-8 w-8 text-terracotta" />
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Review an assignment</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Get coaching feedback on clarity, rigor, student thinking, accessibility, differentiation, and
            assessment alignment.
          </p>
          <p className="mt-3 text-xs font-semibold text-terracotta">Start review</p>
          <ArrowRightIcon className="absolute bottom-5 right-5 h-4 w-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta" />
        </button>
        <button
          type="button"
          onClick={() => setPendingMode('redesign_ai')}
          className="group relative rounded-2xl border border-hairline bg-cream-card p-6 text-left transition-shadow hover:shadow-md"
        >
          <div className="relative inline-block">
            <span className="flex h-8 w-8 items-center justify-center text-terracotta">
              <ClipboardIcon className="h-8 w-8" />
            </span>
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-forest">
              <SparkleIcon className="h-2.5 w-2.5" />
            </span>
          </div>
          <h2 className="mt-4 font-heading text-lg font-semibold text-forest">Redesign for meaningful AI use</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Adapt an assignment so students must demonstrate their own thinking—whether AI is allowed, limited, or
            not allowed.
          </p>
          <p className="mt-3 text-xs font-semibold text-terracotta">Start redesign</p>
          <ArrowRightIcon className="absolute bottom-5 right-5 h-4 w-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta" />
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
const REVIEW_PREVIEW_PILLS = ['Grade fit', 'Thinking & rigor', 'Learning value', 'Workload', 'AI completion risk']
const REDESIGN_PREVIEW_PILLS = ['Grade fit', 'AI use level', 'Redesign strategies', 'Student guidelines', 'Revised assignment']

// Dark, "focused coaching workspace" treatment, matching the reference
// design — same hand-picked dark brand tints as the Review snapshot panel,
// applied here too so the whole Assignment Coach flow reads as one piece.
function AddAssignmentScreen({
  mode,
  onBack,
  onStarted,
}: {
  mode: 'review' | 'redesign_ai'
  onBack: () => void
  onStarted: (session: AssignmentCoachSession) => void
}) {
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('upload')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileReady, setFileReady] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [aiUseLevel, setAiUseLevel] = useState<AssignmentAiUseLevel | ''>('')
  const [letWivozaRecommend, setLetWivozaRecommend] = useState(false)
  const [starting, setStarting] = useState(false)
  const analyzeProgress = useSimulatedProgress(starting, 16000)
  const [analyzingStep, setAnalyzingStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carried over from a Review session's "Make this assignment AI-ready"
  // banner — pre-fills the assignment text so the teacher never has to
  // re-upload or re-paste what's already on file. `carriedOver` just flags
  // the intake UI to skip the upload/paste chrome; `extraNote` (the
  // review's own findings, not shown to the teacher here) rides along to
  // the backend on submit.
  const [carriedOver, setCarriedOver] = useState(false)
  const [extraNote, setExtraNote] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (mode !== 'redesign_ai') return
    const prefill = takeAssignmentRedesignPrefill()
    if (!prefill) return
    setText(prefill.originalText)
    setFileReady(true)
    setCarriedOver(true)
    setExtraNote(prefill.extraNote)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSubmit = text.trim().length > 0 && (mode === 'review' || aiUseLevel !== '' || letWivozaRecommend)
  const analyzingSteps = mode === 'review' ? REVIEW_ANALYZING_STEPS : REDESIGN_ANALYZING_STEPS
  const previewPills = mode === 'review' ? REVIEW_PREVIEW_PILLS : REDESIGN_PREVIEW_PILLS

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
    setFileReady(false)
    try {
      const { text: extracted } = await extractAssignmentText(file)
      // Held internally, never shown back — the teacher just sees a plain
      // "file read successfully" confirmation, not the (possibly OCR-rough)
      // extracted text itself.
      setText(extracted)
      setFileName(file.name)
      setFileReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file. Please try pasting the text instead.')
    } finally {
      setExtracting(false)
    }
  }

  function handleRemoveFile() {
    setText('')
    setFileName(null)
    setFileReady(false)
    setCarriedOver(false)
    setExtraNote(undefined)
  }

  async function handleAnalyze() {
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const session = await startAssignmentCoach({
        mode,
        aiUseLevel: mode === 'redesign_ai' && !letWivozaRecommend ? (aiUseLevel as AssignmentAiUseLevel) : undefined,
        letWivozaChooseAiUseLevel: mode === 'redesign_ai' && letWivozaRecommend ? true : undefined,
        originalText: text.trim(),
        extraNote,
      })
      onStarted(session)
    } catch (e) {
      // Redesign gets its own calm, reassuring copy regardless of the
      // underlying reason — the teacher's text and AI-use choice are both
      // still right here (canSubmit/text/aiUseLevel are never cleared on
      // failure), so "start over" is never required.
      setError(
        mode === 'redesign_ai'
          ? "We couldn't redesign the assignment. Your work is still here."
          : e instanceof Error
            ? e.message
            : 'Could not analyze this assignment. Please try again.',
      )
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-forest">
        ← Back
      </button>

      <div className="mx-auto w-full max-w-[900px] rounded-3xl bg-forest p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Assignment Coach</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-cream sm:text-3xl">
          {mode === 'review'
            ? 'See what this assignment truly asks of students.'
            : 'See how ready this assignment is for meaningful AI use.'}
        </h1>
        <p className="mt-2 text-sm text-cream/60">
          Add the assignment. Wivoza will estimate the context and{' '}
          {mode === 'review' ? 'examine the quality of the learning experience.' : 'help you redesign it for meaningful AI use.'}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {previewPills.map((p) => (
            <span key={p} className="rounded-full border border-cream/10 bg-cream/5 px-3.5 py-1.5 text-xs font-medium text-cream/80">
              {p}
            </span>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-cream/10 bg-forest-soft p-6">
          {carriedOver ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-cream/15 bg-cream/5 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-terracotta/20 text-terracotta">
                  <ClipboardIcon className="h-4.5 w-4.5" />
                </span>
                <p className="text-sm font-semibold text-cream">Carried over from your review — no need to re-add it.</p>
              </div>
              <button type="button" onClick={handleRemoveFile} className="shrink-0 text-xs font-semibold text-cream/60 hover:text-cream">
                Remove
              </button>
            </div>
          ) : inputMode === 'upload' ? (
            fileReady && !extracting ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cream/15 bg-cream/5 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-terracotta/20 text-terracotta">
                    <ClipboardIcon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-cream">{fileName ?? 'Assignment text'}</p>
                    <p className="text-xs font-semibold text-mint-tint">
                      {mode === 'review' ? 'Ready to review' : 'Ready to redesign'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-cream/80 hover:text-cream"
                  >
                    Replace
                  </button>
                  <button type="button" onClick={handleRemoveFile} aria-label="Remove file" className="text-cream/60 hover:text-cream">
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,.txt,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
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
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                  dragOver ? 'border-terracotta bg-terracotta/10' : 'border-cream/15'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,.txt,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                    e.target.value = ''
                  }}
                />
                <div className="relative">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta/20 text-terracotta">
                    <ClipboardIcon className="h-6 w-6" />
                  </span>
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-forest">
                    <SparkleIcon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="font-heading text-lg font-semibold text-cream">Add your assignment</p>
                <p className="text-sm text-cream/60">Drag a file here, or paste the text below.</p>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className="flex items-center gap-1.5 rounded-xl bg-mint-tint px-4 py-2.5 text-sm font-semibold text-forest transition-opacity hover:opacity-90"
                  >
                    <ClipboardIcon className="h-4 w-4" />
                    Paste text
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={extracting}
                    className="flex items-center gap-1.5 rounded-xl border border-cream/15 bg-cream/5 px-4 py-2.5 text-sm font-semibold text-cream/90 hover:bg-cream/10 disabled:opacity-50"
                  >
                    <UploadIcon className="h-4 w-4" />
                    {extracting ? 'Reading file...' : 'Choose file'}
                  </button>
                </div>
                <p className="text-xs text-cream/50">PDF, Word, image, or plain text</p>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-cream/90">Paste the assignment</p>
                <button type="button" onClick={() => setInputMode('upload')} className="text-xs font-semibold text-cream/60 hover:text-cream">
                  Upload a file instead
                </button>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={starting}
                rows={9}
                placeholder="Paste the assignment here…"
                className="w-full rounded-xl border border-cream/15 bg-cream/5 px-3.5 py-2.5 text-sm text-cream placeholder:text-cream/50 focus:border-terracotta/50 focus:outline-none disabled:opacity-60"
              />
              <span className="self-end text-xs text-cream/50">{text.length.toLocaleString()} characters</span>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-terracotta">
              <UpgradeMessage text={error} />
            </p>
          )}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-cream/50">
          <ShieldIcon className="h-3.5 w-3.5" />
          Do not include student names or personally identifiable information.
        </p>

        {mode === 'redesign_ai' && (
          <div className="mt-5">
            <p className="text-sm font-medium text-cream/90">How should students use AI?</p>
            <label className="mt-2 flex items-center gap-2 text-xs text-cream/70">
              <input
                type="checkbox"
                checked={letWivozaRecommend}
                onChange={(e) => {
                  setLetWivozaRecommend(e.target.checked)
                  if (e.target.checked) setAiUseLevel('')
                }}
                disabled={starting}
                className="h-3.5 w-3.5 rounded border-cream/30 accent-terracotta"
              />
              Not sure? Let Wivoza recommend the best approach.
            </label>
            <div className={`mt-2 grid gap-3 sm:grid-cols-3 ${letWivozaRecommend ? 'pointer-events-none opacity-40' : ''}`}>
              {AI_USE_LEVEL_OPTIONS.map((opt) => {
                const selected = !letWivozaRecommend && aiUseLevel === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAiUseLevel(opt.value)}
                    disabled={starting || letWivozaRecommend}
                    className={`relative rounded-xl border p-3.5 text-left transition-colors ${
                      selected
                        ? 'border-terracotta bg-cream/15 shadow-md shadow-terracotta/10'
                        : 'border-cream/10 bg-cream/5 hover:border-cream/25'
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-terracotta text-cream">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    )}
                    <p className={`text-sm font-semibold ${selected ? 'text-cream' : 'text-cream/90'}`}>{opt.label}</p>
                    <p className={`mt-1 text-xs ${selected ? 'text-cream/90' : 'text-cream/60'}`}>{opt.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {starting && (
          <div className="mt-5 flex justify-center text-cream">
            <ProgressRing
              progress={analyzeProgress}
              label={analyzingSteps[analyzingStep]}
              hint="Reading the whole assignment, not just the first paragraph."
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canSubmit || starting}
          className="mt-5 w-full rounded-xl bg-mint-tint px-5 py-2.5 text-sm font-semibold text-forest transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {starting ? analyzingSteps[analyzingStep] : error ? 'Try again' : 'Analyze assignment'}
        </button>
      </div>
    </div>
  )
}

// Dark, "focused coaching workspace" treatment for the Review snapshot
// specifically — a deliberate departure from the rest of the app's cream
// theme, scoped to this one panel (per the reference design). Built from
// the site's own existing dark tokens (forest/forest-soft, the same green
// already used for the sidebar) plus opacity-tinted terracotta/gold/mint,
// rather than a separate hand-picked dark palette.
function darkToneStyles(tone: Tone): { badge: string } {
  switch (tone) {
    case 'good':
      return { badge: 'bg-mint-tint/15 text-mint-tint' }
    case 'warn':
      return { badge: 'bg-gold/15 text-gold' }
    case 'concern':
      return { badge: 'bg-terracotta/20 text-terracotta' }
    default:
      return { badge: 'bg-cream/5 text-cream/80' }
  }
}

function DarkReviewCard({
  icon,
  tone,
  label,
  statusLabel,
  explanation,
  detail,
  note,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode
  tone: Tone
  label: string
  statusLabel: string
  explanation: string | null
  detail?: string | null
  note?: string | null
  actionLabel: string
  onAction?: () => void
  disabled?: boolean
}) {
  const t = darkToneStyles(tone)
  return (
    <div className="rounded-2xl border border-cream/10 bg-forest-soft p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.badge}`}>{icon}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs text-cream/60">{label}</p>
          <p className="text-base font-semibold text-cream">{statusLabel}</p>
        </div>
      </div>
      {explanation && <p className="mt-3 text-sm leading-relaxed text-cream/80">{explanation}</p>}
      {detail && <p className="mt-2 whitespace-pre-wrap text-xs text-cream/60">{detail}</p>}
      {note && <p className="mt-2 text-xs italic text-terracotta">{note}</p>}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="mt-3 text-xs font-semibold text-cream/80 hover:text-cream disabled:opacity-50"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

function ReviewSnapshotPanel({
  session,
  onExit,
  onExport,
  onDiscuss,
  onSaveDetails,
  onAnswerClarifying,
  onSkipClarifying,
  clarifyingDismissed,
  refining,
  refineError,
  chatSending,
  onAction,
  onRevise,
  revising,
  reviseError,
  conversationEmpty,
  onRedesign,
}: {
  session: AssignmentCoachSession
  onExit: () => void
  onExport: () => void
  onDiscuss: () => void
  onSaveDetails: (fields: { assignmentType?: AssignmentType; gradeLevel?: string; subject?: string; estimatedTime?: string }) => Promise<void>
  onAnswerClarifying: (answer: string) => void
  onSkipClarifying: () => void
  clarifyingDismissed: boolean
  refining: boolean
  refineError: string | null
  chatSending: boolean
  onAction: (message: string) => void
  onRevise: () => void
  revising: boolean
  reviseError: string | null
  conversationEmpty: boolean
  onRedesign: () => void
}) {
  const snapshot = session.reviewSnapshot!
  const [showAll, setShowAll] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [assignmentType, setAssignmentType] = useState<AssignmentType | ''>(session.assignmentType ?? '')
  const [gradeLevel, setGradeLevel] = useState(session.gradeLevel ?? '')
  const [subject, setSubject] = useState(session.subject ?? '')
  const [estimatedTime, setEstimatedTime] = useState(session.estimatedTime ?? '')
  const [savingDetails, setSavingDetails] = useState(false)

  const hasOpportunity = Boolean(snapshot.mainOpportunity.title || snapshot.mainOpportunity.description)
  const darkSelect =
    'rounded-lg border border-cream/15 bg-cream/5 px-2.5 py-1.5 text-xs text-cream focus:border-terracotta/50 focus:outline-none [&>option]:bg-forest-soft'

  async function handleSaveDetails() {
    setSavingDetails(true)
    try {
      await onSaveDetails({
        assignmentType: assignmentType || undefined,
        gradeLevel: gradeLevel || undefined,
        subject: subject || undefined,
        estimatedTime: estimatedTime || undefined,
      })
      setEditingDetails(false)
    } finally {
      setSavingDetails(false)
    }
  }

  return (
    <div className="rounded-3xl bg-forest p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onExit}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-cream/60 hover:bg-cream/5 hover:text-cream"
          >
            Add assignment
          </button>
          <span className="rounded-full bg-cream/10 px-3.5 py-1.5 text-xs font-semibold text-cream">Review snapshot</span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-cream/15 px-3.5 py-1.5 text-xs font-semibold text-cream/90 hover:bg-cream/5"
          >
            Export
          </button>
          <button
            type="button"
            onClick={onDiscuss}
            className="flex items-center gap-1.5 rounded-full border border-cream/15 px-3.5 py-1.5 text-xs font-semibold text-cream/90 hover:bg-cream/5"
          >
            <ChatBubbleIcon className="h-3.5 w-3.5" />
            Discuss with Coach
          </button>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Assignment review</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-cream sm:text-3xl">
          {session.title || assignmentTypeLabel(session.assignmentType)}
        </h1>
        <p className="mt-1 text-sm text-cream/60">A concise review of what students are being asked to do and think.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-cream/60">Wivoza detected</span>
        {session.gradeLevel && (
          <span className="flex items-center gap-1.5 rounded-full border border-cream/10 bg-cream/5 px-3 py-1 text-xs text-cream/90">
            <GraduationCapIcon className="h-3.5 w-3.5" />
            Likely {session.gradeLevel}
          </span>
        )}
        {session.subject && (
          <span className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1 text-xs text-cream/90">{session.subject}</span>
        )}
        {session.assignmentType && (
          <span className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1 text-xs text-cream/90">
            {assignmentTypeLabel(session.assignmentType)}
          </span>
        )}
        {session.estimatedTime && (
          <span className="flex items-center gap-1.5 rounded-full border border-cream/10 bg-cream/5 px-3 py-1 text-xs text-cream/90">
            <ClockIcon className="h-3.5 w-3.5" />
            {session.estimatedTime}
          </span>
        )}
        <button type="button" onClick={() => setEditingDetails((v) => !v)} className="text-xs font-semibold text-cream/90 hover:opacity-80">
          Edit details
        </button>
      </div>

      {editingDetails && (
        <div className="mt-2 rounded-xl border border-cream/10 bg-cream/5 p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} className={darkSelect}>
              <option value="">Grade level</option>
              {ASSIGNMENT_GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={darkSelect}>
              <option value="">Subject</option>
              {ASSIGNMENT_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value as AssignmentType)} className={darkSelect}>
              <option value="">Assignment type</option>
              {ASSIGNMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} className={darkSelect}>
              <option value="">Estimated time</option>
              {ESTIMATED_TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditingDetails(false)} className="text-xs font-semibold text-cream/60 hover:text-cream">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="rounded-lg bg-cream px-3 py-1.5 text-xs font-semibold text-forest hover:opacity-90 disabled:opacity-50"
            >
              {savingDetails ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {session.clarifyingQuestion && !clarifyingDismissed && (
        <div className="mt-4 rounded-2xl border border-terracotta/30 bg-terracotta/10 p-4">
          <p className="text-sm font-semibold text-cream">{session.clarifyingQuestion.question}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {session.clarifyingQuestion.options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onAnswerClarifying(o)}
                disabled={refining}
                className="rounded-full border border-terracotta/40 bg-cream/5 px-3 py-1.5 text-xs font-semibold text-terracotta hover:bg-cream/10 disabled:opacity-50"
              >
                {o}
              </button>
            ))}
            <button
              type="button"
              onClick={onSkipClarifying}
              disabled={refining}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-cream/60 hover:text-cream disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </div>
      )}
      {refineError && <p className="mt-2 text-sm text-terracotta">{refineError}</p>}

      {hasOpportunity && (
        <div className="mt-6 rounded-2xl bg-mint-tint p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest/70">Most important opportunity</p>
          {snapshot.mainOpportunity.title && <p className="mt-2 text-xl font-bold text-forest">{snapshot.mainOpportunity.title}</p>}
          {snapshot.mainOpportunity.description && <p className="mt-1 text-sm text-forest/80">{snapshot.mainOpportunity.description}</p>}
          <button
            type="button"
            onClick={() => onAction(`Let's work on this: ${snapshot.mainOpportunity.title ?? 'the main opportunity'}.`)}
            disabled={chatSending}
            className="mt-4 w-full rounded-xl bg-forest py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Improve with Coach
          </button>
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-forest hover:opacity-80">
            {showAll ? 'Hide recommendations' : 'See all recommendations'}
          </button>
        </div>
      )}

      {showAll && (
        <div className="mt-3 flex flex-wrap gap-2">
          {REVIEW_QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onAction(a.message)}
              disabled={chatSending}
              className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1.5 text-xs font-medium text-cream/80 transition-colors hover:border-terracotta/40 hover:text-terracotta disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <DarkReviewCard
          icon={<CheckCircleIcon className="h-5 w-5" />}
          tone={gradeFitTone(snapshot.gradeFit.rating)}
          label="Grade-level fit"
          statusLabel={GRADE_FIT_LABELS[snapshot.gradeFit.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.gradeFit.explanation}
          actionLabel="See evidence"
          onAction={() => onAction("Let's talk about whether this fits the intended grade level.")}
          disabled={chatSending}
        />
        <DarkReviewCard
          icon={<BrainIcon className="h-5 w-5" />}
          tone="warn"
          label="Thinking and rigor"
          statusLabel={snapshot.rigor.label ?? 'Not enough evidence yet'}
          explanation={snapshot.rigor.explanation}
          actionLabel="Strengthen thinking"
          onAction={() => onAction("Let's strengthen the rigor of this assignment.")}
          disabled={chatSending}
        />
        <DarkReviewCard
          icon={<TargetIcon className="h-5 w-5" />}
          tone={meaningfulWorkTone(snapshot.meaningfulWork.rating)}
          label="Meaningful work"
          statusLabel={MEANINGFUL_WORK_LABELS[snapshot.meaningfulWork.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.meaningfulWork.explanation}
          note={snapshot.meaningfulWork.suggestion}
          actionLabel="Remove low-value work"
          onAction={() => onAction("Let's remove any low-value or busywork steps.")}
          disabled={chatSending}
        />
        <DarkReviewCard
          icon={<RobotIcon className="h-5 w-5" />}
          tone={aiRiskTone(snapshot.aiRisk.rating)}
          label="AI completion risk"
          statusLabel={AI_RISK_LABELS[snapshot.aiRisk.rating ?? ''] ?? 'Not enough evidence yet'}
          explanation={snapshot.aiRisk.explanation}
          detail={snapshot.aiRisk.reasons}
          actionLabel="Make it AI-resilient"
          onAction={() => onAction("Let's make student thinking more visible so this is harder to fully outsource to AI.")}
          disabled={chatSending}
        />
      </div>

      {snapshot.workloadSummary && (
        <div className="mt-3 rounded-2xl border border-cream/10 bg-forest-soft p-5">
          <p className="text-xs text-cream/50">Workload &amp; clarity</p>
          <p className="mt-1 text-sm text-cream/80">{snapshot.workloadSummary}</p>
        </div>
      )}

      {(snapshot.aiRisk.rating === 'high' || snapshot.aiRisk.rating === 'moderate') && (
        <div className="mt-3 rounded-2xl border border-terracotta/30 bg-terracotta/10 p-5">
          <p className="text-sm font-bold text-cream">AI completion risk: {AI_RISK_LABELS[snapshot.aiRisk.rating]}</p>
          {snapshot.aiRisk.explanation && <p className="mt-1 text-sm text-cream/80">{snapshot.aiRisk.explanation}</p>}
          <button
            type="button"
            onClick={onRedesign}
            className="mt-3 flex items-center gap-1.5 rounded-xl bg-cream px-4 py-2 text-xs font-semibold text-forest transition-opacity hover:opacity-90"
          >
            Make this assignment AI-ready
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onRevise}
        disabled={revising || conversationEmpty}
        className="mt-4 self-start rounded-xl border border-cream/15 px-4 py-2 text-xs font-semibold text-cream/90 hover:bg-cream/5 disabled:opacity-50"
      >
        {revising ? 'Revising...' : 'Revise the whole assignment'}
      </button>
      {reviseError && <p className="mt-2 text-sm text-terracotta">{reviseError}</p>}
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

// Light-themed sibling to DarkReviewCard, for the redesign output's five
// sections — Workspace is cream-themed, so reusing DarkReviewCard's dark
// styling verbatim would look like a foreign patch.
function LightResultCard({
  icon,
  label,
  accentClassName,
  children,
}: {
  icon: React.ReactNode
  label: string
  accentClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-5">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accentClassName ?? 'bg-mint-tint text-forest'}`}>
          {icon}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-forest">{label}</p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Workspace({
  session,
  onUpdate,
  onExit,
  onRedesignFromReview,
}: {
  session: AssignmentCoachSession
  onUpdate: (session: AssignmentCoachSession) => void
  onExit: () => void
  onRedesignFromReview: (session: AssignmentCoachSession) => void
}) {
  const navigate = useNavigate()
  const isRedesign = session.mode === 'redesign_ai'

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

  const [revisedView, setRevisedView] = useState<'original' | 'revised'>('revised')
  const [editingRedesign, setEditingRedesign] = useState(false)

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

  async function handleCopyValue(value: string) {
    await navigator.clipboard.writeText(value).catch(() => {})
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
        <div className="flex items-center gap-4">
          {saveStatus === 'saving' && <span className="text-xs text-ink-soft">Saving…</span>}
          {saveStatus === 'saved' && <span className="text-xs text-ink-soft">Saved</span>}
          {saveStatus === 'error' && <span className="text-xs text-terracotta-600">Couldn't save</span>}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!text.trim()}
            className="text-sm font-medium text-ink-soft hover:text-forest disabled:opacity-50"
          >
            Copy assignment
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
      </div>

      {!(!isRedesign && session.reviewSnapshot) && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full border border-hairline bg-cream-card px-2.5 py-1 text-xs font-semibold text-forest">
              {chip}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4">
        {isRedesign ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-forest">Redesign for meaningful AI use</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/assignment-coach/${session.id}/export`)}
                    className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-forest"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    className="rounded-full border border-hairline bg-cream-card px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-forest"
                  >
                    Start over
                  </button>
                </div>
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

              {session.aiResistant && (
                <div className="flex flex-col gap-3">
                  {session.aiResistant.aiRole && (
                    <LightResultCard icon={<TargetIcon className="h-4 w-4" />} label="Recommended AI role">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-forest">
                        {AI_USE_LEVEL_OPTIONS.find((o) => o.value === session.aiResistant?.aiRole?.level)?.label ?? 'AI as a thinking partner'}
                        {session.aiResistant.aiRole.recommended && (
                          <span className="rounded-full bg-mint-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest">
                            Recommended by Wivoza
                          </span>
                        )}
                      </p>
                      {session.aiResistant.aiRole.explanation && (
                        <p className="mt-1 text-sm text-ink">{session.aiResistant.aiRole.explanation}</p>
                      )}
                    </LightResultCard>
                  )}
                  {session.aiResistant.vulnerableSteps && (
                    <LightResultCard
                      icon={<WarningIcon className="h-4 w-4" />}
                      label="Vulnerable steps"
                      accentClassName="bg-peach-tint text-terracotta-600"
                    >
                      <p className="whitespace-pre-wrap text-sm text-ink">{session.aiResistant.vulnerableSteps}</p>
                    </LightResultCard>
                  )}
                  {(session.aiResistant.thinkingSafeguards ?? session.aiResistant.strategies) && (
                    <LightResultCard icon={<ShieldIcon className="h-4 w-4" />} label="Thinking safeguards">
                      <p className="whitespace-pre-wrap text-sm text-ink">
                        {session.aiResistant.thinkingSafeguards ?? session.aiResistant.strategies}
                      </p>
                    </LightResultCard>
                  )}
                  {session.aiResistant.guidelines && (
                    <LightResultCard icon={<ChecklistIcon className="h-4 w-4" />} label="Student AI guidelines">
                      <p className="whitespace-pre-wrap text-sm text-ink">{session.aiResistant.guidelines}</p>
                      <button
                        type="button"
                        onClick={() => handleCopyValue(session.aiResistant?.guidelines ?? '')}
                        className="mt-2 text-xs font-semibold text-ink-soft hover:text-forest"
                      >
                        Copy student AI guidelines
                      </button>
                    </LightResultCard>
                  )}
                  {session.aiResistant.revisedAssignment && (
                    <div className="rounded-2xl border border-hairline bg-cream-card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Revised assignment</p>
                        <div className="flex rounded-full border border-hairline bg-cream p-0.5 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setRevisedView('original')}
                            className={`rounded-full px-2.5 py-1 ${revisedView === 'original' ? 'bg-forest text-cream' : 'text-ink-soft'}`}
                          >
                            Original
                          </button>
                          <button
                            type="button"
                            onClick={() => setRevisedView('revised')}
                            className={`rounded-full px-2.5 py-1 ${revisedView === 'revised' ? 'bg-forest text-cream' : 'text-ink-soft'}`}
                          >
                            Revised
                          </button>
                        </div>
                      </div>
                      {editingRedesign ? (
                        <textarea
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          rows={12}
                          className="mt-2 w-full rounded-lg border border-hairline bg-cream px-3 py-2 text-sm text-ink focus:border-terracotta/50 focus:outline-none"
                        />
                      ) : (
                        <div className="mt-2">
                          <AssignmentContent
                            text={revisedView === 'original' ? session.originalText || 'No original text on file.' : session.aiResistant.revisedAssignment}
                          />
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleApplyAiResistant}
                          className="rounded-lg bg-forest px-4 py-2 text-xs font-semibold text-cream transition-opacity hover:opacity-90"
                        >
                          Apply to assignment
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyValue(session.aiResistant?.revisedAssignment ?? '')}
                          className="text-xs font-semibold text-ink-soft hover:text-forest"
                        >
                          Copy revised assignment
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRedesign((v) => !v)}
                          className="text-xs font-semibold text-ink-soft hover:text-forest"
                        >
                          {editingRedesign ? 'Done editing' : 'Edit'}
                        </button>
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
                  )}
                  {aiResistError && <p className="text-sm text-terracotta-600">{aiResistError}</p>}
                </div>
              )}
            </>
          ) : session.reviewSnapshot ? (
            <ReviewSnapshotPanel
              session={session}
              onExit={onExit}
              onExport={() => navigate(`/assignment-coach/${session.id}/export`)}
              onDiscuss={() =>
                document.getElementById('assignment-coach-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              onSaveDetails={handleSaveDetails}
              onAnswerClarifying={handleRefine}
              onSkipClarifying={() => setClarifyingDismissed(true)}
              clarifyingDismissed={clarifyingDismissed}
              refining={refining}
              refineError={refineError}
              chatSending={chatSending}
              onAction={handleAreaPill}
              onRevise={handleRevise}
              revising={revising}
              reviseError={reviseError}
              conversationEmpty={session.conversation.length === 0}
              onRedesign={() => onRedesignFromReview(session)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-forest">Review</h2>
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
            </>
          )}

        <div id="assignment-coach-chat">
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
      </div>
    </div>
  )
}
