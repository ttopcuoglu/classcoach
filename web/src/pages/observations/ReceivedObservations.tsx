import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ObservationReportView, observationHeading } from '../../components/ObservationReportView'
import { ObservationLessonReport } from '../AudioCoaching'
import {
  getReceivedObservation,
  getReceivedObservationLesson,
  getReceivedObservations,
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

function List() {
  const [rows, setRows] = useState<ReceivedObservation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getReceivedObservations()
      .then(setRows)
      .catch((e: Error) => setError(e.message))
  }, [])
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Header title="Observations" blurb="Lessons a supervisor observed and sent you, with what they saw and what Wivoza heard." />
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {rows && rows.length === 0 && <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">No observations have been sent to you yet.</div>}
      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {rows.map((o) => (
            <Link key={o.id} to={`/observations/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/70 px-5 py-4 last:border-0 hover:bg-cream/40">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{o.lessonTitle || 'Observed lesson'}</p>
                <p className="text-sm text-ink-soft">
                  Observed by {o.observerName} · {new Date(o.observedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
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
        ← All observations
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
