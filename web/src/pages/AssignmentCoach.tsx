import { useEffect, useState } from 'react'
import CoachingChat from '../components/CoachingChat'
import { BrainIcon, ChartBarIcon, ChecklistIcon, SparkleIcon, StarIcon, TargetIcon } from '../components/icons'
import { UpgradeMessage } from '../components/UpgradeMessage'
import {
  deleteAssignmentCoachSession,
  finalizeAssignmentCoach,
  getAssignmentCoachSessions,
  sendAssignmentCoachChat,
  setAssignmentCoachSaved,
  startAssignmentCoach,
  type AssignmentCoachMode,
  type AssignmentCoachSession,
} from '../lib/api'

const MODE_CARDS: {
  mode: AssignmentCoachMode
  label: string
  description: string
  icon: (props: { className?: string }) => React.ReactElement
}[] = [
  { mode: 'create', label: 'Create an assignment', description: 'Turn a learning objective into a task.', icon: SparkleIcon },
  { mode: 'review', label: 'Review my assignment', description: 'Get coaching on clarity, rigor, and engagement.', icon: ChecklistIcon },
  { mode: 'differentiate', label: 'Differentiate it', description: 'Scaffolds, extensions, and accommodations.', icon: TargetIcon },
  { mode: 'rubric', label: 'Build a rubric', description: 'Define clear success criteria.', icon: ChartBarIcon },
  { mode: 'ai_aware', label: 'Make it AI-aware', description: "Think through AI's role in this task.", icon: BrainIcon },
]

const MODE_LABELS: Record<AssignmentCoachMode, string> = {
  create: 'Create an assignment',
  review: 'Review my assignment',
  differentiate: 'Differentiate it',
  rubric: 'Build a rubric',
  ai_aware: 'Make it AI-aware',
}

const MATERIAL_SECTIONS: { key: keyof NonNullable<AssignmentCoachSession['finalMaterials']>; label: string }[] = [
  { key: 'assignment', label: 'Assignment' },
  { key: 'rubric', label: 'Rubric' },
  { key: 'scaffolds', label: 'Scaffolds' },
  { key: 'aiUseStatement', label: 'AI-use statement' },
]

