import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { UserProfile } from '../lib/api'
import { ADMIN_GROUP_LABEL, ADMIN_NAV, adminPageFor, adminPath, type AdminGroup, type AdminPage } from '../lib/adminNav'
import {
  ChartBarIcon,
  GearIcon,
  GraduationCapIcon,
  GridIcon,
  LessonPlanIcon,
  LightbulbIcon,
  SchoolIcon,
  ShieldIcon,
  TargetIcon,
  UserIcon,
} from './icons'

// The School Admin half of the one Wivoza sidebar: the workspace switch, the
// school, and the admin pages in their groups. Used by the desktop sidebar and
// the phone drawer alike (Layout), so the two can't offer different pages.

type IconComponent = (props: { className?: string }) => React.ReactElement

const ICON: Record<AdminPage, IconComponent> = {
  dashboard: GridIcon,
  engagement: ChartBarIcon,
  insights: LightbulbIcon,
  professionalLearning: GraduationCapIcon,
  coachingPriorities: TargetIcon,
  people: UserIcon,
  lessonFormat: LessonPlanIcon,
  canvas: GraduationCapIcon,
  organizations: ShieldIcon,
  platformUsers: ShieldIcon,
  schoolInquiries: ShieldIcon,
}

const MAIN_GROUPS: AdminGroup[] = ['overview', 'insights', 'coaching', 'manage']

export function adminNavLinkClasses(isActive: boolean) {
  return [
    'flex min-h-[44px] items-center gap-3 rounded-r-lg border-l-4 py-2 pl-3 pr-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
    isActive ? 'border-gold bg-forest-soft text-cream' : 'border-transparent text-cream/75 hover:bg-forest-soft/60 hover:text-cream',
  ].join(' ')
}

export function isAdminRole(user: UserProfile | null): boolean {
  return user != null && user.role !== 'teacher'
}

/// My Coaching | School Admin. Only for someone who can open School Admin;
/// each half opens its own home page, and which half is lit follows the
/// address, so back and forward keep it right.
export function WorkspaceSwitch({ admin, onPick }: { admin: boolean; onPick?: () => void }) {
  const navigate = useNavigate()
  const option = (on: boolean) =>
    `min-h-[40px] flex-1 rounded-lg px-2 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold/70 ${
      on ? 'bg-cream text-forest shadow-sm' : 'text-cream/70 hover:text-cream'
    }`
  return (
    <div role="group" aria-label="Workspace" className="flex gap-1 rounded-xl border border-cream/10 bg-black/15 p-1">
      <button
        type="button"
        aria-pressed={!admin}
        className={option(!admin)}
        onClick={() => {
          navigate('/')
          onPick?.()
        }}
      >
        My Coaching
      </button>
      <button
        type="button"
        aria-pressed={admin}
        className={option(admin)}
        onClick={() => {
          navigate('/admin')
          onPick?.()
        }}
      >
        School Admin
      </button>
    </div>
  )
}

function SchoolBlock({ user }: { user: UserProfile | null }) {
  const isSuperadmin = user?.role === 'superadmin'
  const name = user?.organization?.name ?? (isSuperadmin ? 'All schools' : 'Your school')
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-soft text-gold">
        <SchoolIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-cream">{name}</span>
        {isSuperadmin && <span className="block text-xs text-cream/60">Wivoza staff · pick a school on each page</span>}
      </span>
    </div>
  )
}

function AdminLink({ page, label, onPick }: { page: AdminPage; label: string; onPick?: () => void }) {
  const Icon = ICON[page]
  return (
    <NavLink to={adminPath(page)} end={page === 'dashboard'} onClick={onPick} className={({ isActive }) => adminNavLinkClasses(isActive)}>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

function GroupHeading({ group }: { group: AdminGroup }) {
  return <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-cream/60">{ADMIN_GROUP_LABEL[group]}</p>
}

/// The admin pages, grouped. Settings sits at the foot and opens on its own
/// whenever one of its pages is the one on screen.
export function AdminNav({ user, onPick }: { user: UserProfile | null; onPick?: () => void }) {
  const location = useLocation()
  const current = adminPageFor(location.pathname)
  const isSuperadmin = user?.role === 'superadmin'
  const settingsItems = ADMIN_NAV.filter((i) => i.group === 'settings')
  const settingsActive = settingsItems.some((i) => i.page === current)
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)
  const open = settingsOpen || settingsActive

  return (
    <div className="flex flex-1 flex-col gap-5">
      <SchoolBlock user={user} />
      {MAIN_GROUPS.map((group) => (
        <div key={group}>
          <GroupHeading group={group} />
          <div className="mt-1.5 flex flex-col gap-1">
            {ADMIN_NAV.filter((i) => i.group === group).map((i) => (
              <AdminLink key={i.page} page={i.page} label={i.label} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
      {isSuperadmin && (
        <div>
          <GroupHeading group="internal" />
          <div className="mt-1.5 flex flex-col gap-1">
            {ADMIN_NAV.filter((i) => i.group === 'internal').map((i) => (
              <AdminLink key={i.page} page={i.page} label={i.label} onPick={onPick} />
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto border-t border-cream/10 pt-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setSettingsOpen(!open)}
          className={adminNavLinkClasses(false)}
        >
          <GearIcon className="h-[18px] w-[18px] shrink-0" />
          <span className="flex-1 text-left">Settings</span>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
          </svg>
        </button>
        {open && (
          <div className="mt-1 flex flex-col gap-1 pl-4">
            {settingsItems.map((i) => (
              <AdminLink key={i.page} page={i.page} label={i.label} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
