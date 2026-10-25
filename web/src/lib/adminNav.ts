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

export type AdminGroup = 'overview' | 'insights' | 'coaching' | 'manage' | 'settings' | 'internal'

export type AdminNavItem = { page: AdminPage; slug: string; label: string; group: AdminGroup; superadminOnly?: boolean }

export const ADMIN_NAV: AdminNavItem[] = [
  { page: 'dashboard', slug: '', label: 'Dashboard', group: 'overview' },
  { page: 'engagement', slug: 'usage', label: 'Usage & Engagement', group: 'insights' },
  { page: 'insights', slug: 'insights', label: 'Coaching Insights', group: 'insights' },
  { page: 'professionalLearning', slug: 'professional-learning', label: 'Professional Learning', group: 'insights' },
  { page: 'coachingPriorities', slug: 'coaching-priorities', label: 'Coaching Priorities', group: 'coaching' },
  { page: 'people', slug: 'people', label: 'People', group: 'manage' },
  { page: 'lessonFormat', slug: 'lesson-format', label: 'Lesson Plan Format', group: 'settings' },
  { page: 'canvas', slug: 'lms', label: 'LMS Connections', group: 'settings' },
  { page: 'organizations', slug: 'organizations', label: 'Organizations', group: 'internal', superadminOnly: true },
  { page: 'platformUsers', slug: 'platform-users', label: 'Platform users', group: 'internal', superadminOnly: true },
  { page: 'schoolInquiries', slug: 'school-inquiries', label: 'School inquiries', group: 'internal', superadminOnly: true },
]

export const ADMIN_GROUP_LABEL: Record<AdminGroup, string> = {
  overview: 'Overview',
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
