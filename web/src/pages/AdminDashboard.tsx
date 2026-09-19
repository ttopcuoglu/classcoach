import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  archivePdFocusArea,
  createOrganization,
  createPdFocusArea,
  deleteOrganization,
  deleteUser,
  getAdminBreakdown,
  getAdminFocusAreas,
  type AdminFocusAreas,
  getAdminExportUrl,
  getAdminOverview,
  getAdminUsers,
  getMe,
  getOrganizationMembers,
  getOrganizations,
  getPdFocusAreas,
  removeMember,
  suspendMember,
  suspendUser,
  updateMember,
  updateUser,
  updateOrganization,
  type AdminBreakdown,
  type AdminOverview,
  type AdminUser,
  type JobTitle,
  type MemberEdits,
  type ClimateAverages,
  type DataConfidence,
  type InstructionalAverages,
  type Organization,
  type OrgMember,
  type PdFocusArea,
  type Strength,
  type TallyEntry,
  type UserProfile,
  getSchoolInquiries,
  updateSchoolInquiryStatus,
  type SchoolInquiry,
} from '../lib/api'
import { ACCENT_CYCLE, type Accent } from '../components/report'
import { categoryLabel } from '../lib/categories'
import {
  buildSchoolGlance,
  describeSnapshot,
  describeTrend,
  nextUntrackedNeed,
  PD_SUGGESTIONS,
  PRIORITY_LABELS,
  PRIORITY_MEANING,
  STRENGTH_MEANING,
} from '../lib/adminLabels'
import { FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import { CHALLENGE_TYPES, MESSAGE_PURPOSES, challengeLabel, purposeLabel } from '../lib/communicationOptions'
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
  'rounded-xl border border-hairline bg-cream px-3.5 py-2.5 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60'

const primaryButtonClass =
  'rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft'

type AnalyticsTab = 'dashboard' | 'engagement' | 'insights'
type Tab = AnalyticsTab | 'professionalLearning' | 'people' | 'organizations' | 'platformUsers' | 'schoolInquiries'

const ANALYTICS_META: Record<AnalyticsTab, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Are teachers using Wivoza, and what should you do next.' },
  engagement: { title: 'Adoption & engagement', subtitle: 'How consistently your staff is using Wivoza.' },
  insights: { title: 'Coaching insights', subtitle: 'Shared strengths and growth areas emerging across your staff.' },
}

function navButtonClass(active: boolean) {
  return `flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
    active ? 'bg-forest font-semibold text-cream' : 'text-ink-soft hover:bg-cream hover:text-ink'
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
            <button
              type="button"
              onClick={() => setTab('professionalLearning')}
              className={navButtonClass(tab === 'professionalLearning')}
            >
              Professional Learning
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
              <button
                type="button"
                onClick={() => setTab('schoolInquiries')}
                className={navButtonClass(tab === 'schoolInquiries')}
              >
                School inquiries
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

        {overviewError && <p className="text-sm text-terracotta-600">{overviewError}</p>}

        {isAnalyticsTab && !overview && !overviewError && <p className="text-sm text-ink-soft">Loading...</p>}

        {tab === 'dashboard' && overview && (
          <DashboardPanel overview={overview} organizationId={selectedOrgId || undefined} onNavigate={setTab} />
        )}
        {tab === 'engagement' && overview && <EngagementPanel overview={overview} />}
        {tab === 'insights' && overview && (
          <CoachingInsightsPanel overview={overview} selectedOrgId={selectedOrgId} />
        )}
        {tab === 'professionalLearning' && (
          <PdFocusAreaPanel
            selectedOrgId={selectedOrgId}
            onOrgChange={handleOrgChange}
            orgs={orgs}
            isSuperadmin={isSuperadmin}
            overview={overview}
          />
        )}
        {tab === 'people' && (
          <PeoplePanel
            selectedOrgId={selectedOrgId}
            onOrgChange={handleOrgChange}
            orgs={orgs}
            isSuperadmin={isSuperadmin}
            currentUserId={me?.id ?? null}
            overview={overview}
          />
        )}
        {tab === 'organizations' && <OrganizationsPanel />}
        {tab === 'platformUsers' && <UsersPanel currentUserId={me?.id ?? null} />}
        {tab === 'schoolInquiries' && <SchoolInquiriesPanel />}
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
      active ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'
    }`

  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-4 bg-cream px-4 pb-4 pt-1 md:-mx-10 md:px-10">
      <div>
        {overview?.organizationName ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">{overview.organizationName}</p>
        ) : (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Platform-wide</p>
        )}
        <h1 className="mt-0.5 font-heading text-2xl font-extrabold text-forest md:text-[34px]">
          {meta.title}
          <span className="text-gold">.</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{meta.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-cream-card p-2.5 shadow-sm">
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-xl border border-hairline bg-cream px-2.5 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
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
            className="rounded-xl border border-hairline bg-cream px-2 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={defaultEndDate()}
            onChange={(e) => onCustomDateChange('end', e.target.value)}
            className="rounded-xl border border-hairline bg-cream px-2 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
          />
        </div>

        <select
          value={gradeBand}
          onChange={(e) => onGradeBandChange(e.target.value)}
          className="rounded-xl border border-hairline bg-cream px-2.5 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
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
          className="rounded-xl border border-hairline bg-cream px-2.5 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
        >
          <option value="">All subjects</option>
          {SUBJECT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Link
          to={`/admin/pilot-report?${new URLSearchParams({
            ...(selectedOrgId ? { organizationId: selectedOrgId } : {}),
            startDate,
            endDate,
          }).toString()}`}
          className="ml-auto rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-cream hover:bg-forest/90"
        >
          Pilot report (PDF)
        </Link>
        <a
          href={getAdminExportUrl({ organizationId: selectedOrgId || undefined, startDate, endDate, gradeBand: gradeBand || undefined, subject: subject || undefined })}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600"
        >
          Export data (CSV)
        </a>
      </div>

      {(gradeBand || subject) && (
        <p className="-mt-2 text-xs text-ink-soft">
          Grade band and subject filters only apply to Lesson Debrief data — usage counts elsewhere (Try It Out,
          Communications, Ask &amp; Practice) don&rsquo;t have a grade/subject dimension to filter by.
        </p>
      )}

      {tab === 'dashboard' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-mint-tint bg-mint-tint/60 px-4 py-2.5 text-sm text-forest">
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
      <p className="text-[10px] text-ink-soft">Most in one week: {maxCount}</p>
      <div className="relative mt-6">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
          <path d={path} fill="none" stroke="var(--color-terracotta)" strokeWidth={2} strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-terracotta)" />
          ))}
        </svg>
        {points.map((p, i) => (
          <span
            key={i}
            className="absolute text-[10px] font-semibold text-ink"
            style={{ left: `${p.xPct}%`, top: `${(p.y / height) * 100}%`, transform: 'translate(-50%, calc(-100% - 4px))' }}
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

// Tinted like the report's stat tiles. The colour is picked from the label so
// a given number keeps the same colour wherever it appears.
const STAT_TINTS = [
  { card: 'bg-peach-tint/60', ink: 'text-terracotta-600' },
  { card: 'bg-gold-tint/60', ink: 'text-terracotta-600' },
  { card: 'bg-mint-tint/60', ink: 'text-forest' },
]
function tintFor(label: string) {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return STAT_TINTS[h % STAT_TINTS.length]
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  const tint = tintFor(label)
  return (
    <div className={`rounded-2xl p-5 ${tint.card}`}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${tint.ink}`}>{label}</p>
      <p className="mt-1.5 font-heading text-3xl font-extrabold text-forest">{value}</p>
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

const INACTIVE_THRESHOLD_DAYS = 14

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function memberStatusLabel(member: OrgMember): 'Suspended' | 'Never active' | 'Inactive' | 'Active' {
  if (member.suspendedAt) return 'Suspended'
  const d = daysSince(member.lastActiveAt)
  if (d == null) return 'Never active'
  if (d > INACTIVE_THRESHOLD_DAYS) return 'Inactive'
  return 'Active'
}

// How each roster status reads to a principal, and what it means.
const STATUS_META: Record<ReturnType<typeof memberStatusLabel>, { label: string; meaning: string; chip: string; tile: string }> = {
  Active: { label: 'Active', meaning: 'Used Wivoza in the last 14 days.', chip: 'bg-mint-tint text-forest', tile: 'bg-mint-tint/60' },
  Inactive: { label: 'Inactive', meaning: 'Used it before, but not in the last 14 days.', chip: 'bg-gold-tint text-terracotta-600', tile: 'bg-gold-tint/60' },
  'Never active': { label: 'Not started', meaning: "Has an account but hasn't used it yet.", chip: 'bg-peach-tint text-terracotta-600', tile: 'bg-peach-tint/60' },
  Suspended: { label: 'Suspended', meaning: "Can't sign in until you unsuspend them.", chip: 'bg-hairline text-ink-soft', tile: 'bg-cream' },
}
const STATUS_ORDER = ['Active', 'Inactive', 'Never active', 'Suspended'] as const

function lastActiveText(iso: string | null): string {
  const d = daysSince(iso)
  if (d == null) return 'Never'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 14) return `${d} days ago`
  return new Date(iso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function memberRoleLabel(role: OrgMember['role']): string {
  return role === 'org_admin' ? 'Admin' : role === 'superadmin' ? 'Superadmin' : 'Teacher'
}

type MemberSortKey = 'name' | 'role' | 'status' | 'lastActive' | 'joined'

function SortableTh<K extends string>({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string
  sortKey: K
  active: K
  dir: 'asc' | 'desc'
  onSort: (key: K) => void
}) {
  const isActive = active === sortKey
  return (
    <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
      <button type="button" onClick={() => onSort(sortKey)} className="flex items-center gap-1 hover:text-ink">
        {label}
        <span aria-hidden="true" className={isActive ? 'text-ink' : 'text-ink-soft/40'}>
          {isActive && dir === 'desc' ? '↓' : '↑'}
        </span>
      </button>
    </th>
  )
}

// A real searchable, sortable table — replaces the earlier card list, which
// had no way to find or reorder anyone once a roster grew past a handful of
// names.
const JOB_TITLES: JobTitle[] = ['Teacher', 'Instructional Coach', 'Assistant Principal', 'Principal', 'District Leader', 'Other']

// Pinned to the table's right edge: both rosters are wider than a laptop
// window, and macOS hides the horizontal scrollbar, so an ordinary last
// column left every Suspend/Delete button invisible off-screen.
const ACTIONS_TH_CLASS =
  'sticky right-0 bg-cream px-3.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]'
const ACTIONS_TD_CLASS = 'sticky right-0 bg-cream-card px-3.5 py-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]'

type EditValues = { name: string; jobTitle: JobTitle | ''; role: 'teacher' | 'org_admin'; organizationId: string }

// Opens under the row being edited. School is offered only on the
// platform-wide list (a school admin can't move people between schools),
// and email is never editable — it's how the person signs in.
function EditUserRow({
  colSpan,
  initial,
  roleLocked,
  orgs,
  onSave,
  onCancel,
}: {
  colSpan: number
  initial: EditValues
  roleLocked: boolean
  orgs?: Organization[]
  onSave: (values: EditValues) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const independent = orgs !== undefined && !values.organizationId

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(independent ? { ...values, role: 'teacher' } : values)
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <tr className="border-b border-hairline/60 bg-cream/60">
      <td colSpan={colSpan} className="px-3.5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Name
            <input
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              maxLength={100}
              className={`${inputClass} w-52`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Job title
            <select
              value={values.jobTitle}
              onChange={(e) => setValues({ ...values, jobTitle: e.target.value as JobTitle | '' })}
              className={`${inputClass} w-48`}
            >
              <option value="">Not set</option>
              {JOB_TITLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {orgs !== undefined && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              School
              <select
                value={values.organizationId}
                onChange={(e) => setValues({ ...values, organizationId: e.target.value })}
                disabled={roleLocked}
                className={`${inputClass} w-52`}
              >
                <option value="">Independent</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Role
            <select
              value={independent ? 'teacher' : values.role}
              onChange={(e) => setValues({ ...values, role: e.target.value as EditValues['role'] })}
              disabled={roleLocked || independent}
              className={`${inputClass} w-40`}
            >
              <option value="teacher">Teacher</option>
              <option value="org_admin">School admin</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-cream disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-2 py-2 text-xs font-medium text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
        {roleLocked && <p className="mt-2 text-xs text-ink-soft">A superadmin's role and school can't be changed here.</p>}
        {independent && !roleLocked && (
          <p className="mt-2 text-xs text-ink-soft">Independent teachers can't be school admins.</p>
        )}
        {error && <p className="mt-2 text-xs text-terracotta-600">{error}</p>}
      </td>
    </tr>
  )
}

function editsFrom(values: EditValues): MemberEdits {
  return { name: values.name.trim() || null, jobTitle: values.jobTitle || null, role: values.role }
}

// ---- Bulk selection, shared by both rosters ----
//
// Selection only ever counts rows the current filters show: a filter change
// can't leave hidden accounts selected and then sweep them into a delete.
// Your own account and superadmins are never selectable.

type BulkOutcome = { done: number; failures: string[] }

// One request per person, a few at a time — the per-user routes already
// carry every permission and self-protection check, so bulk adds no new
// server surface, and one refusal doesn't abort the rest.
async function runBulk<T extends { id: string; name: string | null; email: string }>(
  people: T[],
  action: (person: T) => Promise<unknown>,
): Promise<BulkOutcome> {
  const failures: string[] = []
  let done = 0
  for (let i = 0; i < people.length; i += 5) {
    const batch = people.slice(i, i + 5)
    const results = await Promise.allSettled(batch.map((p) => action(p)))
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') done += 1
      else failures.push(`${batch[j].name ?? batch[j].email}: ${(r.reason as Error).message}`)
    })
  }
  return { done, failures }
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Select all shown"
      title="Select everyone the current filters show"
      className="h-4 w-4 cursor-pointer accent-forest disabled:cursor-default"
    />
  )
}

function RowCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: () => void
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={`Select ${label}`}
      className="h-4 w-4 cursor-pointer accent-forest disabled:cursor-not-allowed disabled:opacity-30"
    />
  )
}

type BulkAction = { key: string; label: string; danger?: boolean; count: number; run: () => void }

function BulkBar({
  selectedCount,
  actions,
  busy,
  outcome,
  onClear,
}: {
  selectedCount: number
  actions: BulkAction[]
  busy: string | null
  outcome: string | null
  onClear: () => void
}) {
  if (selectedCount === 0 && !outcome) return null
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-hairline bg-mint-tint/40 px-3.5 py-2.5">
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-forest">{selectedCount} selected</span>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.run}
              disabled={busy !== null || a.count === 0}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
                a.danger
                  ? 'border-terracotta/40 bg-cream-card text-terracotta-600 hover:bg-peach-tint'
                  : 'border-hairline bg-cream-card text-ink hover:bg-cream'
              }`}
            >
              {busy === a.key ? 'Working...' : `${a.label}${a.count !== selectedCount ? ` (${a.count})` : ''}`}
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            disabled={busy !== null}
            className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-40"
          >
            Clear selection
          </button>
        </div>
      )}
      {outcome && <p className="whitespace-pre-line text-xs text-ink">{outcome}</p>}
    </div>
  )
}

