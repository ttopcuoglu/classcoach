import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RUBRIC_LEVEL_LOOKS_LIKE } from '../../components/RubricLevel'
import {
  getSelfEvalReport,
  getSupervisorWorkspace,
  RUBRIC_LEVEL_NAMES,
  type SelfEvalReport,
  type SupervisorWorkspace,
  type WorkspaceComponent,
  type WorkspaceShare,
} from '../../lib/api'
import {
  clock,
  defaultTerm,
  formatDate,
  gradeLabel,
  GrowthView,
  inRange,
  initials,
  lessonMeta,
  PageHeader,
  PrivacyFooter,
  rangeFor,
  teacherMeta,
  termOptions,
  type DateRange,
} from './common'

// The supervisor's workspace in the School Workspace (from the user's
// mockups, 2026-11-19): Overview, My Teachers and Reports (Danielson
// evidence, Strengths & opportunities, Content & instruction, Evidence over
// time). Everything comes from GET /self-eval-shares/workspace, which only
// holds lessons teachers chose to share with this supervisor; the period
// filter is applied here, by the date the lesson was taught.

type View = 'overview' | 'teachers' | 'selfevals' | 'reports'
type ReportKey = 'danielson' | 'strengths' | 'content' | 'time'
type Teacher = SupervisorWorkspace['teachers'][number]

const VIEWS: { key: View; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'teachers', label: 'My Teachers' },
  // Every teacher who has shared a Self Evaluation with me, and each one's
  // shares from the start (the user's call, 2026-11-24).
  { key: 'selfevals', label: 'Self Evaluations' },
  { key: 'reports', label: 'Reports' },
]

// Short component names for column heads and pickers.
const SHORT_NAME: Record<string, string> = {
  '1a': 'Content knowledge',
  '1b': 'Knowing students',
  '1c': 'Learning outcomes',
  '1d': 'Resources',
  '1e': 'Coherent planning',
  '1f': 'Assessment design',
  '2a': 'Respect and rapport',
  '2b': 'Culture for learning',
  '2c': 'Purposeful environment',
  '2d': 'Student behavior',
  '2e': 'Physical space',
  '3a': 'Explaining content',
  '3b': 'Questioning and discussion',
  '3c': 'Student engagement',
  '3d': 'Checks for understanding',
  '3e': 'Responsiveness',
}
const DOMAIN_CODES: Record<'1' | '2' | '3', string[]> = {
  '1': ['1a', '1b', '1c', '1d', '1e', '1f'],
  '2': ['2a', '2b', '2c', '2d', '2e'],
  '3': ['3a', '3b', '3c', '3d', '3e'],
}

const CELL_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: 'Emerging', 2: 'Revisiting', 3: 'Meets', 4: 'Exceeds' }
const CELL_STYLE: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-terracotta/15 text-terracotta-600',
  2: 'bg-gold-tint text-terracotta-600',
  3: 'bg-mint-tint/60 text-forest',
  4: 'bg-mint-tint text-forest font-semibold',
}
const NOT_ENOUGH_STYLE = 'bg-cream text-ink-soft'

const byShared = (a: WorkspaceShare, b: WorkspaceShare) => new Date(b.sharedAt).getTime() - new Date(a.sharedAt).getTime()

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mint-tint/50 text-sm font-bold text-forest" aria-hidden="true">
      {initials(name)}
    </span>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-hairline p-6 text-sm text-ink-soft">{children}</div>
}

function LevelPill({ level }: { level: 1 | 2 | 3 | 4 | null }) {
  return level == null ? (
    <span className={`rounded-lg px-3 py-1.5 text-sm ${NOT_ENOUGH_STYLE}`}>Not enough evidence</span>
  ) : (
    <span className={`rounded-lg px-3 py-1.5 text-sm ${CELL_STYLE[level]}`}>{RUBRIC_LEVEL_NAMES[level]}</span>
  )
}

function domainsLabel(s: WorkspaceShare): string {
  return s.hasPlanning ? 'Domains I–III' : 'Domains II–III'
}

