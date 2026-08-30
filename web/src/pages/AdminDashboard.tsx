import { useEffect, useState } from 'react'
import {
  createOrganization,
  deleteOrganization,
  getAdminOverview,
  getMe,
  getOrganizationMembers,
  getOrganizations,
  updateOrganization,
  type AdminOverview,
  type Organization,
  type OrgMember,
  type UserProfile,
} from '../lib/api'
import { categoryLabel } from '../lib/categories'

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const inputClass =
  'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60'

const primaryButtonClass =
  'rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50'

function pillClass(active: boolean) {
  return `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'border-brand-500 bg-brand-50 text-brand-600'
      : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
  }`
}

type Tab = 'overview' | 'organizations'

export default function AdminDashboard() {
  const [me, setMe] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => {})
  }, [])

  const isSuperadmin = me?.role === 'superadmin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Admin Overview</h1>
        <span className="inline-flex w-fit items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">
          Aggregate, staff-wide trends only — no individual teacher's attempts or ratings are ever shown here
        </span>
      </div>

      {isSuperadmin && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab('overview')} className={pillClass(tab === 'overview')}>
            Overview
          </button>
          <button type="button" onClick={() => setTab('organizations')} className={pillClass(tab === 'organizations')}>
            Organizations
          </button>
        </div>
      )}

      {tab === 'overview' ? <OverviewPanel isSuperadmin={isSuperadmin} /> : <OrganizationsPanel />}
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
      <h3 className="text-sm font-semibold text-ink">Weekly activity</h3>
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

function MembersList({ organizationId }: { organizationId?: string }) {
  const [members, setMembers] = useState<OrgMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMembers(null)
    setError(null)
    getOrganizationMembers(organizationId)
      .then(setMembers)
      .catch(() => setError('Could not load members.'))
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
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{m.name ?? m.email}</p>
                <p className="text-xs text-ink-soft">
                  {m.email}
                  {m.jobTitle ? ` · ${m.jobTitle}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.role === 'org_admin' && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                    Admin
                  </span>
                )}
                <span className="text-xs text-ink-soft">
                  Joined{' '}
                  {new Date(m.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OverviewPanel({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    if (isSuperadmin) {
      getOrganizations()
        .then(setOrgs)
        .catch(() => {})
    }
  }, [isSuperadmin])

  useEffect(() => {
    setOverview(null)
    setError(null)
    getAdminOverview({ organizationId: selectedOrgId || undefined, weekOffset })
      .then(setOverview)
      .catch(() => setError('Could not load the admin overview.'))
  }, [selectedOrgId, weekOffset])

  function handleOrgChange(id: string) {
    setSelectedOrgId(id)
    setWeekOffset(0)
  }

  const sortedCategories = overview
    ? Object.entries(overview.categoryTally).sort((a, b) => b[1] - a[1])
    : []
  const maxCount = Math.max(1, ...sortedCategories.map(([, c]) => c))

  return (
    <>
      {isSuperadmin && orgs.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="org-select" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Viewing
          </label>
          <select
            id="org-select"
            value={selectedOrgId}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm text-ink focus:border-brand-400 focus:outline-none"
          >
            <option value="">Platform-wide</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isSuperadmin && overview?.organizationName && (
        <p className="text-sm font-semibold text-ink">Showing data for {overview.organizationName}</p>
      )}

      {error && <p className="text-sm text-warm-500">{error}</p>}

      {!overview ? (
        <p className="text-sm text-ink-soft">Loading...</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink-soft hover:border-brand-400 hover:text-brand-600"
              aria-label="Previous week"
            >
              ‹
            </button>
            <p className="text-sm font-semibold text-ink">
              {weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Last Week' : `${weekOffset} weeks ago`}
              <span className="ml-1.5 font-normal text-ink-soft">
                · {formatShortDate(overview.weekStart)} – {formatShortDate(overview.weekEnd)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              disabled={weekOffset === 0}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink-soft hover:border-brand-400 hover:text-brand-600 disabled:opacity-40"
              aria-label="Next week"
            >
              ›
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Total teachers</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{overview.totalTeachers}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Active this week</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {overview.activeThisWeek} of {overview.totalTeachers}
              </p>
            </div>
          </div>

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

          <div className="rounded-2xl border border-border bg-surface p-5">
            <WeeklyActivityChart data={overview.weeklyActivity} />
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Practice by category ({overview.organizationName ?? 'all teachers'})
            </h2>
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
                  <span className="w-24 shrink-0 text-right text-sm text-ink-soft">
                    {count === 0 ? 'no activity yet' : count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {overview.scope === 'organization' && <MembersList organizationId={selectedOrgId || undefined} />}
        </>
      )}
    </>
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
