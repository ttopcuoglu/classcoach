import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { logout } from '../lib/api'
import type { UserProfile } from '../lib/api'
import {
  ArrowUpIcon,
  ChatBubbleIcon,
  ChecklistIcon,
  HomeIcon,
  LessonPlanIcon,
  MailIcon,
  MicIcon,
  ScenarioIcon,
  StarIcon,
  UserIcon,
} from './icons'

type IconComponent = (props: { className?: string }) => React.ReactElement
type NavItem = { to: string; label: string; icon: IconComponent }
type NavGroup = { label: string; icon: IconComponent; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Coach',
    icon: MicIcon,
    items: [{ to: '/audio-coaching', label: 'Audio Coaching', icon: MicIcon }],
  },
  {
    label: 'Plan',
    icon: LessonPlanIcon,
    items: [{ to: '/lesson-planning', label: 'Lesson Planning', icon: LessonPlanIcon }],
  },
  {
    label: 'Connect',
    icon: MailIcon,
    items: [
      { to: '/parent-messages', label: 'Parent Messages', icon: MailIcon },
      { to: '/difficult-conversations', label: 'Difficult Conversations', icon: ChatBubbleIcon },
    ],
  },
  {
    label: 'Manage',
    icon: ScenarioIcon,
    items: [{ to: '/coach-chat', label: 'Coach Chat', icon: ChatBubbleIcon }],
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
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:bg-canvas hover:text-ink',
  ].join(' ')
}

function mobileNavClasses(isActive: boolean) {
  return [
    'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium',
    isActive ? 'text-brand-600' : 'text-ink-soft',
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

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold text-ink">Wivoza</p>
          <p className="text-xs text-ink-soft">Instructional coaching, sharpened</p>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={({ isActive }) => navLinkClasses(isActive)}>
            <HomeIcon className="h-5 w-5" />
            Home
          </NavLink>

          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft/70">
                {group.label}
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navLinkClasses(isActive)}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => navLinkClasses(isActive)}>
              <ChecklistIcon className="h-5 w-5" />
              Admin
            </NavLink>
          )}
        </nav>
        <div className="border-t border-border px-6 py-4">
          {user?.email && <p className="truncate text-xs text-ink-soft">{user.email}</p>}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <p className="text-base font-semibold text-ink">Wivoza</p>
          <button type="button" onClick={handleLogout} className="text-sm font-medium text-ink-soft">
            Log out
          </button>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-10 md:pb-10">
          <div className="mx-auto w-full max-w-4xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav — Home plus one button per category. Categories
            with a single tool link straight to it; categories with several
            (Manage, Grow) pop a small menu open above the button instead of
            picking one page for the user. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-border bg-surface py-2 md:hidden">
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
                  <div className="absolute bottom-full right-1/2 mb-2 w-44 translate-x-1/2 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                    {group.items.map(({ to, label, icon: SubIcon }) => (
                      <Link
                        key={to}
                        to={to}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-canvas"
                      >
                        <SubIcon className="h-4 w-4" />
                        {label}
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
