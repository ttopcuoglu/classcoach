// Lesson Plan Eval (2026-11-24): a supervisor reviews a teacher's lesson plan.
// Only supervisors (the same rule as Observations). The supervisor picks a
// teacher at their school (or types a name), uploads or pastes the plan, and
// Wivoza writes a draft (lib/planReview.ts): Danielson Domain 1 with quotes,
// the school's own lesson plan format, strengths and next steps. The
// supervisor sets the levels, adds comments and sends; the teacher reads it
// only once sent. Only the plan's text is kept, never the file.

import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { INSTRUCTION_PRIORITY_NOTICE, PRIVACY_NOTICE } from '../lib/coachPersona.ts'
import { extractInChild } from '../lib/extractInChild.ts'
import { sendExtractionError } from '../lib/extractHttp.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { buildPlanReviewPrompt, parsePlanReview, PLAN_REVIEW_COMMENTS_MAX, type PlanReviewReport } from '../lib/planReview.ts'
import { prisma } from '../lib/prisma.ts'
import { buildPlanningPrompt, parsePlanning, planSections, PLAN_TEXT_MAX, type PlanSection } from '../lib/selfEvalReport.ts'
import { maskStudentNames } from '../lib/studentNames.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'
import { observer, schoolTeacher } from './observations.ts'

export const planReviewsRouter = Router()

const planUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const firstOf = (list: string | null | undefined) => (list ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] ?? null

const LIST_SELECT = {
  id: true,
  teacherId: true,
  teacherName: true,
  lessonTitle: true,
  gradeLevel: true,
  planLabel: true,
  status: true,
  sentAt: true,
  createdAt: true,
} as const

async function mine(id: string, reviewerId: string) {
  return prisma.lessonPlanReview.findFirst({ where: { id, reviewerId } })
}

function out(r: NonNullable<Awaited<ReturnType<typeof mine>>>) {
  const { plan, ...rest } = r
  const sections = ((plan as { sections?: PlanSection[] } | null)?.sections ?? []) as PlanSection[]
  return { ...rest, plan: sections }
}

// ---- the teacher's side ----

planReviewsRouter.get('/received', async (req, res) => {
  const rows = await prisma.lessonPlanReview.findMany({
    where: { teacherId: req.user!.userId, sentAt: { not: null } },
    select: { ...LIST_SELECT, reviewer: { select: { name: true, email: true } } },
    orderBy: { sentAt: 'desc' },
  })
  res.json(rows.map(({ reviewer, ...r }) => ({ ...r, reviewerName: reviewer.name ?? reviewer.email })))
})

planReviewsRouter.get('/received/:id', async (req, res) => {
  const r = await prisma.lessonPlanReview.findFirst({
    where: { id: String(req.params.id), teacherId: req.user!.userId, sentAt: { not: null } },
    include: { reviewer: { select: { name: true, email: true } } },
  })
  if (!r || !r.report) {
    res.status(404).json({ error: 'Review not found.' })
    return
  }
  const { reviewer, ...rest } = r
  res.json({ ...out(rest), reviewerName: reviewer.name ?? reviewer.email })
})

// ---- the supervisor's side ----

planReviewsRouter.get('/', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  res.json(await prisma.lessonPlanReview.findMany({ where: { reviewerId: me.id }, select: LIST_SELECT, orderBy: { createdAt: 'desc' } }))
})

