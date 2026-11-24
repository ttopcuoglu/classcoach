// School Admin's pages, in the order the sidebar shows them, each at its own
// address (/admin/<slug>) so back, refresh and a shared link all land on the
// page they should. The sidebar (Layout) and the admin page (AdminDashboard)
// both read this, so the menu and the routes can't drift apart.

export type AdminPage =
  | 'dashboard'
  | 'engagement'
  | 'insights'
  | 'professionalLearning'
  | 'coachingPriorities'
  | 'people'
  | 'lessonFormat'
  | 'canvas'
  | 'organizations'
  | 'platformUsers'
  | 'schoolInquiries'
  | 'leadersCorner'
  | 'evaluations'
  | 'observations'
  | 'planReviews'
  | 'supervisorAssignments'

export type AdminGroup = 'leader' | 'overview' | 'instruction' | 'insights' | 'coaching' | 'manage' | 'settings' | 'internal'

export type AdminNavItem = { page: AdminPage; slug: string; label: string; group: AdminGroup; superadminOnly?: boolean }

export const ADMIN_NAV: AdminNavItem[] = [
  // Only for someone a superadmin has given a level (AdminNav). Its own route
  // in App, not an AdminDashboard tab: a department head with no admin role
  // can open it, and the dashboard's school data would refuse them.
  { page: 'leadersCorner', slug: 'leaders-corner', label: 'Leader’s Corner', group: 'leader' },
  { page: 'dashboard', slug: '', label: 'Dashboard', group: 'overview' },
  // Self Evaluations teachers shared with this person as their supervisor. Its own
  // route in App, like Leader's Corner: a supervisor need not be an admin.
  { page: 'evaluations', slug: 'evaluations', label: 'Evaluations', group: 'instruction' },
  // A supervisor's classroom observations (pages/observations/). Same rule as
  // Evaluations: anyone the school made a supervisor.
  { page: 'observations', slug: 'observations', label: 'Observations', group: 'instruction' },
  // A supervisor's reviews of teachers' lesson plans (pages/planReviews/).
  { page: 'planReviews', slug: 'lesson-plan-reviews', label: 'Lesson Plans', group: 'instruction' },
  { page: 'engagement', slug: 'usage', label: 'Usage & Engagement', group: 'insights' },
  { page: 'insights', slug: 'insights', label: 'Coaching Insights', group: 'insights' },
  { page: 'professionalLearning', slug: 'professional-learning', label: 'Professional Learning', group: 'insights' },
  { page: 'coachingPriorities', slug: 'coaching-priorities', label: 'Coaching Priorities', group: 'coaching' },
  { page: 'people', slug: 'people', label: 'People', group: 'manage' },
  { page: 'supervisorAssignments', slug: 'supervisors', label: 'Supervisor Assignments', group: 'manage' },
  { page: 'lessonFormat', slug: 'lesson-format', label: 'Lesson Plan Format', group: 'settings' },
  { page: 'canvas', slug: 'lms', label: 'LMS Connections', group: 'settings' },
  { page: 'organizations', slug: 'organizations', label: 'Organizations', group: 'internal', superadminOnly: true },
  { page: 'platformUsers', slug: 'platform-users', label: 'Platform users', group: 'internal', superadminOnly: true },
  { page: 'schoolInquiries', slug: 'school-inquiries', label: 'School inquiries', group: 'internal', superadminOnly: true },
]

export const ADMIN_GROUP_LABEL: Record<AdminGroup, string> = {
  leader: 'For you',
  overview: 'Overview',
  instruction: 'Instruction',
  insights: 'Insights',
  coaching: 'Coaching',
  manage: 'Manage',
  settings: 'Settings',
  internal: 'Wivoza internal',
}

export function adminPath(page: AdminPage): string {
  const slug = ADMIN_NAV.find((i) => i.page === page)?.slug ?? ''
  return slug ? `/admin/${slug}` : '/admin'
}

/// The page an /admin address names; an unknown slug is the Dashboard.
export function adminPageFor(pathname: string): AdminPage {
  const slug = pathname.replace(/^\/admin\/?/, '').split('/')[0]
  return ADMIN_NAV.find((i) => i.slug === slug)?.page ?? 'dashboard'
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || (pathname.startsWith('/admin/') && !pathname.startsWith('/admin/pilot-report'))
}
