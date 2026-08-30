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

export async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const existing = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (!existing) return code
  }
  throw new Error('Could not generate a unique join code')
}
