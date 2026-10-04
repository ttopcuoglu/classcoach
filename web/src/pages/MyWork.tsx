import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getWork, type WorkFeed } from '../lib/api'
import { WORK_SURFACE_LABELS, WORK_SURFACES } from '../lib/workSurface'

// One history, across all four surfaces.
//
// Replaces nine per-tool lists. The duplication was the smaller problem: the
// real one was that a teacher who remembered writing something but not which
// tool they wrote it in had to go looking tool by tool, and what they wanted
// was usually in the one they checked last.
//
// Everything here is derived, not migrated. A conversation from before any of
// this existed appears under Talk It Through because `workSurface.ts` says it
// belongs there, and tapping it opens the page it was always on.

export default function MyWork() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const surface = searchParams.get('surface')
  const topic = searchParams.get('topic')
  const savedOnly = searchParams.get('saved') === 'true'

  const [feed, setFeed] = useState<WorkFeed | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFeed(null)
    getWork({ surface, topic, saved: savedOnly })
      .then(setFeed)
      .catch((err) => setError((err as Error).message))
  }, [surface, topic, savedOnly])

  /// Filters live in the URL so a teacher can get back to a filtered view,
  /// and so the back button undoes a filter rather than leaving the page.
  function setFilter(key: 'surface' | 'topic' | 'saved', value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          My Work<span className="text-terracotta">.</span>
        </h1>
        <p className="text-ink-soft">Everything you have made, newest first.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('surface', null)}
            aria-pressed={!surface}
            className={chip(!surface)}
          >
            All{feed ? ` · ${feed.total}` : ''}
          </button>
          {WORK_SURFACES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter('surface', surface === key ? null : key)}
              aria-pressed={surface === key}
              className={chip(surface === key)}
            >
              {WORK_SURFACE_LABELS[key]}
              {/* The count is shown even at zero — a chip reading "0" is how a
                  teacher learns the filter is why the list looks empty. */}
              {feed ? ` · ${feed.bySurface[key] ?? 0}` : ''}
            </button>
          ))}
        </div>

        {/* Topic chips are built from what the teacher actually has, not from
            the taxonomy — offering all seven when five are empty would be a
            row of dead ends. */}
        {feed != null && feed.byTopic.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feed.byTopic.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter('topic', topic === value ? null : value)}
                aria-pressed={topic === value}
                className={chip(topic === value)}
              >
                {label} · {count}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setFilter('saved', savedOnly ? null : 'true')}
          aria-pressed={savedOnly}
          className={`w-fit ${chip(savedOnly)}`}
        >
          {savedOnly ? 'Showing saved only' : 'Saved only'}
        </button>
      </div>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      {feed == null ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : feed.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-center">
          <p className="text-sm text-ink-soft">
            {surface || topic || savedOnly
              ? 'Nothing here with those filters.'
              : "Nothing yet. Anything you make shows up here — conversations, practice, reviews and recordings."}
          </p>
          {(surface || topic || savedOnly) && (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
              className="mt-2 text-sm font-semibold text-terracotta-600 hover:text-terracotta"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {feed.items.map((item) => (
            <button
              key={`${item.surface}-${item.id}`}
              type="button"
              onClick={() => navigate(item.href)}
              className="flex items-start gap-3 rounded-2xl border border-hairline bg-cream-card p-4 text-left transition-colors hover:border-terracotta/40"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-terracotta-600">
                    {item.kind}
                  </span>
                  {item.topicLabel && (
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                      {item.topicLabel}
                    </span>
                  )}
                  <span className="text-[11px] text-ink-soft">
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <span className="mt-1 block line-clamp-2 text-sm text-ink">{item.title}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-sm font-semibold text-forest">
                Open →
              </span>
            </button>
          ))}
        </div>
      )}

      <Link to="/" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Back home
      </Link>
    </div>
  )
}

function chip(selected: boolean) {
  return `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
    selected ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft hover:text-ink'
  }`
}
