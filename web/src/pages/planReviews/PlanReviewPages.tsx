import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlanReviewView, planReviewHeading } from '../../components/PlanReviewView'
import { TeacherBox, type TeacherPick } from '../../components/SchoolTeacherBox'
import {
  createPlanReview,
  deletePlanReview,
  getPlanReview,
  getPlanReviews,
  regeneratePlanReview,
  savePlanReviewReport,
  sendPlanReview,
  updatePlanReview,
  type PlanReview,
  type PlanReviewStatus,
  type PlanReviewSummary,
} from '../../lib/api'
import { PageHeader } from '../evaluations/common'

// Lesson Plan Eval (School Workspace > Review > Lesson Plans, 2026-11-24): a
// supervisor picks a teacher, uploads or pastes the plan, and Wivoza writes a
// draft (Domain 1 with quotes, the school's lesson plan format, strengths,
// next steps). The supervisor sets the levels, adds comments and sends it.

export default function PlanReviewPages() {
  const { id } = useParams()
  if (id === 'new') return <NewReview />
  return id ? <ReviewFlow id={id} /> : <ReviewList />
}

const btnPrimary = 'rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-cream hover:bg-forest/90 disabled:bg-hairline disabled:text-ink-soft'
const btnSecondary = 'rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest disabled:opacity-50'
const input = 'w-full rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none'
const GRADES = ['6', '7', '8', '9', '10', '11', '12']

function Shell({ children, back }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      {back && (
        <Link to="/admin/lesson-plan-reviews" className="text-sm text-ink-soft hover:text-forest">
          ← All lesson plan reviews
        </Link>
      )}
      {children}
    </div>
  )
}

const STATUS: Record<PlanReviewStatus, { label: string; tone: string }> = {
  pending: { label: 'Preparing', tone: 'bg-gold-tint text-terracotta-600' },
  generating: { label: 'Preparing', tone: 'bg-gold-tint text-terracotta-600' },
  draft: { label: 'Draft', tone: 'bg-mint-tint/70 text-forest' },
  failed: { label: 'Needs a retry', tone: 'bg-terracotta/15 text-terracotta-600' },
  sent: { label: 'Sent', tone: 'bg-forest text-cream' },
}

// ---- the list ----

