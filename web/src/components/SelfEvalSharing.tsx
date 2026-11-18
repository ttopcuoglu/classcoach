import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  attachSelfEvalPlan,
  getLessonPlans,
  getSelfEvalShare,
  previewSelfEvalReport,
  removeSelfEvalPlan,
  saveSelfEvalAbout,
  setSelfEvalShare,
  type AudioRubricLens,
  type AudioSessionWithSegments,
  type LessonPlan,
  type SelfEvalShareState,
  type SharedSelfEvalReport,
} from '../lib/api'
import { WorkingRing } from './ProgressRing'
import { RubricComponentAbout, RubricLevelBadge } from './RubricLevel'
import { SelfEvalReportView } from './SelfEvalReportView'

// The teacher's half of the supervisor report: Domain 1 from an attached
// lesson plan, and the one Preview → Share path. The preview is built by the
// server with the same function and choices the share uses
// (server lib/selfEvalReport.ts), so what the teacher sees is what is sent.

const DATE = { month: 'short', day: 'numeric', year: 'numeric' } as const

// ---------------------------------------------------------------------------
// Domain 1 · Planning and Preparation
// ---------------------------------------------------------------------------

export function PlanningSection({
  sessionId,
  lens,
  locked,
  onSessionChanged,
  renderNote,
}: {
  sessionId: string
  lens: AudioRubricLens
  locked: boolean
  onSessionChanged: (updated: AudioSessionWithSegments) => void
  renderNote: (code: string, note: string | null) => ReactNode
}) {
  const [mode, setMode] = useState<'closed' | 'paste' | 'plans'>('closed')
  const [text, setText] = useState('')
  const [plans, setPlans] = useState<LessonPlan[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode !== 'plans' || plans) return
    getLessonPlans()
      .then((list) => setPlans(list.slice(0, 30)))
      .catch(() => setPlans([]))
  }, [mode, plans])

  async function attach(from: { file: File } | { text: string } | { lessonPlanId: string }) {
    setBusy(true)
    setError(null)
    try {
      onSessionChanged(await attachSelfEvalPlan(sessionId, from))
      setMode('closed')
      setText('')
    } catch (err) {
      setError((err as Error).message || 'Could not read that plan. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Remove the lesson plan and its Domain 1 levels?')) return
    setBusy(true)
    setError(null)
    try {
      onSessionChanged(await removeSelfEvalPlan(sessionId))
    } catch (err) {
      setError((err as Error).message || 'Could not remove the plan.')
    } finally {
      setBusy(false)
    }
  }

  const planning = lens.planning
  const plan = lens.plan

  const picker = !locked && (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.pptx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void attach({ file })
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
        >
          {plan ? 'Upload a different plan' : 'Attach Lesson Plan'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(mode === 'paste' ? 'closed' : 'paste')}
          className="rounded-full border border-hairline bg-white px-4 py-2 text-xs font-semibold text-forest hover:border-forest disabled:opacity-50"
        >
          Paste it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(mode === 'plans' ? 'closed' : 'plans')}
          className="rounded-full border border-hairline bg-white px-4 py-2 text-xs font-semibold text-forest hover:border-forest disabled:opacity-50"
        >
          Choose from Planning Coach
        </button>
      </div>
      {mode === 'paste' && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste your lesson plan: objective, materials, sequence, checks for understanding..."
            className="w-full rounded-xl border border-hairline bg-white p-3 text-sm text-ink focus:border-forest focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || text.trim().length < 80}
            onClick={() => attach({ text })}
            className="self-start rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
          >
            Read this plan
          </button>
        </div>
      )}
      {mode === 'plans' &&
        (plans == null ? (
          <p className="text-sm text-ink-soft">Loading your plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-ink-soft">No Planning Coach plans yet.</p>
        ) : (
          <div className="flex max-h-64 flex-col overflow-y-auto rounded-xl border border-hairline bg-white">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => attach({ lessonPlanId: p.id })}
                className="border-b border-hairline/60 px-4 py-2.5 text-left text-sm text-ink last:border-0 hover:bg-cream disabled:opacity-50"
              >
                <span className="block font-semibold text-forest">{p.objective || p.unitName || p.fileName || 'Untitled plan'}</span>
                <span className="text-xs text-ink-soft">
                  {[p.subject, p.gradeLevel ? `Grade ${p.gradeLevel}` : null, new Date(p.createdAt).toLocaleDateString(undefined, DATE)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        ))}
      <WorkingRing active={busy} estimatedMs={25000} label="Reading your plan for Domain 1" className="text-forest" />
    </div>
  )

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-heading text-lg font-bold leading-tight text-forest">Domain 1: Planning and Preparation</h3>
        <p className="mt-0.5 text-xs text-ink-soft">Optional. A recording can&rsquo;t show planning, so this comes from your lesson plan.</p>
      </div>
      {!planning || !plan ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-cream-card p-5">
          <p className="text-sm text-ink">
            Attach the plan for this lesson to get a suggested level for each Domain 1 component (1a&ndash;1f), with the words from your
            plan behind each one. Where the plan says too little, it says so instead of guessing.
          </p>
          <p className="mt-1.5 text-xs text-ink-soft">
            Only you see it unless you share this Self-Eval with your supervisor; the plan then goes with it.
          </p>
          {locked ? <p className="mt-3 text-sm text-ink-soft">This report is locked, so a plan can&rsquo;t be attached.</p> : picker}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-white px-4 py-3">
            <p className="min-w-0 text-sm text-ink">
              <span className="font-semibold text-forest">Plan:</span> {plan.label}
              <span className="text-ink-soft"> · attached {new Date(plan.attachedAt).toLocaleDateString(undefined, DATE)}</span>
            </p>
            {!locked && (
              <button type="button" onClick={remove} disabled={busy} className="text-xs font-semibold text-terracotta-600 hover:underline disabled:opacity-50">
                Remove plan
              </button>
            )}
          </div>
          {planning.components.map((c) => (
            <div key={c.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                <p className="font-heading text-base font-bold text-forest">{c.name}</p>
              </div>
              <RubricComponentAbout code={c.code} />
              <RubricLevelBadge level={c.level} source="plan" />
              {c.excerpts.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {c.excerpts.map((e, i) => (
                    <div key={i} className="border-l-2 border-gold/60 pl-3">
                      <p className="text-sm text-ink">&ldquo;{e.text}&rdquo;</p>
                      <p className="mt-0.5 text-xs text-ink-soft">Plan · {e.ref}</p>
                    </div>
                  ))}
                </div>
              )}
              {c.explanation && <p className="mt-3 text-sm text-ink">{c.explanation}</p>}
              {renderNote(c.code, c.teacherNote ?? null)}
            </div>
          ))}
          {picker}
        </>
      )}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Share bar and preview
