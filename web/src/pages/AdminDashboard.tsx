import { useEffect, useState } from 'react'
import {
  createOrganization,
  deleteOrganization,
  deleteUser,
  getAdminBreakdown,
  getAdminExportUrl,
  getAdminOverview,
  getAdminUsers,
  getMe,
  getOrganizationMembers,
  getOrganizations,
  removeMember,
  suspendUser,
  updateOrganization,
  type AdminBreakdown,
  type AdminOverview,
  type AdminUser,
  type ClimateAverages,
  type DataConfidence,
  type InstructionalAverages,
  type Organization,
  type OrgMember,
  type Strength,
  type TallyEntry,
  type UserProfile,
} from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { challengeLabel, purposeLabel } from '../lib/communicationOptions'
import { ChartBarIcon, ChatBubbleIcon, HomeIcon, LockIcon, ShieldIcon, UserIcon } from '../components/icons'

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultEndDate(): string {
  return toDateInputValue(new Date())
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateInputValue(d)
}

// Aug 1 – today, spanning whichever school year "now" falls in (before
// August, the school year that started last August is still current).
function schoolYearStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return toDateInputValue(new Date(year, 7, 1))
}

const inputClass =
  'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60'

const primaryButtonClass =
  'rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50'

type AnalyticsTab = 'dashboard' | 'engagement' | 'insights'
type Tab = AnalyticsTab | 'people' | 'organizations' | 'platformUsers'

const ANALYTICS_META: Record<AnalyticsTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Are teachers using Wivoza, and what should you do next.' },
  engagement: { title: 'Adoption & engagement', subtitle: 'How consistently your staff is using Wivoza.' },
  insights: { title: 'Coaching insights', subtitle: 'Shared strengths and growth areas emerging across your staff.' },
}

