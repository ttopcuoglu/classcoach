import { useEffect, useState } from 'react'
import {
  createOrganization,
  deleteOrganization,
  deleteUser,
  getAdminOverview,
  getAdminUsers,
  getMe,
  getOrganizationMembers,
  getOrganizations,
  removeMember,
  suspendUser,
  updateOrganization,
  type AdminOverview,
  type AdminUser,
  type InstructionalAverages,
  type Organization,
  type OrgMember,
  type TallyEntry,
  type UserProfile,
} from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { challengeLabel, purposeLabel } from '../lib/communicationOptions'
import { LockIcon } from '../components/icons'

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const inputClass =
  'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60'

const primaryButtonClass =
  'rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50'

type ReportingTab = 'overview' | 'engagement' | 'themes'
type Tab = ReportingTab | 'organizations' | 'users'

const REPORTING_NAV: { id: ReportingTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'themes', label: 'Coaching themes' },
]

const TAB_META: Record<ReportingTab, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'A clear picture of participation and coaching activity.' },
  engagement: { title: 'Engagement', subtitle: 'How consistently your staff is using Wivoza.' },
  themes: { title: 'Coaching themes', subtitle: 'Common challenges and practice patterns across your staff.' },
}

function navButtonClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-canvas hover:text-ink'
  }`
}

export default function AdminDashboard() {
  const [me, setMe] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {})
  }, [])

  const isSuperadmin = me?.role === 'superadmin'

  useEffect(() => {
    if (isSuperadmin) {
      getOrganizations()
        .then(setOrgs)
        .catch(() => {})
    }
  }, [isSuperadmin])

  useEffect(() => {
    setOverview(null)
    setOverviewError(null)
    getAdminOverview({ organizationId: selectedOrgId || undefined, weekOffset })
      .then(setOverview)
      .catch(() => setOverviewError('Could not load the admin overview.'))
  }, [selectedOrgId, weekOffset])

  function handleOrgChange(id: string) {
    setSelectedOrgId(id)
    setWeekOffset(0)
  }

  const isReportingTab = tab === 'overview' || tab === 'engagement' || tab === 'themes'

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav className="flex shrink-0 flex-col gap-6 lg:w-52">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Reporting</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {REPORTING_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={navButtonClass(tab === item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {isSuperadmin && (
          <div>
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Administration</p>
            <div className="mt-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setTab('organizations')}
                className={navButtonClass(tab === 'organizations')}
              >
                Organizations
              </button>
              <button type="button" onClick={() => setTab('users')} className={navButtonClass(tab === 'users')}>
                Users &amp; access
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {isReportingTab && (
          <ReportingHeader
            tab={tab}
            overview={overview}
            orgs={orgs}
            selectedOrgId={selectedOrgId}
            onOrgChange={handleOrgChange}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            isSuperadmin={isSuperadmin}
          />
        )}

        {overviewError && <p className="text-sm text-warm-500">{overviewError}</p>}

        {isReportingTab && !overview && !overviewError && <p className="text-sm text-ink-soft">Loading...</p>}

        {tab === 'overview' && overview && <OverviewPanel overview={overview} onNavigateThemes={() => setTab('themes')} />}
        {tab === 'engagement' && overview && (
          <EngagementPanel overview={overview} selectedOrgId={selectedOrgId} isSuperadmin={isSuperadmin} />
        )}
        {tab === 'themes' && overview && <CoachingThemesPanel overview={overview} />}
        {tab === 'organizations' && <OrganizationsPanel />}
        {tab === 'users' && <UsersPanel />}
      </div>
    </div>
  )
}

function ReportingHeader({
  tab,
  overview,
  orgs,
  selectedOrgId,
  onOrgChange,
  weekOffset,
  onWeekOffsetChange,
  isSuperadmin,
}: {
  tab: ReportingTab
  overview: AdminOverview | null
  orgs: Organization[]
  selectedOrgId: string
  onOrgChange: (id: string) => void
  weekOffset: number
  onWeekOffsetChange: (updater: (w: number) => number) => void
  isSuperadmin: boolean
}) {
  const meta = TAB_META[tab]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {overview?.organizationName ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{overview.organizationName}</p>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Platform-wide</p>
          )}
          <h1 className="mt-0.5 text-2xl font-semibold text-ink md:text-3xl">{meta.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{meta.subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {isSuperadmin && orgs.length > 0 && (
            <select
              value={selectedOrgId}
              onChange={(e) => onOrgChange(e.target.value)}
              className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
            >
              <option value="">Platform-wide</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onWeekOffsetChange((w) => w + 1)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink-soft hover:border-brand-400 hover:text-brand-600"
              aria-label="Previous week"
            >
              ‹
            </button>
            <p className="text-sm font-medium text-ink">
              {weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Last week' : `${weekOffset} weeks ago`}
              {overview && (
                <span className="ml-1.5 font-normal text-ink-soft">
                  · {formatShortDate(overview.weekStart)} – {formatShortDate(overview.weekEnd)}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => onWeekOffsetChange((w) => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink-soft hover:border-brand-400 hover:text-brand-600 disabled:opacity-40"
              aria-label="Next week"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {tab === 'overview' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-600">
          <LockIcon className="h-4 w-4 shrink-0" />
          Aggregate reporting · Individual coaching stays private
        </div>
      )}
    </div>
  )
}

function WeeklyActivityChart({ data }: { data: { weekStart: string; activeCount: number }[] }) {
  const width = 600
  const height = 110
  const padX = 8
  const padY = 14
  const usableW = width - padX * 2
  const usableH = height - padY * 2
  const maxCount = Math.max(1, ...data.map((d) => d.activeCount))
  const n = data.length

  const points = data.map((d, i) => ({
    x: n > 1 ? padX + (i / (n - 1)) * usableW : padX + usableW / 2,
    y: padY + usableH - (d.activeCount / maxCount) * usableH,
    count: d.activeCount,
  }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Weekly participation</h3>
      <p className="text-xs text-ink-soft">Active teachers per week, last {n} weeks</p>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="mt-3">
        <path d={path} fill="none" stroke="var(--color-brand-500)" strokeWidth={2} strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="var(--color-brand-500)" />
            <title>{p.count}</title>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-soft">
        <span>{formatShortDate(data[0]?.weekStart)}</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{sub}</p>
    </div>
  )
}

const FEATURE_ACTIVITY_META: Record<keyof AdminOverview['featureActivity'], { label: string; sub: string }> = {
  lessonDebrief: { label: 'Lesson Debrief', sub: 'Analyzed classroom recordings' },
  lessonPlanning: { label: 'Lesson Planning', sub: 'Plans generated or reviewed' },
  communications: { label: 'Communications', sub: 'Messages, prep, and practice conversations' },
  practiceReflect: { label: 'Practice & Ask', sub: 'Scenario practice and reflections' },
}

function FeatureActivityCard({ data }: { data: AdminOverview['featureActivity'] }) {
  const entries = (Object.entries(data) as [keyof typeof data, number][]).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Activity by feature</h2>
      <p className="text-xs text-ink-soft">All-time completed activity, not limited to the selected week</p>
      <div className="mt-3 flex flex-col gap-3">
        {entries.map(([key, count]) => (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{FEATURE_ACTIVITY_META[key].label}</span>
              <span className="text-sm font-semibold text-ink">{count}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">{FEATURE_ACTIVITY_META[key].sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MembersList({ organizationId, isSuperadmin }: { organizationId?: string; isSuperadmin: boolean }) {
  const [members, setMembers] = useState<OrgMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setError(null)
    getOrganizationMembers(organizationId)
      .then(setMembers)
      .catch(() => setError('Could not load members.'))
  }

  useEffect(() => {
    setMembers(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Members</h2>
      {error && <p className="mt-2 text-sm text-warm-500">{error}</p>}
      {!members ? (
        <p className="mt-3 text-sm text-ink-soft">Loading...</p>
      ) : members.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No members yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} isSuperadmin={isSuperadmin} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function MemberRow({
  member,
  isSuperadmin,
  onChanged,
}: {
  member: OrgMember
  isSuperadmin: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    if (!window.confirm(`Remove ${member.name ?? member.email} from this organization? They become independent — no data is lost.`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await removeMember(member.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function handleSuspendToggle() {
    setBusy(true)
    setError(null)
    try {
      await suspendUser(member.id, !member.suspendedAt)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Permanently delete ${member.name ?? member.email}'s account and all their data? This cannot be undone.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteUser(member.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{member.name ?? member.email}</p>
          <p className="text-xs text-ink-soft">
            {member.email}
            {member.jobTitle ? ` · ${member.jobTitle}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {member.role === 'org_admin' && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
              Admin
            </span>
          )}
          {member.suspendedAt && (
            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Suspended
            </span>
          )}
          <span className="text-xs text-ink-soft">
            Joined{' '}
            {new Date(member.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
        >
          Remove from org
        </button>
        {isSuperadmin && (
          <>
            <button
              type="button"
              onClick={handleSuspendToggle}
              disabled={busy}
              className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
            >
              {member.suspendedAt ? 'Unsuspend' : 'Suspend'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs font-medium text-warm-500 hover:text-warm-600 disabled:opacity-50"
            >
              Delete account
            </button>
          </>
        )}
        {error && <span className="text-xs text-warm-500">{error}</span>}
      </div>
    </div>
  )
}

const PRIORITY_LABELS: Record<string, string> = {
  'talk-balance': 'Talk time balance',
  questioning: 'Higher-order questioning',
  'wait-time': 'Wait time after questions',
  cfu: 'Checking for understanding',
  feedback: 'Specific feedback',
}

function StatRow({ label, value, sampleNote }: { label: string; value: string; sampleNote: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-ink">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-ink">{value}</span>
        <p className="text-xs text-ink-soft">{sampleNote}</p>
      </div>
    </div>
  )
}

function InstructionalAveragesCard({ data }: { data: InstructionalAverages }) {
  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Instructional practice averages</h2>
      <div className="mt-2 flex flex-col">
        <StatRow
          label="Average wait time after a question"
          value={data.avgWaitTimeSec != null ? `${data.avgWaitTimeSec.toFixed(1)}s` : '—'}
          sampleNote={sampleOr(data.waitTimeSampleSize, 'sessions')}
        />
        <StatRow
          label="Teacher talk vs. student talk"
          value={
            data.avgTeacherTalkPct != null && data.avgStudentTalkPct != null
              ? `${Math.round(data.avgTeacherTalkPct)}% teacher · ${Math.round(data.avgStudentTalkPct)}% student`
              : '—'
          }
          sampleNote={sampleOr(data.talkSampleSize, 'sessions')}
        />
        <StatRow
          label="Higher-order questions"
          value={data.higherOrderPct != null ? `${data.higherOrderPct}%` : '—'}
          sampleNote={sampleOr(data.higherOrderSampleSize, 'questions')}
        />
        <StatRow
          label="Sessions with a real-life example or connection"
          value={data.realLifeConnectionRatePct != null ? `${data.realLifeConnectionRatePct}%` : '—'}
          sampleNote={sampleOr(data.realLifeConnectionSampleSize, 'sessions')}
        />
        <StatRow
          label="Follow-up questions"
          value={data.avgFollowUpPer10Min != null ? `${data.avgFollowUpPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.followUpSampleSize, 'sessions')}
        />
        <StatRow
          label="Sessions with a check for understanding"
          value={data.cfuRatePct != null ? `${data.cfuRatePct}%` : '—'}
          sampleNote={sampleOr(data.cfuSampleSize, 'sessions long enough to detect')}
        />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Averaged across {data.totalAnalyzedSessions} analyzed Lesson Debrief session
        {data.totalAnalyzedSessions === 1 ? '' : 's'} — each stat only counts sessions with real evidence for it,
        never padded with sessions where it wasn&rsquo;t measured.
      </p>
    </div>
  )
}

function TallyBarList({
  title,
  tally,
  labelFor,
  totalTeachers,
}: {
  title: string
  tally: Record<string, TallyEntry>
  labelFor: (value: string) => string
  totalTeachers: number
}) {
  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count)
  const maxCount = Math.max(1, ...sorted.map(([, v]) => v.count))
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {sorted.map(([value, { count, teachers }]) => (
          <div key={value} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-sm text-ink">{labelFor(value)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / maxCount) * 100}%` }} />
            </div>
            <span className="w-44 shrink-0 text-right text-sm text-ink-soft">
              {count === 0 ? 'no activity yet' : `${count} · ${teachers} of ${totalTeachers} teachers`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewPanel({ overview, onNavigateThemes }: { overview: AdminOverview; onNavigateThemes: () => void }) {
  const participationPct =
    overview.totalTeachers > 0 ? Math.round((overview.activeThisWeek / overview.totalTeachers) * 100) : 0
  const priorActiveCount =
    overview.weeklyActivity.length >= 2 ? overview.weeklyActivity[overview.weeklyActivity.length - 2].activeCount : null
  const activeDelta = priorActiveCount != null ? overview.activeThisWeek - priorActiveCount : null
  const activitiesDelta = overview.activitiesThisWeek - overview.activitiesPriorWeek

  const deltaText = (delta: number | null) =>
    delta == null ? 'This week' : `${delta >= 0 ? '+' : ''}${delta} vs. previous week`

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total teachers" value={String(overview.totalTeachers)} sub="Accounts with teacher access" />
        <StatCard label="Active teachers" value={String(overview.activeThisWeek)} sub={deltaText(activeDelta)} />
        <StatCard
          label="Participation"
          value={`${participationPct}%`}
          sub={`${overview.activeThisWeek} of ${overview.totalTeachers} teachers`}
        />
        <StatCard
          label="Activities completed"
          value={String(overview.activitiesThisWeek)}
          sub={deltaText(activitiesDelta)}
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <WeeklyActivityChart data={overview.weeklyActivity} />
      </div>

      <FeatureActivityCard data={overview.featureActivity} />

      <TallyBarList
        title="Popular coaching topics"
        tally={overview.priorityTally}
        labelFor={(v) => PRIORITY_LABELS[v] ?? v}
        totalTeachers={overview.totalTeachers}
      />

      <div className="rounded-2xl bg-brand-600 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-100">Professional learning</p>
        <h3 className="mt-2 text-lg font-semibold">Start with what teachers are exploring.</h3>
        <p className="mt-1 text-sm text-white/80">
          Use shared coaching themes to plan an optional workshop or resource collection.
        </p>
        <button
          type="button"
          onClick={onNavigateThemes}
          className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-600 transition-opacity hover:opacity-90"
        >
          Explore coaching themes →
        </button>
      </div>
    </div>
  )
}

function EngagementPanel({
  overview,
  selectedOrgId,
  isSuperadmin,
}: {
  overview: AdminOverview
  selectedOrgId: string
  isSuperadmin: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Staff-wide growth signal</p>
        {overview.growth.recentTotal === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No rated practice this week yet.</p>
        ) : (
          <p className="mt-1 text-sm text-ink">
            <span className="text-lg font-semibold text-ink">
              {overview.growth.recentStrong} of {overview.growth.recentTotal}
            </span>{' '}
            rated practice this week showed strong technique
            {overview.growth.priorTotal > 0
              ? `, vs. ${overview.growth.priorStrong} of ${overview.growth.priorTotal} the week before.`
              : '.'}
          </p>
        )}
      </div>

      {overview.scope === 'organization' && (
        <MembersList organizationId={selectedOrgId || undefined} isSuperadmin={isSuperadmin} />
      )}
    </div>
  )
}