function describeOutcome(verb: string, outcome: BulkOutcome): string {
  const lines = [`${verb} ${outcome.done} ${outcome.done === 1 ? 'account' : 'accounts'}.`]
  if (outcome.failures.length > 0) {
    lines.push(`Couldn't do ${outcome.failures.length}:`, ...outcome.failures.map((f) => `· ${f}`))
  }
  return lines.join('\n')
}

// Deleting in bulk is irreversible and cascades to everyone's recordings and
// notes, so it asks for the word, not just an OK.
function confirmBulkDelete(people: { name: string | null; email: string }[]): boolean {
  const preview = people
    .slice(0, 5)
    .map((p) => `  · ${p.name ? `${p.name} (${p.email})` : p.email}`)
    .join('\n')
  const more = people.length > 5 ? `\n  …and ${people.length - 5} more` : ''
  const typed = window.prompt(
    `Permanently delete ${people.length} ${people.length === 1 ? 'account' : 'accounts'} and all their data?\n\n${preview}${more}\n\nThis cannot be undone. Type DELETE to confirm.`,
  )
  return typed?.trim() === 'DELETE'
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const filterSelectClass =
  'rounded-xl border border-hairline bg-cream px-2.5 py-1.5 text-xs text-ink focus:border-terracotta focus:outline-none'

type MemberStatusFilter = 'all' | 'Active' | 'Inactive' | 'Never active' | 'Suspended'

function MembersList({
  organizationId,
  isSuperadmin,
  currentUserId,
}: {
  organizationId?: string
  isSuperadmin: boolean
  currentUserId: string | null
}) {
  const [members, setMembers] = useState<OrgMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'teacher' | 'org_admin'>('all')
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('all')
  const [sortKey, setSortKey] = useState<MemberSortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [bulkOutcome, setBulkOutcome] = useState<string | null>(null)

  function refresh() {
    setError(null)
    getOrganizationMembers(organizationId)
      .then(setMembers)
      .catch(() => setError('Could not load members.'))
  }

  useEffect(() => {
    setMembers(null)
    setSelected(new Set())
    setBulkOutcome(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  function handleSort(key: MemberSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = (members ?? []).filter(
    (m) =>
      (!query ||
        (m.name ?? '').toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        (m.jobTitle ?? '').toLowerCase().includes(query)) &&
      (roleFilter === 'all' || m.role === roleFilter) &&
      (statusFilter === 'all' || memberStatusLabel(m) === statusFilter),
  )

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = (a.name ?? a.email).localeCompare(b.name ?? b.email)
    else if (sortKey === 'role') cmp = memberRoleLabel(a.role).localeCompare(memberRoleLabel(b.role))
    else if (sortKey === 'status') cmp = memberStatusLabel(a).localeCompare(memberStatusLabel(b))
    else if (sortKey === 'lastActive') cmp = (daysSince(a.lastActiveAt) ?? Infinity) - (daysSince(b.lastActiveAt) ?? Infinity)
    else if (sortKey === 'joined') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })

  const isSelectable = (m: OrgMember) => m.role !== 'superadmin' && m.id !== currentUserId
  const selectable = sorted.filter(isSelectable)
  const picked = selectable.filter((m) => selected.has(m.id))
  const allPicked = selectable.length > 0 && picked.length === selectable.length

  function toggle(id: string) {
    setBulkOutcome(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setBulkOutcome(null)
    setSelected(allPicked ? new Set() : new Set(selectable.map((m) => m.id)))
  }

  async function bulk(key: string, verb: string, people: OrgMember[], action: (m: OrgMember) => Promise<unknown>) {
    setBulkBusy(key)
    const outcome = await runBulk(people, action)
    setBulkBusy(null)
    setSelected(new Set())
    setBulkOutcome(describeOutcome(verb, outcome))
    refresh()
  }

  const toSuspend = picked.filter((m) => !m.suspendedAt)
  const toUnsuspend = picked.filter((m) => m.suspendedAt)
  const actions: BulkAction[] = [
    {
      key: 'suspend',
      label: 'Suspend',
      count: toSuspend.length,
      run: () => {
        if (
          !window.confirm(
            `Suspend ${plural(toSuspend.length, 'person', 'people')}? They won't be able to sign in until unsuspended. Their data is kept.`,
          )
        ) {
          return
        }
        void bulk('suspend', 'Suspended', toSuspend, (m) => suspendMember(m.id, true, organizationId))
      },
    },
    {
      key: 'unsuspend',
      label: 'Unsuspend',
      count: toUnsuspend.length,
      run: () => void bulk('unsuspend', 'Unsuspended', toUnsuspend, (m) => suspendMember(m.id, false, organizationId)),
    },
    {
      key: 'remove',
      label: 'Remove from school',
      count: picked.length,
      run: () => {
        if (
          !window.confirm(
            `Remove ${plural(picked.length, 'person', 'people')} from this school? They become independent — no data is lost.`,
          )
        ) {
          return
        }
        void bulk('remove', 'Removed', picked, (m) => removeMember(m.id, organizationId))
      },
    },
  ]
  if (isSuperadmin) {
    actions.push({
      key: 'delete',
      label: 'Delete',
      danger: true,
      count: picked.length,
      run: () => {
        if (!confirmBulkDelete(picked)) return
        void bulk('delete', 'Deleted', picked, (m) => deleteUser(m.id))
      },
    })
  }

  const counts = Object.fromEntries(
    STATUS_ORDER.map((st) => [st, (members ?? []).filter((m) => memberStatusLabel(m) === st).length]),
  ) as Record<(typeof STATUS_ORDER)[number], number>
  const needsNudge = counts['Never active'] + counts.Inactive > 0
  const rosterN = needsNudge ? 3 : 2

  return (
    <div className="flex flex-col gap-6">
      {members && members.length > 0 && (
        <AdminCard
          n={1}
          title="Staff at a glance"
          question="Who is using Wivoza right now. Tap a box to see just those people below."
          howToRead="Everyone with a Wivoza account at your school, grouped by when they last used any part of it. You see names and dates only, never what anyone recorded, wrote or practiced."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {STATUS_ORDER.map((st) => {
              const on = statusFilter === st
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(on ? 'all' : st)}
                  className={`rounded-2xl p-4 text-left transition-shadow ${STATUS_META[st].tile} ${
                    on ? 'ring-2 ring-forest' : 'hover:shadow-md'
                  }`}
                >
                  <p className="font-heading text-3xl font-extrabold text-forest">{counts[st]}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{STATUS_META[st].label}</p>
                  <p className="text-xs text-ink-soft">{STATUS_META[st].meaning}</p>
                </button>
              )
            })}
          </div>
        </AdminCard>
      )}

      {members && needsNudge && <NudgeCard n={2} members={members} />}

      <AdminCard
        n={rosterN}
        title="Your staff"
        question={`Everyone at your school with a Wivoza account${members ? ` (${members.length})` : ''}.`}
        howToRead="Last active is the last time someone used any part of Wivoza. Edit changes a name, job title or role; Suspend stops someone signing in until you unsuspend them; Remove takes them off your school without deleting anything of theirs. Select several people to do the same thing to all of them at once."
      >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            aria-label="Filter by role"
            className={filterSelectClass}
          >
            <option value="all">All roles</option>
            <option value="teacher">Teachers</option>
            <option value="org_admin">Admins</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MemberStatusFilter)}
            aria-label="Filter by status"
            className={filterSelectClass}
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Never active">Not started</option>
            <option value="Suspended">Suspended</option>
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or title"
            className={`${inputClass} w-full max-w-xs`}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
      <BulkBar
        selectedCount={picked.length}
        actions={actions}
        busy={bulkBusy}
        outcome={bulkOutcome}
        onClear={() => {
          setSelected(new Set())
          setBulkOutcome(null)
        }}
      />
      {!members ? (
        <p className="mt-3 text-sm text-ink-soft">Loading...</p>
      ) : members.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No members yet.</p>
      ) : sorted.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No members match these filters.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[760px] border-collapse bg-cream-card text-sm">
            <thead>
              <tr className="border-b border-hairline bg-cream">
                <th className="w-10 px-3.5 py-2.5 text-left">
                  <SelectAllCheckbox
                    checked={allPicked}
                    indeterminate={picked.length > 0 && !allPicked}
                    disabled={selectable.length === 0 || bulkBusy !== null}
                    onChange={toggleAll}
                  />
                </th>
                <SortableTh label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Role" sortKey="role" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Status" sortKey="status" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Last active" sortKey="lastActive" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Joined" sortKey="joined" active={sortKey} dir={sortDir} onSort={handleSort} />
                <th className={ACTIONS_TH_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  organizationId={organizationId}
                  isSuperadmin={isSuperadmin}
                  selected={selected.has(m.id)}
                  selectable={isSelectable(m) && bulkBusy === null}
                  onToggle={() => toggle(m.id)}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      </AdminCard>
    </div>
  )
}

// The two groups worth a word from the principal, with a way to reach them:
// Copy emails puts the addresses on the clipboard for the admin's own email
// — Wivoza never sends anything on their behalf.
function NudgeCard({ n, members }: { n: number; members: OrgMember[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const groups = [
    {
      key: 'Never active' as const,
      title: 'Haven\u2019t started yet',
      advice: 'A two-minute demo at a staff meeting usually works better than another invite email. Showing one real feature, like Talk It Through, is enough.',
    },
    {
      key: 'Inactive' as const,
      title: 'Tried it, then stopped',
      advice: 'A personal \u201chow\u2019s it going?\u201d tends to bring people back. Ask what got in the way; it\u2019s often time, and the 5-minute tools answer that.',
    },
  ]
    .map((g) => ({ ...g, people: members.filter((m) => memberStatusLabel(m) === g.key) }))
    .filter((g) => g.people.length > 0)

  async function copy(key: string, people: OrgMember[]) {
    try {
      await navigator.clipboard.writeText(people.map((p) => p.email).join(', '))
      setCopied(key)
    } catch {
      setCopied(null)
    }
  }

  return (
    <AdminCard
      n={n}
      title="Who to nudge"
      question="Teachers who haven't started, or who drifted off, and what tends to help."
      howToRead="Based only on when people last used Wivoza. Copy emails puts their addresses on your clipboard so you can write to them yourself; Wivoza doesn't send anything for you."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.key} className={`flex flex-col rounded-2xl p-4 ${STATUS_META[g.key].tile}`}>
            <p className="text-sm font-semibold text-ink">
              {g.title} <span className="font-normal text-ink-soft">· {plural(g.people.length, 'teacher', 'teachers')}</span>
            </p>
            <p className="mt-1 text-xs text-ink-soft">{g.people.map((p) => p.name ?? p.email).join(', ')}</p>
            <p className="mt-2 flex-1 text-sm text-ink">{g.advice}</p>
            <button
              type="button"
              onClick={() => copy(g.key, g.people)}
              className="mt-3 self-start rounded-full border border-hairline bg-cream-card px-3 py-1 text-xs font-semibold text-ink hover:border-terracotta/40"
            >
              {copied === g.key ? 'Copied' : `Copy ${g.people.length === 1 ? 'email' : 'emails'}`}
            </button>
          </div>
        ))}
      </div>
    </AdminCard>
  )
}

