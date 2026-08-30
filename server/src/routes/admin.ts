import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAdmin, requireSuperadmin } from '../lib/auth.ts'
import { generateUniqueJoinCode, normalizeJoinCode, parseAdminEmails, syncOrganizationRoles } from '../lib/organization.ts'
import { prisma } from '../lib/prisma.ts'
import { SCENARIO_CATEGORIES } from '../lib/scenarioCategories.ts'

export const adminRouter = Router()

adminRouter.use(requireAdmin)

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKLY_TREND_WEEKS = 6

// Shared by /overview and /members — resolves which organization (if any)
// the requester is allowed to see: an org_admin always sees their own,
// unset for everyone else unless a superadmin explicitly selects one via
// ?organizationId=. Never lets an org_admin view another org's data.
async function resolveScope(req: Request, res: Response) {
  const requester = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!requester) {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }

  let organizationId: string | null = null
  let scope: 'platform' | 'organization' = 'platform'

  if (requester.role === 'org_admin') {
    organizationId = requester.organizationId
    scope = 'organization'
  } else if (requester.role === 'superadmin') {
    const requested = typeof req.query.organizationId === 'string' ? req.query.organizationId : null
    if (requested) {
      organizationId = requested
      scope = 'organization'
    }
  } else {
    res.status(403).json({ error: 'Admin access required' })
    return null
  }

  let organizationName: string | null = null
  if (scope === 'organization') {
    if (!organizationId) {
      res.status(400).json({ error: 'This account is not assigned to an organization yet.' })
      return null
    }
    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) {
      res.status(404).json({ error: 'Organization not found' })
      return null
    }
    organizationName = org.name
  }

  return { scope, organizationId, organizationName }
}

// Aggregate, staff-wide numbers only — deliberately no route exists that
// returns one teacher's individual attempts, responses, or ratings. That's
// the whole point of the "aggregate trends only" admin visibility choice,
// unchanged whether the requester sees the whole platform or just their own
// organization.
adminRouter.get('/overview', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { scope, organizationId, organizationName } = resolved

  const userScope = organizationId ? { organizationId } : {}
  const relatedUserScope = organizationId ? { user: { organizationId } } : {}

  // A week navigator — weekOffset=0 is the current week, 1 is the week
  // before, etc. Only affects the stat cards below, not the 6-week trend
  // (that always shows the most recent 6 weeks ending now).
  const weekOffsetRaw = typeof req.query.weekOffset === 'string' ? parseInt(req.query.weekOffset, 10) : 0
  const weekOffset = Number.isFinite(weekOffsetRaw) && weekOffsetRaw >= 0 ? weekOffsetRaw : 0
  const weekEnd = new Date(Date.now() - weekOffset * 7 * DAY_MS)
  const weekStart = new Date(weekEnd.getTime() - 7 * DAY_MS)
  const priorWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS)

  const totalTeachers = await prisma.user.count({ where: { role: 'teacher', ...userScope } })

  const activeUserIds = await prisma.usageLog.findMany({
    where: { createdAt: { gte: weekStart, lt: weekEnd }, ...relatedUserScope },
    select: { userId: true },
    distinct: ['userId'],
  })

  // Category lives on the related Scenario, which Prisma can't group by
  // directly, so pull rows and tally by category in JS instead. All-time,
  // cumulative — not scoped to the selected week.
  const attempts = await prisma.scenarioAttempt.findMany({
    where: { ...relatedUserScope },
    include: { scenario: true },
  })
  const debriefs = await prisma.debrief.findMany({ where: { category: { not: null }, ...relatedUserScope } })

  // Every category is always present, even at zero — a category with no
  // tallied attempts is a confirmed zero (a complete count, not a sample),
  // never rendered as "unavailable" on the client.
  const categoryTally = new Map<string, number>(SCENARIO_CATEGORIES.map((c) => [c, 0]))
  for (const a of attempts) {
    categoryTally.set(a.scenario.category, (categoryTally.get(a.scenario.category) ?? 0) + 1)
  }
  for (const d of debriefs) {
    if (!d.category) continue
    categoryTally.set(d.category, (categoryTally.get(d.category) ?? 0) + 1)
  }

  const recentRated = attempts.filter((a) => a.rating != null && a.createdAt >= weekStart && a.createdAt < weekEnd)
  const priorRated = attempts.filter(
    (a) => a.rating != null && a.createdAt >= priorWeekStart && a.createdAt < weekStart,
  )
  const strongCount = (rows: typeof attempts) => rows.filter((a) => (a.rating ?? 0) >= 4).length

  // Weekly activity trend — the 6 most recent weeks ending now, independent
  // of the navigator above. Every week always resolves to a real count
  // (possibly 0), since it's a complete tally of UsageLog rows, not a
  // sample — no "unavailable" state applies here.
  const weeklyActivity: { weekStart: string; activeCount: number }[] = []
  for (let i = WEEKLY_TREND_WEEKS - 1; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * DAY_MS)
    const start = new Date(end.getTime() - 7 * DAY_MS)
    const ids = await prisma.usageLog.findMany({
      where: { createdAt: { gte: start, lt: end }, ...relatedUserScope },
      select: { userId: true },
      distinct: ['userId'],
    })
    weeklyActivity.push({ weekStart: start.toISOString(), activeCount: ids.length })
  }

  res.json({
    scope,
    organizationName,
    totalTeachers,
    activeThisWeek: activeUserIds.length,
    weekOffset,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    categoryTally: Object.fromEntries(categoryTally),
    growth: {
      recentStrong: strongCount(recentRated),
      recentTotal: recentRated.length,
      priorStrong: strongCount(priorRated),
      priorTotal: priorRated.length,
    },
    weeklyActivity,
  })
})