function CoachingThemesPanel({ overview }: { overview: AdminOverview }) {
  return (
    <div className="flex flex-col gap-6">
      <TallyBarList
        title="Practice by category"
        tally={overview.categoryTally}
        labelFor={categoryLabel}
        totalTeachers={overview.totalTeachers}
      />

      <TallyBarList
        title="Conversations practiced, by challenge"
        tally={overview.challengeTally}
        labelFor={(v) => challengeLabel(v) ?? v}
        totalTeachers={overview.totalTeachers}
      />

      <TallyBarList
        title="Messages written, by purpose"
        tally={overview.messagePurposeTally}
        labelFor={(v) => purposeLabel(v) ?? v}
        totalTeachers={overview.totalTeachers}
      />

      <div>
        <TallyBarList
          title="Lesson Debrief: most common coaching priority"
          tally={overview.priorityTally}
          labelFor={(v) => PRIORITY_LABELS[v] ?? v}
          totalTeachers={overview.totalTeachers}
        />
        <p className="mt-2 text-xs text-ink-soft">
          Based on each analyzed session's own measured numbers — a short recording or one with too little evidence
          on a given metric doesn&rsquo;t count toward any priority, so totals here can be lower than the number of
          sessions recorded.
        </p>
      </div>

      <InstructionalAveragesCard data={overview.instructionalAverages} />

      <TallyBarList
        title="Content specialist notes, by theme"
        tally={overview.contentNoteTally}
        labelFor={(v) => v}
        totalTeachers={overview.totalTeachers}
      />
    </div>
  )
}