// A new review: the teacher, the lesson, and the plan (a file or pasted text).
// The draft is written in the background; the page watches for it.
planReviewsRouter.post('/', planUpload.single('file'), async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const teacherId = typeof req.body?.teacherId === 'string' && req.body.teacherId ? req.body.teacherId : null
  const teacher = teacherId ? await schoolTeacher(teacherId, me) : null
  if (teacherId && !teacher) {
    res.status(400).json({ error: 'That teacher is not at your school.' })
    return
  }
  const teacherName = teacher ? (teacher.name ?? teacher.email) : text(req.body?.teacherName, 120)
  if (!teacherName) {
    res.status(400).json({ error: 'Choose or type the teacher’s name.' })
    return
  }
  let raw = ''
  let label = 'Pasted plan'
  if (req.file) {
    try {
      raw = (await extractInChild(req.file.buffer, req.file.originalname)).text
    } catch (error) {
      if (sendExtractionError(res, error, 'plan-review', req.file)) return
      res.status(502).json({ error: 'Could not read that file. Please try pasting the plan instead.' })
      return
    }
    label = req.file.originalname
  } else if (typeof req.body?.text === 'string') {
    raw = req.body.text
  }
  // Names in a plan (a seating chart, a student example) are masked like a
  // transcript's before anything is kept.
  const sections = planSections(maskStudentNames([raw.slice(0, PLAN_TEXT_MAX)]).texts[0])
  if (sections.length === 0 || raw.trim().length < 80) {
    res.status(400).json({ error: 'That plan is too short to review.' })
    return
  }
  const created = await prisma.lessonPlanReview.create({
    data: {
      reviewerId: me.id,
      organizationId: me.organizationId,
      teacherId: teacher?.id ?? null,
      teacherName,
      lessonTitle: text(req.body?.lessonTitle, 160),
      gradeLevel: text(req.body?.gradeLevel, 40) ?? firstOf(teacher?.gradeLevels),
      planLabel: label.slice(0, 120),
      plan: { sections },
      status: 'generating',
    },
  })
  res.status(201).json(out(created))
  void writeReview(created.id)
})

planReviewsRouter.get('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  if (!r) {
    res.status(404).json({ error: 'Review not found.' })
    return
  }
  res.json(out(r))
})

planReviewsRouter.patch('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  if (!r || r.sentAt) {
    res.status(r ? 400 : 404).json({ error: r ? 'This review was already sent.' : 'Review not found.' })
    return
  }
  const data: Record<string, unknown> = {}
  if ('teacherId' in (req.body ?? {})) {
    const id = typeof req.body.teacherId === 'string' && req.body.teacherId ? req.body.teacherId : null
    if (id) {
      const t = await schoolTeacher(id, me)
      if (!t) {
        res.status(400).json({ error: 'That teacher is not at your school.' })
        return
      }
      data.teacherId = t.id
      data.teacherName = t.name ?? t.email
    } else {
      data.teacherId = null
      const typed = text(req.body.teacherName, 120)
      if (typed) data.teacherName = typed
    }
  }
  for (const [key, max] of [['lessonTitle', 160], ['gradeLevel', 40]] as const) {
    if (key in (req.body ?? {})) data[key] = text(req.body[key], max)
  }
  await prisma.lessonPlanReview.update({ where: { id: r.id }, data })
  res.json(out((await mine(r.id, me.id))!))
})

// The supervisor's levels and comments on the draft.
planReviewsRouter.put('/:id/report', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  const report = r?.report as PlanReviewReport | null
  if (!r || !report || r.status !== 'draft') {
    res.status(r ? 400 : 404).json({ error: r ? 'Only a draft can be changed.' : 'Review not found.' })
    return
  }
  const levels = (req.body?.levels ?? {}) as Record<string, unknown>
  const levelOf = (v: unknown) => (v === null ? null : typeof v === 'number' && [1, 2, 3, 4].includes(v) ? (v as 1 | 2 | 3 | 4) : undefined)
  const next: PlanReviewReport = {
    ...report,
    planning: report.planning?.map((c) => (levelOf(levels[c.code]) === undefined ? c : { ...c, level: levelOf(levels[c.code])! })) ?? null,
    comments: 'comments' in (req.body ?? {}) ? text(req.body.comments, PLAN_REVIEW_COMMENTS_MAX) : report.comments,
  }
  await prisma.lessonPlanReview.update({ where: { id: r.id }, data: { report: next } })
  res.json(out((await mine(r.id, me.id))!))
})