// ---------------------------------------------------------------------------

export function SelfEvalShareBar({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<SelfEvalShareState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    let live = true
    getSelfEvalShare(sessionId)
      .then((s) => live && setState(s))
      .catch(() => live && setState(null))
    return () => {
      live = false
    }
  }, [sessionId])

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      setState(await setSelfEvalShare(sessionId, false))
    } catch (err) {
      setError((err as Error).message || 'Could not stop sharing. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null
  // The supervisor's feedback stays here even after sharing stops.
  const feedback = state.feedback ? (
    <div className="rounded-2xl border border-forest/20 bg-mint-tint/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest">
        Feedback from {state.feedback.fromName ?? 'your supervisor'}
        {state.feedback.at ? ` · ${new Date(state.feedback.at).toLocaleDateString(undefined, DATE)}` : ''}
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm text-ink">{state.feedback.text}</p>
    </div>
  ) : null
  if (!state.supervisorName) {
    return (
      <div className="flex flex-col gap-3">
        {feedback}
        <p className="text-xs text-ink-soft">No supervisor is assigned to you yet, so this Self-Eval can&rsquo;t be shared. Your school sets this up.</p>
      </div>
    )
  }

  const shared = state.sharedAt != null
  return (
    <div className="flex flex-col gap-3">
      {feedback}
      <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-cream-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-forest">
              {shared
                ? `Shared with ${state.supervisorName} on ${new Date(state.sharedAt!).toLocaleDateString(undefined, DATE)}`
                : 'Share with my supervisor'}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {shared
                ? `${state.supervisorName} has the report as you sent it. Changes you make now reach them only if you share again.`
                : `Preview the exact report ${state.supervisorName} will receive, then share. It includes your lesson plan and the Content Specialist's notes, never the recording or the transcript.`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream"
            >
              {shared ? 'Preview and share again' : 'Preview Supervisor Report'}
            </button>
            {shared && (
              <button
                type="button"
                onClick={stop}
                disabled={busy}
                className="rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-ink hover:border-forest disabled:opacity-50"
              >
                {busy ? 'Stopping...' : 'Stop sharing'}
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
      </div>
      {previewing && (
        <SupervisorReportPreview
          sessionId={sessionId}
          onClose={() => setPreviewing(false)}
          onShared={(s) => {
            setState(s)
            setPreviewing(false)
          }}
        />
      )}
    </div>
  )
}

function SupervisorReportPreview({
  sessionId,
  onClose,
  onShared,
}: {
  sessionId: string
  onClose: () => void
  onShared: (s: SelfEvalShareState) => void
}) {
  const [data, setData] = useState<{ supervisorName: string | null; report: SharedSelfEvalReport; aboutError: string | null } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  // Not sent with the preview request: it changes nothing in the report
  // body, so typing it shouldn't rebuild the preview on every key.
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoadError(null)
    previewSelfEvalReport(sessionId)
      .then((d) => live && setData(d))
      .catch((err: Error) => live && setLoadError(err.message || 'Could not build the preview.'))
    return () => {
      live = false
    }
  }, [sessionId, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function saveAbout(text: string) {
    setBusy(true)
    setError(null)
    try {
      await saveSelfEvalAbout(sessionId, text)
      setEditingAbout(false)
      if (!text) setData(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError((err as Error).message || 'Could not save About This Lesson.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    setBusy(true)
    setError(null)
    try {
      onShared(await setSelfEvalShare(sessionId, true, { feedbackRequest: question.trim() || undefined }))
    } catch (err) {
      setError((err as Error).message || 'Could not share. Please try again.')
      setBusy(false)
    }
  }

  const report = data?.report
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-ink/30 px-2 pt-2 sm:px-6 sm:pt-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview Supervisor Report"
        className="mb-2 flex h-fit w-full max-w-3xl flex-col rounded-2xl bg-cream shadow-lg sm:mb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-xl font-bold text-forest">Preview Supervisor Report</h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              To: <span className="font-semibold text-ink">{data?.supervisorName ?? '...'}</span> · the report they&rsquo;ll receive. Their copy also lists
              the lesson&rsquo;s strengths and the Content Specialist&rsquo;s notes.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-ink-soft hover:text-forest">
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-hairline bg-cream-card px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">What would you like feedback on? (optional)</span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. I tried more “why” questions this time. Did the discussion part work?"
              className="w-full rounded-xl border border-hairline bg-white p-3 text-sm text-ink focus:border-forest focus:outline-none"
            />
            <span className="text-xs text-ink-soft">{data?.supervisorName ?? 'Your supervisor'} sees this first, above the report.</span>
          </label>
        </div>

        <div className="px-5 py-5">
          {loadError && <p className="text-sm text-terracotta-600">{loadError}</p>}
          {!report && !loadError && <WorkingRing active estimatedMs={15000} label="Writing About This Lesson and building your report" className="text-forest" />}
          {report && (
            <SelfEvalReportView
              report={report}
              teacherPreview
              aboutMissing={
                <div className="mt-2 flex flex-col gap-2 text-sm text-ink-soft">
                  <p>{data?.aboutError ?? 'About This Lesson could not be written.'} The report can be shared without it.</p>
                  <button type="button" onClick={() => setReload((n) => n + 1)} className="self-start font-semibold text-forest hover:underline">
                    Try again
                  </button>
                </div>
              }
              aboutActions={
                report.about && !editingAbout ? (
                  <span className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setAboutDraft(report.about!.text)
                        setEditingAbout(true)
                      }}
                      className="font-semibold text-forest hover:underline"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => saveAbout('')} disabled={busy} className="font-semibold text-ink-soft hover:underline">
                      Write it again
                    </button>
                  </span>
                ) : null
              }
              aboutBody={
                editingAbout ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <textarea
                      value={aboutDraft}
                      onChange={(e) => setAboutDraft(e.target.value)}
                      rows={6}
                      maxLength={1500}
                      className="w-full rounded-xl border border-hairline bg-white p-3 text-sm text-ink focus:border-forest focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveAbout(aboutDraft)}
                        disabled={busy || !aboutDraft.trim()}
                        className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingAbout(false)} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft hover:text-forest">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : undefined
              }
            />
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-hairline bg-cream-card px-5 py-4">
          <p className="text-xs text-ink-soft">You can stop sharing at any time.</p>
          <div className="flex items-center gap-3">
            {error && <p className="text-sm text-terracotta-600">{error}</p>}
            <button
              type="button"
              onClick={share}
              disabled={busy || !report || editingAbout}
              className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
            >
              {busy ? 'Sharing...' : 'Share with My Supervisor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
