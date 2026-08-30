import { Router } from 'express'
import { requireAdmin, requireSuperadmin } from '../lib/auth.ts'
import { generateUniqueJoinCode, normalizeJoinCode, parseAdminEmails, syncOrganizationRoles } from '../lib/organization.ts'
import { prisma } from '../lib/prisma.ts'

export const adminRouter = Router()

adminRouter.use(requireAdmin)

// Aggregate, staff-wide numbers only — deliberately no route exists that
// returns one teacher's individual attempts, responses, or ratings. That's
// the whole point of the "aggregate trends only" admin visibility choice,
// unchanged whether the requester sees the whole platform or just their own
// organization.
adminRouter.get('/overview', async (req, res) => {
  const requester = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!requester) {
    res.status(401).json({ error: 'Not signed in' })
    return
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
    return
  }

  let organizationName: string | null = null
  if (scope === 'organization') {
    if (!organizationId) {
      res.status(400).json({ error: 'This account is not assigned to an organization yet.' })
      return
    }
    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) {
      res.status(404).json({ error: 'Organization not found' })
      return
    }
    organizationName = org.name
  }

  const userScope = organizationId ? { organizationId } : {}
  const relatedUserScope = organizationId ? { user: { organizationId } } : {}

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const totalTeachers = await prisma.user.count({ where: { role: 'teacher', ...userScope } })

  const activeUserIds = await prisma.usageLog.findMany({
    where: { createdAt: { gte: sevenDaysAgo }, ...relatedUserScope },
    select: { userId: true },
    distinct: ['userId'],
  })

  // Category lives on the related Scenario, which Prisma can't group by
  // directly, so pull rows and tally by category in JS instead.
  const attempts = await prisma.scenarioAttempt.findMany({
    where: { ...relatedUserScope },
    include: { scenario: true },
  })
  const debriefs = await prisma.debrief.findMany({ where: { category: { not: null }, ...relatedUserScope } })

  const categoryTally = new Map<string, number>()
  for (const a of attempts) {
    categoryTally.set(a.scenario.category, (categoryTally.get(a.scenario.category) ?? 0) + 1)
  }
  for (const d of debriefs) {
    if (!d.category) continue
    categoryTally.set(d.category, (categoryTally.get(d.category) ?? 0) + 1)
  }

  const recentRated = attempts.filter((a) => a.rating != null && a.createdAt >= sevenDaysAgo)
  const priorRated = attempts.filter(
    (a) => a.rating != null && a.createdAt >= fourteenDaysAgo && a.createdAt < sevenDaysAgo,
  )
  const goodShare = (rows: typeof attempts) =>
    rows.length === 0 ? null : rows.filter((a) => (a.rating ?? 0) >= 4).length / rows.length

  res.json({
    scope,
    organizationName,
    totalTeachers,
    activeThisWeek: activeUserIds.length,
    categoryTally: Object.fromEntries(categoryTally),
    growth: {
      recentStrongShare: goodShare(recentRated),
      priorStrongShare: goodShare(priorRated),
    },
  })
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