// Write the draft again: after a failure, or to start over.
planReviewsRouter.post('/:id/generate', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  if (!r || r.sentAt || !['draft', 'failed'].includes(r.status)) {
    res.status(r ? 400 : 404).json({ error: r ? 'This review can’t be written again now.' : 'Review not found.' })
    return
  }
  await prisma.lessonPlanReview.update({ where: { id: r.id }, data: { status: 'generating', failureReason: null } })
  res.status(202).json(out((await mine(r.id, me.id))!))
  void writeReview(r.id)
})

planReviewsRouter.post('/:id/send', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  if (!r || r.status !== 'draft' || !r.report) {
    res.status(r ? 400 : 404).json({ error: r ? 'Only a finished draft can be sent.' : 'Review not found.' })
    return
  }
  if (!r.teacherId || !(await schoolTeacher(r.teacherId, me))) {
    res.status(400).json({ error: 'Choose the teacher from your school before sending. A typed name can’t receive it in Wivoza.' })
    return
  }
  await prisma.lessonPlanReview.update({ where: { id: r.id }, data: { status: 'sent', sentAt: new Date() } })
  res.json(out((await mine(r.id, me.id))!))
})

// Any of the supervisor's own reviews, sent or not; a sent one also leaves
// the teacher's page (the page says so first), as with Observations.
planReviewsRouter.delete('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const r = await mine(String(req.params.id), me.id)
  if (!r) {
    res.status(404).json({ error: 'Review not found.' })
    return
  }
  await prisma.lessonPlanReview.delete({ where: { id: r.id } })
  res.json({ ok: true })
})

// ---- writing the draft ----

/// The school's own lesson plan format: its default, or failing that any one
/// it hasn't archived.
async function schoolFormat(organizationId: string | null) {
  if (!organizationId) return null
  const t = await prisma.lessonTemplate.findFirst({
    where: { organizationId, archivedAt: null },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  const sections = (Array.isArray(t?.sections) ? t!.sections : []) as { title?: string; prompt?: string | null }[]
  const usable = sections.filter((s) => typeof s.title === 'string' && s.title.trim()).map((s) => ({ title: s.title!.trim(), prompt: s.prompt ?? null }))
  return t && usable.length > 0 ? { name: t.name, sections: usable } : null
}

export async function writeReview(id: string): Promise<void> {
  const r = await prisma.lessonPlanReview.findUnique({ where: { id } })
  if (!r || r.status !== 'generating') return
  const fail = (reason: string) => prisma.lessonPlanReview.update({ where: { id }, data: { status: 'failed', failureReason: reason } })
  const denied = await checkAndLogUsage(r.reviewerId, 'plan_review')
  if (denied) {
    await fail(denied)
    return
  }
  try {
    const sections = ((r.plan as { sections?: PlanSection[] } | null)?.sections ?? []) as PlanSection[]
    const format = await schoolFormat(r.organizationId)
    const rules = `${INSTRUCTION_PRIORITY_NOTICE}\n${PRIVACY_NOTICE}`
    const read = (system: string, ask: string, maxTokens: number) =>
      anthropic.messages
        .create({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: ask }] })
        .then((resp) => resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'))
    // Domain 1 and the rest of the review, read at the same time.
    const [domain1, rest] = await Promise.all([
      read(buildPlanningPrompt(sections, { subject: r.lessonTitle, grade: r.gradeLevel }, rules, 'review'), 'Read the plan for Domain 1 now.', 3000),
      read(buildPlanReviewPrompt({ sections, context: { lessonTitle: r.lessonTitle, grade: r.gradeLevel }, format, sharedRules: rules }), 'Write the review now.', 2500),
    ])
    const planning = parsePlanning(domain1, sections)
    const report = parsePlanReview(rest, { planning: planning.length >= 5 ? planning : null, format })
    if (!report || !report.planning) {
      await fail('Could not write the review. Please try again.')
      return
    }
    await prisma.lessonPlanReview.update({ where: { id }, data: { status: 'draft', report } })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not write the review')
    logModelFailure('[plan-reviews] review failed:', failure, error)
    await fail(failure.message)
  }
}
