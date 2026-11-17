import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RubricComponentAbout, RubricLevelBadge } from '../components/RubricLevel'
import {
  getSharedSelfEval,
  getSharedSelfEvals,
  type AudioRubricLens,
  type SharedSelfEvalSummary,
} from '../lib/api'

// Self-Evals teachers chose to share with this person as their supervisor.
// Read-only, and only the Self-Eval: the server never sends the recording,
// transcript or the rest of the report (routes/selfEvalShares.ts). A teacher
// can stop sharing at any time, and then it is gone from here.

function lessonLabel(s: SharedSelfEvalSummary): string {
  const parts = [s.classSubject, s.period ? `Period ${s.period}` : null, s.gradeLevel].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Lesson'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SharedSelfEvals() {
  const { sessionId } = useParams()
  return sessionId ? <SharedSelfEvalDetail sessionId={sessionId} /> : <SharedSelfEvalList />
}

function PageHeader({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Shared with you</p>
      <h1 className="mt-1 font-heading text-3xl font-bold text-forest">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">{blurb}</p>
    </div>
  )
}

function SharedSelfEvalList() {
  const [items, setItems] = useState<SharedSelfEvalSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSharedSelfEvals()
      .then(setItems)
      .catch((err: Error) => setError(err.message || 'Could not load shared Self-Evals.'))
  }, [])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <PageHeader
        title="Shared Self-Evals"
        blurb="Danielson Self-Evals your teachers chose to share with you. Each one is the teacher's own estimate from one lesson recording, with any notes they added. A teacher can stop sharing at any time."
      />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {items === null && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {items?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">
          Nothing has been shared with you yet. When a teacher you supervise shares a Self-Eval, it appears here.
        </div>
      )}
      {items && items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Link
              key={item.sessionId}
              to={`/shared-self-evals/${item.sessionId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-cream-card p-5 transition-colors hover:border-forest"
            >
              <div className="min-w-0">
                <p className="font-heading text-base font-bold text-forest">{item.teacherName}</p>
                <p className="text-sm text-ink">
                  {lessonLabel(item)} · {formatDate(item.sessionDate)}
                </p>
              </div>
              <p className="text-xs text-ink-soft">Shared {formatDate(item.sharedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SharedSelfEvalDetail({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<(SharedSelfEvalSummary & { selfEval: AudioRubricLens }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSharedSelfEval(sessionId)
      .then(setData)
      .catch((err: Error) => setError(err.message || 'This Self-Eval is not shared with you.'))
  }, [sessionId])

  const back = (
    <Link to="/shared-self-evals" className="text-sm text-ink-soft hover:text-forest">
      ← All shared Self-Evals
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

  const lens = data.selfEval
  const domains = [...new Set(lens.components.map((c) => c.domain))]

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      {back}
      <PageHeader
        title={data.teacherName}
        blurb={`${lessonLabel(data)} · ${formatDate(data.sessionDate)}. Shared ${formatDate(data.sharedAt)}.`}
      />
      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        {lens.frameworkName}, Domains 2 and 3. Each level is an estimate from one lesson's audio. It can't see the room
        or student work, and "not enough evidence" only means audio couldn't show it, not that it didn't happen. Any
        note the teacher added is shown with the level.
      </div>

      {domains.map((domain) => (
        <section key={domain} className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold text-forest">{domain}</h2>
          {lens.components
            .filter((c) => c.domain === domain)
            .map((c) => (
              <div key={c.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                  <p className="font-heading text-base font-bold text-forest">{c.name}</p>
                </div>
                <RubricComponentAbout code={c.code} />
                <RubricLevelBadge level={c.level ?? null} />
                <p className="mt-3 text-sm text-ink">{c.summary}</p>
                {c.evidence.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {c.evidence.map((e, i) => (
                      <div key={i} className="border-l-2 border-gold/60 pl-3">
                        <p className="text-sm text-ink">"{e.text}"</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {formatTime(e.timestampSec)} · {e.kind}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {c.nextStep && (
                  <div className="mt-4 rounded-xl bg-gold-tint/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Next step</p>
                    <p className="mt-1 text-sm text-ink">{c.nextStep}</p>
                  </div>
                )}
                {c.teacherNote && (
                  <div className="mt-4 rounded-xl border border-hairline bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Teacher's note</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink">{c.teacherNote}</p>
                  </div>
                )}
              </div>
            ))}
          {lens.notObservable
            .filter((c) => c.domain === domain)
            .map((c) => (
              <p key={c.code} className="rounded-2xl border border-dashed border-hairline p-4 text-sm text-ink-soft">
                <span className="font-semibold">
                  {c.code} {c.name}:
                </span>{' '}
                not in a recording. {c.reason}
              </p>
            ))}
        </section>
      ))}
    </div>
  )
}