function navButtonClass(active: boolean) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-canvas hover:text-ink'
  }`
}

const GRADE_BAND_OPTIONS = ['K-2', '3-5', '6-8', '9-12', 'Unspecified'] as const
const SUBJECT_OPTIONS = ['Math', 'ELA', 'Science', 'Social Studies', 'Other'] as const

type DatePreset = '7d' | '30d' | '90d' | 'schoolYear' | 'custom'
const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'schoolYear', label: 'School year' },
]

function presetRange(preset: DatePreset): { startDate: string; endDate: string } {
  const endDate = defaultEndDate()
  if (preset === '30d') return { startDate: daysAgo(29), endDate }
  if (preset === '90d') return { startDate: daysAgo(89), endDate }
  if (preset === 'schoolYear') return { startDate: schoolYearStart(), endDate }
  return { startDate: daysAgo(6), endDate }
}

export default function AdminDashboard() {
  const [me, setMe] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('7d')
  const [startDate, setStartDate] = useState(() => presetRange('7d').startDate)
  const [endDate, setEndDate] = useState(() => presetRange('7d').endDate)
  const [gradeBand, setGradeBand] = useState('')
  const [subject, setSubject] = useState('')

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
    getAdminOverview({
      organizationId: selectedOrgId || undefined,
      startDate,
      endDate,
      gradeBand: gradeBand || undefined,
      subject: subject || undefined,
    })
      .then(setOverview)
      .catch(() => setOverviewError('Could not load the admin overview.'))
  }, [selectedOrgId, startDate, endDate, gradeBand, subject])

  function handleOrgChange(id: string) {
    setSelectedOrgId(id)
    setDatePreset('7d')
    const range = presetRange('7d')
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset)
    const range = presetRange(preset)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  function handleCustomDateChange(which: 'start' | 'end', value: string) {
    setDatePreset('custom')
    if (which === 'start') setStartDate(value)
    else setEndDate(value)
  }

  const isAnalyticsTab = tab === 'dashboard' || tab === 'engagement' || tab === 'insights'

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav className="flex shrink-0 flex-col gap-6 lg:w-56">
        <button type="button" onClick={() => setTab('dashboard')} className={navButtonClass(tab === 'dashboard')}>
          <HomeIcon className="h-4 w-4 shrink-0" />
          Dashboard
        </button>

        <div>
          <p className="flex items-center gap-1.5 px-3 text-xs font-semibold text-ink-soft">
            <ChartBarIcon className="h-3.5 w-3.5 shrink-0" />
            Analytics
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            <button type="button" onClick={() => setTab('engagement')} className={navButtonClass(tab === 'engagement')}>
              Adoption &amp; engagement
            </button>
            <button type="button" onClick={() => setTab('insights')} className={navButtonClass(tab === 'insights')}>
              Coaching insights
            </button>
          </div>
        </div>

        <button type="button" onClick={() => setTab('people')} className={navButtonClass(tab === 'people')}>
          <UserIcon className="h-4 w-4 shrink-0" />
          People
        </button>

        {isSuperadmin && (
          <div>
            <p className="flex items-center gap-1.5 px-3 text-xs font-semibold text-ink-soft">
              <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
              Wivoza internal
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setTab('organizations')}
                className={navButtonClass(tab === 'organizations')}
              >
                Organizations
              </button>
              <button
                type="button"
                onClick={() => setTab('platformUsers')}
                className={navButtonClass(tab === 'platformUsers')}
              >
                Platform users
              </button>
            </div>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {isAnalyticsTab && (
          <FilterBar
            tab={tab}
            overview={overview}
            orgs={orgs}
            selectedOrgId={selectedOrgId}
            onOrgChange={handleOrgChange}
            datePreset={datePreset}
            onPresetChange={handlePresetChange}
            startDate={startDate}
            endDate={endDate}
            onCustomDateChange={handleCustomDateChange}
            gradeBand={gradeBand}
            onGradeBandChange={setGradeBand}
            subject={subject}
            onSubjectChange={setSubject}
            isSuperadmin={isSuperadmin}
          />
        )}

        {overviewError && <p className="text-sm text-warm-500">{overviewError}</p>}

        {isAnalyticsTab && !overview && !overviewError && <p className="text-sm text-ink-soft">Loading...</p>}

        {tab === 'dashboard' && overview && <DashboardPanel overview={overview} onNavigate={setTab} />}
        {tab === 'engagement' && overview && <EngagementPanel overview={overview} />}
        {tab === 'insights' && overview && (
          <CoachingInsightsPanel overview={overview} selectedOrgId={selectedOrgId} />
        )}
        {tab === 'people' && (
          <PeoplePanel
            selectedOrgId={selectedOrgId}
            onOrgChange={handleOrgChange}
            orgs={orgs}
            isSuperadmin={isSuperadmin}
            overview={overview}
          />
        )}
        {tab === 'organizations' && <OrganizationsPanel />}
        {tab === 'platformUsers' && <UsersPanel />}
      </div>
    </div>
  )
}

function FilterBar({
  tab,
  overview,
  orgs,
  selectedOrgId,
  onOrgChange,
  datePreset,
  onPresetChange,
  startDate,
  endDate,
  onCustomDateChange,
  gradeBand,
  onGradeBandChange,
  subject,
  onSubjectChange,
  isSuperadmin,
}: {
  tab: AnalyticsTab
  overview: AdminOverview | null
  orgs: Organization[]
  selectedOrgId: string
  onOrgChange: (id: string) => void
  datePreset: DatePreset
  onPresetChange: (preset: DatePreset) => void
  startDate: string
  endDate: string
  onCustomDateChange: (which: 'start' | 'end', value: string) => void
  gradeBand: string
  onGradeBandChange: (v: string) => void
  subject: string
  onSubjectChange: (v: string) => void
  isSuperadmin: boolean
}) {
  const meta = ANALYTICS_META[tab]
  const presetButtonClass = (active: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
      active ? 'bg-brand-500 text-white' : 'bg-canvas text-ink-soft hover:text-ink'
    }`

  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-4 bg-canvas px-4 pb-4 pt-1 md:-mx-10 md:px-10">
      <div>
        {overview?.organizationName ? (
          <p className="text-xs font-semibold text-ink-soft">{overview.organizationName}</p>
        ) : (
          <p className="text-xs font-semibold text-ink-soft">Platform-wide</p>
        )}
        <h1 className="mt-0.5 text-2xl font-semibold text-ink md:text-[34px]">{meta.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{meta.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          >
            <option value="">Platform-wide</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1">
          {DATE_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => onPresetChange(p.id)} className={presetButtonClass(datePreset === p.id)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-sm text-ink-soft">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => onCustomDateChange('start', e.target.value)}
            className="rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={defaultEndDate()}
            onChange={(e) => onCustomDateChange('end', e.target.value)}
            className="rounded-lg border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          />
        </div>

        <select
          value={gradeBand}
          onChange={(e) => onGradeBandChange(e.target.value)}
          className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
        >
          <option value="">All grade bands</option>
          {GRADE_BAND_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
        >
          <option value="">All subjects</option>
          {SUBJECT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <a
          href={getAdminExportUrl({ organizationId: selectedOrgId || undefined, startDate, endDate, gradeBand: gradeBand || undefined, subject: subject || undefined })}
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand-400 hover:text-brand-600"
        >
          Export report
        </a>
      </div>

      {(gradeBand || subject) && (
        <p className="-mt-2 text-xs text-ink-soft">
          Grade band and subject filters only apply to Lesson Debrief data — usage counts elsewhere (Try It Out,
          Communications, Ask &amp; Practice) don&rsquo;t have a grade/subject dimension to filter by.
        </p>
      )}

      {tab === 'dashboard' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-600">
          <LockIcon className="h-4 w-4 shrink-0" />
          Aggregate reporting · Individual coaching stays private
        </div>
      )}
    </div>
  )
}

// Value labels and the y-axis max are rendered as plain HTML (percentage-
// positioned over the SVG), not SVG <text> — the SVG uses
// preserveAspectRatio="none" so it can stretch to fill its container width,
// which would visually squash/stretch any text drawn inside it.
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
    xPct: n > 1 ? (i / (n - 1)) * 100 : 50,
    x: n > 1 ? padX + (i / (n - 1)) * usableW : padX + usableW / 2,
    y: padY + usableH - (d.activeCount / maxCount) * usableH,
    count: d.activeCount,
  }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Weekly participation</h3>
      <p className="text-xs text-ink-soft">Active teachers per week, last {n} weeks — count of teachers, not a percentage</p>
      <div className="relative mt-4">
        <span className="absolute -top-3 left-0 text-[10px] text-ink-soft">max {maxCount}</span>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
          <path d={path} fill="none" stroke="var(--color-brand-500)" strokeWidth={2} strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-brand-500)" />
          ))}
        </svg>
        {points.map((p, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[10px] font-semibold text-ink"
            style={{ left: `${p.xPct}%`, top: `${(p.y / height) * 100}%`, transform: 'translate(-50%, -140%)' }}
          >
            {p.count}
          </span>
        ))}
      </div>
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