function ReviewList() {
  const [rows, setRows] = useState<PlanReviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getPlanReviews()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <Shell>
      <PageHeader
        crumb="Lesson Plans"
        title="Lesson Plans"
        blurb="Review a teacher's lesson plan. Wivoza reads it through Danielson Domain 1 and your school's lesson plan format; you set the levels and send it."
        aside={
          <Link to="/admin/lesson-plan-reviews/new" className={btnPrimary}>
            Review a Lesson Plan
          </Link>
        }
      />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">No lesson plan reviews yet.</div>
      )}
      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-b border-hairline/70 pr-3 last:border-0 hover:bg-cream/40">
              <Link to={`/admin/lesson-plan-reviews/${r.id}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{r.teacherName}</p>
                  <p className="text-sm text-ink-soft">
                    {[r.lessonTitle, r.planLabel, new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </Link>
              <button
                type="button"
                aria-label={`Delete the review for ${r.teacherName}`}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-terracotta-600 hover:bg-terracotta/10"
                onClick={async () => {
                  const ask = r.sentAt
                    ? `Delete the review sent to ${r.teacherName}? It will also disappear from their page. This can’t be undone.`
                    : `Delete the review for ${r.teacherName}? This can’t be undone.`
                  if (!window.confirm(ask)) return
                  try {
                    await deletePlanReview(r.id)
                    setRows((list) => (list ? list.filter((x) => x.id !== r.id) : list))
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </section>
      )}
    </Shell>
  )
}

// ---- a new review ----

function NewReview() {
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState<TeacherPick>({ id: null, name: '' })
  const [lesson, setLesson] = useState('')
  const [grade, setGrade] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [mode, setMode] = useState<'upload' | 'paste'>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const optional = <span className="font-normal text-ink-soft"> (optional)</span>
  const hasPlan = mode === 'upload' ? !!file : pasted.trim().length >= 80

  return (
    <Shell back>
      <PageHeader crumb="Lesson Plans" title="Review a Lesson Plan" blurb="Who wrote it, and the plan itself. Only the plan's text is kept, never the file." />
      <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-white p-6">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
          Teacher
          <TeacherBox
            value={teacher}
            onChange={(t) => {
              setTeacher(t)
              if (t.id) {
                if (!lesson.trim() && t.subject) setLesson(t.subject)
                const g = (t.gradeLevel ?? '').replace(/(st|nd|rd|th)$/i, '')
                if (!grade && GRADES.includes(g)) setGrade(g)
              }
            }}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
            <span>Subject/Lesson{optional}</span>
            <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="For example: Science, chemical reactions" className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-forest">
            <span>Grade{optional}</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={input}>
              <option value="">Choose a grade</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-forest">Lesson plan</p>
          <div className="flex gap-2">
            {(['upload', 'paste'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${mode === m ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:border-forest'}`}
              >
                {m === 'upload' ? 'Upload a file' : 'Paste it'}
              </button>
            ))}
          </div>
          {mode === 'upload' ? (
            <label className={`${btnSecondary} w-fit cursor-pointer`}>
              {file ? file.name : 'Choose a file (PDF, Word, PowerPoint, text)'}
              <input type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.pptx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={8} placeholder="Paste the lesson plan" className={input} />
          )}
        </div>
        {error && <p className="text-sm text-terracotta-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !teacher.name.trim() || !hasPlan}
            className={btnPrimary}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                const r = await createPlanReview({
                  teacherId: teacher.id,
                  teacherName: teacher.name.trim(),
                  lessonTitle: lesson.trim() || undefined,
                  gradeLevel: grade || undefined,
                  ...(mode === 'upload' && file ? { file } : { text: pasted }),
                })
                navigate(`/admin/lesson-plan-reviews/${r.id}`)
              } catch (e) {
                setError((e as Error).message)
                setBusy(false)
              }
            }}
          >
            {busy ? 'Reading the plan...' : 'Review the plan'}
          </button>
          {!teacher.name.trim() && <span className="text-sm text-ink-soft">Add the teacher first.</span>}
        </div>
      </section>
    </Shell>
  )
}

// ---- one review, whatever step it is at ----

