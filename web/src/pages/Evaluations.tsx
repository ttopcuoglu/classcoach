import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { SelfEvalReportView } from '../components/SelfEvalReportView'
import { getSharedSelfEval, saveSelfEvalFeedback, type SharedSelfEvalDetail, type UserProfile } from '../lib/api'
import { formatDate, lessonMeta } from './evaluations/common'
import { EvaluationsHome } from './evaluations/Workspace'

// The supervisor's side of Self Evaluation sharing, in the School Workspace:
// the workspace (Overview, My Teachers, Reports; pages/evaluations/) and one
// shared evaluation with the supervisor's feedback. Read-only apart from that
// feedback. The server never sends the recording, transcript or the rest of
// a report (routes/selfEvalShares.ts), and a teacher can stop sharing at any time.

function Header({ school, title, blurb }: { school: string | null; title: string; blurb: string }) {
  return (
    <div>
      {school && <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta-600">{school}</p>}
      <h1 className="mt-2 font-heading text-3xl font-extrabold text-forest md:text-4xl">
        {title}
        <span className="text-gold">.</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">{blurb}</p>
    </div>
  )
}

export default function Evaluations({ user }: { user: UserProfile | null }) {
  const { sessionId } = useParams()
  const school = user?.organization?.name ?? null
  return sessionId ? <EvaluationDetail sessionId={sessionId} school={school} /> : <EvaluationsHome />
}

function EvaluationDetail({ sessionId, school }: { sessionId: string; school: string | null }) {
  const [data, setData] = useState<SharedSelfEvalDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSharedSelfEval(sessionId)
      .then(setData)
      .catch((err: Error) => setError(err.message || 'This Self Evaluation is not shared with you.'))
  }, [sessionId])

  // A report cell links to #component-3b: open the evaluation at that component.
  const { hash } = useLocation()
  useEffect(() => {
    if (data && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [data, hash])

  const back = (
    <Link to="/admin/evaluations" className="text-sm text-ink-soft hover:text-forest">
      ← Self Evaluations
    </Link>
  )

  if (error) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8 sm:px-8">
        {back}
        <p className="text-sm text-terracotta-600">{error}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <p className="text-sm text-ink-soft">Loading...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      {back}
      <Header
        school={school}
        title={data.lessonTitle}
        blurb={`${lessonMeta(data)} · ${formatDate(data.sessionDate, true)}. Shared ${formatDate(data.sharedAt, true)}.`}
      />
      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        {data.report.frameworkName}. The report as the teacher previewed and sent it. Levels for Domains 2 and 3 are estimates from one
        lesson&rsquo;s audio, which can&rsquo;t see the room or student work; &ldquo;not enough evidence&rdquo; only means audio couldn&rsquo;t
        show it, not that it didn&rsquo;t happen.{data.report.planning ? ' Domain 1 levels are suggested from the lesson plan as written.' : ''} The
        teacher&rsquo;s notes are shown with the levels.
      </div>

      {data.report.feedbackRequest && (
        <section className="rounded-2xl border border-gold/50 bg-gold-tint/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">{data.teacherName} would like feedback on</p>
          <p className="mt-1.5 whitespace-pre-line text-base text-ink">{data.report.feedbackRequest}</p>
        </section>
      )}

      <FeedbackCard data={data} onSaved={(feedback, feedbackAt) => setData({ ...data, feedback, feedbackAt, status: feedback ? 'replied' : 'awaiting' })} />

      <SelfEvalReportView report={data.report} />
    </div>
  )
}

// The supervisor's written feedback, which the teacher sees on their own
// Self Evaluation tab. One per lesson; editing replaces it, clearing removes it.
function FeedbackCard({
  data,
  onSaved,
}: {
  data: SharedSelfEvalDetail
  onSaved: (feedback: string | null, feedbackAt: string | null) => void
}) {
  const [editing, setEditing] = useState(!data.feedback)
  const [draft, setDraft] = useState(data.feedback ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(text: string) {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveSelfEvalFeedback(data.sessionId, text)
      onSaved(saved.feedback, saved.feedbackAt)
      setDraft(saved.feedback ?? '')
      setEditing(!saved.feedback)
    } catch (err) {
      setError((err as Error).message || 'Could not save your feedback.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold text-forest">Your feedback to {data.teacherName}</h2>

      </div>
      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What stood out, a question for your next conversation, or one thing to try. The teacher sees this on their Self Evaluation."
            className="w-full rounded-xl border border-hairline bg-cream/40 p-3 text-sm text-ink focus:border-forest focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(draft)}
              disabled={saving || !draft.trim()}
              className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
            >
              {saving ? 'Sending...' : data.feedback ? 'Update feedback' : 'Send feedback'}
            </button>
            {data.feedback && (
              <button
                type="button"
                onClick={() => {
                  setDraft(data.feedback ?? '')
                  setEditing(false)
                }}
                disabled={saving}
                className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft hover:text-forest"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="whitespace-pre-line text-sm text-ink">{data.feedback}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {data.feedbackAt && <span className="text-ink-soft">Sent {formatDate(data.feedbackAt, true)}</span>}
            <button type="button" onClick={() => setEditing(true)} className="font-semibold text-forest hover:underline">
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Remove your feedback? The teacher will no longer see it.')) void save('')
              }}
              disabled={saving}
              className="font-semibold text-terracotta-600 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
    </section>
  )
}
