import { useEffect, useState } from 'react'
import { getAdminOverview, type AdminOverview } from '../lib/api'
import { categoryLabel } from '../lib/categories'

function formatShare(share: number | null): string {
  if (share == null) return '—'
  return `${Math.round(share * 100)}%`
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAdminOverview()
      .then(setOverview)
      .catch(() => setError('Could not load the admin overview.'))
  }, [])

  const sortedCategories = overview
    ? Object.entries(overview.categoryTally).sort((a, b) => b[1] - a[1])
    : []
  const maxCount = sortedCategories.length > 0 ? sortedCategories[0][1] : 1

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Admin Overview</h1>
        <p className="text-ink-soft">
          Aggregate, staff-wide trends only — no individual teacher's attempts or ratings are ever shown here.
        </p>
      </div>

      {error && <p className="text-sm text-warm-500">{error}</p>}

      {!overview ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total teachers</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{overview.totalTeachers}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Active this week</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{overview.activeThisWeek}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Staff-wide growth signal
            </p>
            <p className="mt-1 text-sm text-ink">
              {formatShare(overview.growth.recentStrongShare)} of rated practice this week showed strong
              technique, vs. {formatShare(overview.growth.priorStrongShare)} the week before.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Practice by category (all teachers)
            </h2>
            {sortedCategories.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No practice activity yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {sortedCategories.map(([category, count]) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-ink">{categoryLabel(category)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm text-ink-soft">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
