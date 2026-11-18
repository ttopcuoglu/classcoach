import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SelfEvalReportView } from '../components/SelfEvalReportView'
import {
  getSelfEvalReport,
  getSharedSelfEval,
  getSharedSelfEvals,
  getSupervisedTeachers,
  RUBRIC_LEVEL_NAMES,
  saveSelfEvalFeedback,
  type SelfEvalReport,
  type SharedSelfEvalDetail,
  type SharedSelfEvalSummary,
  type SupervisedTeacher,
  type UserProfile,
} from '../lib/api'

// The supervisor's side of Self Evaluation sharing, in the School Workspace:
// Self Evaluations their teachers chose to share (Inbox), everyone they supervise
// (My Teachers), and counts over what was shared (Reports). Read-only apart
// from the supervisor's own feedback to the teacher. The server never sends
// the recording, transcript or the rest of a report (routes/selfEvalShares.ts),
// and a teacher can stop sharing at any time.

type View = 'inbox' | 'teachers' | 'reports'

const VIEWS: { key: View; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'teachers', label: 'My Teachers' },
  { key: 'reports', label: 'Reports' },
]

// The lesson-date window every view shares, kept in the address (?term=, and
// ?from=&to= for custom dates). A school year runs August to July; Semester 1
// is August–January and Semester 2 February–July of the current year.
type Term = 'all' | 'year' | 's1' | 's2' | 'custom'
type DateRange = { from: Date | null; to: Date | null }

function schoolYearStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

function termOptions(now = new Date()): { key: Term; label: string }[] {
  const y = schoolYearStart(now)
  const span = `${y}–${String(y + 1).slice(2)}`
  return [
    { key: 'all', label: 'All time' },
    { key: 'year', label: `This school year (${span})` },
    { key: 's1', label: `Semester 1, ${span} (Aug–Jan)` },
    { key: 's2', label: `Semester 2, ${span} (Feb–Jul)` },
    { key: 'custom', label: 'Custom dates' },
  ]
}

function dayStart(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayEnd(ymd: string | null): Date | null {
  const d = dayStart(ymd)
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) : null
}

function rangeFor(term: Term, from: string | null, to: string | null, now = new Date()): DateRange {
  const y = schoolYearStart(now)
  const end = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999)
  switch (term) {
    case 'year':
      return { from: new Date(y, 7, 1), to: end(y + 1, 6) }
    case 's1':
      return { from: new Date(y, 7, 1), to: end(y + 1, 0) }
    case 's2':
      return { from: new Date(y + 1, 1, 1), to: end(y + 1, 6) }
    case 'custom':
      return { from: dayStart(from), to: dayEnd(to) }
    default:
      return { from: null, to: null }
  }
}

function inRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime()
  return (!range.from || t >= range.from.getTime()) && (!range.to || t <= range.to.getTime())
}

const PRIVACY_LINE = 'Teachers choose which Self Evaluations to share. The rest of their coaching stays private.'

function formatDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
}

function lessonMeta(s: SharedSelfEvalSummary, withTeacher = true): string {
  return [withTeacher ? s.teacherName : null, s.classSubject, s.gradeLevel ? `Grade ${s.gradeLevel.replace(/(st|nd|rd|th)$/i, '')}` : null]
    .filter(Boolean)
    .join(' · ')
}

function teacherMeta(t: SupervisedTeacher): string {
  return [t.subjects.join(', '), t.gradeLevels.length ? `Grade ${t.gradeLevels.map((g) => g.replace(/(st|nd|rd|th)$/i, '')).join(', ')}` : '']
    .filter(Boolean)
    .join(' · ')
}

function StatusChip({ status }: { status: SharedSelfEvalSummary['status'] }) {
  return status === 'awaiting' ? (
    <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-terracotta-600">Awaiting feedback</span>
  ) : (
    <span className="rounded-full bg-mint-tint/70 px-3 py-1 text-xs font-semibold text-forest">Replied</span>
  )
}

function OpenReport({ sessionId }: { sessionId: string }) {
  return (
    <Link
      to={`/admin/evaluations/${sessionId}`}
      className="shrink-0 rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-forest transition-colors hover:border-forest"
    >
      Open report
    </Link>
  )
}

