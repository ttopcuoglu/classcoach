import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ObservationReportView, observationHeading } from '../../components/ObservationReportView'
import { ObservationLessonReport } from '../AudioCoaching'
import {
  getReceivedObservation,
  getReceivedObservationLesson,
  getReceivedObservations,
  getReceivedPlanReviews,
  type AudioSessionWithSegments,
  type ReceivedObservation,
} from '../../lib/api'

// The teacher's side of Observations: what a supervisor observed in their
// class and sent them. Read-only; drafts never appear here.

export default function ReceivedObservations() {
  const { id } = useParams()
  return id ? <One id={id} /> : <List />
}

function Header({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
        {title}
        <span className="text-gold">.</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">{blurb}</p>
    </div>
  )
}

type FeedbackRow = { kind: 'observation' | 'plan'; id: string; title: string; by: string; at: string; to: string }

/// Everything a supervisor sent this teacher, newest first: observations and
/// lesson plan reviews ("From my supervisor", 2026-11-24).
function List() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([getReceivedObservations(), getReceivedPlanReviews().catch(() => [])])
      .then(([obs, plans]) =>
        setRows(
          [
            ...obs.map((o) => ({ kind: 'observation' as const, id: o.id, title: o.lessonTitle || 'Observed lesson', by: o.observerName, at: o.sentAt ?? o.observedAt, to: `/observations/${o.id}` })),
            ...plans.map((p) => ({ kind: 'plan' as const, id: p.id, title: p.lessonTitle || 'Lesson plan', by: p.reviewerName, at: p.sentAt ?? p.createdAt, to: `/plan-reviews/${p.id}` })),
          ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
        ),
      )
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Header title="From my supervisor" blurb="Observations of your lessons and reviews of your lesson plans that a supervisor sent you." />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {rows && rows.length === 0 && <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">Nothing has been sent to you yet.</div>}
      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {rows.map((r) => (
            <Link key={`${r.kind}-${r.id}`} to={r.to} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-4 last:border-0 hover:bg-cream/40">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{r.title}</p>
                <p className="text-sm text-ink-soft">
                  {r.kind === 'observation' ? 'Observation' : 'Lesson plan review'} · from {r.by} · {new Date(r.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className="text-sm font-semibold text-forest">Open</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}

function One({ id }: { id: string }) {
  const [o, setO] = useState<ReceivedObservation | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getReceivedObservation(id)
      .then(setO)
      .catch((e: Error) => setError(e.message))
  }, [id])
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Link to="/observations" className="text-sm text-ink-soft hover:text-forest">
        ← From my supervisor
      </Link>
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!o && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {o?.report && (
        <>
          <Header title={o.lessonTitle || 'Observed lesson'} blurb={`Observed by ${o.observerName}. ${observationHeading({ ...o, teacherName: '', lessonTitle: null }).replace(/^ · /, '')}.`} />
          <p className="rounded-xl border border-dashed border-hairline px-4 py-3 text-xs text-ink-soft">
            Each level was set by your observer. The evidence shows where it came from: what they observed, the notes they took, and what Wivoza heard in the
            recording.
          </p>
          <LessonTabs id={o.id} hasLesson={!!o.hasLesson}>
            <ObservationReportView observation={o} report={o.report} />
          </LessonTabs>
        </>
      )}
    </div>
  )
}

/// The observation, with the observed lesson's Summary, Insights and Content
/// Specialist beside it, read-only: the lesson comes back locked, so nothing
/// on those tabs asks the server for anything.
function LessonTabs({ id, hasLesson, children }: { id: string; hasLesson: boolean; children: ReactNode }) {
  const [lesson, setLesson] = useState<AudioSessionWithSegments | null>(null)
  useEffect(() => {
    if (!hasLesson) return
    getReceivedObservationLesson(id)
      .then(setLesson)
      .catch(() => setLesson(null))
  }, [id, hasLesson])
  if (!lesson) return <>{children}</>
  return <ObservationLessonReport session={lesson} onUpdate={() => {}} observationContent={<div className="flex flex-col gap-6">{children}</div>} />
}