export default function AssignmentCoach() {
  const [pendingMode, setPendingMode] = useState<AssignmentCoachMode | null>(null)
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
      // best-effort — a stale row reappearing on next load is a minor
      // inconvenience, not worth restoring optimistic-delete state for
    }
  }

  if (session) {
    return <ConversationView session={session} onUpdate={handleUpdate} onExit={handleExit} />
  }

  if (pendingMode) {
    return <StartForm mode={pendingMode} onBack={() => setPendingMode(null)} onStarted={setSession} />
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Assignment Coach</h1>
        <p className="text-ink-soft">
          A coach for the assignments, homework, and rubrics your students actually see — not a generator.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODE_CARDS.map(({ mode, label, description, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPendingMode(mode)}
            className="group rounded-2xl border border-border bg-surface p-6 text-left transition-shadow hover:shadow-md"
          >
            <Icon className="h-8 w-8 text-brand-500" />
            <h2 className="mt-4 text-lg font-semibold text-ink">{label}</h2>
            <p className="mt-1 text-sm text-ink-soft">{description}</p>
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Past sessions</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Sessions you start will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
                <button type="button" onClick={() => setSession(s)} className="min-w-0 flex-1 text-left">
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
                    {MODE_LABELS[s.mode]}
                  </span>
                  <p className="mt-1.5 truncate text-sm text-ink">
                    {s.title || s.objective || s.originalText?.slice(0, 80) || 'Assignment Coach session'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="shrink-0 text-sm font-medium text-ink-soft hover:text-warm-500"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StartForm({
  mode,
  onBack,
  onStarted,
}: {
  mode: AssignmentCoachMode
  onBack: () => void
  onStarted: (session: AssignmentCoachSession) => void
}) {
  const [gradeLevel, setGradeLevel] = useState('')
  const [subject, setSubject] = useState('')
  const [objective, setObjective] = useState('')
  const [originalText, setOriginalText] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = mode === 'create' ? objective.trim().length > 0 : originalText.trim().length > 0

  async function handleStart() {
    if (!canSubmit || starting) return
    setStarting(true)
    setError(null)
    try {
      const session = await startAssignmentCoach({
        mode,
        gradeLevel: gradeLevel.trim() || undefined,
        subject: subject.trim() || undefined,
        objective: mode === 'create' ? objective.trim() : undefined,
        originalText: mode !== 'create' ? originalText.trim() : undefined,
      })
      onStarted(session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start this conversation. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  const inputClass =
    'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60'

  return (
    <div className="flex flex-col gap-6">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-ink-soft hover:text-ink">
        ← Back
      </button>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">{MODE_LABELS[mode]}</h1>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Grade level</span>
              <input
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                disabled={starting}
                placeholder="e.g. 7th grade"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={starting}
                placeholder="e.g. Science"
                className={inputClass}
              />
            </label>
          </div>

          {mode === 'create' ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What's the learning objective?</span>
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
              <span className="text-sm font-medium text-ink">Paste or describe the assignment</span>
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

          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !canSubmit}
            className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {starting ? 'Starting...' : 'Start the conversation'}
          </button>
        </div>
        {error && (
          <p className="mt-4 text-center text-sm text-warm-500">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>
    </div>
  )
}

function ConversationView({
  session,
  onUpdate,
  onExit,
}: {
  session: AssignmentCoachSession
  onUpdate: (session: AssignmentCoachSession) => void
  onExit: () => void
}) {
  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

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

  async function handleFinalize() {
    if (finalizing) return
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const updated = await finalizeAssignmentCoach(session.id)
      onUpdate(updated)
    } catch (err) {
      setFinalizeError((err as Error).message || 'Could not put together the final materials. Please try again.')
    } finally {
      setFinalizing(false)
    }
  }

  async function handleToggleSaved() {
    const nextSaved = !session.saved
    onUpdate({ ...session, saved: nextSaved })
    try {
      await setAssignmentCoachSaved(session.id, nextSaved)
    } catch {
      onUpdate({ ...session, saved: !nextSaved })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Back to Assignment Coach
        </button>
        <button
          type="button"
          onClick={handleToggleSaved}
          className={`flex items-center gap-1.5 text-sm font-medium ${
            session.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
          }`}
        >
          <StarIcon className="h-4 w-4" filled={session.saved} />
          {session.saved ? 'Saved' : 'Save for later'}
        </button>
      </div>

      <div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
          {MODE_LABELS[session.mode]}
        </span>
        {(session.gradeLevel || session.subject) && (
          <p className="mt-2 text-sm text-ink-soft">
            {[session.gradeLevel, session.subject].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <CoachingChat
        messages={session.conversation}
        sending={chatSending}
        error={chatError}
        draft={chatDraft}
        onDraftChange={setChatDraft}
        onSend={handleSendChat}
        placeholder="Reply to your coach..."
      />

      <button
        type="button"
        onClick={handleFinalize}
        disabled={finalizing}
        className="self-start rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
      >
        {finalizing ? 'Putting it together...' : "I'm ready — create the final version"}
      </button>
      {finalizeError && <p className="text-sm text-warm-500">{finalizeError}</p>}

      {session.finalMaterials && (
        <div className="flex flex-col gap-4">
          {MATERIAL_SECTIONS.map(({ key, label }) => {
            const value = session.finalMaterials?.[key]
            if (!value) return null
            return <MaterialCard key={key} label={label} value={value} />
          })}
        </div>
      )}
    </div>
  )
}

function MaterialCard({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{label}</p>
        <button type="button" onClick={handleCopy} className="text-xs font-medium text-ink-soft hover:text-brand-600">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  )
}