function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [adminEmails, setAdminEmails] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    getOrganizations()
      .then(setOrgs)
      .catch(() => setError('Could not load organizations.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setJustCreatedCode(null)
    setCreating(true)
    try {
      const org = await createOrganization({
        name,
        joinCode: joinCode.trim() || undefined,
        adminEmails: adminEmails.trim() || undefined,
      })
      setJustCreatedCode(org.joinCode)
      setName('')
      setJoinCode('')
      setAdminEmails('')
      refresh()
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Create organization</h2>
        <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="District or school name"
            className={inputClass}
            required
          />
          <input
            value={adminEmails}
            onChange={(e) => setAdminEmails(e.target.value)}
            placeholder="Admin email(s), comma-separated"
            className={inputClass}
          />
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Join code (optional — auto-generated if left blank)"
            className={inputClass}
          />
          {createError && <p className="text-sm text-warm-500">{createError}</p>}
          {justCreatedCode && (
            <p className="text-sm text-brand-600">
              Created — join code: <span className="font-mono font-semibold">{justCreatedCode}</span>
            </p>
          )}
          <button type="submit" disabled={creating} className={`self-start ${primaryButtonClass}`}>
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Organizations</h2>
        {error && <p className="mt-2 text-sm text-warm-500">{error}</p>}
        {loading ? (
          <p className="mt-3 text-sm text-ink-soft">Loading...</p>
        ) : orgs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No organizations yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {orgs.map((org) => (
              <OrganizationRow key={org.id} org={org} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OrganizationRow({ org, onChanged }: { org: Organization; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(org.name)
  const [joinCode, setJoinCode] = useState(org.joinCode)
  const [adminEmails, setAdminEmails] = useState(org.adminEmails ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateOrganization(org.id, { name, joinCode, adminEmails })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${org.name}? Its teachers become independent — their accounts aren't deleted.`)) {
      return
    }
    await deleteOrganization(org.id)
    onChanged()
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className={inputClass} />
          <input
            value={adminEmails}
            onChange={(e) => setAdminEmails(e.target.value)}
            placeholder="Admin email(s), comma-separated"
            className={inputClass}
          />
          {error && <p className="text-sm text-warm-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-ink-soft">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-semibold text-ink">{org.name}</p>
        <p className="text-xs text-ink-soft">
          Code: <span className="font-mono">{org.joinCode}</span> · {org.teacherCount} teacher
          {org.teacherCount === 1 ? '' : 's'}
          {org.adminEmails ? ` · Admins: ${org.adminEmails}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-ink-soft hover:text-ink">
          Edit
        </button>
        <button type="button" onClick={handleDelete} className="text-xs font-medium text-ink-soft hover:text-warm-500">
          Delete
        </button>
      </div>
    </div>
  )
}

// Superadmin-only, platform-wide — the one place to find an independent
// teacher who isn't in any org (and so never appears in a Members list).
function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setError(null)
    getAdminUsers()
      .then(setUsers)
      .catch(() => setError('Could not load users.'))
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">All users</h2>
      {error && <p className="mt-2 text-sm text-warm-500">{error}</p>}
      {!users ? (
        <p className="mt-3 text-sm text-ink-soft">Loading...</p>
      ) : users.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No users yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {users.map((u) => (
            <UserRow key={u.id} user={u} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSuspendToggle() {
    setBusy(true)
    setError(null)
    try {
      await suspendUser(user.id, !user.suspendedAt)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(`Permanently delete ${user.name ?? user.email}'s account and all their data? This cannot be undone.`)
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteUser(user.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{user.name ?? user.email}</p>
          <p className="text-xs text-ink-soft">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            {user.role === 'superadmin' ? 'Superadmin' : user.role === 'org_admin' ? 'Org admin' : 'Teacher'}
          </span>
          <span className="text-xs text-ink-soft">{user.organizationName ?? 'Independent'}</span>
          {user.suspendedAt && (
            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Suspended
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSuspendToggle}
          disabled={busy}
          className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
        >
          {user.suspendedAt ? 'Unsuspend' : 'Suspend'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="text-xs font-medium text-warm-500 hover:text-warm-600 disabled:opacity-50"
        >
          Delete account
        </button>
        {error && <span className="text-xs text-warm-500">{error}</span>}
      </div>
    </div>
  )
}
