import { prisma } from './prisma.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function parseAdminEmails(raw: string): { emails: string[] } | { error: string } {
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const invalid = emails.find((e) => !EMAIL_PATTERN.test(e))
  if (invalid) return { error: `"${invalid}" isn't a valid email address.` }
  return { emails }
}

export async function resolveJoinCode(
  email: string,
  rawCode: string,
): Promise<{ organizationId: string; role: 'org_admin' | 'teacher' } | { error: string }> {
  const org = await prisma.organization.findUnique({ where: { joinCode: normalizeJoinCode(rawCode) } })
  if (!org) return { error: "That school code wasn't recognized." }
  const admins = (org.adminEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return { organizationId: org.id, role: admins.includes(email.toLowerCase()) ? 'org_admin' : 'teacher' }
}

// Re-derives role for every current member of an org after its adminEmails
// list changes, and adopts any pre-existing independent user whose email is
// now a listed admin (e.g. they signed up solo before the district deal was
// formalized). Never touches a superadmin's role — the global ADMIN_EMAILS
// allowlist always wins over any org-level assignment.
export async function syncOrganizationRoles(organizationId: string, adminEmails: string | null) {
  const admins = (adminEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const members = await prisma.user.findMany({ where: { organizationId, role: { not: 'superadmin' } } })
  await Promise.all(
    members.map((m) =>
      prisma.user.update({
        where: { id: m.id },
        data: { role: admins.includes(m.email.toLowerCase()) ? 'org_admin' : 'teacher' },
      }),
    ),
  )

  if (admins.length > 0) {
    await prisma.user.updateMany({
      where: { email: { in: admins }, organizationId: null, role: { not: 'superadmin' } },
      data: { organizationId, role: 'org_admin' },
    })
  }
}

// Adds or removes one email on an org's adminEmails list. The list, not the
// user row, is what makes someone a school admin — resolveSignInRole
// re-derives role from it on every sign-in — so an admin edit that only
// touched User.role would quietly revert the next time that person signed in.
export async function setListedAsAdmin(organizationId: string, email: string, listed: boolean) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!org) return
  const normalized = email.toLowerCase()
  const current = (org.adminEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const next = listed
    ? current.includes(normalized) ? current : [...current, normalized]
    : current.filter((e) => e !== normalized)
  if (next.length === current.length && next.every((e, i) => e === current[i])) return
  await prisma.organization.update({
    where: { id: organizationId },
    data: { adminEmails: next.length > 0 ? next.join(', ') : null },
  })
}

function listsAdmin(adminEmails: string | null, email: string): boolean {
  return (adminEmails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}

// The role and organization a user should have at sign-in. The global
// ADMIN_EMAILS allowlist wins; otherwise a user whose email is listed on an
// organization's adminEmails is that org's admin — their current org if it
// lists them, or (for an independent user) whichever org does, so a school
// admin who creates their account after the org was set up is adopted on
// their first sign-in instead of landing as a plain teacher. Everyone else
// is a teacher and keeps whatever organization they already joined.
export async function resolveSignInRole(
  email: string,
  isSuperadmin: boolean,
  current: { organizationId: string | null } | null,
): Promise<{ role: 'superadmin' | 'org_admin' | 'teacher'; organizationId?: string }> {
  if (isSuperadmin) return { role: 'superadmin' }
  const normalized = email.toLowerCase()
  if (current?.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: current.organizationId } })
    return { role: org && listsAdmin(org.adminEmails, normalized) ? 'org_admin' : 'teacher' }
  }
  const candidates = await prisma.organization.findMany({
    where: { adminEmails: { contains: normalized, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  })
  const org = candidates.find((o) => listsAdmin(o.adminEmails, normalized))
  return org ? { role: 'org_admin', organizationId: org.id } : { role: 'teacher' }
}

export async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const existing = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (!existing) return code
  }
  throw new Error('Could not generate a unique join code')
}