const INACTIVE_THRESHOLD_DAYS = 14

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
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
          {!member.suspendedAt &&
            (daysSince(member.lastActiveAt) == null || daysSince(member.lastActiveAt)! > INACTIVE_THRESHOLD_DAYS) && (
              <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
                {member.lastActiveAt ? 'Inactive' : 'Never active'}
              </span>
            )}
          <span className="text-xs text-ink-soft">
            {member.lastActiveAt
              ? `Active ${new Date(member.lastActiveAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : 'Never active'}
            {' · Joined '}
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

// A staff-wide, deterministic coach-voice observation — same discipline as
// every other coach note in this app: never invented, only surfaced when
// the aggregate data actually shows something worth naming, and always
// about the group, never a single teacher.
function AdminCoachNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50 p-3">
      <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
      <p className="text-sm text-ink">{text}</p>
    </div>
  )
}

// Shared insight logic for a plain "which value shows up most" tally
// (category/challenge/purpose/priority/content-note tallies all have this
// exact shape) — only speaks up once there's enough real activity to say
// anything, and never claims a lead that isn't actually there.
// minTotal defaults to 5 — the same "full confidence" floor as
// dataConfidence() server-side (server/src/routes/admin.ts), so a narrative
// claim like "X stands out" never fires off fewer sessions than a plain
// stat would need to drop its "Limited data" badge.
function buildTallyInsight(
  tally: Record<string, TallyEntry>,
  labelFor: (value: string) => string,
  itemNoun: string,
  activityNoun: string,
  minTotal = 5,
): string | null {
  const entries = Object.entries(tally).filter(([, v]) => v.count > 0)
  if (entries.length === 0) return null
  const total = entries.reduce((sum, [, v]) => sum + v.count, 0)
  if (total < minTotal) return null
  const sorted = [...entries].sort((a, b) => b[1].count - a[1].count)
  const [topValue, topEntry] = sorted[0]
  const label = labelFor(topValue)
  const share = Math.round((topEntry.count / total) * 100)
  if (entries.length === 1 || share >= 40) {
    return `${label} stands out as the most common ${itemNoun} across your staff (${share}% of ${activityNoun}) — a candidate for a shared PD session or resource.`
  }
  return `No single ${itemNoun} dominates yet — ${label} leads narrowly, but ${activityNoun} are fairly spread out.`
}

// Confidence-gated: only speaks up once a stat has cleared the same "full"
// bar every other number on this page uses (see dataConfidence in
// server/src/routes/admin.ts), not the old ad hoc >=5/>=10 thresholds.
function buildInstructionalGroupInsight(data: InstructionalAverages): string | null {
  if (data.higherOrderConfidence === 'full' && data.higherOrderPct != null && data.higherOrderPct < 30) {
    return `Higher-order questions are a stretch area staff-wide (${data.higherOrderPct}% of questions) — a good theme for a shared PD session on questioning technique.`
  }
  if (data.cfuConfidence === 'full' && data.cfuRatePct != null && data.cfuRatePct < 50) {
    return `Checks for understanding show up in only ${data.cfuRatePct}% of eligible sessions staff-wide — worth reinforcing as a quick, low-lift routine.`
  }
  if (data.waitTimeConfidence === 'full' && data.avgWaitTimeSec != null && data.avgWaitTimeSec < 3) {
    return `Average wait time after a question is ${data.avgWaitTimeSec.toFixed(1)}s staff-wide — extending it by even a couple seconds is a well-supported, easy lever to name.`
  }
  if (data.higherOrderConfidence === 'full' && data.higherOrderPct != null && data.higherOrderPct >= 40) {
    return `Higher-order questioning is a real strength staff-wide (${data.higherOrderPct}% of questions) — worth naming and reinforcing.`
  }
  return null
}

function buildClimateGroupInsight(data: ClimateAverages): string | null {
  if (
    data.redirectionMeasuredConfidence === 'full' &&
    data.zeroRedirectionRatePct != null &&
    data.zeroRedirectionRatePct >= 60
  ) {
    // Deliberately not "a sign of smooth-running classrooms" — absence of
    // redirection language in a recording isn't proof of good classroom
    // management, it could just as easily mean the clip didn't capture
    // much classroom-management activity at all.
    return `${data.zeroRedirectionRatePct}% of these sessions had no redirection language detected staff-wide.`
  }
  if (data.toneConfidence === 'full' && data.positiveTonePct != null && data.positiveTonePct < 50) {
    return `Corrective language outweighs positive language staff-wide (${data.positiveTonePct}% positive) — could be worth a shared conversation on tone.`
  }
  if (data.directiveConfidence === 'full' && data.clearDirectivesRatePct != null && data.clearDirectivesRatePct >= 70) {
    return `${data.clearDirectivesRatePct}% of sessions show clear directive language staff-wide — a real strength worth naming.`
  }
  return null
}

// The one confidence bar's visual expression, matching dataConfidence() in
// server/src/routes/admin.ts: 'none' hides the number entirely (StatRow
// swaps in "Not enough evidence yet"), 'limited' shows the number with a
// small badge, 'full' shows it with no badge at all.
function ConfidenceBadge({ level }: { level: DataConfidence }) {
  if (level !== 'limited') return null
  return (
    <span className="rounded-full bg-warm-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
      Limited data
    </span>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-label={text}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-ink-soft/40 text-[9px] font-semibold text-ink-soft"
      >
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

function StatRow({
  label,
  value,
  sampleNote,
  confidence,
  tooltip,
}: {
  label: string
  value: string
  sampleNote: string
  confidence?: DataConfidence
  tooltip?: string
}) {
  const hideValue = confidence === 'none'
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-ink">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <div className="text-right">
        <span className="flex items-center justify-end gap-1.5">
          <span className="text-sm font-semibold text-ink">{hideValue ? 'Not enough evidence yet' : value}</span>
          {confidence && <ConfidenceBadge level={confidence} />}
        </span>
        <p className="text-xs text-ink-soft">{sampleNote}</p>
      </div>
    </div>
  )
}

function InstructionalAveragesCard({ data, insight }: { data: InstructionalAverages; insight?: string | null }) {
  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')
  const otherPct =
    data.avgTeacherTalkPct != null && data.avgStudentTalkPct != null
      ? Math.max(0, Math.round(100 - data.avgTeacherTalkPct - data.avgStudentTalkPct))
      : null
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Instructional practice averages</h2>
      <div className="mt-2 flex flex-col">
        <StatRow
          label="Average wait time after a question"
          value={data.avgWaitTimeSec != null ? `${data.avgWaitTimeSec.toFixed(1)}s` : '—'}
          sampleNote={sampleOr(data.waitTimeSampleSize, 'sessions')}
          confidence={data.waitTimeConfidence}
          tooltip="Median seconds of silence between a question and the teacher speaking again — median rather than average so one unusually long pause doesn't swing a small sample."
        />
        <StatRow
          label="Teacher talk vs. student talk"
          value={
            data.avgTeacherTalkPct != null && data.avgStudentTalkPct != null
              ? `${Math.round(data.avgTeacherTalkPct)}% teacher · ${Math.round(data.avgStudentTalkPct)}% student${otherPct != null ? ` · ${otherPct}% other` : ''}`
              : '—'
          }
          sampleNote={sampleOr(data.talkSampleSize, 'sessions')}
          confidence={data.talkConfidence}
          tooltip="Share of recorded audio classified as teacher speech vs. student speech. 'Other' is the remainder — silence, group work, or audio the transcript couldn't confidently attribute."
        />
        <StatRow
          label="Higher-order questions"
          value={data.higherOrderPct != null ? `${data.higherOrderPct}%` : '—'}
          sampleNote={sampleOr(data.higherOrderSampleSize, 'questions')}
          confidence={data.higherOrderConfidence}
          tooltip="Percentage of all detected questions that use higher-order starters (why, explain, compare, justify) rather than simple recall."
        />
        <StatRow
          label="Sessions with a real-life example or connection"
          value={data.realLifeConnectionRatePct != null ? `${data.realLifeConnectionRatePct}%` : '—'}
          sampleNote={sampleOr(data.realLifeConnectionSampleSize, 'sessions')}
          confidence={data.realLifeConnectionConfidence}
          tooltip="Percentage of sessions with lesson-content analysis where at least one real-world connection or example was detected."
        />
        <StatRow
          label="Follow-up questions"
          value={data.avgFollowUpPer10Min != null ? `${data.avgFollowUpPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.followUpSampleSize, 'sessions')}
          confidence={data.followUpConfidence}
          tooltip="Median rate of follow-up questions (a second question building on a student's answer) per 10 minutes of class."
        />
        <StatRow
          label="Sessions with a check for understanding"
          value={data.cfuRatePct != null ? `${data.cfuRatePct}%` : '—'}
          sampleNote={sampleOr(data.cfuSampleSize, 'sessions long enough to detect')}
          confidence={data.cfuConfidence}
          tooltip="Percentage of sessions long enough to reliably detect a check-for-understanding moment that had at least one."
        />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Averaged across {data.totalAnalyzedSessions} analyzed Lesson Debrief session
        {data.totalAnalyzedSessions === 1 ? '' : 's'} — each stat only counts sessions with real evidence for it,
        never padded with sessions where it wasn&rsquo;t measured.
      </p>
      {insight !== undefined && <AdminCoachNote text={insight} />}
    </div>
  )
}