// Names/emails only — no attempts, ratings, or any practice content. Only
// visible when a concrete organization is in view (an org_admin's own org,
// or a superadmin's selected one) — never a platform-wide roster.
adminRouter.get('/members', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization to view its members.' })
    return
  }

  const members = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, jobTitle: true, role: true, suspendedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  res.json(members)
})

// Un-enrolls a teacher from their org (org_admin's real, scoped power —
// no data is touched, they simply become independent again and could
// rejoin later with the join code). An org_admin can only reach members of
// their own org; a superadmin must have that org selected first — both
// enforced by comparing the target's organizationId against resolveScope's
// result, not just trusting the :id in the URL.
adminRouter.delete('/members/:id', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return
  }

  const targetId = req.params.id as string
  const target = await prisma.user.findUnique({ where: { id: targetId } })
  if (!target || target.organizationId !== organizationId) {
    res.status(404).json({ error: 'Member not found in this organization.' })
    return
  }

  await prisma.user.update({ where: { id: targetId }, data: { organizationId: null, role: 'teacher' } })
  res.json({ status: 'ok' })
})

// Everything below is superadmin-only — creating/editing/deleting
// organizations is a platform-operator action, not something a district's
// own org_admin should ever see or touch.

adminRouter.get('/organizations', requireSuperadmin, async (_req, res) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true } } },
  })
  res.json(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      joinCode: o.joinCode,
      adminEmails: o.adminEmails,
      teacherCount: o._count.users,
    })),
  )
})

adminRouter.post('/organizations', requireSuperadmin, async (req, res) => {
  const { name, joinCode, adminEmails } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  let normalizedAdminEmails: string | null = null
  if (adminEmails !== undefined && adminEmails !== null && adminEmails !== '') {
    if (typeof adminEmails !== 'string') {
      res.status(400).json({ error: 'adminEmails must be a comma-separated string' })
      return
    }
    const parsed = parseAdminEmails(adminEmails)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    normalizedAdminEmails = parsed.emails.join(',')
  }

  let code: string
  if (typeof joinCode === 'string' && joinCode.trim()) {
    code = normalizeJoinCode(joinCode)
    const existing = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (existing) {
      res.status(409).json({ error: 'That join code is already in use.' })
      return
    }
  } else {
    code = await generateUniqueJoinCode()
  }

  const org = await prisma.organization.create({
    data: { name: name.trim(), joinCode: code, adminEmails: normalizedAdminEmails },
  })

  if (normalizedAdminEmails) {
    await syncOrganizationRoles(org.id, normalizedAdminEmails)
  }

  res.status(201).json({
    id: org.id,
    name: org.name,
    joinCode: org.joinCode,
    adminEmails: org.adminEmails,
    teacherCount: 0,
  })
})

