import { useEffect, useState } from 'react'
import {
  createOrganization,
  deleteOrganization,
  getAdminOverview,
  getMe,
  getOrganizations,
  updateOrganization,
  type AdminOverview,
  type Organization,
  type UserProfile,
} from '../lib/api'
import { categoryLabel } from '../lib/categories'

function formatShare(share: number | null): string {
  if (share == null) return '—'
  return `${Math.round(share * 100)}%`
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Admin Overview</h1>
        <p className="text-ink-soft">
          Aggregate, staff-wide trends only — no individual teacher's attempts or ratings are ever shown here.
        </p>
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

function OverviewPanel({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')

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
    getAdminOverview(selectedOrgId || undefined)
      .then(setOverview)
      .catch(() => setError('Could not load the admin overview.'))
  }, [selectedOrgId])

  const sortedCategories = overview
    ? Object.entries(overview.categoryTally).sort((a, b) => b[1] - a[1])
    : []
  const maxCount = sortedCategories.length > 0 ? sortedCategories[0][1] : 1

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
            onChange={(e) => setSelectedOrgId(e.target.value)}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Staff-wide growth signal
            </p>
            <p className="mt-1 text-sm text-ink">
              {formatShare(overview.growth.recentStrongShare)} of rated practice this week showed strong
              technique, vs. {formatShare(overview.growth.priorStrongShare)} the week before.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Practice by category ({overview.organizationName ?? 'all teachers'})
            </h2>
            {sortedCategories.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No practice activity yet.</p>
            ) : (
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
                    <span className="w-8 shrink-0 text-right text-sm text-ink-soft">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
