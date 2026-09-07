import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AssignmentContent } from '../components/AssignmentDiagram'
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
                <div className="mt-1">
                  <AssignmentContent text={session.liveAssignmentText} />
                </div>
              </section>
            )}

            {session.reviewSnapshot ? (
              <section className="mt-4 break-inside-avoid rounded-xl border border-hairline p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Assignment Review Snapshot</p>
                {session.reviewSnapshot.purpose && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Purpose:</span> {session.reviewSnapshot.purpose}
                  </p>
                )}
                {session.reviewSnapshot.gradeFit.explanation && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Grade-level fit:</span> {session.reviewSnapshot.gradeFit.explanation}
                  </p>
                )}
                {session.reviewSnapshot.rigor.explanation && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Thinking & rigor{session.reviewSnapshot.rigor.label ? ` (${session.reviewSnapshot.rigor.label})` : ''}:</span>{' '}
                    {session.reviewSnapshot.rigor.explanation}
                  </p>
                )}
                {session.reviewSnapshot.meaningfulWork.explanation && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Meaningful work:</span> {session.reviewSnapshot.meaningfulWork.explanation}
                  </p>
                )}
                {session.reviewSnapshot.aiRisk.explanation && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">AI completion risk{session.reviewSnapshot.aiRisk.rating ? ` (${session.reviewSnapshot.aiRisk.rating})` : ''}:</span>{' '}
                    {session.reviewSnapshot.aiRisk.explanation}
                  </p>
                )}
                {session.reviewSnapshot.workloadSummary && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Workload &amp; clarity:</span> {session.reviewSnapshot.workloadSummary}
                  </p>
                )}
                {session.reviewSnapshot.mainOpportunity.description && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">
                      Main opportunity{session.reviewSnapshot.mainOpportunity.title ? ` — ${session.reviewSnapshot.mainOpportunity.title}` : ''}:
                    </span>{' '}
                    {session.reviewSnapshot.mainOpportunity.description}
                  </p>
                )}
              </section>
            ) : (
              session.reviewSummary && (
                <section className="mt-4 break-inside-avoid rounded-xl border border-hairline p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Coaching review</p>
                  {session.reviewSummary.working && (
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-semibold">Working:</span> {session.reviewSummary.working}
                    </p>
                  )}
                  {session.reviewSummary.needsAttention && (
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-semibold">Needs attention:</span> {session.reviewSummary.needsAttention}
                    </p>
                  )}
                  {session.reviewSummary.suggestions && (
                    <p className="mt-2 text-sm text-ink">
                      <span className="font-semibold">Suggestions:</span> {session.reviewSummary.suggestions}
                    </p>
                  )}
                </section>
              )
            )}

            {session.aiResistant?.guidelines && (
              <section className="mt-4 break-inside-avoid rounded-xl border border-hairline p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Student AI guidelines</p>
                {session.aiResistant.recommendedAiUse && (
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-semibold">Wivoza-recommended AI use:</span> {session.aiResistant.recommendedAiUse.note}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{session.aiResistant.guidelines}</p>
                {session.aiResistant.strategies && (
                  <p className="mt-2 text-sm text-ink">
                    <span className="font-semibold">Strategies:</span> {session.aiResistant.strategies}
                  </p>
                )}
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
