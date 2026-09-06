import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { assignmentTypeLabel } from '../lib/assignmentTypes'
import { getAssignmentCoachSession, type AssignmentCoachSession } from '../lib/api'

export default function AssignmentCoachExport() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<AssignmentCoachSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getAssignmentCoachSession(id)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="min-h-screen bg-cream px-6 py-8 text-ink">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/assignment-coach" className="text-sm font-medium text-ink-soft hover:text-forest">
            ← Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Print / Save as PDF
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : !session ? (
          <p className="mt-8 text-sm text-ink-soft">Assignment not found.</p>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-bold text-forest">
              {session.title || assignmentTypeLabel(session.assignmentType)}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {assignmentTypeLabel(session.assignmentType)}
              {session.gradeLevel ? ` · ${session.gradeLevel}` : ''}
              {session.subject ? ` · ${session.subject}` : ''}
              {session.estimatedTime ? ` · ${session.estimatedTime}` : ''}
            </p>

            {session.liveAssignmentText && (
              <section className="mt-6 break-inside-avoid rounded-xl border border-hairline p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Assignment</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.liveAssignmentText}</p>
              </section>
            )}

            {session.reviewSummary && (
              <section className="mt-4 break-inside-avoid rounded-xl border border-hairline p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coaching review</p>
                {session.reviewSummary.working && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">What's working:</span> {session.reviewSummary.working}
                  </p>
                )}
                {session.reviewSummary.misunderstand && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Students may misunderstand:</span>{' '}
                    {session.reviewSummary.misunderstand}
                  </p>
                )}
                {session.reviewSummary.opportunity && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Most important opportunity:</span>{' '}
                    {session.reviewSummary.opportunity}
                  </p>
                )}
              </section>
            )}

            {session.aiResistant?.guidelines && (
              <section className="mt-4 break-inside-avoid rounded-xl border border-hairline p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Student AI guidelines</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.aiResistant.guidelines}</p>
              </section>
            )}

            {!session.liveAssignmentText && (
              <p className="mt-6 text-sm text-ink-soft">This assignment doesn't have any text yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
