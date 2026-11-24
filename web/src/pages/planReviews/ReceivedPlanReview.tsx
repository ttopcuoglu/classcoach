import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PlanReviewView } from '../../components/PlanReviewView'
import { getReceivedPlanReview, type ReceivedPlanReview as Received } from '../../lib/api'

// The teacher's copy of a lesson plan review a supervisor sent, read-only.
// Listed with observations under "From my supervisor" (/observations).

export default function ReceivedPlanReview() {
  const { id } = useParams()
  const [r, setR] = useState<Received | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    getReceivedPlanReview(id)
      .then(setR)
      .catch((e: Error) => setError(e.message))
  }, [id])
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Link to="/observations" className="text-sm text-ink-soft hover:text-forest">
        ← From my supervisor
      </Link>
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!r && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {r?.report && (
        <>
          <div>
            <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
              {r.lessonTitle || 'Lesson plan review'}
              <span className="text-gold">.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">Reviewed by {r.reviewerName}. Each Domain 1 level was set by your reviewer and cites your plan&rsquo;s own words.</p>
          </div>
          <PlanReviewView review={r} report={r.report} />
        </>
      )}
    </div>
  )
}