function ReviewFlow({ id }: { id: string }) {
  const navigate = useNavigate()
  const [r, setR] = useState<PlanReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => getPlanReview(id).then(setR).catch((e: Error) => setError(e.message)), [id])
  useEffect(() => {
    void reload()
  }, [reload])
  const preparing = !!r && ['pending', 'generating'].includes(r.status)
  useEffect(() => {
    if (!preparing) return
    const t = window.setInterval(() => void reload(), 3000)
    return () => window.clearInterval(t)
  }, [preparing, reload])

  if (error && !r) {
    return (
      <Shell back>
        <p className="text-sm text-terracotta-600">{error}</p>
      </Shell>
    )
  }
  if (!r) {
    return (
      <Shell back>
        <p className="text-sm text-ink-soft">Loading...</p>
      </Shell>
    )
  }
  const header = <PageHeader crumb="Lesson Plans" title={r.teacherName} blurb={`${planReviewHeading({ ...r, teacherName: '' })} · ${r.planLabel}`} />

  if (preparing) {
    return (
      <Shell back>
        {header}
        <section className="rounded-2xl border border-hairline bg-white p-6">
          <p className="font-heading text-lg font-bold text-forest">Reviewing the plan...</p>
          <p className="mt-1 text-sm text-ink-soft">
            Wivoza is reading the plan through Domain 1 and your school&rsquo;s lesson plan format. This usually takes under a minute; you can leave this page.
          </p>
        </section>
      </Shell>
    )
  }
  if (r.status === 'failed') {
    return (
      <Shell back>
        {header}
        <section className="rounded-2xl border border-terracotta/30 bg-white p-6">
          <p className="font-heading text-lg font-bold text-forest">The review couldn&rsquo;t be written</p>
          <p className="mt-1 text-sm text-ink-soft">{r.failureReason ?? 'Something went wrong.'} The plan is saved.</p>
          <button type="button" className={`${btnPrimary} mt-4`} onClick={() => regeneratePlanReview(r.id).then(setR).catch((e: Error) => setError(e.message))}>
            Try again
          </button>
        </section>
      </Shell>
    )
  }
  if (r.status === 'sent' || !r.report) {
    return (
      <Shell back>
        {header}
        {r.sentAt && (
          <p className="rounded-xl bg-mint-tint/40 px-4 py-3 text-sm text-forest">
            Sent to {r.teacherName} on {new Date(r.sentAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        )}
        {r.report && <PlanReviewView review={r} report={r.report} />}
      </Shell>
    )
  }
  return (
    <Shell back>
      {header}
      <DraftEditor review={r} onChanged={setR} onDeleted={() => navigate('/admin/lesson-plan-reviews')} />
    </Shell>
  )
}

function DraftEditor({ review, onChanged, onDeleted }: { review: PlanReview; onChanged: (r: PlanReview) => void; onDeleted: () => void }) {
  const report = review.report!
  const [comments, setComments] = useState(report.comments ?? '')
  const [teacher, setTeacher] = useState<TeacherPick>({ id: review.teacherId, name: review.teacherName })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commentsRef = useRef(comments)
  commentsRef.current = comments
  const run = async (fn: () => Promise<PlanReview>) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await fn())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const setLevel = (code: string, level: 1 | 2 | 3 | 4 | null) => {
    onChanged({ ...review, report: { ...report, planning: report.planning?.map((c) => (c.code === code ? { ...c, level } : c)) ?? null } })
    void savePlanReviewReport(review.id, { levels: { [code]: level } }).catch((e: Error) => setError(e.message))
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-xl border border-dashed border-hairline px-4 py-3 text-sm text-ink-soft">
        Draft. Only you can see it until you send it. Wivoza suggested each level from the plan; set your own where you disagree.
      </p>
      {!review.teacherId && (
        <section className="flex flex-col gap-3 rounded-2xl border border-gold/50 bg-gold-tint/30 p-5">
          <p className="text-sm text-ink">
            <b>{review.teacherName}</b> isn&rsquo;t linked to a Wivoza account. Choose them from your school to send the review.
          </p>
          <TeacherBox value={teacher} onChange={setTeacher} />
          <div>
            <button type="button" disabled={busy || !teacher.id} className={btnSecondary} onClick={() => run(() => updatePlanReview(review.id, { teacherId: teacher.id }))}>
              Link teacher
            </button>
          </div>
        </section>
      )}
      <PlanReviewView review={review} report={report} onLevel={setLevel} showComments={false} />
      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-5">
        <h2 className="font-heading text-lg font-bold text-forest">Your comments to {review.teacherName}</h2>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onBlur={() => void savePlanReviewReport(review.id, { comments }).then(onChanged).catch((e: Error) => setError(e.message))}
          rows={5}
          maxLength={3000}
          placeholder="What is working in this plan, the one change that would matter most, and a question for your conversation."
          className={input}
        />
      </section>
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !review.teacherId}
          className={btnPrimary}
          onClick={async () => {
            if (!window.confirm(`Send this review to ${review.teacherName}? It can't be changed after sending.`)) return
            await savePlanReviewReport(review.id, { comments: commentsRef.current }).catch(() => null)
            await run(() => sendPlanReview(review.id))
          }}
        >
          Send to {review.teacherName}
        </button>
        <button
          type="button"
          disabled={busy}
          className={btnSecondary}
          onClick={() => {
            if (window.confirm('Write the review again from the plan? Your levels and comments will be replaced.')) void run(() => regeneratePlanReview(review.id))
          }}
        >
          Write it again
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-terracotta-600 hover:underline"
          onClick={async () => {
            if (!window.confirm('Delete this draft? This can’t be undone.')) return
            await deletePlanReview(review.id).catch(() => null)
            onDeleted()
          }}
        >
          Delete draft
        </button>
      </div>
    </div>
  )
}