function ClimateAveragesCard({ data, insight }: { data: ClimateAverages; insight?: string | null }) {
  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Classroom climate &amp; management
      </h2>
      <div className="mt-2 flex flex-col">
        <StatRow
          label="Redirection language"
          value={data.avgRedirectionPer10Min != null ? `${data.avgRedirectionPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.redirectionFrequencySampleSize, 'sessions')}
          confidence={data.redirectionConfidence}
          tooltip="Median rate of detected redirection phrases per 10 minutes — median rather than average so one unusually disruptive session doesn't swing a small sample."
        />
        <StatRow
          label="Sessions with no redirection language detected"
          value={data.zeroRedirectionRatePct != null ? `${data.zeroRedirectionRatePct}%` : '—'}
          sampleNote={sampleOr(data.redirectionMeasuredSampleSize, 'sessions')}
          confidence={data.redirectionMeasuredConfidence}
          tooltip="Absence of detected redirection language isn't proof of good classroom management — it can also mean the recording captured less classroom-management activity overall."
        />
        <StatRow
          label="Transition language"
          value={data.avgTransitionPer10Min != null ? `${data.avgTransitionPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.transitionSampleSize, 'sessions')}
          confidence={data.transitionConfidence}
          tooltip="Median rate of detected activity-transition phrases per 10 minutes."
        />
        <StatRow
          label="Sessions with clear directive language detected"
          value={data.clearDirectivesRatePct != null ? `${data.clearDirectivesRatePct}%` : '—'}
          sampleNote={sampleOr(data.directiveSampleSize, 'sessions')}
          confidence={data.directiveConfidence}
          tooltip="Percentage of sessions with at least one detected clear-directive phrase (a specific, actionable instruction)."
        />
        <StatRow
          label="Positive vs. corrective tone"
          value={data.positiveTonePct != null ? `${data.positiveTonePct}% positive` : '—'}
          sampleNote={sampleOr(data.toneSampleSize, 'tone-language moments')}
          confidence={data.toneConfidence}
          tooltip="Share of detected positive-vs-corrective phrase moments that were positive, out of every such moment across these sessions."
        />
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Keyword/phrase-matched counts only — clarity and effectiveness aren&rsquo;t judged automatically. Each stat
        only counts sessions with real evidence for it.
      </p>
      {insight !== undefined && <AdminCoachNote text={insight} />}
    </div>
  )
}