function Header({ school, title, blurb }: { school: string | null; title: string; blurb: string }) {
  return (
    <div>
      {school && <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta-600">{school}</p>}
      <h1 className="mt-2 font-heading text-3xl font-extrabold text-forest md:text-4xl">
        {title}
        <span className="text-gold">.</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">{blurb}</p>
    </div>
  )
}

export default function Evaluations({ user }: { user: UserProfile | null }) {
  const { sessionId } = useParams()
  const school = user?.organization?.name ?? null
  return sessionId ? <EvaluationDetail sessionId={sessionId} school={school} /> : <EvaluationsHome school={school} />
}

function EvaluationsHome({ school }: { school: string | null }) {
  const [params, setParams] = useSearchParams()
  const view: View = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'inbox') as View
  const terms = termOptions()
  const term: Term = terms.find((t) => t.key === params.get('term'))?.key ?? 'all'
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const range = useMemo(() => rangeFor(term, fromParam, toParam), [term, fromParam, toParam])
  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const [inbox, setInbox] = useState<SharedSelfEvalSummary[] | null>(null)
  const [teachers, setTeachers] = useState<SupervisedTeacher[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getSharedSelfEvals(), getSupervisedTeachers()])
      .then(([shares, mine]) => {
        setInbox(shares)
        setTeachers(mine)
      })
      .catch((err: Error) => setError(err.message || 'Could not load evaluations.'))
  }, [])

  const awaiting = inbox?.filter((s) => s.status === 'awaiting').length ?? 0

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Header school={school} title="Evaluations" blurb="Review the Danielson Self Evaluations your teachers share with you, and write feedback back to them." />

      {inbox && teachers && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-2xl bg-mint-tint/50 px-5 py-4 text-base text-ink">
          <span>
            <b className="font-bold">{awaiting}</b> awaiting feedback
          </span>
          <span>
            <b className="font-bold">{teachers.length}</b> assigned {teachers.length === 1 ? 'teacher' : 'teachers'}
          </span>
        </div>
      )}

      <div role="tablist" aria-label="Evaluations" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => {
              const next = new URLSearchParams(params)
              if (v.key === 'inbox') next.delete('view')
              else next.set('view', v.key)
              setParams(next, { replace: true })
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              view === v.key ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:border-forest'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-ink-soft">
        <label className="flex flex-wrap items-center gap-3">
          Lessons taught
          <select
            value={term}
            onChange={(e) => setParam({ term: e.target.value === 'all' ? null : e.target.value })}
            className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
          >
            {terms.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {term === 'custom' && (
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="From"
              value={fromParam ?? ''}
              onChange={(e) => setParam({ from: e.target.value || null })}
              className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
            />
            to
            <input
              type="date"
              aria-label="To"
              value={toParam ?? ''}
              onChange={(e) => setParam({ to: e.target.value || null })}
              className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
            />
          </span>
        )}
      </div>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!error && (!inbox || !teachers) && <p className="text-sm text-ink-soft">Loading...</p>}

      {inbox && teachers && view === 'inbox' && <InboxView inbox={inbox.filter((s) => inRange(s.sessionDate, range))} filtered={term !== 'all'} />}
      {inbox && teachers && view === 'teachers' && (
        <TeachersView teachers={teachers.map((t) => ({ ...t, shares: t.shares.filter((s) => inRange(s.sessionDate, range)) }))} filtered={term !== 'all'} />
      )}
      {inbox && teachers && view === 'reports' && <ReportsView teachers={teachers} range={range} />}

      <p className="text-xs text-ink-soft">{PRIVACY_LINE}</p>
    </div>
  )
}

function InboxView({ inbox, filtered }: { inbox: SharedSelfEvalSummary[]; filtered: boolean }) {
  if (inbox.length === 0 && filtered) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">
        No shared lessons were taught in these dates. Choose &ldquo;All time&rdquo; to see everything shared with you.
      </div>
    )
  }
  if (inbox.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">
        Nothing has been shared with you yet. When a teacher you supervise shares a lesson&rsquo;s Self Evaluation, it appears here.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
      {inbox.map((s) => (
        <div key={s.sessionId} className="flex flex-wrap items-center gap-4 border-b border-hairline/70 px-5 py-4 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-bold text-forest">{s.lessonTitle}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{lessonMeta(s)}</p>
          </div>
          <div className="flex flex-col items-start gap-1">
            <StatusChip status={s.status} />
            <span className="text-xs text-ink-soft">Shared {formatDate(s.sharedAt)}</span>
          </div>
          <OpenReport sessionId={s.sessionId} />
        </div>
      ))}
    </div>
  )
}

