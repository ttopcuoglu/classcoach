import { Router } from 'express'
import { requireAuth, requireSuperadmin } from '../lib/auth.ts'
import { prisma } from '../lib/prisma.ts'

export const schoolInquiriesRouter = Router()

// The public /for-schools form. Unauthenticated and free to serve, but it
// writes rows, so it carries the same shape of protection as the support
// chat: a per-IP ceiling, a global daily ceiling, hard length limits, and a
// honeypot field real visitors never see.
const PER_IP_PER_HOUR = 5
const GLOBAL_PER_DAY = 200

const ORGANIZATION_TYPES = ['school', 'district', 'network', 'other'] as const
const TEACHER_COUNTS = ['1-25', '26-100', '101-500', '500+'] as const
const INTERESTS = ['pilot', 'license', 'demo', 'pd'] as const
const STATUSES = ['new', 'contacted', 'closed'] as const

const ipHits = new Map<string, number[]>()
let globalDay = ''
let globalCount = 0

function allowed(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== globalDay) {
    globalDay = today
    globalCount = 0
  }
  if (globalCount >= GLOBAL_PER_DAY) return false
  const cutoff = Date.now() - 60 * 60 * 1000
  if (ipHits.size > 5000) {
    for (const [key, times] of ipHits) if (times.every((t) => t <= cutoff)) ipHits.delete(key)
  }
  const recent = (ipHits.get(ip) ?? []).filter((t) => t > cutoff)
  ipHits.set(ip, recent)
  return recent.length < PER_IP_PER_HOUR
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

schoolInquiriesRouter.post('/', async (req, res) => {
  const body = req.body ?? {}

  // Honeypot: a visually hidden "website" field. A person never fills it; a
  // form-filling bot usually does. Answer as if it worked so the bot learns
  // nothing, and store nothing.
  if (text(body.website, 200)) {
    res.status(201).json({ ok: true })
    return
  }

  const name = text(body.name, 120)
  const email = text(body.email, 200)
  const role = text(body.role, 120)
  const organizationName = text(body.organizationName, 200)
  const organizationType = text(body.organizationType, 20)
  const state = text(body.state, 80) || null
  const teacherCount = text(body.teacherCount, 20) || null
  const message = text(body.message, 2000) || null
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((i: unknown): i is string => typeof i === 'string' && (INTERESTS as readonly string[]).includes(i))
    : []

  if (!name || !role || !organizationName) {
    res.status(400).json({ error: 'Please fill in your name, role, and school or district.' })
    return
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address so we can reach you.' })
    return
  }
  if (!(ORGANIZATION_TYPES as readonly string[]).includes(organizationType)) {
    res.status(400).json({ error: 'Please choose what kind of organization you represent.' })
    return
  }
  if (teacherCount && !(TEACHER_COUNTS as readonly string[]).includes(teacherCount)) {
    res.status(400).json({ error: 'Please choose a teacher count from the list.' })
    return
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown'
  if (!allowed(ip)) {
    res.status(429).json({ error: 'We’ve received a lot of requests just now. Please email hello@wivoza.com instead.' })
    return
  }

  try {
    await prisma.schoolInquiry.create({
      data: {
        name,
        email,
        role,
        organizationName,
        organizationType,
        state,
        teacherCount,
        interests: interests.length ? [...new Set(interests)].join(',') : null,
        message,
      },
    })
    ipHits.set(ip, [...(ipHits.get(ip) ?? []), Date.now()])
    globalCount += 1
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('[school-inquiries] create failed', err)
    res.status(500).json({ error: 'Something went wrong sending your request. Please email hello@wivoza.com instead.' })
  }
})

// Superadmin-only: the inbox for the form above.
schoolInquiriesRouter.get('/', requireAuth, requireSuperadmin, async (_req, res) => {
  const inquiries = await prisma.schoolInquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  res.json(inquiries)
})

schoolInquiriesRouter.patch('/:id', requireAuth, requireSuperadmin, async (req, res) => {
  const status = text(req.body?.status, 20)
  if (!(STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: 'Invalid status.' })
    return
  }
  try {
    const updated = await prisma.schoolInquiry.update({ where: { id: String(req.params.id) }, data: { status } })
    res.json(updated)
  } catch {
    res.status(404).json({ error: 'Inquiry not found.' })
  }
})