adminRouter.patch('/organizations/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const { name, joinCode, adminEmails } = req.body ?? {}

  const existing = await prisma.organization.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const data: { name?: string; joinCode?: string; adminEmails?: string | null } = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' })
      return
    }
    data.name = name.trim()
  }

  if (joinCode !== undefined) {
    if (typeof joinCode !== 'string' || !joinCode.trim()) {
      res.status(400).json({ error: 'joinCode must be a non-empty string' })
      return
    }
    const code = normalizeJoinCode(joinCode)
    const collision = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (collision && collision.id !== id) {
      res.status(409).json({ error: 'That join code is already in use.' })
      return
    }
    data.joinCode = code
  }

  let normalizedAdminEmails: string | null | undefined
  if (adminEmails !== undefined) {
    if (adminEmails === null || adminEmails === '') {
      normalizedAdminEmails = null
    } else if (typeof adminEmails === 'string') {
      const parsed = parseAdminEmails(adminEmails)
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error })
        return
      }
      normalizedAdminEmails = parsed.emails.join(',')
    } else {
      res.status(400).json({ error: 'adminEmails must be a comma-separated string' })
      return
    }
    data.adminEmails = normalizedAdminEmails
  }

  const updated = await prisma.organization.update({ where: { id }, data })

  // A district swapping their point of contact takes effect immediately for
  // existing members, not just future signups.
  if (normalizedAdminEmails !== undefined) {
    await syncOrganizationRoles(id, normalizedAdminEmails)
  }

  const teacherCount = await prisma.user.count({ where: { organizationId: id } })
  res.json({
    id: updated.id,
    name: updated.name,
    joinCode: updated.joinCode,
    adminEmails: updated.adminEmails,
    teacherCount,
  })
})

// onDelete: SetNull on User.organizationId orphans former members back to
// independent teachers automatically — no manual cleanup needed here.
adminRouter.delete('/organizations/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const existing = await prisma.organization.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }
  await prisma.organization.delete({ where: { id } })
  res.json({ status: 'ok' })
})

// Platform-wide roster — the one place a superadmin can find any account,
// including an independent teacher who isn't in any org and so never shows
// up in a /members list. /members deliberately never allows this
// unscoped view for anyone else.
adminRouter.get('/users', requireSuperadmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspendedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      organizationName: u.organization?.name ?? null,
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
    })),
  )
})

adminRouter.post('/users/:id/suspend', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const { suspended } = req.body ?? {}
  if (typeof suspended !== 'boolean') {
    res.status(400).json({ error: 'suspended must be a boolean' })
    return
  }
  if (id === req.user!.userId) {
    res.status(400).json({ error: "You can't suspend your own account." })
    return
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedAt: suspended ? new Date() : null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspendedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
  })
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    organizationName: updated.organization?.name ?? null,
    suspendedAt: updated.suspendedAt,
    createdAt: updated.createdAt,
  })
})

// Cascades to every model owned by this user (ScenarioAttempt, Debrief,
// ParentMessage, UsageLog, AudioSession -> TranscriptSegment, LessonPlan,
// ConversationPrep, ConversationPlan) — all already onDelete: Cascade in
// the schema, so this one call cleanly removes everything.
adminRouter.delete('/users/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  if (id === req.user!.userId) {
    res.status(400).json({ error: "You can't delete your own account." })
    return
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  await prisma.user.delete({ where: { id } })
  res.json({ status: 'ok' })
})