function TeachersView({ teachers, filtered }: { teachers: SupervisedTeacher[]; filtered: boolean }) {
  if (teachers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">
        No teachers are assigned to you yet. Your school admin assigns supervisors in Supervisor Assignments.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
      {teachers.map((t) => (
        <div key={t.teacherId} className="border-b border-hairline/70 px-5 py-4 last:border-0">
          <p className="font-heading text-base font-bold text-forest">{t.teacherName}</p>
          {teacherMeta(t) && <p className="text-sm text-ink-soft">{teacherMeta(t)}</p>}
          {t.shares.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">{filtered ? 'Nothing shared from these dates.' : 'Nothing shared yet.'}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {t.shares.map((s) => (
                <div key={s.sessionId} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{s.lessonTitle}</p>
                    <p className="text-xs text-ink-soft">
                      Shared {formatDate(s.sharedAt)}
                      {s.status === 'replied' ? ' · Replied' : ' · Awaiting feedback'}
                    </p>
                  </div>
                  <OpenReport sessionId={s.sessionId} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const LEVEL_CHIP: Record<'1' | '2' | '3' | '4', string> = {
  '1': 'bg-terracotta/15 text-terracotta-600',
  '2': 'bg-gold-tint text-terracotta-600',
  '3': 'bg-mint-tint/70 text-forest',
  '4': 'bg-forest text-cream',
}

const LEVEL_CELL: Record<number, string> = {
  1: 'bg-terracotta/15 text-terracotta-600',
  2: 'bg-gold-tint text-terracotta-600',
  3: 'bg-mint-tint/70 text-forest',
  4: 'bg-forest text-cream',
}

function ReportsView({ teachers, range }: { teachers: SupervisedTeacher[]; range: DateRange }) {
  const [teacherId, setTeacherId] = useState('')
  const [report, setReport] = useState<SelfEvalReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReport(null)
    setError(null)
    getSelfEvalReport(teacherId || undefined, range)
      .then(setReport)
      .catch((err: Error) => setError(err.message || 'Could not load the report.'))
  }, [teacherId, range])

  const single = teacherId !== ''
  const domains = report ? [...new Set(report.components.map((c) => c.domain))] : []

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-ink-soft">
        Report for
        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink focus:border-forest focus:outline-none"
        >
          <option value="">All my teachers</option>
          {teachers.map((t) => (
            <option key={t.teacherId} value={t.teacherId}>
              {t.teacherName}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!report && !error && <p className="text-sm text-ink-soft">Loading...</p>}

      {report && (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
          <section className="border-b border-hairline/70 px-5 py-5">
            <h2 className="font-heading text-lg font-bold text-forest">Review activity</h2>
            <p className="mt-1 text-sm text-ink">
              {report.activity.shared} shared · {report.activity.awaiting} awaiting feedback · {report.activity.replied} replied
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Teachers choose which lessons to share, so this describes the lessons they picked, not every class they taught.
            </p>
          </section>

          {single ? (
            report.lessons.length > 0 && <GrowthView report={report} />
          ) : (
            report.lessons.length > 0 && (
              <section className="border-b border-hairline/70 px-5 py-4 text-sm text-ink-soft">
                Pick a teacher above to see how each component changed across their lessons.
              </section>
            )
          )}

          <section className="px-5 py-5">
            <h2 className="font-heading text-lg font-bold text-forest">Danielson levels by component</h2>
            <p className="mt-1 text-xs text-ink-soft">
              How many shared lessons placed each component at each level. Each level is an estimate from one lesson&rsquo;s
              audio; &ldquo;not enough evidence&rdquo; means the recording couldn&rsquo;t show it, not that it didn&rsquo;t happen.
            </p>
            {report.components.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                {range.from || range.to
                  ? `No shared Self Evaluations ${single ? 'from this teacher ' : ''}for lessons taught in these dates.`
                  : `No shared Self Evaluations ${single ? 'from this teacher ' : ''}yet.`}
              </p>
            ) : (
              domains.map((domain) => (
                <div key={domain} className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{domain}</p>
                  <div className="mt-2 flex flex-col">
                    {report.components
                      .filter((c) => c.domain === domain)
                      .map((c) => (
                        <div key={c.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/50 py-2.5 last:border-0">
                          <p className="text-sm text-ink">
                            <span className="font-semibold">{c.code}</span> · {c.name}
                            {c.notes > 0 && <span className="ml-2 text-xs text-ink-soft">({c.notes} with a teacher note)</span>}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(['4', '3', '2', '1'] as const)
                              .filter((l) => c.levels[l] > 0)
                              .map((l) => (
                                <span key={l} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_CHIP[l]}`}>
                                  {c.levels[l]} at Level {l} · {RUBRIC_LEVEL_NAMES[Number(l) as 1 | 2 | 3 | 4]}
                                </span>
                              ))}
                            {c.notEnough > 0 && (
                              <span className="rounded-full border border-dashed border-hairline px-2.5 py-1 text-xs font-semibold text-ink-soft">
                                {c.notEnough} not enough evidence
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))
            )}
          </section>

          {single && report.lessons.length > 0 && (
            <details className="border-t border-hairline/70 px-5 py-5">
              <summary className="cursor-pointer font-heading text-lg font-bold text-forest">Lesson-by-lesson table</summary>
              <p className="mt-1 text-xs text-ink-soft">Each shared lesson&rsquo;s level per component, oldest first. A dash is not enough evidence.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 pr-3 text-left text-xs font-semibold text-ink-soft">Component</th>
                      {report.lessons.map((l) => (
                        <th key={l.sessionId} className="px-1 py-2 text-center text-xs font-semibold text-ink-soft" title={l.lessonTitle}>
                          <Link to={`/admin/evaluations/${l.sessionId}`} className="hover:text-forest">
                            {formatDate(l.sessionDate)}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.components.map((c) => (
                      <tr key={c.code} className="border-t border-hairline/50">
                        <td className="py-2 pr-3 text-ink">
                          <span className="font-semibold">{c.code}</span> <span className="text-ink-soft">{c.name}</span>
                        </td>
                        {report.lessons.map((l) => {
                          const level = l.levels[c.code]
                          return (
                            <td key={l.sessionId} className="px-1 py-1.5 text-center">
                              {level == null ? (
                                <span className="text-ink-soft">–</span>
                              ) : (
                                <span className={`inline-block min-w-[2rem] rounded-md px-2 py-0.5 text-xs font-bold ${LEVEL_CELL[level]}`}>{level}</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// One teacher's levels in lesson order, per component: a dot per lesson and a
// plain-words comparison of the earlier lessons with the later ones. It
// compares typical (median) levels, never an average, and says nothing until
// at least four lessons gave the component a level.
const GROWTH_MIN = 4

function typicalLevel(levels: number[]): number {
  const sorted = [...levels].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function growthFor(levels: (number | null)[]): { early: number; late: number; half: number } | null {
  const leveled = levels.filter((l): l is number => l != null)
  if (leveled.length < GROWTH_MIN) return null
  const half = Math.floor(leveled.length / 2)
  return { early: typicalLevel(leveled.slice(0, half)), late: typicalLevel(leveled.slice(leveled.length - half)), half }
}

function GrowthView({ report }: { report: SelfEvalReport }) {
  const domains = [...new Set(report.components.map((c) => c.domain))]
  return (
    <section className="border-b border-hairline/70 px-5 py-5">
      <h2 className="font-heading text-lg font-bold text-forest">Growth across lessons</h2>
      <p className="mt-1 text-xs text-ink-soft">
        One dot per shared lesson, oldest on the left; an empty dot is not enough evidence. The line compares the typical level in the
        earlier lessons with the later ones, once at least {GROWTH_MIN} lessons gave that component a level. It is a starting point
        for a conversation, not a rating.
      </p>
      {domains.map((domain) => (
        <div key={domain} className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{domain}</p>
          <div className="mt-2 flex flex-col">
            {report.components
              .filter((c) => c.domain === domain)
              .map((c) => {
                const levels = report.lessons.map((l) => l.levels[c.code] ?? null)
                const growth = growthFor(levels)
                const counted = levels.filter((l) => l != null).length
                return (
                  <div key={c.code} className="flex flex-col gap-2 border-b border-hairline/50 py-3 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm text-ink">
                      <span className="font-semibold">{c.code}</span> · {c.name}
                    </p>
                      <p className="text-xs text-ink-soft sm:text-right">
                      {growth ? (
                        <>
                          <span
                            className={`mr-1.5 rounded-full px-2 py-0.5 font-semibold ${
                              growth.late > growth.early ? 'bg-mint-tint/70 text-forest' : growth.late < growth.early ? 'bg-gold-tint text-terracotta-600' : 'bg-cream text-ink'
                            }`}
                          >
                            {growth.late > growth.early ? 'Higher lately' : growth.late < growth.early ? 'Lower lately' : 'Steady'}
                          </span>
                          Level {growth.early} in the first {growth.half}, Level {growth.late} in the last {growth.half}
                        </>
                      ) : (
                        `Too few lessons with a level to compare (${counted} of ${GROWTH_MIN})`
                      )}
                    </p>
                    </div>
                    <div className="flex gap-1 overflow-x-auto pb-0.5">
                      {report.lessons.map((l, i) => {
                        const level = levels[i]
                        const label = `${formatDate(l.sessionDate, true)} · ${l.lessonTitle} · ${level == null ? 'not enough evidence' : `Level ${level}`}`
                        return (
                          <Link
                            key={l.sessionId}
                            to={`/admin/evaluations/${l.sessionId}`}
                            title={label}
                            aria-label={label}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              level == null ? 'border border-dashed border-hairline text-ink-soft' : LEVEL_CELL[level]
                            }`}
                          >
                            {level ?? ''}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </section>
  )
}

function EvaluationDetail({ sessionId, school }: { sessionId: string; school: string | null }) {
  const [data, setData] = useState<SharedSelfEvalDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSharedSelfEval(sessionId)
      .then(setData)
      .catch((err: Error) => setError(err.message || 'This Self Evaluation is not shared with you.'))
  }, [sessionId])

  const back = (
    <Link to="/admin/evaluations" className="text-sm text-ink-soft hover:text-forest">
      ← All evaluations
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8">
      {back}
      <Header
        school={school}
        title={data.lessonTitle}
        blurb={`${lessonMeta(data)} · ${formatDate(data.sessionDate, true)}. Shared ${formatDate(data.sharedAt, true)}.`}
      />
      <div className="rounded-xl border border-dashed border-hairline p-4 text-xs text-ink-soft">
        {data.report.frameworkName}. The report as the teacher previewed and sent it. Levels for Domains 2 and 3 are estimates from one
        lesson&rsquo;s audio, which can&rsquo;t see the room or student work; &ldquo;not enough evidence&rdquo; only means audio couldn&rsquo;t
        show it, not that it didn&rsquo;t happen.{data.report.planning ? ' Domain 1 levels are suggested from the lesson plan as written.' : ''} The
        teacher&rsquo;s notes are shown with the levels.
      </div>

      {data.report.feedbackRequest && (
        <section className="rounded-2xl border border-gold/50 bg-gold-tint/40 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">{data.teacherName} would like feedback on</p>
          <p className="mt-1.5 whitespace-pre-line text-base text-ink">{data.report.feedbackRequest}</p>
        </section>
      )}

      <FeedbackCard data={data} onSaved={(feedback, feedbackAt) => setData({ ...data, feedback, feedbackAt, status: feedback ? 'replied' : 'awaiting' })} />

      <SelfEvalReportView report={data.report} />
    </div>
  )
}

// The supervisor's written feedback, which the teacher sees on their own
// Self Evaluation tab. One per lesson; editing replaces it, clearing removes it.
function FeedbackCard({
  data,
  onSaved,
}: {
  data: SharedSelfEvalDetail
  onSaved: (feedback: string | null, feedbackAt: string | null) => void
}) {
  const [editing, setEditing] = useState(!data.feedback)
  const [draft, setDraft] = useState(data.feedback ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(text: string) {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveSelfEvalFeedback(data.sessionId, text)
      onSaved(saved.feedback, saved.feedbackAt)
      setDraft(saved.feedback ?? '')
      setEditing(!saved.feedback)
    } catch (err) {
      setError((err as Error).message || 'Could not save your feedback.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold text-forest">Your feedback to {data.teacherName}</h2>
        <StatusChip status={data.status} />
      </div>
      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What stood out, a question for your next conversation, or one thing to try. The teacher sees this on their Self Evaluation."
            className="w-full rounded-xl border border-hairline bg-cream/40 p-3 text-sm text-ink focus:border-forest focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(draft)}
              disabled={saving || !draft.trim()}
              className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:bg-hairline disabled:text-ink-soft"
            >
              {saving ? 'Sending...' : data.feedback ? 'Update feedback' : 'Send feedback'}
            </button>
            {data.feedback && (
              <button
                type="button"
                onClick={() => {
                  setDraft(data.feedback ?? '')
                  setEditing(false)
                }}
                disabled={saving}
                className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft hover:text-forest"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p className="whitespace-pre-line text-sm text-ink">{data.feedback}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {data.feedbackAt && <span className="text-ink-soft">Sent {formatDate(data.feedbackAt, true)}</span>}
            <button type="button" onClick={() => setEditing(true)} className="font-semibold text-forest hover:underline">
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Remove your feedback? The teacher will no longer see it.')) void save('')
              }}
              disabled={saving}
              className="font-semibold text-terracotta-600 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
    </section>
  )
}