export function EvaluationsHome() {
  const [params, setParams] = useSearchParams()
  const view: View = VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'overview'
  const terms = termOptions()
  const term = terms.find((t) => t.key === params.get('term'))?.key ?? defaultTerm()
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const range = useMemo(() => rangeFor(term, fromParam, toParam), [term, fromParam, toParam])
  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: false })
  }

  const [data, setData] = useState<SupervisorWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getSupervisorWorkspace()
      .then(setData)
      .catch((err: Error) => setError(err.message || 'Could not load your workspace.'))
  }, [])

  const period = (
    <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-ink-soft">
      <label className="flex items-center gap-3">
        Period
        <select
          value={term}
          onChange={(e) => setParam({ term: e.target.value === defaultTerm() ? null : e.target.value })}
          className="rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-medium text-ink focus:border-forest focus:outline-none"
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
  )

  const tabs = (
    <div role="tablist" aria-label="Supervisor workspace" className="flex flex-wrap gap-2">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          role="tab"
          aria-selected={view === v.key}
          onClick={() => setParam({ view: v.key === 'overview' ? null : v.key, report: null, teacher: null, list: null, component: null, domain: null })}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            view === v.key ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:border-forest'
          }`}
        >
          {v.label}
          {v.key === 'teachers' && data ? <span className={`ml-2 ${view === v.key ? 'text-cream/80' : 'text-ink-soft'}`}>{data.teachers.length}</span> : null}
        </button>
      ))}
    </div>
  )

  const inPeriod = data ? data.shares.filter((s) => inRange(s.sessionDate, range)) : []
  const report = (['danielson', 'strengths', 'content', 'time'] as const).find((r) => r === params.get('report')) ?? null
  const teacherId = params.get('teacher')

  let body: ReactNode = null
  if (data && view === 'overview') body = <OverviewView data={data} inPeriod={inPeriod} period={period} list={params.get('list') === 'all' ? 'all' : 'awaiting'} setParam={setParam} />
  if (data && view === 'teachers' && !teacherId) body = <TeachersView data={data} inPeriod={inPeriod} period={period} setParam={setParam} />
  if (data && view === 'selfevals') body = <SelfEvaluationsView data={data} teacherId={teacherId} setParam={setParam} />
  if (data && view === 'teachers' && teacherId) body = <TeacherHistory data={data} teacherId={teacherId} inPeriod={inPeriod} range={range} period={period} setParam={setParam} />
  if (data && view === 'reports' && !report) body = <ReportsHub period={period} setParam={setParam} />
  if (data && view === 'reports' && report) {
    const back = (
      <button
        type="button"
        onClick={() => setParam({ report: null, teacher: null, component: null, domain: null })}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest"
      >
        <span aria-hidden="true">←</span> All Reports
      </button>
    )
    if (report === 'danielson') body = <DanielsonReport data={data} inPeriod={inPeriod} period={period} back={back} domain={params.get('domain')} setParam={setParam} />
    if (report === 'strengths') body = <StrengthsReport inPeriod={inPeriod} period={period} back={back} />
    if (report === 'content') body = <ContentReport inPeriod={inPeriod} period={period} back={back} />
    if (report === 'time') body = <EvidenceOverTime data={data} inPeriod={inPeriod} period={period} back={back} teacherId={teacherId} component={params.get('component')} setParam={setParam} />
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      {tabs}
      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!error && !data && <p className="text-sm text-ink-soft">Loading...</p>}
      {body}
      {data && <PrivacyFooter />}
    </div>
  )
}

type SetParam = (changes: Record<string, string | null>) => void

// ---- Overview ----

function Tile({ label, icon, value, of, note, active, onClick }: { label: string; icon: ReactNode; value: number; of?: number; note: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-4 rounded-2xl border p-5 text-left transition-colors ${active ? 'border-forest/40 bg-mint-tint/30' : 'border-hairline bg-white hover:border-forest/40'}`}
    >
      <span className="flex items-start justify-between gap-3 text-sm font-medium text-ink-soft">
        {label}
        <span className="text-ink-soft">{icon}</span>
      </span>
      <span className="font-heading text-4xl font-extrabold text-forest">
        {value}
        {of != null && <span className="ml-2 text-lg font-medium text-ink">of {of}</span>}
      </span>
      <span className="text-sm text-ink-soft">{note}</span>
    </button>
  )
}

const ICON = {
  chat: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 4v16M4 12h16" />
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8zM18 3v4M16 5h4M18 16v4M16 18h4" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
    </svg>
  ),
}

