import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { logout, type FocusMetric } from '../lib/api'
import type { UserProfile } from '../lib/api'
import { FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import {
  ArrowUpIcon,
  ChartBarIcon,
  ChatBubbleIcon,
  ChecklistIcon,
  HomeIcon,
  LessonPlanIcon,
  MailIcon,
  MicIcon,
  StarIcon,
  TargetIcon,
  UserIcon,
  WaveformIcon,
} from './icons'

type IconComponent = (props: { className?: string }) => React.ReactElement
type NavItem = { to: string; label: string; icon: IconComponent; subtitle?: string }
type NavGroup = { label: string; icon: IconComponent; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Coaching',
    icon: MicIcon,
    items: [
      { to: '/talk-to-me', label: 'Talk It Through', icon: WaveformIcon, subtitle: 'live voice check-in' },
      { to: '/audio-coaching', label: 'Lesson Debrief', icon: MicIcon, subtitle: 'recorded-lesson report' },
      { to: '/coach-chat', label: 'Ask & Practice', icon: ChatBubbleIcon, subtitle: 'chat with your coach' },
    ],
  },
  {
    label: 'Plan',
    icon: LessonPlanIcon,
    items: [
      { to: '/lesson-planning', label: 'Lesson Planning', icon: LessonPlanIcon },
      { to: '/communications', label: 'Messages', icon: MailIcon },
    ],
  },
  {
    label: 'Grow',
    icon: ArrowUpIcon,
    items: [
      { to: '/profile', label: 'Profile', icon: UserIcon },
      { to: '/cheat-sheet', label: 'Cheat Sheet', icon: StarIcon },
      { to: '/first-30-days', label: 'First 30 Days', icon: ChecklistIcon },
    ],
  },
]

function navLinkClasses(isActive: boolean) {
  return [
    'flex items-center gap-3 rounded-r-lg border-l-4 py-2.5 pl-3 pr-3 text-sm font-medium transition-colors',
    isActive ? 'border-gold bg-forest-soft text-cream' : 'border-transparent text-cream/70 hover:bg-forest-soft/60 hover:text-cream',
  ].join(' ')
}

function mobileNavClasses(isActive: boolean) {
  return [
    'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium',
    isActive ? 'text-terracotta' : 'text-ink-soft',
  ].join(' ')
}

export default function Layout({ user, onLogout }: { user: UserProfile | null; onLogout: () => void }) {
  const location = useLocation()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  useEffect(() => {
    setOpenGroup(null)
  }, [location.pathname])

  async function handleLogout() {
    await logout().catch(() => {})
    onLogout()
  }

  function isGroupActive(group: NavGroup) {
    return group.items.some((item) => location.pathname.startsWith(item.to))
  }

  const focusMetric = user?.focusMetric as FocusMetric | null | undefined

  return (
    <div className="flex min-h-screen bg-cream text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-forest md:flex md:flex-col">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold text-forest">
            <ChartBarIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-base font-bold text-cream">Wivoza</p>
            <p className="text-[11px] text-cream/50">Practice. Reflect. Grow.</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={({ isActive }) => navLinkClasses(isActive)}>
            <HomeIcon className="h-5 w-5" />
            Home
          </NavLink>

          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-cream/40">{group.label}</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {group.items.map(({ to, label, icon: Icon, subtitle }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navLinkClasses(isActive)}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex flex-col leading-tight">
                      <span>{label}</span>
                      {subtitle && <span className="text-xs font-normal text-cream/50">{subtitle}</span>}
                    </span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Real data only — the teacher's own chosen My Growth focus metric,
            not an invented streak or weekly-action count. */}
        <div className="mx-3 mb-3 rounded-2xl bg-forest-soft p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-tint text-terracotta-600">
            <TargetIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-cream">Your focus</p>
          <p className="mt-0.5 text-xs text-cream/60">
            {focusMetric ? FOCUS_METRIC_LABELS[focusMetric] : 'Not set yet'}
          </p>
          <Link to="/audio-coaching" className="mt-2.5 inline-block text-xs font-semibold text-gold hover:underline">
            View your trends →
          </Link>
        </div>

        {user != null && user.role !== 'teacher' && (
          <div className="border-t border-cream/10 px-3 py-3">
            <NavLink to="/admin" className={({ isActive }) => navLinkClasses(isActive)}>
              <ChecklistIcon className="h-5 w-5 shrink-0" />
              Admin
            </NavLink>
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t border-cream/10 px-6 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-forest">
            {(user?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-cream">{user?.name || user?.email}</p>
            <button type="button" onClick={handleLogout} className="text-xs font-medium text-cream/50 hover:text-cream">
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-hairline bg-cream-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-4 w-4" />
            </span>
            <p className="font-heading text-base font-bold text-forest">Wivoza</p>
          </div>
          <button type="button" onClick={handleLogout} className="text-sm font-medium text-ink-soft">
            Log out
          </button>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-10 md:pb-10">
          <div className="mx-auto w-full max-w-4xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav — Home plus one button per category. A category
            with a single tool links straight to it; one with several
            (Coaching, Plan, Grow) pops a small menu open above the button
            instead of picking one page for the user. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-hairline bg-cream-card py-2 md:hidden">
          <NavLink to="/" end className={({ isActive }) => mobileNavClasses(isActive)}>
            <HomeIcon className="h-5 w-5" />
            Home
          </NavLink>

          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon
            if (group.items.length === 1) {
              const item = group.items[0]
              return (
                <NavLink key={group.label} to={item.to} className={({ isActive }) => mobileNavClasses(isActive)}>
                  <GroupIcon className="h-5 w-5" />
                  {group.label}
                </NavLink>
              )
            }

            const open = openGroup === group.label
            return (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.label)}
                  className={mobileNavClasses(isGroupActive(group) || open)}
                >
                  <GroupIcon className="h-5 w-5" />
                  {group.label}
                </button>
                {open && (
                  <div className="absolute bottom-full right-1/2 mb-2 w-44 translate-x-1/2 rounded-xl border border-hairline bg-cream-card p-1.5 shadow-lg">
                    {group.items.map(({ to, label, icon: SubIcon, subtitle }) => (
                      <Link
                        key={to}
                        to={to}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream"
                      >
                        <SubIcon className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col leading-tight">
                          <span>{label}</span>
                          {subtitle && <span className="text-[11px] font-normal text-ink-soft">{subtitle}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
