import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout, type FocusMetric } from '../lib/api'
import type { UserProfile } from '../lib/api'
import { FOCUS_METRIC_LABELS } from '../lib/focusMetrics'
import {
  BookIcon,
  ChecklistIcon,
  HomeIcon,
  MicIcon,
  ScenarioIcon,
  TargetIcon,
  UserIcon,
  WaveformIcon,
} from './icons'

type IconComponent = (props: { className?: string }) => React.ReactElement
type NavItem = { to: string; label: string; icon: IconComponent; subtitle?: string }
/// A group header is optional now. Three of the four surfaces stand on their
/// own; only Look It Over gets one, because "before and after" is what
/// explains why reviewing a document and debriefing a lesson are the same
/// kind of act at opposite ends of it.
type NavGroup = { label?: string; icon: IconComponent; items: NavItem[] }

// Four surfaces, down from nine tools in three groups.
//
// The nine were not nine different things — they were four things with
// doors cut into them at different angles. "Ask & Practice" and "Talk It
// Through" were both a teacher talking something over. "Get Feedback",
// "Review a Presentation", "Review an assignment" and "Review My
// Communication" were one act performed on four file types. A teacher who
// knew what they wanted still had to work out which of nine names it lived
// behind, and the subtitles underneath them were the tell: every one was
// explaining what the label failed to.
//
// The subtitles that survive are doing a different job: they say WHEN, not
// what. "Before students see it" and "After you taught it" are the two ends
// of the same lesson, which is the distinction the old IA never drew.
const NAV_GROUPS: NavGroup[] = [
  {
    icon: WaveformIcon,
    items: [
      { to: '/talk', label: 'Talk It Through', icon: WaveformIcon, subtitle: 'ask, or think out loud' },
      { to: '/practice', label: 'Practice', icon: ScenarioIcon, subtitle: 'rehearse the move' },
    ],
  },
  {
    label: 'Before and after',
    icon: BookIcon,
    items: [
      { to: '/look-it-over', label: 'Look It Over', icon: BookIcon, subtitle: 'before students see it' },
      { to: '/debrief', label: 'Lesson Debrief', icon: MicIcon, subtitle: 'after you taught it' },
    ],
  },
  {
    icon: UserIcon,
    items: [
      { to: '/work', label: 'My Work', icon: ChecklistIcon, subtitle: 'everything you have made' },
      { to: '/profile', label: 'Profile', icon: UserIcon },
    ],
  },
]

/// The four surfaces, for the mobile bottom bar. Short labels: a bottom bar
/// has room for a word, not a phrase.
const PRIMARY_SURFACES: { to: string; label: string; icon: IconComponent }[] = [
  { to: '/talk', label: 'Talk', icon: WaveformIcon },
  { to: '/practice', label: 'Practice', icon: ScenarioIcon },
  { to: '/look-it-over', label: 'Review', icon: BookIcon },
  { to: '/debrief', label: 'Debrief', icon: MicIcon },
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
  const navigate = useNavigate()
  async function handleLogout() {
    await logout().catch(() => {})
    // Land on the home page rather than leaving the signed-out visitor on
    // whatever app URL they were on (/admin, /profile...).
    navigate('/', { replace: true })
    onLogout()
  }

  const focusMetric = user?.focusMetric as FocusMetric | null | undefined
  // Covers a school plan, admins and review accounts too — `plan` alone only
  // reflects a personal subscription.
  const hasPlus = user?.plusAccess != null || user?.plan === 'plus'
  // Every teacher sees the same four surfaces. The nav used to vary by
  // experience level to hide First 30 Days from veterans, which is gone — and
  // a nav that differs between accounts is a nav nobody can be told how to
  // use ("it's under Grow" was wrong for half of them).

  return (
    <div className="flex min-h-screen bg-cream text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-forest md:flex md:flex-col">
        <div className="flex flex-col items-start gap-1 px-6 py-6">
          <img src="/logo/wivoza-lockup-dark.png" alt="Wivoza" className="h-10 w-auto" />
          <p className="text-[11px] text-cream/50">Practice. Reflect. Grow.</p>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
          <NavLink to="/" end className={({ isActive }) => navLinkClasses(isActive)}>
            <HomeIcon className="h-5 w-5" />
            Home
          </NavLink>

          {NAV_GROUPS.map((group) => (
            <div key={group.items[0].to}>
              {group.label && (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-cream/40">
                  {group.label}
                </p>
              )}
              <div className={`flex flex-col gap-1 ${group.label ? 'mt-1.5' : ''}`}>
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
          <Link to="/debrief" className="mt-2.5 inline-block text-xs font-semibold text-gold hover:underline">
            View your trends →
          </Link>
        </div>

        {user != null && !hasPlus && (
          <div className="mx-3 mb-3 rounded-2xl bg-gold-tint p-4">
            <p className="text-sm font-semibold text-terracotta-600">Wivoza Plus</p>
            <p className="mt-1 text-xs text-forest/70">
              Unlimited Lesson Debrief, Look It Over, and Coach's memory.
            </p>
            <Link
              to="/profile"
              className="mt-2.5 inline-block rounded-lg bg-terracotta-600 px-3 py-1.5 text-xs font-semibold text-cream hover:bg-terracotta"
            >
              Upgrade — $9.99/month
            </Link>
          </div>
        )}

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
          <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-6 w-auto" />
          {/* My Work and Profile left the bottom bar to make room for the
              four surfaces, so they live here. */}
          <div className="flex items-center gap-4">
            <Link to="/work" className="text-sm font-medium text-ink-soft">
              My Work
            </Link>
            <Link to="/profile" className="text-sm font-medium text-ink-soft">
              Profile
            </Link>
            <button type="button" onClick={handleLogout} className="text-sm font-medium text-ink-soft">
              Log out
            </button>
          </div>
        </header>

        {user != null && !hasPlus && (
          <Link
            to="/profile"
            className="block bg-gold-tint px-4 py-2 text-center text-xs font-semibold text-terracotta-600 md:hidden"
          >
            Unlock unlimited coaching — Upgrade to Wivoza Plus →
          </Link>
        )}

        <main className="flex-1 px-4 py-6 pb-24 md:px-10 md:py-10 md:pb-10">
          {/* Reading width everywhere except the admin reports, which carry their
              own section menu beside the content — at the reading width that
              left the dashboards about 670px, too narrow for a row of stats. */}
          <div className={`mx-auto w-full ${location.pathname.startsWith('/admin') ? 'max-w-6xl' : 'max-w-4xl'}`}>
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

          {/* Flat, now that there are four surfaces rather than nine tools.
              The popover this replaces existed only because three groups of
              three could not fit a bottom bar — so tapping "Coaching" opened
              a menu to choose from, which is two taps to reach a thing whose
              name the teacher already knew. My Work and Profile live in the
              top bar on mobile; these five are what a teacher opens the app
              to do. */}
          {PRIMARY_SURFACES.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => mobileNavClasses(isActive)}>
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