type BreakdownBy = 'gradeBand' | 'subject'

const BREAKDOWN_OPTIONS: { id: 'none' | BreakdownBy; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'gradeBand', label: 'Grade band' },
  { id: 'subject', label: 'Subject' },
]

// Same 5 headline instructional/climate metrics as the two cards above,
// sliced by grade band or subject instead of one school-wide number — a
// bucket only shows up once at least a few distinct teachers have
// contributed to it (see MIN_TEACHERS_FOR_BREAKDOWN server-side); until
// then it's a deliberate "not enough data yet," not a missing feature.
function BreakdownCard({ selectedOrgId }: { selectedOrgId: string }) {
  const [by, setBy] = useState<'none' | BreakdownBy>('none')
  const [data, setData] = useState<AdminBreakdown | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (by === 'none') {
      setData(null)
      setError(null)
      return
    }
    setData(null)
    setError(null)
    getAdminBreakdown({ by, organizationId: selectedOrgId || undefined })
      .then(setData)
      .catch(() => setError('Could not load the breakdown.'))
  }, [by, selectedOrgId])

  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Instructional averages, by grade or subject
        </h2>
        <div className="flex gap-1 rounded-lg bg-canvas p-1">
          {BREAKDOWN_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBy(opt.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                by === opt.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {by === 'none' && (
        <p className="mt-2 text-xs text-ink-soft">
          See the same averages above split by grade band or subject, to spot where PD would help most.
        </p>
      )}

      {by !== 'none' && error && <p className="mt-3 text-sm text-warm-500">{error}</p>}

      {by !== 'none' && !data && !error && <p className="mt-3 text-sm text-ink-soft">Loading...</p>}

      {data && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.breakdown.map((entry) => (
            <div key={entry.bucket} className="rounded-xl border border-border/60 p-3">
              <p className="text-sm font-semibold text-ink">{entry.bucket}</p>
              {entry.suppressed ? (
                <p className="mt-2 text-xs text-ink-soft">
                  Not enough data yet — fewer than {data.minTeachers} teachers have a session here.
                </p>
              ) : (
                <div className="mt-1 flex flex-col">
                  <StatRow
                    label="Avg. wait time"
                    value={entry.metrics.avgWaitTimeSec != null ? `${entry.metrics.avgWaitTimeSec.toFixed(1)}s` : '—'}
                    sampleNote={sampleOr(entry.metrics.waitTimeSampleSize, 'sessions')}
                    confidence={entry.metrics.waitTimeConfidence}
                  />
                  <StatRow
                    label="Teacher talk"
                    value={entry.metrics.avgTeacherTalkPct != null ? `${Math.round(entry.metrics.avgTeacherTalkPct)}%` : '—'}
                    sampleNote={sampleOr(entry.metrics.talkSampleSize, 'sessions')}
                    confidence={entry.metrics.talkConfidence}
                  />
                  <StatRow
                    label="Higher-order questions"
                    value={entry.metrics.higherOrderPct != null ? `${entry.metrics.higherOrderPct}%` : '—'}
                    sampleNote={sampleOr(entry.metrics.higherOrderSampleSize, 'questions')}
                    confidence={entry.metrics.higherOrderConfidence}
                  />
                  <StatRow
                    label="Redirection language"
                    value={
                      entry.metrics.avgRedirectionPer10Min != null
                        ? `${entry.metrics.avgRedirectionPer10Min.toFixed(1)}/10min`
                        : '—'
                    }
                    sampleNote={sampleOr(entry.metrics.redirectionFrequencySampleSize, 'sessions')}
                    confidence={entry.metrics.redirectionConfidence}
                  />
                  <StatRow
                    label="Positive tone"
                    value={entry.metrics.positiveTonePct != null ? `${entry.metrics.positiveTonePct}%` : '—'}
                    sampleNote={sampleOr(entry.metrics.toneSampleSize, 'tone-language moments')}
                    confidence={entry.metrics.toneConfidence}
                  />
                  <p className="mt-1.5 text-xs text-ink-soft">{entry.teacherCount} teachers</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TallyBarList({
  title,
  tally,
  labelFor,
  totalTeachers,
  comment,
  insight,
}: {
  title: string
  tally: Record<string, TallyEntry>
  labelFor: (value: string) => string
  totalTeachers: number
  comment?: string
  insight?: string | null
}) {
  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count)
  const active = sorted.filter(([, v]) => v.count > 0)
  const inactive = sorted.filter(([, v]) => v.count === 0)
  const maxCount = Math.max(1, ...active.map(([, v]) => v.count))

  const row = ([value, { count, teachers }]: [string, TallyEntry]) => (
    <div key={value} className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-ink">{labelFor(value)}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(count / maxCount) * 100}%` }} />
      </div>
      <span className="w-44 shrink-0 text-right text-sm text-ink-soft">
        {count === 0 ? 'no activity yet' : `${count} · ${teachers} of ${totalTeachers} teachers`}
      </span>
    </div>
  )

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      {comment && <p className="mt-1 text-xs text-ink-soft">{comment}</p>}
      {active.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">{active.map(row)}</div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">More data is needed before this shows anything useful.</p>
      )}
      {inactive.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-medium text-brand-600 marker:content-none [&::-webkit-details-marker]:hidden">
            Show {inactive.length} {inactive.length === 1 ? 'category' : 'categories'} with no activity
          </summary>
          <div className="mt-2 flex flex-col gap-2">{inactive.map(row)}</div>
        </details>
      )}
      {insight !== undefined && <AdminCoachNote text={insight} />}
    </div>
  )
}

// Client-side mirror of dataConfidence() (server/src/routes/admin.ts) for
// numbers computed straight from a tally on the client — priorityTally's
// counts aren't sent with a precomputed confidence field the way the
// instructional/climate averages are, so this applies the exact same bar
// (<3 none, <5 limited, else full) locally instead.
function confidenceFor(n: number): DataConfidence {
  if (n < 3) return 'none'
  if (n < 5) return 'limited'
  return 'full'
}

const PD_SUGGESTIONS: Record<string, string> = {
  'talk-balance': 'a short PD session on structuring more student talk time — think-pair-share, cold-call routines',
  questioning: 'a 15-minute micro-PD on higher-order question stems (why / explain / compare / justify)',
  'wait-time': 'a quick, low-lift practice: silently count to 3-5 after every question before calling on someone',
  cfu: 'a shared routine for quick checks for understanding — thumbs up/down, exit tickets, cold-call',
  feedback: 'a short workshop on giving specific rather than generic feedback during practice',
}

function InsightCard({
  eyebrow,
  body,
  actionLabel,
  onAction,
}: {
  eyebrow: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{eyebrow}</p>
      <p className="mt-2 text-sm text-ink">{body}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-3 text-sm font-semibold text-brand-600 hover:text-brand-500">
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

function DashboardPanel({ overview, onNavigate }: { overview: AdminOverview; onNavigate: (tab: Tab) => void }) {
  const participationPct =
    overview.totalTeachers > 0 ? Math.round((overview.activeThisWeek / overview.totalTeachers) * 100) : 0
  const priorActiveCount =
    overview.weeklyActivity.length >= 2 ? overview.weeklyActivity[overview.weeklyActivity.length - 2].activeCount : null
  const priorParticipationPct =
    priorActiveCount != null && overview.totalTeachers > 0
      ? Math.round((priorActiveCount / overview.totalTeachers) * 100)
      : null

  const topPriorityEntry = Object.entries(overview.priorityTally)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)[0]
  const topPriorityConfidence = topPriorityEntry ? confidenceFor(topPriorityEntry[1].count) : 'none'
  const topPriorityLabel = topPriorityEntry ? (PRIORITY_LABELS[topPriorityEntry[0]] ?? topPriorityEntry[0]) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Licensed staff" value={String(overview.totalTeachers)} sub="Accounts with teacher access" />
        <StatCard
          label="Activated accounts"
          value={String(overview.activatedAccounts)}
          sub="Finished onboarding"
        />
        <StatCard label="Active this period" value={String(overview.activeThisWeek)} sub={`${participationPct}% of licensed staff`} />
        <StatCard label="Returning users" value={String(overview.returningUsers)} sub="Active this period and the one before" />
        <StatCard label="Coaching activities" value={String(overview.activitiesThisWeek)} sub="This period" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard
          eyebrow="Participation"
          body={
            priorParticipationPct == null
              ? `${participationPct}% of teachers used Wivoza this period.`
              : `${participationPct}% of teachers used Wivoza this period, ${
                  participationPct >= priorParticipationPct ? 'up' : 'down'
                } from ${priorParticipationPct}% last period.`
          }
          actionLabel="View engagement"
          onAction={() => onNavigate('engagement')}
        />
        <InsightCard
          eyebrow="Emerging need"
          body={
            topPriorityConfidence === 'none' || !topPriorityLabel
              ? 'Not enough Lesson Debrief data yet to identify a shared growth area.'
              : `${topPriorityLabel} appeared as the most common instructional growth area${topPriorityConfidence === 'limited' ? ' (limited data so far)' : ''}.`
          }
          actionLabel={topPriorityConfidence !== 'none' ? 'Explore evidence' : undefined}
          onAction={topPriorityConfidence !== 'none' ? () => onNavigate('insights') : undefined}
        />
        <InsightCard
          eyebrow="Recommended action"
          body={
            topPriorityConfidence === 'none' || !topPriorityEntry
              ? "Once more Lesson Debrief sessions come in, we'll surface a specific recommendation here."
              : `Consider ${PD_SUGGESTIONS[topPriorityEntry[0]] ?? 'a shared PD session on this theme'}.`
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <WeeklyActivityChart data={overview.weeklyActivity} />
        </div>
        <FeatureAdoptionCard data={overview.featureAdoption} totalTeachers={overview.totalTeachers} />
      </div>
    </div>
  )
}

function FeatureAdoptionCard({ data, totalTeachers }: { data: AdminOverview['featureAdoption']; totalTeachers: number }) {
  const entries = (Object.entries(data) as [keyof typeof data, number][]).sort((a, b) => b[1] - a[1])
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Feature adoption</h2>
      <p className="text-xs text-ink-soft">Share of teachers who have tried each feature at least once, ever</p>
      <div className="mt-3 flex flex-col gap-3">
        {entries.map(([key, teacherCount]) => {
          const pct = totalTeachers > 0 ? Math.round((teacherCount / totalTeachers) * 100) : 0
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{FEATURE_ACTIVITY_META[key].label}</span>
                <span className="text-sm font-semibold text-ink">
                  {pct}% · {teacherCount} of {totalTeachers}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EngagementPanel({ overview }: { overview: AdminOverview }) {
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

      <FeatureAdoptionCard data={overview.featureAdoption} totalTeachers={overview.totalTeachers} />
    </div>
  )
}

// A compact "top N" list for the Coaching Insights Overview tab — distinct
// from TallyBarList (which always shows the full breakdown with bars); this
// is a quick teaser pointing at the dedicated tab for the full picture.
function TopNList({
  tally,
  labelFor,
  n,
  emptyText,
}: {
  tally: Record<string, TallyEntry>
  labelFor: (value: string) => string
  n: number
  emptyText: string
}) {
  const top = Object.entries(tally)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
  if (top.length === 0) return <p className="mt-2 text-sm text-ink-soft">{emptyText}</p>
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {top.map(([value, { count, teachers }]) => (
        <div key={value} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink">{labelFor(value)}</span>
          <span className="text-ink-soft">
            {count} · {teachers} teachers
          </span>
        </div>
      ))}
    </div>
  )
}

function StrengthsCard({ strengths }: { strengths: Strength[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Top shared strengths</h2>
      {strengths.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Not enough data yet to confidently name a staff-wide strength.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {strengths.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink">{s.label}</span>
              <span className="flex items-center gap-1.5 font-semibold text-ink">
                {s.value}%
                <ConfidenceBadge level={s.confidence} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Naive sum for a quick Overview-tab teaser only — a teacher present in
// both source tallies gets double-counted in `teachers` here. The
// Communication & Meetings tab below shows challengeTally/messagePurposeTally
// separately with their real, non-approximated counts.
function mergeTallies(a: Record<string, TallyEntry>, b: Record<string, TallyEntry>): Record<string, TallyEntry> {
  const merged: Record<string, TallyEntry> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    merged[k] = merged[k] ? { count: merged[k].count + v.count, teachers: merged[k].teachers + v.teachers } : v
  }
  return merged
}

type InsightsTab = 'overview' | 'practice' | 'climate' | 'communication'
const INSIGHTS_TABS: { id: InsightsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'practice', label: 'Classroom practice' },
  { id: 'climate', label: 'Classroom climate' },
  { id: 'communication', label: 'Communication & meetings' },
]

function CoachingInsightsPanel({ overview, selectedOrgId }: { overview: AdminOverview; selectedOrgId: string }) {
  const [tab, setTab] = useState<InsightsTab>('overview')
  const communicationLabel = (v: string) => challengeLabel(v) ?? purposeLabel(v) ?? v

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-fit gap-1 rounded-xl bg-canvas p-1">
        {INSIGHTS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <StrengthsCard strengths={overview.strengths} />

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Top shared growth areas</h2>
            <TopNList
              tally={overview.priorityTally}
              labelFor={(v) => PRIORITY_LABELS[v] ?? v}
              n={3}
              emptyText="Not enough Lesson Debrief data yet."
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Most practiced classroom situations
            </h2>
            <TopNList tally={overview.categoryTally} labelFor={categoryLabel} n={3} emptyText="No practice activity yet." />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Most common communication needs
            </h2>
            <TopNList
              tally={mergeTallies(overview.challengeTally, overview.messagePurposeTally)}
              labelFor={communicationLabel}
              n={3}
              emptyText="No communication activity yet."
            />
          </div>

          <BreakdownCard selectedOrgId={selectedOrgId} />
        </>
      )}

      {tab === 'practice' && (
        <>
          <InstructionalAveragesCard
            data={overview.instructionalAverages}
            insight={buildInstructionalGroupInsight(overview.instructionalAverages)}
          />
          <TallyBarList
            title="Lesson Debrief: coaching priority, in full"
            comment="Based on each analyzed session's own measured numbers — a short recording or one with too little evidence on a given metric doesn't count toward any priority, so totals here can be lower than the number of sessions recorded."
            tally={overview.priorityTally}
            labelFor={(v) => PRIORITY_LABELS[v] ?? v}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(
              overview.priorityTally,
              (v) => PRIORITY_LABELS[v] ?? v,
              'coaching priority',
              'sessions with a clear priority',
            )}
          />
          <TallyBarList
            title="Content specialist notes, by theme"
            comment="Which content-note themes (Clarity, Vocabulary, Engagement, Worth double-checking) come up most across your staff's recordings."
            tally={overview.contentNoteTally}
            labelFor={(v) => v}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(overview.contentNoteTally, (v) => v, 'content note theme', 'content notes')}
          />
        </>
      )}

      {tab === 'climate' && (
        <ClimateAveragesCard data={overview.climateAverages} insight={buildClimateGroupInsight(overview.climateAverages)} />
      )}

      {tab === 'communication' && (
        <>
          <TallyBarList
            title="Conversations practiced, by challenge"
            comment="The kinds of difficult conversations your staff are rehearsing before having them for real."
            tally={overview.challengeTally}
            labelFor={(v) => challengeLabel(v) ?? v}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(
              overview.challengeTally,
              (v) => challengeLabel(v) ?? v,
              'conversation type',
              'conversations practiced',
            )}
          />
          <TallyBarList
            title="Messages written, by purpose"
            comment="What teachers are reaching out to parents, colleagues, or administrators about most."
            tally={overview.messagePurposeTally}
            labelFor={(v) => purposeLabel(v) ?? v}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(
              overview.messagePurposeTally,
              (v) => purposeLabel(v) ?? v,
              'message purpose',
              'messages written',
            )}
          />
        </>
      )}
    </div>
  )
}

// School-facing staff roster — the org-scoped member list, visible to an
// org_admin viewing their own org or a superadmin who's selected one. This
// is deliberately separate from the platform-wide, Wivoza-internal
// UsersPanel below: a principal should see their own staff, never a
// cross-tenant list of every independent teacher on the platform.
function PeoplePanel({
  selectedOrgId,
  onOrgChange,
  orgs,
  isSuperadmin,
  overview,
}: {
  selectedOrgId: string
  onOrgChange: (id: string) => void
  orgs: Organization[]
  isSuperadmin: boolean
  overview: AdminOverview | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink md:text-[34px]">People</h1>
          <p className="mt-1 text-sm text-ink-soft">Your school&rsquo;s staff roster.</p>
        </div>
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          >
            <option value="">Select an organization</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!overview ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : overview.scope === 'organization' ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <MembersList organizationId={selectedOrgId || undefined} isSuperadmin={isSuperadmin} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">Select an organization above to view its staff roster.</p>
      )}
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Platform users</h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        Every user across every organization, including independent teachers not part of any school — Wivoza-internal
        only.
      </p>
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
