import { useEffect, useState } from 'react'
import { getLinkableReviews, linkRecordingToReview, type LinkableReview } from '../lib/api'
import { DOC_TYPE_LABELS, isDocType } from '../lib/reviewLenses'

// Linking a recording to the plan it was taught from.
//
// Opt-in rather than inferred. Guessing which of a teacher's reviewed plans a
// Tuesday recording belongs to would be wrong often enough to be worse than
// asking — and a wrong pairing does not produce a missing comparison, it
// produces a confident, false one ("you planned 12 minutes" about a plan for
// a different lesson).
//
// Renders nothing at all when the teacher has no reviewed plans. A control
// explaining a feature they cannot use yet is worse than its absence.

export default function LinkReviewedPlan({
  sessionId,
  reviewId,
  onLinked,
}: {
  sessionId: string
  reviewId: string | null | undefined
  /// Fires after a successful link or unlink, so the report can re-read
  /// itself and pick up the comparison.
  onLinked: () => void
}) {
  const [reviews, setReviews] = useState<LinkableReview[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getLinkableReviews(sessionId)
      .then(setReviews)
      // A failed load means no picker, not an error on a report the teacher
      // came here to read.
      .catch(() => setReviews([]))
  }, [sessionId])

  async function link(next: string | null) {
    setBusy(true)
    setError(null)
    try {
      await linkRecordingToReview(sessionId, next)
      setOpen(false)
      onLinked()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (reviews == null || reviews.length === 0) return null

  const linked = reviewId ? reviews.find((r) => r.id === reviewId) : null

  function describe(review: LinkableReview) {
    const type = isDocType(review.docType) ? DOC_TYPE_LABELS[review.docType] : review.docType
    const when = new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${review.fileName ?? type} · ${when}`
  }

  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {linked ? 'Taught from a plan you had me read' : 'Was this lesson from a plan I read?'}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {linked
              ? describe(linked)
              : 'Link it and the report can compare what the plan allocated against what I heard.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold text-terracotta-600 hover:text-terracotta disabled:opacity-60"
        >
          {open ? 'Cancel' : linked ? 'Change' : 'Link a plan'}
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-1.5">
          {reviews.map((review) => (
            <button
              key={review.id}
              type="button"
              disabled={busy || !review.comparable}
              onClick={() => void link(review.id)}
              aria-pressed={review.id === reviewId}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                review.id === reviewId ? 'bg-mint-tint/60 font-semibold text-forest' : 'bg-cream text-ink hover:bg-cream/60'
              }`}
            >
              <span>{describe(review)}</span>
              {/* A review with no timing estimate cannot ground a comparison,
                  so it says so rather than being offered as though it would. */}
              {!review.comparable && <span className="text-xs text-ink-soft">no timing to compare</span>}
            </button>
          ))}
          {linked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void link(null)}
              className="self-start px-1 pt-1 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-60"
            >
              Unlink
            </button>
          )}
          {error && <p className="text-xs text-terracotta-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