function ShareRow({ s }: { s: WorkspaceShare }) {
  const awaiting = s.status === 'awaiting'
  return (
    <div className="flex flex-col gap-3 border-b border-hairline/70 px-5 py-5 last:border-0 md:grid md:grid-cols-[1.1fr_1.3fr_auto] md:items-center md:gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={s.teacherName} />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{s.teacherName}</p>
          <p className="text-sm text-ink-soft">{lessonMeta(s, false)}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-base text-ink">{s.lessonTitle}</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          Shared {formatDate(s.sharedAt)} · {domainsLabel(s)}
        </p>
      </div>
      <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-2">
        <Link to={`/admin/evaluations/${s.sessionId}`} className="rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-forest hover:border-forest">
          {awaiting ? 'Review' : 'View report'}
        </Link>
        <span className={`text-sm ${awaiting ? 'text-terracotta-600' : 'text-ink-soft'}`}>{awaiting ? 'Awaiting feedback' : 'Feedback sent'}</span>
      </div>
    </div>
  )
}

function SharesTable({ title, rows, toggle, empty }: { title: string; rows: WorkspaceShare[]; toggle?: ReactNode; empty: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
        <h2 className="font-heading text-2xl font-bold text-forest">{title}</h2>
        {toggle}
      </div>
      <div className="hidden grid-cols-[1.1fr_1.3fr_auto] gap-6 border-y border-hairline bg-cream/50 px-5 py-4 text-sm uppercase tracking-wide text-ink-soft md:grid">
        <span>Teacher</span>
        <span>Lesson &amp; shared date</span>
        <span className="text-right">Feedback</span>
      </div>
      {rows.length === 0 ? <p className="border-t border-hairline px-5 py-6 text-sm text-ink-soft md:border-t-0">{empty}</p> : rows.map((s) => <ShareRow key={s.sessionId} s={s} />)}
    </section>
  )
}

function OverviewView({ data, inPeriod, period, list, setParam }: { data: SupervisorWorkspace; inPeriod: WorkspaceShare[]; period: ReactNode; list: 'awaiting' | 'all'; setParam: SetParam }) {
  // What still needs me is never hidden by the period; oldest first, a queue.
  const awaiting = data.shares.filter((s) => s.status === 'awaiting').sort((a, b) => -byShared(a, b))
  const all = [...inPeriod].sort((a, b) => (a.status === b.status ? byShared(a, b) : a.status === 'awaiting' ? -1 : 1))
  const sharers = new Set(inPeriod.map((s) => s.teacherId)).size
  const rows = list === 'all' ? all : awaiting
  const toggle = (
    <div className="flex gap-2">
      {(['awaiting', 'all'] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={list === k}
          onClick={() => setParam({ list: k === 'awaiting' ? null : 'all' })}
          className={`rounded-xl px-3.5 py-2 text-sm font-semibold ${list === k ? 'bg-forest text-cream' : 'bg-cream text-ink hover:bg-mint-tint/50'}`}
        >
          {k === 'awaiting' ? 'Awaiting feedback' : 'All shared'}
        </button>
      ))}
    </div>
  )
  return (
    <>
      <PageHeader crumb="Overview" title="More of the teaching you support" blurb="Review shared lessons. Recognize strengths. Give useful feedback." />
      {period}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Awaiting your feedback" icon={ICON.chat} value={awaiting.length} note="Shared reports ready to review" active={list === 'awaiting'} onClick={() => setParam({ list: null })} />
        <Tile label="Shared evaluations" icon={ICON.copy} value={inPeriod.length} note="During the selected period" active={list === 'all'} onClick={() => setParam({ list: 'all' })} />
        <Tile label="Teachers who shared" icon={ICON.people} value={sharers} of={data.teachers.length} note="Your assigned teachers" onClick={() => setParam({ view: 'teachers', list: null })} />
      </div>
      <SharesTable
        title="Shared evaluations"
        rows={rows}
        toggle={toggle}
        empty={list === 'all' ? 'No lessons shared with you were taught in this period.' : 'Nothing is waiting for your feedback.'}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => setParam({ view: 'reports', report: 'danielson', list: null })} className="flex flex-col gap-3 rounded-2xl bg-forest p-7 text-left">
          <span className="text-sm font-semibold uppercase tracking-[0.15em] text-gold">Instruction across your team</span>
          <span className="font-heading text-3xl font-bold text-cream">See the evidence behind the ratings</span>
          <span className="text-base text-cream/85">Review the latest shared evidence by teacher and Danielson component.</span>
          <span className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-gold">
            Explore Danielson evidence <Arrow />
          </span>
        </button>
        <button type="button" onClick={() => setParam({ view: 'reports', report: 'content', list: null })} className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-7 text-left hover:border-forest/40">
          <span className="text-sm font-semibold uppercase tracking-[0.15em] text-ink-soft">Content &amp; instruction</span>
          <span className="font-heading text-3xl font-bold text-forest">Feedback that gets into the subject</span>
          <span className="text-base text-ink-soft">Understand the content behind a teaching move, with notes tied to the lesson.</span>
          <span className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-forest">
            Explore content feedback <Arrow />
          </span>
        </button>
      </div>
    </>
  )
}