function MemberRow({
  member,
  organizationId,
  isSuperadmin,
  selected,
  selectable,
  onToggle,
  onChanged,
}: {
  member: OrgMember
  organizationId?: string
  isSuperadmin: boolean
  selected: boolean
  selectable: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A superadmin who happens to belong to a school is shown on its roster,
  // but only the platform-wide list can act on them.
  const actionable = member.role !== 'superadmin'
  const status = memberStatusLabel(member)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  function handleRemove() {
    if (!window.confirm(`Remove ${member.name ?? member.email} from this organization? They become independent — no data is lost.`)) {
      return
    }
    void run(() => removeMember(member.id, organizationId))
  }

  function handleSuspendToggle() {
    if (
      !member.suspendedAt &&
      !window.confirm(
        `Suspend ${member.name ?? member.email}? They won't be able to sign in until you unsuspend them. Their data is kept.`,
      )
    ) {
      return
    }
    void run(() => suspendMember(member.id, !member.suspendedAt, organizationId))
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Permanently delete ${member.name ?? member.email}'s account and all their data? This cannot be undone.`,
      )
    ) {
      return
    }
    void run(() => deleteUser(member.id))
  }

  return (
    <>
      <tr className={`border-b border-hairline/60 align-top last:border-0 ${selected ? 'bg-mint-tint/30' : ''}`}>
        <td className="px-3.5 py-3">
          <RowCheckbox checked={selected} disabled={!selectable} label={member.name ?? member.email} onChange={onToggle} />
        </td>
        <td className="max-w-[15rem] px-3.5 py-3">
          <p className="text-sm font-semibold text-ink">{member.name ?? member.email}</p>
          <p className="text-xs text-ink-soft">
            {member.email}
            {member.jobTitle ? ` · ${member.jobTitle}` : ''}
          </p>
        </td>
        <td className="whitespace-nowrap px-3.5 py-3">
          {member.role === 'org_admin' ? (
            <span className="rounded-full bg-mint-tint/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest">
              Admin
            </span>
          ) : (
            <span className="text-sm text-ink-soft">{memberRoleLabel(member.role)}</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3.5 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[status].chip}`}
            title={STATUS_META[status].meaning}
          >
            {STATUS_META[status].label}
          </span>
        </td>
        <td className="whitespace-nowrap px-3.5 py-3 text-sm text-ink-soft">{lastActiveText(member.lastActiveAt)}</td>
        <td className="whitespace-nowrap px-3.5 py-3 text-sm text-ink-soft">
          {new Date(member.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td className={ACTIONS_TD_CLASS}>
          {actionable ? (
            <div className="flex items-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                disabled={busy}
                className="text-xs font-medium text-forest hover:text-ink disabled:opacity-50"
              >
                Edit
              </button>
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
                onClick={handleRemove}
                disabled={busy}
                className="text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-50"
              >
                Remove
              </button>
              {isSuperadmin && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="text-xs font-medium text-terracotta-600 hover:text-terracotta-600 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-ink-soft">—</span>
          )}
          {error && <p className="mt-1 text-xs text-terracotta-600">{error}</p>}
        </td>
      </tr>
      {editing && (
        <EditUserRow
          colSpan={7}
          initial={{
            name: member.name ?? '',
            jobTitle: member.jobTitle ?? '',
            role: member.role === 'org_admin' ? 'org_admin' : 'teacher',
            organizationId: '',
          }}
          roleLocked={false}
          onSave={async (values) => {
            await updateMember(member.id, editsFrom(values), organizationId)
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </>
  )
}

// A staff-wide, deterministic coach-voice observation — same discipline as
// every other coach note in this app: never invented, only surfaced when
// the aggregate data actually shows something worth naming, and always
// about the group, never a single teacher.
function AdminCoachNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-mint-tint/50 p-4">
      <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
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
    <span className="rounded-full bg-peach-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-terracotta-600">
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
  goal,
}: {
  label: string
  value: string
  sampleNote: string
  confidence?: DataConfidence
  tooltip?: string
  // Shown under the label: what the number means, and what a good sign
  // looks like, in the same thresholds Wivoza itself uses.
  goal?: string
}) {
  const hideValue = confidence === 'none'
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline/60 py-3 last:border-0">
      <span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
        </span>
        {goal && <span className="mt-0.5 block text-xs text-ink-soft">{goal}</span>}
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

function InstructionalAveragesCard({ n, data, insight }: { n: number; data: InstructionalAverages; insight?: string | null }) {
  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')
  const otherPct =
    data.avgTeacherTalkPct != null && data.avgStudentTalkPct != null
      ? Math.max(0, Math.round(100 - data.avgTeacherTalkPct - data.avgStudentTalkPct))
      : null
  return (
    <AdminCard
      n={n}
      title="How lessons are taught"
      question="Averages across every recorded lesson, with what a good sign looks like for each."
      howToRead="Each measure only counts lessons with real evidence for it. A short recording without enough questions, for example, isn't counted toward questioning. Where there are too few lessons behind a number, it says so instead of guessing."
    >
      <div className="flex flex-col">
        <StatRow
          label="Average wait time after a question"
          goal="A good sign: 3 seconds or more, so more students have time to think."
          value={data.avgWaitTimeSec != null ? `${data.avgWaitTimeSec.toFixed(1)}s` : '—'}
          sampleNote={sampleOr(data.waitTimeSampleSize, 'sessions')}
          confidence={data.waitTimeConfidence}
          tooltip="Median seconds of silence between a question and the teacher speaking again — median rather than average so one unusually long pause doesn't swing a small sample."
        />
        <StatRow
          label="Teacher talk vs. student talk"
          goal="A lesson where the teacher talks 65% or more of the time is flagged as a growth area."
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
          goal="Questions that ask students to explain, compare or reason. 40% or more is a staff strength."
          value={data.higherOrderPct != null ? `${data.higherOrderPct}%` : '—'}
          sampleNote={sampleOr(data.higherOrderSampleSize, 'questions')}
          confidence={data.higherOrderConfidence}
          tooltip="Percentage of all detected questions that use higher-order starters (why, explain, compare, justify) rather than simple recall."
        />
        <StatRow
          label="Sessions with a real-life example or connection"
          goal="Lessons that tie the content to real life or earlier learning. 60% or more is a strength."
          value={data.realLifeConnectionRatePct != null ? `${data.realLifeConnectionRatePct}%` : '—'}
          sampleNote={sampleOr(data.realLifeConnectionSampleSize, 'sessions')}
          confidence={data.realLifeConnectionConfidence}
          tooltip="Percentage of sessions with lesson-content analysis where at least one real-world connection or example was detected."
        />
        <StatRow
          label="Follow-up questions"
          goal="A second question that builds on a student's answer. More means deeper discussion."
          value={data.avgFollowUpPer10Min != null ? `${data.avgFollowUpPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.followUpSampleSize, 'sessions')}
          confidence={data.followUpConfidence}
          tooltip="Median rate of follow-up questions (a second question building on a student's answer) per 10 minutes of class."
        />
        <StatRow
          label="Sessions with a check for understanding"
          goal="Thumbs up, turn and talk, exit tickets and the like. 70% or more of lessons is a strength."
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
    </AdminCard>
  )
}

