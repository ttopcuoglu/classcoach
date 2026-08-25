import { NavLink, Outlet } from 'react-router-dom'
import { logout } from '../lib/api'
import type { UserProfile } from '../lib/api'
import { ChatBubbleIcon, ChecklistIcon, HomeIcon, MicIcon, ScenarioIcon, UserIcon } from './icons'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/try-it-out', label: 'Try It Out', icon: ScenarioIcon, end: false },
  { to: '/ask-an-expert', label: 'Ask an Expert', icon: ChatBubbleIcon, end: false },
  { to: '/audio-coaching', label: 'Audio Coaching', icon: MicIcon, end: false },
  { to: '/profile', label: 'Profile', icon: UserIcon, end: false },
]

function navLinkClasses(isActive: boolean) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-600'
      : 'text-ink-soft hover:bg-canvas hover:text-ink',
  ].join(' ')
}

export default function Layout({ user, onLogout }: { user: UserProfile | null; onLogout: () => void }) {
  async function handleLogout() {
    await logout().catch(() => {})
    onLogout()
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold text-ink">ClassCoach</p>
          <p className="text-xs text-ink-soft">Classroom management, sharpened</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive)}>
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
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
          <p className="text-base font-semibold text-ink">ClassCoach</p>
          <button type="button" onClick={handleLogout} className="text-sm font-medium text-ink-soft">
            Log out
          </button>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-10 md:pb-10">
          <div className="mx-auto w-full max-w-4xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-border bg-surface py-2 md:hidden">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium',
                  isActive ? 'text-brand-600' : 'text-ink-soft',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