// ---- My Teachers ----

function TeachersView({ data, inPeriod, period, setParam }: { data: SupervisorWorkspace; inPeriod: WorkspaceShare[]; period: ReactNode; setParam: SetParam }) {
  const rows = data.teachers
    .map((t) => {
      const shares = inPeriod.filter((s) => s.teacherId === t.teacherId).sort(byShared)
      const awaiting = data.shares.filter((s) => s.teacherId === t.teacherId && s.status === 'awaiting').length
      return { t, shares, awaiting, latest: shares[0] ?? null }
    })
    .sort((a, b) => {
      const rank = (r: typeof a) => (r.awaiting ? 0 : r.latest ? 1 : 2)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      if (a.latest && b.latest) return byShared(a.latest, b.latest)
      return a.t.teacherName.localeCompare(b.t.teacherName)
    })
  return (
    <>
      <PageHeader
        crumb="My Teachers"
        title="My Teachers"
        blurb={`${data.teachers.length} ${data.teachers.length === 1 ? 'teacher' : 'teachers'} assigned to you. Open a teacher’s shared lesson history.`}
      />
      {period}
      {data.teachers.length === 0 ? (
        <Empty>No teachers are assigned to you yet. Your school admin assigns supervisors in Supervisor Assignments.</Empty>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          <div className="hidden grid-cols-[1.2fr_1.3fr_4rem_7rem_4.5rem] gap-4 border-b border-hairline bg-cream/50 px-5 py-4 text-sm text-ink-soft md:grid">
            <span>Teacher</span>
            <span>Latest shared lesson</span>
            <span>Shared</span>
            <span>Feedback</span>
            <span />
          </div>
          {rows.map(({ t, shares, awaiting, latest }) => (
            <div key={t.teacherId} className="flex flex-col gap-3 border-b border-hairline/70 px-5 py-4 last:border-0 md:grid md:grid-cols-[1.2fr_1.3fr_4rem_7rem_4.5rem] md:items-center md:gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={t.teacherName} />
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t.teacherName}</p>
                  {teacherMeta(t) && <p className="text-sm text-ink-soft">{teacherMeta(t)}</p>}
                </div>
              </div>
              <div className="min-w-0">
                {latest ? (
                  <>
                    <p className="text-base text-ink">{latest.lessonTitle}</p>
                    <p className="text-sm text-ink-soft">{formatDate(latest.sharedAt)}</p>
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">No shared evaluations</p>
                )}
              </div>
              <span className="text-sm text-ink">
                <span className="md:hidden text-ink-soft">Shared: </span>
                {shares.length}
              </span>
              <span>
                {awaiting > 0 ? (
                  <span className="inline-block rounded-lg bg-gold-tint px-2.5 py-1.5 text-sm text-ink">{awaiting} awaiting</span>
                ) : latest || data.shares.some((s) => s.teacherId === t.teacherId) ? (
                  <span className="text-sm text-ink">Replied</span>
                ) : (
                  <span className="text-sm text-ink-soft">—</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setParam({ teacher: t.teacherId })}
                className="w-fit rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-forest hover:border-forest"
              >
                View
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function TeacherHistory({
  data,
  teacherId,
  inPeriod,
  range,
  period,
  setParam,
}: {
  data: SupervisorWorkspace
  teacherId: string
  inPeriod: WorkspaceShare[]
  range: DateRange
  period: ReactNode
  setParam: SetParam
}) {
  const teacher: Teacher | undefined = data.teachers.find((t) => t.teacherId === teacherId)
  const shares = inPeriod.filter((s) => s.teacherId === teacherId).sort(byShared)
  const [growth, setGrowth] = useState<SelfEvalReport | null>(null)
  useEffect(() => {
    setGrowth(null)
    getSelfEvalReport(teacherId, range).then(setGrowth).catch(() => setGrowth(null))
  }, [teacherId, range])
  return (
    <>
      <button
        type="button"
        onClick={() => setParam({ teacher: null })}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest"
      >
        <span aria-hidden="true">←</span> My Teachers
      </button>
      <PageHeader crumb="My Teachers" title={teacher?.teacherName ?? 'Teacher'} blurb={teacher && teacherMeta(teacher) ? `${teacherMeta(teacher)}. Lessons shared with you, newest first.` : 'Lessons shared with you, newest first.'} />
      {period}
      <SharesTable title="Shared lessons" rows={shares} empty="No lessons shared with you were taught in this period." />
      {growth && growth.lessons.length > 0 && <GrowthView report={growth} />}
    </>
  )
}

// ---- Reports ----

const REPORTS: { key: ReportKey; title: string; blurb: string; icon: ReactNode }[] = [
  { key: 'danielson', title: 'Danielson evidence', blurb: 'Latest shared evidence by teacher and component.', icon: ICON.grid },
  { key: 'strengths', title: 'Strengths & opportunities', blurb: 'Practices appearing across shared lessons.', icon: ICON.sparkle },
  { key: 'content', title: 'Content & instruction', blurb: 'Subject-specific explanations and feedback ideas.', icon: ICON.book },
  { key: 'time', title: 'Evidence over time', blurb: 'A teacher’s evidence alongside your earlier feedback.', icon: ICON.history },
]

function ReportsHub({ period, setParam }: { period: ReactNode; setParam: SetParam }) {
  return (
    <>
      <PageHeader crumb="Reports" title="Reports" blurb="Understand the instruction teachers have chosen to share." aside={period} />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <button key={r.key} type="button" onClick={() => setParam({ report: r.key })} className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-7 text-left hover:border-forest/40">
            <span className="text-ink">{r.icon}</span>
            <span className="font-heading text-2xl font-bold text-forest">{r.title}</span>
            <span className="text-base text-ink-soft">{r.blurb}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function DanielsonReport({
  data,
  inPeriod,
  period,
  back,
  domain,
  setParam,
}: {
  data: SupervisorWorkspace
  inPeriod: WorkspaceShare[]
  period: ReactNode
  back: ReactNode
  domain: string | null
  setParam: SetParam
}) {
  const d = (domain === '1' || domain === '2' ? domain : '3') as '1' | '2' | '3'
  const codes = DOMAIN_CODES[d]
  const rows = data.teachers
    .map((t) => ({ t, latest: inPeriod.filter((s) => s.teacherId === t.teacherId).sort(byShared)[0] ?? null }))
    .sort((a, b) => (a.latest && b.latest ? byShared(a.latest, b.latest) : a.latest ? -1 : b.latest ? 1 : a.t.teacherName.localeCompare(b.t.teacherName)))
  return (
    <>
      {back}
      <PageHeader crumb="Reports" title="Danielson evidence" blurb="Latest shared evaluation for each teacher in the selected period." />
      {period}
      <div className="flex flex-wrap gap-2">
        {(['1', '2', '3'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={d === k}
            onClick={() => setParam({ domain: k === '3' ? null : k })}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${d === k ? 'bg-forest text-cream' : 'border border-hairline bg-white text-forest hover:border-forest'}`}
          >
            Domain {'I'.repeat(Number(k))}
          </button>
        ))}
      </div>
      {data.teachers.length === 0 ? (
        <Empty>No teachers are assigned to you yet.</Empty>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-hairline bg-white">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline bg-cream/50">
                <th className="px-5 py-4 text-left font-medium text-ink-soft">Teacher</th>
                {codes.map((c) => (
                  <th key={c} className="px-2 py-3 text-center align-bottom font-medium">
                    <span className="block text-ink">{c}</span>
                    <span className="block text-xs font-normal leading-snug text-ink-soft">{SHORT_NAME[c]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, latest }) => {
                const byCode = new Map((latest?.components ?? []).map((c) => [c.code, c]))
                return (
                  <tr key={t.teacherId} className="border-b border-hairline/70 last:border-0">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{t.teacherName}</p>
                      <p className="text-sm text-ink-soft">{latest ? `Shared ${formatDate(latest.sharedAt)}` : 'No shared evaluation'}</p>
                    </td>
                    {codes.map((code) => {
                      const c = byCode.get(code)
                      if (!latest || !c) {
                        return (
                          <td key={code} className="px-2 py-3 text-center text-ink-soft" title={latest && d === '1' ? 'No lesson plan attached' : undefined}>
                            —
                          </td>
                        )
                      }
                      const label = c.level == null ? 'Not enough evidence' : CELL_LABEL[c.level]
                      return (
                        <td key={code} className="px-1.5 py-3">
                          <Link
                            to={`/admin/evaluations/${latest.sessionId}#component-${code}`}
                            title={`${t.teacherName} · ${code} ${c.name} · ${c.level == null ? 'Not enough evidence' : `Level ${c.level} · ${RUBRIC_LEVEL_NAMES[c.level]}`}`}
                            className={`block rounded-lg px-2 py-2 text-center text-xs leading-tight hover:ring-2 hover:ring-forest/30 ${c.level == null ? NOT_ENOUGH_STYLE : CELL_STYLE[c.level]}`}
                          >
                            {label}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {([1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={`rounded-lg px-3 py-1.5 ${CELL_STYLE[l]}`}>
            {RUBRIC_LEVEL_NAMES[l]}
          </span>
        ))}
        <span className={`rounded-lg px-3 py-1.5 ${NOT_ENOUGH_STYLE}`}>Not enough evidence</span>
      </div>
      <p className="text-sm text-ink-soft">
        Select a cell to review the supporting evidence. Not enough evidence has no numeric score.
        {d === '1' ? ' Domain I appears only when the teacher attached a lesson plan.' : ''}
      </p>
    </>
  )
}

type Pattern = { code: string; name: string; lessons: { share: WorkspaceShare; c: WorkspaceComponent }[]; teachers: number }

function patterns(inPeriod: WorkspaceShare[], match: (level: number) => boolean): Pattern[] {
  const map = new Map<string, Pattern>()
  for (const s of inPeriod) {
    for (const c of s.components) {
      if (c.level == null || !match(c.level)) continue
      const p = map.get(c.code) ?? { code: c.code, name: c.name, lessons: [], teachers: 0 }
      p.lessons.push({ share: s, c })
      map.set(c.code, p)
    }
  }
  return [...map.values()]
    .map((p) => ({ ...p, teachers: new Set(p.lessons.map((l) => l.share.teacherId)).size }))
    .sort((a, b) => b.lessons.length - a.lessons.length || b.teachers - a.teachers || a.code.localeCompare(b.code))
    .slice(0, 2)
}

function PatternCard({ p, kind }: { p: Pattern; kind: 'strength' | 'opportunity' }) {
  const looks = RUBRIC_LEVEL_LOOKS_LIKE[p.code]
  return (
    <section className="rounded-2xl border border-hairline bg-white p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.15em] text-terracotta-600">{kind === 'strength' ? 'Strength to recognize' : 'Opportunity to discuss'}</p>
      <h2 className="mt-2 font-heading text-2xl font-bold text-forest">
        {p.code} · {SHORT_NAME[p.code] ?? p.name}
      </h2>
      {looks && (
        <p className="mt-2 text-base text-ink">
          {kind === 'strength' ? 'Placed at Meeting or Exceeding Expectations. ' : 'Placed at Emerging or Worth Revisiting. The next step up: '}
          {looks[2]}
        </p>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        {p.lessons.length} shared {p.lessons.length === 1 ? 'lesson' : 'lessons'} · {p.teachers} {p.teachers === 1 ? 'teacher' : 'teachers'}
      </p>
      <details className="mt-4 border-t border-hairline pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">View supporting lessons</summary>
        <ul className="mt-3 flex flex-col gap-3">
          {p.lessons.map(({ share, c }) => (
            <li key={share.sessionId} className="rounded-xl bg-cream/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {share.teacherName} · {share.lessonTitle}
                </p>
                <LevelPill level={c.level} />
              </div>
              {c.evidence && (
                <p className="mt-1.5 text-sm text-ink">
                  &ldquo;{c.evidence.text}&rdquo;{' '}
                  <span className="text-ink-soft">
                    · {c.evidence.source === 'plan' ? `Lesson plan${c.evidence.ref ? ` · ${c.evidence.ref}` : ''}` : c.evidence.timestampSec != null ? clock(c.evidence.timestampSec) : ''}
                  </span>
                </p>
              )}
              <Link to={`/admin/evaluations/${share.sessionId}#component-${c.code}`} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline">
                Open evaluation <Arrow />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function StrengthsReport({ inPeriod, period, back }: { inPeriod: WorkspaceShare[]; period: ReactNode; back: ReactNode }) {
  const strengths = patterns(inPeriod, (l) => l >= 3)
  const opportunities = patterns(inPeriod, (l) => l <= 2)
  return (
    <>
      {back}
      <PageHeader crumb="Reports" title="Strengths & opportunities" blurb="Patterns in shared lessons, with source evidence you can open." />
      {period}
      {inPeriod.length === 0 ? (
        <Empty>No lessons shared with you were taught in this period.</Empty>
      ) : (
        <>
          {strengths.map((p) => (
            <PatternCard key={`s-${p.code}`} p={p} kind="strength" />
          ))}
          {opportunities.map((p) => (
            <PatternCard key={`o-${p.code}`} p={p} kind="opportunity" />
          ))}
          {strengths.length + opportunities.length === 0 && <Empty>No component was given a level in the lessons shared in this period.</Empty>}
        </>
      )}
    </>
  )
}

function ContentReport({ inPeriod, period, back }: { inPeriod: WorkspaceShare[]; period: ReactNode; back: ReactNode }) {
  const cards = [...inPeriod]
    .sort(byShared)
    .map((s) => ({
      s,
      why: s.notes.find((n) => n.label === 'What worked') ?? null,
      idea: s.notes.find((n) => n.label === 'Where it could go further') ?? null,
    }))
    .filter((x) => x.why || x.idea)
  return (
    <>
      {back}
      <PageHeader crumb="Reports" title="Content & instruction" blurb="Subject-specific context for your feedback conversations." aside={period} />
      {cards.length === 0 ? (
        <Empty>No Content Specialist notes in the lessons shared in this period.</Empty>
      ) : (
        cards.map(({ s, why, idea }) => {
          const lead = why ?? idea!
          return (
            <section key={s.sessionId} className="rounded-2xl border border-hairline bg-white p-6">
              <h2 className="font-heading text-2xl font-bold text-forest">{s.lessonTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{[s.teacherName, s.classSubject, gradeLabel(s.gradeLevel), formatDate(s.sessionDate)].filter(Boolean).join(' · ')}</p>
              <div className="mt-4 border-l-2 border-gold/70 pl-4">
                <p className="text-sm text-ink-soft">{clock(lead.timestampSec)} · Lesson transcript</p>
                <p className="mt-1 text-base text-ink">&ldquo;{lead.excerpt}&rdquo;</p>
              </div>
              {why && (
                <div className="mt-4 rounded-xl bg-mint-tint/40 p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink">Why this matters in the subject</p>
                  <p className="mt-1 text-base text-ink">{why.text}</p>
                </div>
              )}
              {idea && (
                <p className="mt-4 text-base text-ink">
                  <span className="font-semibold">Feedback idea: </span>
                  {idea.text}
                </p>
              )}
              <p className="mt-4 text-sm text-ink-soft">AI-generated by the Content Specialist</p>
              <Link to={`/admin/evaluations/${s.sessionId}`} className="mt-3 inline-flex items-center gap-2 text-base font-semibold text-forest hover:underline">
                Open shared evaluation <Arrow />
              </Link>
            </section>
          )
        })
      )}
    </>
  )
}

function EvidenceOverTime({
  data,
  inPeriod,
  period,
  back,
  teacherId,
  component,
  setParam,
}: {
  data: SupervisorWorkspace
  inPeriod: WorkspaceShare[]
  period: ReactNode
  back: ReactNode
  teacherId: string | null
  component: string | null
  setParam: SetParam
}) {
  const withShares = data.teachers.filter((t) => inPeriod.some((s) => s.teacherId === t.teacherId))
  const teacher = withShares.find((t) => t.teacherId === teacherId) ?? withShares[0] ?? null
  const shares = teacher ? inPeriod.filter((s) => s.teacherId === teacher.teacherId).sort((a, b) => -byShared(a, b)) : []
  const codes = [...new Set(shares.flatMap((s) => s.components.map((c) => c.code)))].sort()
  const code = codes.includes(component ?? '') ? component! : codes.includes('3a') ? '3a' : (codes[0] ?? null)
  const select = 'rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-medium text-ink focus:border-forest focus:outline-none'
  return (
    <>
      {back}
      <PageHeader crumb="Reports" title="Evidence over time" blurb="Compare evidence in context and revisit your earlier feedback." />
      {period}
      {!teacher ? (
        <Empty>No lessons shared with you were taught in this period.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-ink-soft">
            <label className="flex items-center gap-3">
              Teacher
              <select value={teacher.teacherId} onChange={(e) => setParam({ teacher: e.target.value })} className={select}>
                {withShares.map((t) => (
                  <option key={t.teacherId} value={t.teacherId}>
                    {t.teacherName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3">
              Component
              <select value={code ?? ''} onChange={(e) => setParam({ component: e.target.value })} className={select}>
                {codes.map((c) => (
                  <option key={c} value={c}>
                    {c} · {SHORT_NAME[c] ?? c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shares.map((s) => {
            const c = s.components.find((x) => x.code === code)
            return (
              <section key={s.sessionId} className="rounded-2xl border border-hairline bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm uppercase tracking-wide text-ink-soft">Shared {formatDate(s.sharedAt)}</p>
                    <h2 className="mt-1 font-heading text-2xl font-bold text-forest">{s.lessonTitle}</h2>
                  </div>
                  {c ? <LevelPill level={c.level} /> : <span className="text-sm text-ink-soft">Not in this lesson&rsquo;s report</span>}
                </div>
                {c?.evidence && (
                  <div className="mt-4 border-l-2 border-gold/70 pl-4">
                    <p className="text-sm text-ink-soft">
                      {c.evidence.source === 'plan' ? `Lesson plan${c.evidence.ref ? ` · ${c.evidence.ref}` : ''}` : `${c.evidence.timestampSec != null ? clock(c.evidence.timestampSec) : ''} · Lesson transcript`}
                    </p>
                    <p className="mt-1 text-base text-ink">&ldquo;{c.evidence.text}&rdquo;</p>
                  </div>
                )}
                <details className="mt-4 border-t border-hairline pt-4">
                  <summary className="cursor-pointer text-base font-semibold text-ink">{s.feedback ? 'Your earlier feedback' : 'Awaiting your feedback'}</summary>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink">
                    {s.feedback ?? 'You haven’t written feedback on this lesson yet.'}
                    {s.feedback && s.feedbackAt ? <span className="block pt-1 text-xs text-ink-soft">Sent {formatDate(s.feedbackAt, true)}</span> : null}
                  </p>
                </details>
                <Link to={`/admin/evaluations/${s.sessionId}${code ? `#component-${code}` : ''}`} className="mt-3 inline-flex items-center gap-2 text-base font-semibold text-forest hover:underline">
                  Open evaluation <Arrow />
                </Link>
              </section>
            )
          })}
        </>
      )}
    </>
  )
}

// ---- Self Evaluations: who has shared, and everything each one shared ----
// Not limited to the period: from a teacher's first share to now.

function SelfEvaluationsView({ data, teacherId, setParam }: { data: SupervisorWorkspace; teacherId: string | null; setParam: SetParam }) {
  const sharers = data.teachers
    .map((t) => {
      const shares = data.shares.filter((s) => s.teacherId === t.teacherId).sort(byShared)
      return { t, shares, awaiting: shares.filter((s) => s.status === 'awaiting').length }
    })
    .filter((x) => x.shares.length > 0)
    .sort((a, b) => (a.awaiting !== b.awaiting ? b.awaiting - a.awaiting : byShared(a.shares[0], b.shares[0])))

  const picked = teacherId ? sharers.find((x) => x.t.teacherId === teacherId) : null
  if (picked) {
    return (
      <>
        <button
          type="button"
          onClick={() => setParam({ teacher: null })}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest hover:border-forest"
        >
          <span aria-hidden="true">←</span> Self Evaluations
        </button>
        <PageHeader
          crumb="Self Evaluations"
          title={picked.t.teacherName}
          blurb={`${teacherMeta(picked.t) ? `${teacherMeta(picked.t)}. ` : ''}${picked.shares.length} Self ${picked.shares.length === 1 ? 'Evaluation' : 'Evaluations'} shared with you, newest first.`}
        />
        <SharesTable title="Shared with you" rows={picked.shares} empty="Nothing shared yet." />
      </>
    )
  }

  return (
    <>
      <PageHeader crumb="Self Evaluations" title="Self Evaluations" blurb="Teachers who have shared a Self Evaluation with you. Open one to see everything they have shared." />
      {sharers.length === 0 ? (
        <Empty>No teacher has shared a Self Evaluation with you yet. When one does, they appear here.</Empty>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-hairline bg-white">
          {sharers.map(({ t, shares, awaiting }) => (
            <button
              key={t.teacherId}
              type="button"
              onClick={() => setParam({ teacher: t.teacherId })}
              className="flex w-full flex-wrap items-center gap-4 border-b border-hairline/70 px-5 py-4 text-left last:border-0 hover:bg-cream/40"
            >
              <Avatar name={t.teacherName} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t.teacherName}</p>
                <p className="text-sm text-ink-soft">
                  {[teacherMeta(t), `${shares.length} shared`, `latest ${formatDate(shares[0].sharedAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              {awaiting > 0 ? (
                <span className="rounded-lg bg-gold-tint px-2.5 py-1.5 text-sm text-ink">{awaiting} awaiting</span>
              ) : (
                <span className="text-sm text-ink-soft">All replied</span>
              )}
              <span className="text-sm font-semibold text-forest" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </section>
      )}
    </>
  )
}
