import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { categoryLabel } from '../lib/categories'
import { getSharedAttempt, getSharedDebrief, type SharedAttempt, type SharedDebrief } from '../lib/api'

export default function Shared() {
  const { type, token } = useParams<{ type: string; token: string }>()
  const [content, setContent] = useState<SharedAttempt | SharedDebrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    const fetcher = type === 'debrief' ? getSharedDebrief(token) : getSharedAttempt(token)
    fetcher
      .then(setContent)
      .catch(() => setError('This link is invalid or has expired.'))
      .finally(() => setLoading(false))
  }, [type, token])

  return (
    <div className="min-h-screen bg-canvas px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-ink-soft">ClassCoach</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Shared from a colleague</h1>

        {loading ? (
          <p className="mt-8 text-sm text-ink-soft">Loading...</p>
        ) : error || !content ? (
          <p className="mt-8 text-sm text-warm-500">{error ?? 'Nothing to show.'}</p>
        ) : content.type === 'attempt' ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
              {categoryLabel(content.scenario.category)} · Grades {content.scenario.gradeBand}
            </span>
            <p className="mt-3 text-sm text-ink">{content.scenario.text}</p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Response</p>
            <p className="mt-1 text-sm text-ink">{content.responseText}</p>

            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.modelResponse && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Model response
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.modelResponse}</p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
            {content.category && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {categoryLabel(content.category)}
              </span>
            )}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              What happened
            </p>
            <p className="mt-1 text-sm text-ink">{content.incidentText}</p>

            {content.feedback && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.feedback}</p>
              </>
            )}
            {content.followUp && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Following up
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{content.followUp}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