function ClimateAveragesCard({ n, data, insight }: { n: number; data: ClimateAverages; insight?: string | null }) {
  const sampleOr = (n: number, unit: string) => (n > 0 ? `based on ${n} ${unit}` : 'not enough data yet')
  return (
    <AdminCard
      n={n}
      title="Classroom climate"
      question="How calm and well-run classrooms sound, across your staff."
      howToRead="Found by listening for specific phrases: redirections, directions, encouragement and correction. It counts them; it doesn't judge whether a moment was handled well. No redirections in a recording can mean a calm room, or simply that the recording caught less of that part of class."
    >
      <div className="flex flex-col">
        <StatRow
          label="Redirection language"
          goal="How often teachers redirect behavior. Compare grade bands before drawing conclusions."
          value={data.avgRedirectionPer10Min != null ? `${data.avgRedirectionPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.redirectionFrequencySampleSize, 'sessions')}
          confidence={data.redirectionConfidence}
          tooltip="Median rate of detected redirection phrases per 10 minutes — median rather than average so one unusually disruptive session doesn't swing a small sample."
        />
        <StatRow
          label="Sessions with no redirection language detected"
          goal="Lessons that needed no redirecting at all. 70% or more is a strength."
          value={data.zeroRedirectionRatePct != null ? `${data.zeroRedirectionRatePct}%` : '—'}
          sampleNote={sampleOr(data.redirectionMeasuredSampleSize, 'sessions')}
          confidence={data.redirectionMeasuredConfidence}
          tooltip="Absence of detected redirection language isn't proof of good classroom management — it can also mean the recording captured less classroom-management activity overall."
        />
        <StatRow
          label="Transition language"
          goal="Spoken cues for moving between activities, a sign of clear routines."
          value={data.avgTransitionPer10Min != null ? `${data.avgTransitionPer10Min.toFixed(1)} per 10 min` : '—'}
          sampleNote={sampleOr(data.transitionSampleSize, 'sessions')}
          confidence={data.transitionConfidence}
          tooltip="Median rate of detected activity-transition phrases per 10 minutes."
        />
        <StatRow
          label="Sessions with clear directive language detected"
          goal="Lessons with at least one clear, specific direction. 80% or more is a strength."
          value={data.clearDirectivesRatePct != null ? `${data.clearDirectivesRatePct}%` : '—'}
          sampleNote={sampleOr(data.directiveSampleSize, 'sessions')}
          confidence={data.directiveConfidence}
          tooltip="Percentage of sessions with at least one detected clear-directive phrase (a specific, actionable instruction)."
        />
        <StatRow
          label="Positive vs. corrective tone"
          goal="Above 50% means teachers encourage more than they correct."
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
    </AdminCard>
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
function BreakdownCard({ n, selectedOrgId }: { n: number; selectedOrgId: string }) {
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
    <AdminCard
      n={n}
      title="Compare by grade or subject"
      question="Is a need school-wide, or concentrated in one grade band or department?"
      howToRead="The same lesson measures, split by grade band or subject so PD can be targeted — a questioning workshop for the science department rather than the whole staff, for example. Groups with fewer than 5 teachers are combined with their neighbours, so no one can be singled out."
      aside={
        <div className="flex gap-1 rounded-lg bg-cream p-1">
          {BREAKDOWN_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBy(opt.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                by === opt.id ? 'bg-cream-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      {by === 'none' && (
        <p className="mt-2 text-xs text-ink-soft">
          See the same averages above split by grade band or subject, to spot where PD would help most. Groups with
          fewer than 5 teachers are combined with their neighbours so no one can be singled out.
        </p>
      )}

      {data && data.breakdown.length === 0 && (
        <p className="mt-3 rounded-2xl bg-cream p-4 text-sm text-ink-soft">
          Unlocks once at least {data.minTeachers} teachers have recorded a lesson. Until then, the school-wide averages
          above are the most detailed view that keeps individual teachers private.
        </p>
      )}

      {by !== 'none' && error && <p className="mt-3 text-sm text-terracotta-600">{error}</p>}

      {by !== 'none' && !data && !error && <p className="mt-3 text-sm text-ink-soft">Loading...</p>}

      {data && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.breakdown.map((entry) => (
            <div key={entry.bucket} className="rounded-xl border border-hairline/60 p-3">
              <p className="text-sm font-semibold text-ink">{entry.bucket}</p>
              {!entry.suppressed && entry.combined && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  Combines {entry.combined.join(', ')} — too few teachers in each to show separately
                </p>
              )}
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
    </AdminCard>
  )
}

// What teachers chose to work on in My Growth — works for a small staff where
// grade/subject averages can't be shown, since it's a choice, not a measure
// of anyone's teaching. Suppression lives server-side.
function FocusAreasCard({ n, selectedOrgId }: { n: number; selectedOrgId: string }) {
  const [data, setData] = useState<AdminFocusAreas | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    getAdminFocusAreas(selectedOrgId || undefined)
      .then(setData)
      .catch(() => setError('Could not load focus areas.'))
  }, [selectedOrgId])

  const maxCount = data && !data.suppressed ? Math.max(1, ...data.areas.map((a) => a.count), data.otherCount) : 1

  return (
    <AdminCard
      n={n}
      title="What teachers chose to work on"
      question="The goals your teachers set for themselves — where your PD can meet them."
      howToRead="Each teacher can pick one growth focus in Lesson Debrief. Only totals are shown, and a focus only one teacher picked is counted under \u201cother\u201d, so nobody is identified by their choice. When your PD matches what teachers already chose, it lands as support rather than a directive."
    >

      {error && <p className="mt-3 text-sm text-terracotta-600">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-ink-soft">Loading...</p>}

      {data?.suppressed && (
        <p className="mt-3 rounded-2xl bg-cream p-4 text-sm text-ink-soft">
          Shows once at least {data.minTeachers} teachers have picked a focus.
        </p>
      )}

      {data && !data.suppressed && (
        <div className="mt-4 flex flex-col gap-2.5">
          {data.areas.map((area) => (
            <div key={area.metric} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-sm text-ink">{FOCUS_METRIC_LABELS[area.metric] ?? area.metric}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full bg-forest" style={{ width: `${(area.count / maxCount) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-ink-soft">
                {area.count} teachers
              </span>
            </div>
          ))}
          {data.otherCount > 0 && (
            <div className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-sm text-ink-soft">Other focus areas</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full bg-hairline" style={{ width: `${(data.otherCount / maxCount) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-sm text-ink-soft">
                {data.otherCount} {data.otherCount === 1 ? 'teacher' : 'teachers'}
              </span>
            </div>
          )}
          <p className="mt-1 text-xs text-ink-soft">{data.totalTeachers} teachers have chosen a focus.</p>
        </div>
      )}
    </AdminCard>
  )
}

function TallyBarList({
  n,
  title,
  question,
  noun,
  tally,
  labelFor,
  meaningFor,
  totalTeachers,
  comment,
  insight,
}: {
  n: number
  title: string
  question: string
  noun: [string, string]
  tally: Record<string, TallyEntry>
  labelFor: (value: string) => string
  meaningFor?: (value: string) => string | undefined
  totalTeachers: number
  comment?: string
  insight?: string | null
}) {
  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count)
  const active = sorted.filter(([, v]) => v.count > 0)
  const inactive = sorted.filter(([, v]) => v.count === 0)
  const maxCount = Math.max(1, ...active.map(([, v]) => v.count))

  const row = ([value, { count, teachers }]: [string, TallyEntry]) => (
    <div key={value}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-ink">{labelFor(value)}</span>
        <span className="text-sm text-ink-soft">
          {count === 0 ? 'none yet' : `${plural(count, noun[0], noun[1])} · ${teachers} of ${totalTeachers} teachers`}
        </span>
      </div>
      {meaningFor?.(value) && <p className="text-xs text-ink-soft">{meaningFor(value)}</p>}
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
        <div className="h-full rounded-full bg-terracotta" style={{ width: `${(count / maxCount) * 100}%` }} />
      </div>
    </div>
  )

  return (
    <AdminCard n={n} title={title} question={question} howToRead={comment}>
      {active.length > 0 ? (
        <div className="flex flex-col gap-3.5">{active.map(row)}</div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">More data is needed before this shows anything useful.</p>
      )}
      {inactive.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-medium text-forest marker:content-none [&::-webkit-details-marker]:hidden">
            Show {inactive.length} {inactive.length === 1 ? 'category' : 'categories'} with no activity
          </summary>
          <div className="mt-3 flex flex-col gap-3.5">{inactive.map(row)}</div>
        </details>
      )}
      {insight !== undefined && <AdminCoachNote text={insight} />}
    </AdminCard>
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


// ---- Shared report layout ----
//
// Same shape as Lesson Debrief's Insights sections, so a principal reading
// these pages sees the teacher reports' look: a numbered, coloured badge, a
// title, and the question the card answers — then the numbers, then (closed
// by default) how they were measured. Principals open these between other
// things; each card has to make sense on its own, without the manual.

function AdminCard({
  n,
  title,
  question,
  howToRead,
  aside,
  children,
}: {
  n: number
  title: string
  question: string
  howToRead?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  const accent: Accent = ACCENT_CYCLE[(n - 1) % ACCENT_CYCLE.length]
  return (
    <section className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.band} font-heading text-base font-bold text-cream`}
          >
            {n}
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight text-forest">{title}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{question}</p>
          </div>
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
      {howToRead && (
        <details className="mt-4 border-t border-hairline/70 pt-3">
          <summary className="cursor-pointer text-xs font-semibold text-forest">How to read this</summary>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{howToRead}</p>
        </details>
      )}
    </section>
  )
}


// "At a glance": three sentences a principal can read in ten seconds, built
// only from numbers already on the page and silent where there isn't enough.
function AtAGlance({ overview }: { overview: AdminOverview }) {
  const top = (tally: Record<string, TallyEntry>) =>
    Object.entries(tally)
      .filter(([, v]) => v.count > 0)
      .sort((a, b) => b[1].count - a[1].count)[0]
  const strength = overview.strengths[0]
  const need = top(overview.priorityTally)
  const practiced = top(overview.categoryTally)
  const lines: string[] = []
  if (strength) lines.push(`Your staff's clearest strength is ${strength.label.toLowerCase()}: ${strength.value}% ${STRENGTH_MEANING[strength.label] ?? ''}`.trim())
  if (need && need[1].count >= 3) {
    lines.push(
      `The most common area to grow is ${(PRIORITY_LABELS[need[0]] ?? need[0]).toLowerCase()}, in ${plural(need[1].count, 'lesson', 'lessons')} across ${plural(need[1].teachers, 'teacher', 'teachers')}.`,
    )
  }
  if (practiced && practiced[1].count >= 3) {
    lines.push(`Teachers practice ${categoryLabel(practiced[0]).toLowerCase()} most, ${plural(practiced[1].count, 'time', 'times')} so far.`)
  }
  if (lines.length === 0) return null
  return (
    <div className="rounded-3xl bg-forest p-6 text-cream">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">At a glance</p>
      <ul className="mt-3 flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-cream/70">
        Built from your staff&rsquo;s recorded lessons and practice. No individual teacher is ever identified.
      </p>
    </div>
  )
}

function DashboardPanel({
  overview,
  organizationId,
  onNavigate,
}: {
  overview: AdminOverview
  organizationId?: string
  onNavigate: (tab: Tab) => void
}) {
  // Tracked focus areas feed the summary and "What needs your attention" —
  // the Dashboard is where a principal should first see whether PD is working.
  const [tracked, setTracked] = useState<PdFocusArea[]>([])
  useEffect(() => {
    if (overview.scope !== 'organization') return
    getPdFocusAreas(organizationId)
      .then((data) => setTracked(data.items.filter((i) => i.status === 'active')))
      .catch(() => setTracked([]))
  }, [overview.scope, organizationId])

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
  const focusArea = tracked[0] ?? null
  const focusTrend = focusArea ? describeTrend(focusArea.baselineSnapshot, focusArea.currentSnapshot) : null
  const next = nextUntrackedNeed(overview, tracked)
  const glance = buildSchoolGlance(overview, tracked)

  return (
    <div className="flex flex-col gap-6">
      {glance.length > 0 && (
        <div className="rounded-3xl bg-forest p-6 text-cream">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">At a glance</p>
          <ul className="mt-3 flex flex-col gap-2">
            {glance.map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-cream/70">
            Built from your staff&rsquo;s use of Wivoza and their recorded lessons. No individual teacher is ever identified.
          </p>
        </div>
      )}

      <AdminCard
        n={1}
        title="This period"
        question="Who has an account, who's using it, and how much, in the dates chosen above."
        howToRead="Change the dates at the top to look at a different stretch, such as the last 30 days or the whole school year. Returning is the number to watch: people who used Wivoza in this period and the one before are the ones building a habit."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Licensed staff" value={String(overview.totalTeachers)} sub="Teachers with a Wivoza account at your school" />
          <StatCard label="Activated" value={String(overview.activatedAccounts)} sub="Finished setting up their account" />
          <StatCard
            label="Active this period"
            value={String(overview.activeThisWeek)}
            sub={`Used Wivoza in these dates, ${participationPct}% of staff`}
          />
          <StatCard label="Returning" value={String(overview.returningUsers)} sub="Active this period and the one before: the habit signal" />
          <StatCard label="Coaching activities" value={String(overview.activitiesThisWeek)} sub="Lessons, conversations, plans and practice in these dates" />
        </div>
      </AdminCard>

      <AdminCard
        n={2}
        title="What needs your attention"
        question="Three things worth a look this week, each one tap from the details."
        howToRead="Participation compares this period with the one before. Your focus area compares the share of lessons that needed it before you started tracking with the share since. The next step is the most common growth area in recorded lessons that you aren't tracking yet."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <AttentionTile
            label="Participation"
            body={
              priorParticipationPct == null
                ? `${participationPct}% of teachers used Wivoza this period.`
                : `${participationPct}% of teachers used Wivoza this period, ${
                    participationPct >= priorParticipationPct ? 'up' : 'down'
                  } from ${priorParticipationPct}% the period before.`
            }
            actionLabel="See adoption"
            onAction={() => onNavigate('engagement')}
            tint="bg-peach-tint/60"
          />
          {focusArea ? (
            <AttentionTile
              label={`Your focus: ${focusArea.title.toLowerCase()}`}
              body={
                focusTrend
                  ? `${describeSnapshot(focusArea.baselineSnapshot)} when you started; ${describeSnapshot(focusArea.currentSnapshot!).charAt(0).toLowerCase()}${describeSnapshot(focusArea.currentSnapshot!).slice(1)} since. ${focusTrend.text}`
                  : `Tracking since ${new Date(focusArea.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. Progress shows once a few more lessons are recorded.`
              }
              actionLabel="See Professional Learning"
              onAction={() => onNavigate('professionalLearning')}
              tint="bg-mint-tint/60"
            />
          ) : (
            <AttentionTile
              label="Emerging need"
              body={
                topPriorityConfidence === 'none' || !topPriorityEntry
                  ? 'Not enough recorded lessons yet to name a shared growth area.'
                  : `${PRIORITY_LABELS[topPriorityEntry[0]] ?? topPriorityEntry[0]} is the most common growth area in recorded lessons. ${PRIORITY_MEANING[topPriorityEntry[0]] ?? ''}`
              }
              actionLabel={topPriorityConfidence !== 'none' ? 'See the evidence' : undefined}
              onAction={topPriorityConfidence !== 'none' ? () => onNavigate('insights') : undefined}
              tint="bg-mint-tint/60"
            />
          )}
          <AttentionTile
            label="Recommended next step"
            body={
              next
                ? `${PRIORITY_LABELS[next.key] ?? next.key}, in ${plural(next.count, 'lesson', 'lessons')} across ${plural(next.teachers, 'teacher', 'teachers')}. Consider ${PD_SUGGESTIONS[next.key] ?? 'a shared PD session on it'}.`
                : "Once more lessons are recorded, a specific next step will show up here."
            }
            actionLabel={next ? 'Track this focus area' : undefined}
            onAction={next ? () => onNavigate('professionalLearning') : undefined}
            tint="bg-gold-tint/60"
          />
        </div>
      </AdminCard>

      <AdoptionFunnelCard n={3} overview={overview} />

      <WeeklyParticipationCard n={4} data={overview.weeklyActivity} />

      <FeatureAdoptionCard n={5} data={overview.featureAdoption} totalTeachers={overview.totalTeachers} />
    </div>
  )
}

function AttentionTile({
  label,
  body,
  actionLabel,
  onAction,
  tint,
}: {
  label: string
  body: string
  actionLabel?: string
  onAction?: () => void
  tint: string
}) {
  return (
    <div className={`flex flex-col rounded-2xl p-4 ${tint}`}>
      <p className="text-sm font-semibold text-forest">{label}</p>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-ink">{body}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-3 self-start text-sm font-semibold text-terracotta-600 hover:text-terracotta">
          {actionLabel} →
        </button>
      )}
    </div>
  )
}

function WeeklyParticipationCard({ n, data }: { n: number; data: AdminOverview['weeklyActivity'] }) {
  return (
    <AdminCard
      n={n}
      title="Weekly participation"
      question="Is use growing week to week?"
      howToRead="How many different teachers used any part of Wivoza in each of the last six weeks. It counts people, not activity, so one very busy teacher can't make a quiet week look busy. This chart always shows the last six weeks, whatever dates are chosen above."
    >
      <WeeklyActivityChart data={data} />
    </AdminCard>
  )
}

// Licensed → activated → active this period → returning — the same four
// numbers already shown as separate stat tiles on the Dashboard, here
// connected into one funnel so it's clear where staff actually drop off,
// which is the whole point of a page titled "Adoption & engagement."
function AdoptionFunnelCard({ n, overview }: { n: number; overview: AdminOverview }) {
  const stages: { label: string; count: number }[] = [
    { label: 'Have an account', count: overview.totalTeachers },
    { label: 'Set it up', count: overview.activatedAccounts },
    { label: 'Used it in these dates', count: overview.activeThisWeek },
    { label: 'Came back again', count: overview.returningUsers },
  ]
  const total = overview.totalTeachers
  return (
    <AdminCard
      n={n}
      title="From account to habit"
      question="Where do teachers drop off between getting an account and using it regularly?"
      howToRead="Each bar is a share of every teacher with an account. The biggest drop between two bars is where a nudge helps most: teachers who never set up their account need a different message than teachers who tried it once and didn't come back. The People page shows who is in each group."
    >
      <div className="flex flex-col gap-3">
        {stages.map(({ label, count }) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{label}</span>
                <span className="text-sm font-semibold text-ink">
                  {pct}% · {count} of {total}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full bg-terracotta" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </AdminCard>
  )
}

function FeatureAdoptionCard({
  n,
  data,
  totalTeachers,
}: {
  n: number
  data: AdminOverview['featureAdoption']
  totalTeachers: number
}) {
  const entries = (Object.entries(data) as [keyof typeof data, number][]).sort((a, b) => b[1] - a[1])
  return (
    <AdminCard
      n={n}
      title="Which tools teachers use"
      question="How many of your teachers have tried each part of Wivoza."
      howToRead="Counts teachers who have used each tool at least once since your school started. A tool few teachers have tried is often one they don't know about yet, which makes it a good five-minute demo at a staff meeting."
    >
      <div className="flex flex-col gap-3">
        {entries.map(([key, teacherCount]) => {
          const pct = totalTeachers > 0 ? Math.round((teacherCount / totalTeachers) * 100) : 0
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">
                  {FEATURE_ACTIVITY_META[key].label}
                  <span className="ml-1.5 text-xs font-normal text-ink-soft">{FEATURE_ACTIVITY_META[key].sub}</span>
                </span>
                <span className="text-sm font-semibold text-ink">
                  {pct}% · {teacherCount} of {totalTeachers}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full bg-terracotta" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </AdminCard>
  )
}

function EngagementPanel({ overview }: { overview: AdminOverview }) {
  const { recentStrong, recentTotal, priorStrong, priorTotal } = overview.growth
  const bars = [
    { label: 'These dates', strong: recentStrong, total: recentTotal },
    { label: 'The period before', strong: priorStrong, total: priorTotal },
  ]
  return (
    <div className="flex flex-col gap-6">
      <AdminCard
        n={1}
        title="Growing skill in practice"
        question="Are teachers handling practice scenarios better over time?"
        howToRead="When a teacher practices a classroom scenario, Wivoza privately rates the response from 1 to 5 to track growth. Teachers never see it as a score, and you never see anyone's individual rating. A response rated 4 or 5 counts as strong here. A rising share means the practice is working."
      >
        {recentTotal === 0 ? (
          <p className="text-sm text-ink-soft">No rated practice in these dates yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              <span className="font-heading text-2xl font-extrabold text-forest">{Math.round((recentStrong / recentTotal) * 100)}%</span>{' '}
              of practice responses were strong in these dates
              {priorTotal > 0 ? `, compared with ${Math.round((priorStrong / priorTotal) * 100)}% the period before.` : '.'}
            </p>
            {bars.map((b) =>
              b.total === 0 ? null : (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{b.label}</span>
                    <span className="text-ink-soft">
                      {b.strong} of {b.total} strong
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                    <div className="h-full rounded-full bg-forest" style={{ width: `${(b.strong / b.total) * 100}%` }} />
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </AdminCard>

      <AdoptionFunnelCard n={2} overview={overview} />

      <WeeklyParticipationCard n={3} data={overview.weeklyActivity} />

      <FeatureAdoptionCard n={4} data={overview.featureAdoption} totalTeachers={overview.totalTeachers} />
    </div>
  )
}

// A compact "top N" list for the Coaching Insights Overview tab — distinct
// from TallyBarList (which always shows the full breakdown with bars); this
// is a quick teaser pointing at the dedicated tab for the full picture.
function TopNList({
  tally,
  labelFor,
  meaningFor,
  n,
  noun,
  emptyText,
}: {
  tally: Record<string, TallyEntry>
  labelFor: (value: string) => string
  meaningFor?: (value: string) => string | undefined
  n: number
  // What one count is — "lesson", "practice session" — so a row reads
  // "23 lessons · 14 teachers" instead of an unexplained "23×".
  noun: [string, string]
  emptyText: string
}) {
  const top = Object.entries(tally)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
  if (top.length === 0) return <p className="text-sm text-ink-soft">{emptyText}</p>
  const max = Math.max(1, ...top.map(([, v]) => v.count))
  return (
    <div className="flex flex-col gap-3.5">
      {top.map(([value, { count, teachers }]) => (
        <div key={value}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-semibold text-ink">{labelFor(value)}</span>
            <span className="text-sm text-ink-soft">
              {plural(count, noun[0], noun[1])} · {plural(teachers, 'teacher', 'teachers')}
            </span>
          </div>
          {meaningFor?.(value) && <p className="text-xs text-ink-soft">{meaningFor(value)}</p>}
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-terracotta" style={{ width: `${(count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StrengthsCard({ n, strengths }: { n: number; strengths: Strength[] }) {
  return (
    <AdminCard
      n={n}
      title="Shared strengths"
      question="What is your staff already doing well, across classrooms?"
      howToRead="Measured from recorded Lesson Debrief lessons. Something counts as a staff strength once it clears Wivoza's bar — for example, checks for understanding in 70% or more of lessons. Worth naming out loud at a staff meeting: strengths spread faster when people hear them."
    >
      {strengths.length === 0 ? (
        <p className="text-sm text-ink-soft">Not enough recorded lessons yet to name a staff-wide strength with confidence.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {strengths.map((s) => (
            <div key={s.label} className="rounded-2xl bg-mint-tint/50 p-4">
              <p className="flex items-center gap-1.5 font-heading text-3xl font-extrabold text-forest">
                {s.value}%
                <ConfidenceBadge level={s.confidence} />
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{s.label}</p>
              <p className="text-xs text-ink-soft">{s.value}% {STRENGTH_MEANING[s.label] ?? ''}</p>
            </div>
          ))}
        </div>
      )}
    </AdminCard>
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
  // challengeLabel/purposeLabel each fall back to the raw value when a
  // value isn't in their own list, so chaining them with ?? never actually
  // reaches the second lookup — the first call always returns something
  // truthy. Check both lists directly instead, so a message-purpose-only
  // value like "academic_concern" doesn't render as its raw enum string.
  const communicationLabel = (v: string) =>
    CHALLENGE_TYPES.find((c) => c.value === v)?.label ?? MESSAGE_PURPOSES.find((p) => p.value === v)?.label ?? v

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-fit gap-1 rounded-xl bg-cream p-1">
        {INSIGHTS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-cream-card text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <AtAGlance overview={overview} />

          <StrengthsCard n={1} strengths={overview.strengths} />

          <AdminCard
            n={2}
            title="Shared growth areas"
            question="Where would a staff-wide PD session help the most teachers?"
            howToRead="Each recorded lesson is counted under the one area its own numbers point to most — for example, a lesson where the teacher did 65% or more of the talking counts under talk time balance. Short recordings, or ones without enough evidence, aren't counted anywhere. The teacher count shows how widespread it is: an area that shows up for many teachers is a better PD topic than one that shows up often for a few."
          >
            <TopNList
              tally={overview.priorityTally}
              labelFor={(v) => PRIORITY_LABELS[v] ?? v}
              meaningFor={(v) => PRIORITY_MEANING[v]}
              n={3}
              noun={['lesson', 'lessons']}
              emptyText="Not enough recorded lessons yet."
            />
          </AdminCard>

          <AdminCard
            n={3}
            title="Classroom situations teachers practice"
            question="Which moments are teachers rehearsing before they happen for real?"
            howToRead="Counts the classroom-management scenarios teachers practiced and the situations they asked the coach about. What people practice is usually what worries them — a useful read on where staff want support, even before it shows up in lessons."
          >
            <TopNList
              tally={overview.categoryTally}
              labelFor={categoryLabel}
              n={3}
              noun={['time', 'times']}
              emptyText="No practice yet."
            />
          </AdminCard>

          <AdminCard
            n={4}
            title="Conversations with families and colleagues"
            question="What are teachers writing and preparing for most?"
            howToRead="Messages teachers drafted and difficult conversations they practiced, grouped by purpose. A lot of behavior-concern messages, for example, can point to a shared need before it reaches your office."
          >
            <TopNList
              tally={mergeTallies(overview.challengeTally, overview.messagePurposeTally)}
              labelFor={communicationLabel}
              n={3}
              noun={['time', 'times']}
              emptyText="No messages or conversation practice yet."
            />
          </AdminCard>

          <FocusAreasCard n={5} selectedOrgId={selectedOrgId} />

          <BreakdownCard n={6} selectedOrgId={selectedOrgId} />
        </>
      )}

      {tab === 'practice' && (
        <>
          <InstructionalAveragesCard
            n={1}
            data={overview.instructionalAverages}
            insight={buildInstructionalGroupInsight(overview.instructionalAverages)}
          />
          <TallyBarList
            n={2}
            title="Every growth area, in full"
            question="All five areas lessons can point to, from most to least common."
            noun={['lesson', 'lessons']}
            comment="Each recorded lesson is counted under the one area its own numbers point to most. A short recording, or one with too little evidence, isn't counted anywhere, so the totals can be lower than the number of lessons recorded."
            tally={overview.priorityTally}
            labelFor={(v) => PRIORITY_LABELS[v] ?? v}
            meaningFor={(v) => PRIORITY_MEANING[v]}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(
              overview.priorityTally,
              (v) => PRIORITY_LABELS[v] ?? v,
              'coaching priority',
              'sessions with a clear priority',
            )}
          />
          <TallyBarList
            n={3}
            title="Content notes, by theme"
            question="What the subject-matter notes on recorded lessons most often point to."
            noun={['note', 'notes']}
            comment="When a teacher asks for content notes on a lesson, Wivoza groups them into four themes: clarity of explanation, vocabulary, engagement with the content, and facts worth double-checking. Only the theme counts are shown here, never the notes themselves."
            tally={overview.contentNoteTally}
            labelFor={(v) => v}
            totalTeachers={overview.totalTeachers}
            insight={buildTallyInsight(overview.contentNoteTally, (v) => v, 'content note theme', 'content notes')}
          />
        </>
      )}

      {tab === 'climate' && (
        <ClimateAveragesCard n={1} data={overview.climateAverages} insight={buildClimateGroupInsight(overview.climateAverages)} />
      )}

      {tab === 'communication' && (
        <>
          <TallyBarList
            n={1}
            title="Difficult conversations practiced"
            question="The conversations teachers rehearse before having them for real."
            noun={['practice', 'practices']}
            comment="Teachers can practice a hard conversation, like an upset parent or a grade dispute, with a simulated person before it happens. A lot of practice on one kind of conversation is a sign staff would welcome support or a shared protocol for it."
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
            n={2}
            title="Messages written, by purpose"
            question="What teachers are reaching out to families and colleagues about."
            noun={['message', 'messages']}
            comment="Counts the messages teachers drafted with Wivoza, by why they were writing. Positive updates are worth watching too, since they're the messages families remember."
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
  currentUserId,
  overview,
}: {
  selectedOrgId: string
  onOrgChange: (id: string) => void
  orgs: Organization[]
  isSuperadmin: boolean
  currentUserId: string | null
  overview: AdminOverview | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-forest md:text-[34px]">People<span className="text-gold">.</span></h1>
          <p className="mt-1 text-sm text-ink-soft">
            Who has an account, who&rsquo;s using Wivoza, and who might need a nudge. You see names and dates only,
            never anyone&rsquo;s recordings or coaching.
          </p>
        </div>
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
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
        <MembersList
          organizationId={selectedOrgId || undefined}
          isSuperadmin={isSuperadmin}
          currentUserId={currentUserId}
        />
      ) : (
        <p className="text-sm text-ink-soft">Select an organization above to view its staff roster.</p>
      )}
    </div>
  )
}

// Persists a coaching-priority theme as a tracked focus area — an admin
// names one of the 5 PRIORITY_LABELS themes, Wivoza snapshots its current
// evidence, and the admin can check back later against the live numbers.
// Org-scoped, same "select an organization" gate as PeoplePanel above,
// since a school-wide focus area needs a concrete school.
function PdFocusAreaPanel({
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
          <h1 className="font-heading text-2xl font-extrabold text-forest md:text-[34px]">Professional Learning<span className="text-gold">.</span></h1>
          <p className="mt-1 text-sm text-ink-soft">
            Turn a shared coaching theme into something you can track over time.
          </p>
        </div>
        {isSuperadmin && orgs.length > 0 && (
          <select
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
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
        <PdFocusAreaContent organizationId={selectedOrgId || undefined} />
      ) : isSuperadmin && orgs.length === 0 ? (
        <p className="text-sm text-ink-soft">
          A focus area needs a concrete school — create an organization first under Organizations.
        </p>
      ) : (
        <p className="text-sm text-ink-soft">Select an organization above to track a focus area for it.</p>
      )}
    </div>
  )
}

const PRIORITY_LABEL_KEYS = Object.keys(PRIORITY_LABELS)

function PdFocusAreaContent({ organizationId }: { organizationId?: string }) {
  const [items, setItems] = useState<PdFocusArea[]>([])
  const [themeCounts, setThemeCounts] = useState<Record<string, TallyEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  function refresh() {
    setLoading(true)
    getPdFocusAreas(organizationId)
      .then((data) => {
        setItems(data.items)
        setThemeCounts(data.themeCounts)
      })
      .catch(() => setError('Could not load Professional Learning data.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  async function handleCreate(themeKey: string) {
    setCreatingKey(themeKey)
    setError(null)
    try {
      await createPdFocusArea({
        themeKey,
        title: PRIORITY_LABELS[themeKey] ?? themeKey,
        suggestedAction: PD_SUGGESTIONS[themeKey] ?? null,
        organizationId,
      })
      refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreatingKey(null)
    }
  }

  async function handleArchive(id: string) {
    setArchivingId(id)
    setError(null)
    try {
      await archivePdFocusArea(id, organizationId)
      refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setArchivingId(null)
    }
  }

  if (loading) return <p className="text-sm text-ink-soft">Loading...</p>

  const active = items.filter((i) => i.status === 'active')
  const archived = items.filter((i) => i.status === 'archived')
  const activeThemeKeys = new Set(active.map((i) => i.themeKey))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2.5 rounded-xl border border-mint-tint bg-mint-tint/60 px-4 py-2.5 text-sm text-forest">
        <LockIcon className="h-4 w-4 shrink-0" />
        Aggregate reporting · Individual coaching stays private
      </div>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}

      {active.length > 0 && (
        <div className="flex flex-col gap-4">
          {active.map((item) => (
            <FocusAreaCard
              key={item.id}
              item={item}
              onArchive={() => handleArchive(item.id)}
              archiving={archivingId === item.id}
            />
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-forest">Track a new focus area</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pick a growth area to work on as a school. Wivoza notes how often it shows up in lessons today, then shows
          whether it shows up in fewer lessons as your PD takes hold. The counts below are how often each area has come
          up in recorded lessons so far.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {PRIORITY_LABEL_KEYS.map((key) => {
            const tally = themeCounts[key] ?? { count: 0, teachers: 0 }
            const alreadyTracked = activeThemeKeys.has(key)
            const disabled = tally.count === 0 || alreadyTracked || creatingKey === key
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => handleCreate(key)}
                className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-cream px-3.5 py-2.5 text-left text-sm transition-colors enabled:hover:border-terracotta/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium text-ink">{PRIORITY_LABELS[key] ?? key}</span>
                <span className="text-xs text-ink-soft">
                  {alreadyTracked
                    ? 'Already tracked'
                    : tally.count === 0
                      ? 'No evidence yet'
                      : `In ${plural(tally.count, 'lesson', 'lessons')} · ${plural(tally.teachers, 'teacher', 'teachers')}`}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {archived.length > 0 && (
        <details className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Show {archived.length} archived
          </summary>
          <div className="mt-3 flex flex-col">
            {archived.map((item) => (
              <div key={item.id} className="border-b border-hairline/60 py-2.5 text-sm last:border-0">
                <p className="font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Started {formatShortDate(item.createdAt)}
                  {item.archivedAt ? ` · Archived ${formatShortDate(item.archivedAt)}` : ''}
                  {' · '}
                  {describeSnapshot(item.baselineSnapshot)} →{' '}
                  {item.finalSnapshot ? describeSnapshot(item.finalSnapshot) : 'no final numbers'}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}


function FocusAreaCard({
  item,
  onArchive,
  archiving,
}: {
  item: PdFocusArea
  onArchive: () => void
  archiving: boolean
}) {
  const current = item.currentSnapshot
  const trend = describeTrend(item.baselineSnapshot, current)
  return (
    <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-bold text-forest">{item.title}</h3>
          <p className="text-xs text-ink-soft">Started {formatShortDate(item.createdAt)}</p>
        </div>
        <button
          type="button"
          onClick={onArchive}
          disabled={archiving}
          className="text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
        >
          {archiving ? 'Archiving...' : 'Archive'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">When you started</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
            <span className="font-semibold">{describeSnapshot(item.baselineSnapshot)}</span>
            <ConfidenceBadge level={item.baselineSnapshot.confidence} />
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Since you started</p>
          {current == null || current.confidence === 'none' ? (
            <p className="mt-1 text-sm text-ink-soft">Not enough evidence yet</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
              <span className="font-semibold">{describeSnapshot(current)}</span>
              <ConfidenceBadge level={current.confidence} />
            </p>
          )}
        </div>
      </div>

      {trend && (
        <p className={`mt-3 text-sm font-semibold ${trend.improving ? 'text-forest' : 'text-ink'}`}>{trend.text}</p>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        The share of recorded lessons where this was the main area to grow. Lower is better: it means fewer lessons
        need it.
      </p>
      {item.suggestedAction && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">Suggested PD: </span>
          {item.suggestedAction}
        </p>
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
      <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-forest">Create organization</h2>
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
          {createError && <p className="text-sm text-terracotta-600">{createError}</p>}
          {justCreatedCode && (
            <p className="text-sm text-forest">
              Created — join code: <span className="font-mono font-semibold">{justCreatedCode}</span>
            </p>
          )}
          <button type="submit" disabled={creating} className={`self-start ${primaryButtonClass}`}>
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Organizations</h2>
        {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
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
      <div className="rounded-xl border border-hairline bg-cream-card p-4">
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className={inputClass} />
          <input
            value={adminEmails}
            onChange={(e) => setAdminEmails(e.target.value)}
            placeholder="Admin email(s), comma-separated"
            className={inputClass}
          />
          {error && <p className="text-sm text-terracotta-600">{error}</p>}
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-cream-card p-4">
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
        <button type="button" onClick={handleDelete} className="text-xs font-medium text-ink-soft hover:text-terracotta-600">
          Delete
        </button>
      </div>
    </div>
  )
}

// Superadmin-only, platform-wide — the one place to find an independent
// teacher who isn't in any org (and so never appears in a Members list).
function platformUserRoleLabel(role: AdminUser['role']): string {
  return role === 'superadmin' ? 'Superadmin' : role === 'org_admin' ? 'Org admin' : 'Teacher'
}

type UserSortKey = 'name' | 'role' | 'organization' | 'status' | 'joined'

// Same searchable/sortable table pattern as Members above — this list spans
// every organization on the platform, so it needs search even more.
function UsersPanel({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | AdminUser['role']>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  // 'all', 'independent', or an organization id.
  const [schoolFilter, setSchoolFilter] = useState('all')
  const [sortKey, setSortKey] = useState<UserSortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [bulkOutcome, setBulkOutcome] = useState<string | null>(null)

  function refresh() {
    setError(null)
    getAdminUsers()
      .then(setUsers)
      .catch(() => setError('Could not load users.'))
  }

  useEffect(() => {
    refresh()
    getOrganizations()
      .then(setOrgs)
      .catch(() => setOrgs([]))
  }, [])

  function handleSort(key: UserSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const query = search.trim().toLowerCase()
  const filtered = (users ?? []).filter(
    (u) =>
      (!query ||
        (u.name ?? '').toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        (u.organizationName ?? '').toLowerCase().includes(query)) &&
      (roleFilter === 'all' || u.role === roleFilter) &&
      (statusFilter === 'all' || (statusFilter === 'suspended') === !!u.suspendedAt) &&
      (schoolFilter === 'all' ||
        (schoolFilter === 'independent' ? !u.organizationId : u.organizationId === schoolFilter)),
  )

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = (a.name ?? a.email).localeCompare(b.name ?? b.email)
    else if (sortKey === 'role') cmp = platformUserRoleLabel(a.role).localeCompare(platformUserRoleLabel(b.role))
    else if (sortKey === 'organization') cmp = (a.organizationName ?? 'Independent').localeCompare(b.organizationName ?? 'Independent')
    else if (sortKey === 'status') cmp = Number(!!a.suspendedAt) - Number(!!b.suspendedAt)
    else if (sortKey === 'joined') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })

  const isSelectable = (u: AdminUser) => u.role !== 'superadmin' && u.id !== currentUserId
  const selectable = sorted.filter(isSelectable)
  const picked = selectable.filter((u) => selected.has(u.id))
  const allPicked = selectable.length > 0 && picked.length === selectable.length
  const filtersActive = query !== '' || roleFilter !== 'all' || statusFilter !== 'all' || schoolFilter !== 'all'

  function toggle(id: string) {
    setBulkOutcome(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setBulkOutcome(null)
    setSelected(allPicked ? new Set() : new Set(selectable.map((u) => u.id)))
  }

  function clearFilters() {
    setSearch('')
    setRoleFilter('all')
    setStatusFilter('all')
    setSchoolFilter('all')
  }

  async function bulk(key: string, verb: string, people: AdminUser[], action: (u: AdminUser) => Promise<unknown>) {
    setBulkBusy(key)
    const outcome = await runBulk(people, action)
    setBulkBusy(null)
    setSelected(new Set())
    setBulkOutcome(describeOutcome(verb, outcome))
    refresh()
  }

  const toSuspend = picked.filter((u) => !u.suspendedAt)
  const toUnsuspend = picked.filter((u) => u.suspendedAt)
  const actions: BulkAction[] = [
    {
      key: 'suspend',
      label: 'Suspend',
      count: toSuspend.length,
      run: () => {
        if (
          !window.confirm(
            `Suspend ${plural(toSuspend.length, 'account', 'accounts')}? They won't be able to sign in until unsuspended. Their data is kept.`,
          )
        ) {
          return
        }
        void bulk('suspend', 'Suspended', toSuspend, (u) => suspendUser(u.id, true))
      },
    },
    {
      key: 'unsuspend',
      label: 'Unsuspend',
      count: toUnsuspend.length,
      run: () => void bulk('unsuspend', 'Unsuspended', toUnsuspend, (u) => suspendUser(u.id, false)),
    },
    {
      key: 'delete',
      label: 'Delete',
      danger: true,
      count: picked.length,
      run: () => {
        if (!confirmBulkDelete(picked)) return
        void bulk('delete', 'Deleted', picked, (u) => deleteUser(u.id))
      },
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
            Platform users{users ? ` (${filtersActive ? `${sorted.length} of ${users.length}` : users.length})` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Every user across every organization, including independent teachers not part of any school —
            Wivoza-internal only.
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or organization"
          className={`${inputClass} w-full max-w-xs`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          aria-label="Filter by role"
          className={filterSelectClass}
        >
          <option value="all">All roles</option>
          <option value="teacher">Teachers</option>
          <option value="org_admin">Org admins</option>
          <option value="superadmin">Superadmins</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by status"
          className={filterSelectClass}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
          aria-label="Filter by school"
          className={filterSelectClass}
        >
          <option value="all">All schools</option>
          <option value="independent">Independent</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="text-xs font-medium text-ink-soft hover:text-ink">
            Clear filters
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
      <BulkBar
        selectedCount={picked.length}
        actions={actions}
        busy={bulkBusy}
        outcome={bulkOutcome}
        onClear={() => {
          setSelected(new Set())
          setBulkOutcome(null)
        }}
      />
      {!users ? (
        <p className="mt-3 text-sm text-ink-soft">Loading...</p>
      ) : users.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No users yet.</p>
      ) : sorted.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No users match these filters.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[760px] border-collapse bg-cream-card text-sm">
            <thead>
              <tr className="border-b border-hairline bg-cream">
                <th className="w-10 px-3.5 py-2.5 text-left">
                  <SelectAllCheckbox
                    checked={allPicked}
                    indeterminate={picked.length > 0 && !allPicked}
                    disabled={selectable.length === 0 || bulkBusy !== null}
                    onChange={toggleAll}
                  />
                </th>
                <SortableTh label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Role" sortKey="role" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh
                  label="Organization"
                  sortKey="organization"
                  active={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortableTh label="Status" sortKey="status" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Joined" sortKey="joined" active={sortKey} dir={sortDir} onSort={handleSort} />
                <th className={ACTIONS_TH_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  orgs={orgs}
                  selected={selected.has(u.id)}
                  selectable={isSelectable(u) && bulkBusy === null}
                  onToggle={() => toggle(u.id)}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserRow({
  user,
  orgs,
  selected,
  selectable,
  onToggle,
  onChanged,
}: {
  user: AdminUser
  orgs: Organization[]
  selected: boolean
  selectable: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  function handleSuspendToggle() {
    if (
      !user.suspendedAt &&
      !window.confirm(`Suspend ${user.name ?? user.email}? They won't be able to sign in until you unsuspend them. Their data is kept.`)
    ) {
      return
    }
    void run(() => suspendUser(user.id, !user.suspendedAt))
  }

  function handleDelete() {
    if (
      !window.confirm(`Permanently delete ${user.name ?? user.email}'s account and all their data? This cannot be undone.`)
    ) {
      return
    }
    void run(() => deleteUser(user.id))
  }

  return (
    <>
      <tr className={`border-b border-hairline/60 align-top last:border-0 ${selected ? 'bg-mint-tint/30' : ''}`}>
        <td className="px-3.5 py-3">
          <RowCheckbox checked={selected} disabled={!selectable} label={user.name ?? user.email} onChange={onToggle} />
        </td>
        <td className="max-w-[15rem] px-3.5 py-3">
          <p className="text-sm font-semibold text-ink">{user.name ?? user.email}</p>
          <p className="break-all text-xs text-ink-soft">{user.email}</p>
        </td>
        <td className="whitespace-nowrap px-3.5 py-3">
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            {platformUserRoleLabel(user.role)}
          </span>
        </td>
        <td className="whitespace-nowrap px-3.5 py-3 text-sm text-ink-soft">{user.organizationName ?? 'Independent'}</td>
        <td className="whitespace-nowrap px-3.5 py-3">
          {user.suspendedAt ? (
            <span className="rounded-full bg-peach-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-terracotta-600">
              Suspended
            </span>
          ) : (
            <span className="text-sm text-ink-soft">Active</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3.5 py-3 text-sm text-ink-soft">
          {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td className={ACTIONS_TD_CLASS}>
          <div className="flex items-center gap-3 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              disabled={busy}
              className="text-xs font-medium text-forest hover:text-ink disabled:opacity-50"
            >
              Edit
            </button>
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
              className="text-xs font-medium text-terracotta-600 hover:text-terracotta-600 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-terracotta-600">{error}</p>}
        </td>
      </tr>
      {editing && (
        <EditUserRow
          colSpan={7}
          initial={{
            name: user.name ?? '',
            jobTitle: user.jobTitle ?? '',
            role: user.role === 'org_admin' ? 'org_admin' : 'teacher',
            organizationId: user.organizationId ?? '',
          }}
          roleLocked={user.role === 'superadmin'}
          orgs={orgs}
          onSave={async (values) => {
            const edits = editsFrom(values)
            await updateUser(
              user.id,
              user.role === 'superadmin'
                ? { name: edits.name, jobTitle: edits.jobTitle }
                : { ...edits, organizationId: values.organizationId || null },
            )
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </>
  )
}

const INQUIRY_TYPE_LABELS: Record<string, string> = {
  school: 'School',
  district: 'District',
  network: 'Charter network',
  other: 'Other',
}
const INQUIRY_STATUS_STYLES: Record<SchoolInquiry['status'], string> = {
  new: 'bg-terracotta text-cream',
  contacted: 'bg-gold text-forest',
  closed: 'bg-mint-tint text-forest',
}

// Superadmin inbox for the public /for-schools form. Everything shown here
// was typed by an unauthenticated visitor, so it is rendered as plain text.
function SchoolInquiriesPanel() {
  const [inquiries, setInquiries] = useState<SchoolInquiry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  useEffect(() => {
    getSchoolInquiries()
      .then(setInquiries)
      .catch(() => setError('Could not load school inquiries.'))
  }, [])

  async function handleStatus(id: string, status: SchoolInquiry['status']) {
    setInquiries((prev) => prev?.map((i) => (i.id === id ? { ...i, status } : i)) ?? prev)
    try {
      await updateSchoolInquiryStatus(id, status)
    } catch {
      setError('Could not update that inquiry. Refresh and try again.')
    }
  }

  const visible = (inquiries ?? []).filter((i) => filter === 'all' || i.status !== 'closed')
  const newCount = (inquiries ?? []).filter((i) => i.status === 'new').length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza internal</p>
        <h1 className="font-heading text-2xl font-extrabold text-forest md:text-[34px]">
          School inquiries<span className="text-gold">.</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Requests from the For Schools page{inquiries ? ` — ${newCount} new` : ''}.
        </p>
      </div>

      <div className="flex gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? 'bg-forest text-cream' : 'bg-cream-card text-ink-soft hover:text-ink'
            }`}
          >
            {f === 'open' ? 'Open' : 'All'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-terracotta-600">{error}</p>}
      {!inquiries && !error && <p className="text-sm text-ink-soft">Loading...</p>}
      {inquiries && visible.length === 0 && (
        <p className="text-sm text-ink-soft">{filter === 'open' ? 'No open inquiries.' : 'No inquiries yet.'}</p>
      )}

      <div className="flex flex-col gap-4">
        {visible.map((inq) => (
          <div key={inq.id} className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${INQUIRY_STATUS_STYLES[inq.status]}`}>
                    {inq.status}
                  </span>
                  <span className="text-xs text-ink-soft">{new Date(inq.createdAt).toLocaleString()}</span>
                </div>
                <h2 className="mt-2 font-heading text-lg font-bold text-forest">{inq.organizationName}</h2>
                <p className="text-sm text-ink-soft">
                  {[INQUIRY_TYPE_LABELS[inq.organizationType] ?? inq.organizationType, inq.teacherCount ? `${inq.teacherCount} teachers` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <select
                value={inq.status}
                onChange={(e) => handleStatus(inq.id, e.target.value as SchoolInquiry['status'])}
                aria-label="Inquiry status"
                className="rounded-xl border border-hairline bg-cream px-3 py-1.5 text-sm text-ink focus:border-terracotta focus:outline-none"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="mt-4 rounded-2xl bg-mint-tint/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">Contact</p>
              <p className="mt-1 text-sm font-semibold text-ink">{inq.name}</p>
              <p className="text-sm text-ink-soft">{inq.role}</p>
              <a
                href={`mailto:${inq.email}?subject=${encodeURIComponent(`Wivoza for ${inq.organizationName}`)}`}
                className="mt-1 inline-block break-all text-sm font-semibold text-terracotta-600 hover:underline"
              >
                {inq.email}
              </a>
            </div>
            {inq.message && (
              <p className="mt-4 whitespace-pre-wrap rounded-2xl border-l-8 border-gold bg-cream p-4 text-sm text-ink">{inq.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
