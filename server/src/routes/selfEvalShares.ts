// Self Evaluations shared WITH the signed-in person, as someone's supervisor: the
// supervisor's Evaluations page (inbox, my teachers, reports) and the
// feedback they write back to the teacher.
//
// A share is readable only while all three hold: the teacher pressed Share
// to this person (selfEvalSharedWithId), this person is still the teacher's
// supervisor (the school admin or a superadmin can reassign, and the old
// supervisor loses every share at once), and the lesson still has a
// Self Evaluation. What the supervisor reads is the report the teacher previewed
// and sent (selfEvalReport, see lib/selfEvalReport.ts), or for a share from
// before that existed, the Self Evaluation itself. Never the transcript, the rest
// of the lesson report, Reflect, or anything else on the session. Every
// route here, reports included, reads only through visibleShareWhere.

import { Router } from 'express'

import { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { reportFromLiveLens, reportLevels, type SelfEvalLens, type SharedSelfEvalReport } from '../lib/selfEvalReport.ts'

export const selfEvalSharesRouter = Router()

export const SELF_EVAL_FEEDBACK_MAX = 2000

export function visibleShareWhere(viewerId: string) {
  return {
    selfEvalSharedWithId: viewerId,
    user: { supervisorId: viewerId },
    rubricLens: { not: Prisma.AnyNull },
  }
}

// The lesson's headline, from the first sentence of the lesson summary — the
// same idea as the teacher's report title, without sending the summary.
const TITLE_OPENER = /^(?:this|the|in this|today'?s?)\s+(?:lesson|class|session)\s+(?:was\s+)?(?:about|on|covered|focused on|explored|introduced|reviewed)\s+/i
export function lessonTitleFrom(summary: string | null | undefined, fallback: string | null): string {
  const text = summary?.trim()
  if (text) {
    const match = /^.{20,}?[.!?](?=\s|$)/.exec(text)
    let out = (match ? match[0] : text).replace(TITLE_OPENER, '')
    out = out.charAt(0).toUpperCase() + out.slice(1)
    if (out.length > 60) {
      const clipped = out.slice(0, 60)
      out = clipped.slice(0, clipped.lastIndexOf(' ') > 0 ? clipped.lastIndexOf(' ') : 60) + '…'
    }
    out = out.replace(/[\s.]+$/, '')
    if (out) return out
  }
  return fallback || 'Untitled lesson'
}

function splitList(value: string | null): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

const SHARE_SELECT = {
  id: true,
  classSubject: true,
  period: true,
  gradeLevel: true,
  sessionDate: true,
  selfEvalSharedAt: true,
  selfEvalFeedback: true,
  selfEvalFeedbackById: true,
  selfEvalFeedbackAt: true,
  lessonContent: true,
  user: { select: { id: true, name: true, email: true, subjects: true, gradeLevels: true } },
} as const

type ShareRow = Prisma.AudioSessionGetPayload<{ select: typeof SHARE_SELECT }>

// Replied = this supervisor wrote feedback after the teacher last shared it.
// A teacher who shares again (after more notes, say) is waiting again.
function statusFor(s: ShareRow, viewerId: string): 'awaiting' | 'replied' {
  const replied =
    s.selfEvalFeedback != null &&
    s.selfEvalFeedbackById === viewerId &&
    s.selfEvalFeedbackAt != null &&
    (s.selfEvalSharedAt == null || s.selfEvalFeedbackAt >= s.selfEvalSharedAt)
  return replied ? 'replied' : 'awaiting'
}

function summaryOf(s: ShareRow, viewerId: string) {
  const content = s.lessonContent as { summary?: string | null; subject?: string | null } | null
  return {
    sessionId: s.id,
    teacherId: s.user.id,
    teacherName: s.user.name ?? s.user.email,
    lessonTitle: lessonTitleFrom(content?.summary, s.classSubject || content?.subject || null),
    classSubject: s.classSubject,
    period: s.period,
    gradeLevel: s.gradeLevel,
    sessionDate: s.sessionDate,
    sharedAt: s.selfEvalSharedAt,
    status: statusFor(s, viewerId),
  }
}

async function visibleShares(viewerId: string, teacherId?: string) {
  return prisma.audioSession.findMany({
    where: { ...visibleShareWhere(viewerId), ...(teacherId ? { userId: teacherId } : {}) },
    select: SHARE_SELECT,
    orderBy: { selfEvalSharedAt: 'desc' },
  })
}

// A lesson-date window from ?from=&to= (any date the client parses, sent as
// ISO timestamps so the school's own day boundaries hold). Either end is
// optional; one that doesn't parse is ignored rather than refused.
export function lessonDateRange(from: unknown, to: unknown): { gte?: Date; lte?: Date } | undefined {
  const parse = (v: unknown) => {
    if (typeof v !== 'string' || !v) return undefined
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  const gte = parse(from)
  const lte = parse(to)
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined
}

async function visibleSharesWithLens(viewerId: string, teacherId?: string, sessionDate?: { gte?: Date; lte?: Date }) {
  return prisma.audioSession.findMany({
    where: { ...visibleShareWhere(viewerId), ...(teacherId ? { userId: teacherId } : {}), ...(sessionDate ? { sessionDate } : {}) },
    select: { ...SHARE_SELECT, rubricLens: true, selfEvalReport: true },
    orderBy: { selfEvalSharedAt: 'desc' },
  })
}

/// The report as sent, or the live Self Evaluation for a share from before
/// snapshots (2026-11-18).
function sharedReport(s: { selfEvalReport: unknown; rubricLens: unknown }): SharedSelfEvalReport | null {
  if (s.selfEvalReport) return s.selfEvalReport as SharedSelfEvalReport
  const lens = s.rubricLens as SelfEvalLens | null
  return lens?.scored ? reportFromLiveLens(lens) : null
}

// The inbox: every Self Evaluation shared with me, newest share first.
selfEvalSharesRouter.get('/', async (req, res) => {
  const viewerId = req.user!.userId
  const shares = await visibleShares(viewerId)
  res.json(shares.map((s) => summaryOf(s, viewerId)))
})

// Everyone I supervise, including those who have shared nothing yet, each
// with what they have shared.
selfEvalSharesRouter.get('/teachers', async (req, res) => {
  const viewerId = req.user!.userId
  const [teachers, shares] = await Promise.all([
    prisma.user.findMany({
      where: { supervisorId: viewerId },
      select: { id: true, name: true, email: true, subjects: true, gradeLevels: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    visibleShares(viewerId),
  ])
  res.json(
    teachers.map((t) => ({
      teacherId: t.id,
      teacherName: t.name ?? t.email,
      subjects: splitList(t.subjects),
      gradeLevels: splitList(t.gradeLevels),
      shares: shares.filter((s) => s.user.id === t.id).map((s) => summaryOf(s, viewerId)),
    })),
  )
})

// Reports over what has been shared with me, for all my teachers or one,
// optionally only lessons taught between ?from= and ?to=. Counts only: how many shared lessons placed each component at each level,
// and how many had no level. Nothing a teacher did not share is counted.
selfEvalSharesRouter.get('/report', async (req, res) => {
  const viewerId = req.user!.userId
  const teacherId = typeof req.query.teacherId === 'string' && req.query.teacherId ? req.query.teacherId : undefined
  const shares = await visibleSharesWithLens(viewerId, teacherId, lessonDateRange(req.query.from, req.query.to))

  type Row = { code: string; name: string; domain: string; levels: Record<'1' | '2' | '3' | '4', number>; notEnough: number; notes: number }
  const rows = new Map<string, Row>()
  const lessons: { sessionId: string; lessonTitle: string; sessionDate: Date; teacherName: string; levels: Record<string, number | null> }[] = []
  for (const s of shares) {
    const report = sharedReport(s)
    if (!report) continue
    const levels: Record<string, number | null> = {}
    for (const c of reportLevels(report)) {
      const row = rows.get(c.code) ?? { code: c.code, name: c.name, domain: c.domain, levels: { '1': 0, '2': 0, '3': 0, '4': 0 }, notEnough: 0, notes: 0 }
      if (c.level == null) row.notEnough += 1
      else row.levels[String(c.level) as '1' | '2' | '3' | '4'] += 1
      if (c.hasNote) row.notes += 1
      rows.set(c.code, row)
      levels[c.code] = c.level ?? null
    }
    const summary = summaryOf(s, viewerId)
    lessons.push({ sessionId: s.id, lessonTitle: summary.lessonTitle, sessionDate: s.sessionDate, teacherName: summary.teacherName, levels })
  }

  const statuses = shares.map((s) => statusFor(s, viewerId))
  res.json({
    teacherId: teacherId ?? null,
    activity: {
      shared: shares.length,
      awaiting: statuses.filter((x) => x === 'awaiting').length,
      replied: statuses.filter((x) => x === 'replied').length,
    },
    components: [...rows.values()].sort((a, b) => a.code.localeCompare(b.code)),
    // Oldest first, so a teacher's row reads left to right in time.
    lessons: lessons.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime()),
  })
})

selfEvalSharesRouter.get('/:sessionId', async (req, res) => {
  const viewerId = req.user!.userId
  const session = await prisma.audioSession.findFirst({
    where: { id: String(req.params.sessionId), ...visibleShareWhere(viewerId) },
    select: { ...SHARE_SELECT, rubricLens: true, selfEvalReport: true },
  })
  const report = session ? sharedReport(session) : null
  if (!session || !report) {
    res.status(404).json({ error: 'This Self Evaluation is not shared with you.' })
    return
  }
  const mine = session.selfEvalFeedbackById === viewerId
  res.json({
    ...summaryOf(session, viewerId),
    report,
    // Only my own feedback: a previous supervisor's words are the teacher's.
    feedback: mine ? session.selfEvalFeedback : null,
    feedbackAt: mine ? session.selfEvalFeedbackAt : null,
  })
})

// Write (or clear, with an empty string) my feedback for the teacher.
selfEvalSharesRouter.put('/:sessionId/feedback', async (req, res) => {
  const viewerId = req.user!.userId
  const raw = req.body?.feedback
  if (typeof raw !== 'string') {
    res.status(400).json({ error: 'feedback must be a string' })
    return
  }
  const text = raw.trim()
  if (text.length > SELF_EVAL_FEEDBACK_MAX) {
    res.status(400).json({ error: `Feedback must be ${SELF_EVAL_FEEDBACK_MAX} characters or fewer.` })
    return
  }
  const session = await prisma.audioSession.findFirst({
    where: { id: String(req.params.sessionId), ...visibleShareWhere(viewerId) },
    select: { id: true },
  })
  if (!session) {
    res.status(404).json({ error: 'This Self Evaluation is not shared with you.' })
    return
  }
  const at = text ? new Date() : null
  await prisma.audioSession.update({
    where: { id: session.id },
    data: { selfEvalFeedback: text || null, selfEvalFeedbackById: text ? viewerId : null, selfEvalFeedbackAt: at },
  })
  res.json({ feedback: text || null, feedbackAt: at })
})
