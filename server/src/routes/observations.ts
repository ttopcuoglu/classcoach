// Supervisor classroom observations (2026-11-24). Only someone the school made
// a supervisor (they supervise at least one teacher) can observe. The
// supervisor picks a teacher at their school (or types a name), records the
// lesson, answers ten Danielson questions, may attach the plan, and Wivoza
// writes a draft from all of it (lib/observationReport.ts). The supervisor sets
// the levels and sends it; the teacher reads it only once sent, and only when
// it is linked to their account. The audio is never kept, and student names
// are masked before the transcript is saved.

import { Router, type Response } from 'express'
import multer from 'multer'
import { unlink } from 'node:fs/promises'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { INSTRUCTION_PRIORITY_NOTICE, PRIVACY_NOTICE, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import { transcribeAudioFile } from '../lib/deepgram.ts'
import { extractInChild } from '../lib/extractInChild.ts'
import { sendExtractionError } from '../lib/extractHttp.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import {
  buildObservationPrompt,
  observationEvidence,
  OBSERVATION_CLOSING_MAX,
  OBSERVATION_COMMENTS_MAX,
  parseObservationReport,
  readAnswers,
  readNotes,
  type ObservationReport,
  type ObservationUtterance,
} from '../lib/observationReport.ts'
import { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { buildPlanningPrompt, parsePlanning, planSections, PLAN_TEXT_MAX, type PlanSection } from '../lib/selfEvalReport.ts'
import { maskStudentNames } from '../lib/studentNames.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const observationsRouter = Router()

const audioUpload = multer({ storage: multer.diskStorage({}), limits: { fileSize: 200 * 1024 * 1024 } })
const planUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

async function discard(filePath: string | undefined) {
  if (!filePath) return
  try {
    await unlink(filePath)
  } catch (error) {
    console.error('[observations] could not remove uploaded audio:', error)
  }
}

const firstOf = (list: string | null | undefined) => (list ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] ?? null

/// The signed-in person, if the school made them a supervisor.
async function observer(req: { user?: { userId: string } }, res: Response) {
  const me = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, organizationId: true, role: true } })
  const supervises = me ? await prisma.user.count({ where: { supervisorId: me.id } }) : 0
  if (!me || supervises === 0) {
    res.status(403).json({ error: 'Observations are for supervisors.' })
    return null
  }
  return me
}

async function mine(id: string, observerId: string) {
  return prisma.observation.findFirst({ where: { id, observerId } })
}

/// A teacher at the observer's own school, never themselves.
async function schoolTeacher(teacherId: string, me: { id: string; organizationId: string | null }) {
  if (!me.organizationId || teacherId === me.id) return null
  return prisma.user.findFirst({
    where: { id: teacherId, organizationId: me.organizationId },
    select: { id: true, name: true, email: true, subjects: true, gradeLevels: true },
  })
}

const LIST_SELECT = {
  id: true,
  teacherId: true,
  teacherName: true,
  lessonTitle: true,
  subject: true,
  gradeLevel: true,
  observedAt: true,
  durationSec: true,
  status: true,
  sentAt: true,
} as const

/// What the observer's page reads. The transcript stays on the server.
function forObserver(o: NonNullable<Awaited<ReturnType<typeof mine>>>) {
  const { transcript, plan, ...rest } = o
  const p = plan as { label?: string; sections?: PlanSection[] } | null
  return {
    ...rest,
    hasRecording: Array.isArray(transcript) && transcript.length > 0,
    plan: p ? { label: p.label ?? 'Lesson plan', sections: p.sections?.length ?? 0 } : null,
  }
}

// ---- the teacher's side: what was sent to me ----

observationsRouter.get('/received', async (req, res) => {
  const rows = await prisma.observation.findMany({
    where: { teacherId: req.user!.userId, sentAt: { not: null } },
    select: { ...LIST_SELECT, observer: { select: { name: true, email: true } } },
    orderBy: { sentAt: 'desc' },
  })
  res.json(rows.map(({ observer: o, ...r }) => ({ ...r, observerName: o.name ?? o.email })))
})

observationsRouter.get('/received/:id', async (req, res) => {
  const o = await prisma.observation.findFirst({
    where: { id: String(req.params.id), teacherId: req.user!.userId, sentAt: { not: null } },
    select: { ...LIST_SELECT, report: true, observer: { select: { name: true, email: true } } },
  })
  if (!o || !o.report) {
    res.status(404).json({ error: 'Observation not found.' })
    return
  }
  const { observer: by, ...rest } = o
  res.json({ ...rest, observerName: by.name ?? by.email })
})

// ---- the supervisor's side ----

// Teachers at my school for the Teacher box: matched on name or email as I
// type; with nothing typed, the teachers I supervise first.
observationsRouter.get('/teachers', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  if (!me.organizationId) {
    res.json([])
    return
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : ''
  const rows = await prisma.user.findMany({
    where: {
      organizationId: me.organizationId,
      id: { not: me.id },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    select: { id: true, name: true, email: true, subjects: true, gradeLevels: true, supervisorId: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    take: q ? 8 : 60,
  })
  const sorted = q ? rows : [...rows.filter((r) => r.supervisorId === me.id), ...rows.filter((r) => r.supervisorId !== me.id)]
  res.json(
    sorted.map((r) => ({
      id: r.id,
      name: r.name ?? r.email,
      email: r.email,
      subject: firstOf(r.subjects),
      gradeLevel: firstOf(r.gradeLevels),
      mine: r.supervisorId === me.id,
    })),
  )
})

observationsRouter.get('/', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  res.json(await prisma.observation.findMany({ where: { observerId: me.id }, select: LIST_SELECT, orderBy: { observedAt: 'desc' } }))
})

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

observationsRouter.post('/', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const teacherId = typeof req.body?.teacherId === 'string' && req.body.teacherId ? req.body.teacherId : null
  let teacher: Awaited<ReturnType<typeof schoolTeacher>> = null
  if (teacherId) {
    teacher = await schoolTeacher(teacherId, me)
    if (!teacher) {
      res.status(400).json({ error: 'That teacher is not at your school.' })
      return
    }
  }
  const teacherName = teacher ? (teacher.name ?? teacher.email) : text(req.body?.teacherName, 120)
  if (!teacherName) {
    res.status(400).json({ error: 'Choose or type the teacher’s name.' })
    return
  }
  const created = await prisma.observation.create({
    data: {
      observerId: me.id,
      organizationId: me.organizationId,
      teacherId: teacher?.id ?? null,
      teacherName,
      lessonTitle: text(req.body?.lessonTitle, 160),
      subject: text(req.body?.subject, 80) ?? firstOf(teacher?.subjects),
      gradeLevel: text(req.body?.gradeLevel, 40) ?? firstOf(teacher?.gradeLevels),
    },
  })
  res.status(201).json(forObserver(created))
})

observationsRouter.get('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o) {
    res.status(404).json({ error: 'Observation not found.' })
    return
  }
  res.json(forObserver(o))
})

// The start screen, changed later: teacher, lesson, subject, grade, date.
observationsRouter.patch('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.sentAt) {
    res.status(o ? 400 : 404).json({ error: o ? 'This observation was already sent.' : 'Observation not found.' })
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
  } else if (text(req.body?.teacherName, 120) && !o.teacherId) {
    data.teacherName = text(req.body.teacherName, 120)
  }
  for (const [key, max] of [['lessonTitle', 160], ['subject', 80], ['gradeLevel', 40]] as const) {
    if (key in (req.body ?? {})) data[key] = text(req.body[key], max)
  }
  if (typeof req.body?.observedAt === 'string') {
    const d = new Date(req.body.observedAt)
    if (!Number.isNaN(d.getTime())) data.observedAt = d
  }
  const updated = await prisma.observation.update({ where: { id: o.id }, data })
  res.json(forObserver(updated))
})

// The recording, handed over when the supervisor presses Stop. Transcribed in
// the background while they answer the questions; the audio is deleted after.
observationsRouter.post('/:id/audio', audioUpload.single('audio'), async (req, res) => {
  const me = await observer(req, res)
  if (!me) {
    await discard(req.file?.path)
    return
  }
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.status !== 'recording') {
    await discard(req.file?.path)
    res.status(o ? 400 : 404).json({ error: o ? 'This observation already has its recording.' : 'Observation not found.' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No audio received.' })
    return
  }
  const recordedSec = Number(req.body?.durationSec)
  await prisma.observation.update({
    where: { id: o.id },
    data: { status: 'transcribing', ...(Number.isFinite(recordedSec) && recordedSec > 0 ? { durationSec: Math.round(recordedSec) } : {}) },
  })
  res.status(202).json({ status: 'transcribing' })

  const { path, mimetype } = req.file
  void (async () => {
    try {
      const utterances = await transcribeAudioFile(path, mimetype)
      if (utterances.length === 0) throw Object.assign(new Error('No speech'), { code: 'NO_SPEECH' })
      const masked = maskStudentNames(utterances.map((u) => u.transcript)).texts
      const transcript: ObservationUtterance[] = utterances.map((u, i) => ({ speaker: u.speaker, startSec: u.start, endSec: u.end, text: masked[i] }))
      await prisma.observation.update({
        where: { id: o.id },
        data: {
          status: 'transcribed',
          transcript,
          ...(Number.isFinite(recordedSec) && recordedSec > 0 ? {} : { durationSec: Math.round(Math.max(...utterances.map((u) => u.end))) }),
        },
      })
    } catch (error) {
      const noSpeech = (error as { code?: string }).code === 'NO_SPEECH'
      if (!noSpeech) console.error('[observations] transcription failed:', error)
      await prisma.observation.update({
        where: { id: o.id },
        data: {
          status: 'no_recording',
          failureReason: noSpeech ? 'No speech was heard in the recording.' : 'The recording could not be transcribed.',
        },
      })
    } finally {
      await discard(path)
    }
    await generateWhenReady(o.id)
  })()
})

observationsRouter.post('/:id/plan', planUpload.single('file'), async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.sentAt) {
    res.status(o ? 400 : 404).json({ error: o ? 'This observation was already sent.' : 'Observation not found.' })
    return
  }
  let raw = ''
  let label = 'Pasted plan'
  if (req.file) {
    try {
      raw = (await extractInChild(req.file.buffer, req.file.originalname)).text
    } catch (error) {
      if (sendExtractionError(res, error, 'observation-plan', req.file)) return
      res.status(502).json({ error: 'Could not read that file. Please try pasting the plan instead.' })
      return
    }
    label = req.file.originalname
  } else if (typeof req.body?.text === 'string') {
    raw = req.body.text
  }
  const sections = planSections(raw.slice(0, PLAN_TEXT_MAX))
  if (sections.length === 0 || raw.trim().length < 80) {
    res.status(400).json({ error: 'That plan is too short to read.' })
    return
  }
  const updated = await prisma.observation.update({ where: { id: o.id }, data: { plan: { label: label.slice(0, 120), sections } } })
  res.json(forObserver(updated))
})

observationsRouter.delete('/:id/plan', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.sentAt) {
    res.status(o ? 400 : 404).json({ error: o ? 'This observation was already sent.' : 'Observation not found.' })
    return
  }
  const updated = await prisma.observation.update({ where: { id: o.id }, data: { plan: Prisma.DbNull } })
  res.json(forObserver(updated))
})

// The ten answers, the notes taken while observing and the closing note. The
// report starts as soon as the recording is also ready.
observationsRouter.post('/:id/answers', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.sentAt) {
    res.status(o ? 400 : 404).json({ error: o ? 'This observation was already sent.' : 'Observation not found.' })
    return
  }
  const notes = readNotes(req.body?.notes)
  const closing = text(req.body?.closingNote, OBSERVATION_CLOSING_MAX)
  // Supervisors are asked not to name students; names that slip in are masked
  // the same way the transcript's are.
  const masked = maskStudentNames([...notes.map((n) => n.text), closing ?? '']).texts
  const updated = await prisma.observation.update({
    where: { id: o.id },
    data: {
      answers: readAnswers(req.body?.answers),
      notes: notes.map((n, i) => ({ ...n, text: masked[i] })),
      closingNote: closing ? masked[masked.length - 1] : null,
      answeredAt: new Date(),
      // Stopped without a recording (the microphone failed or was refused).
      ...(o.status === 'recording' && req.body?.recording === false ? { status: 'no_recording', failureReason: 'This observation has no recording.' } : {}),
    },
  })
  res.status(202).json(forObserver(updated))
  void generateWhenReady(o.id)
})

// Write the draft again: after a failure, or after attaching a plan. Levels
// and comments already set are replaced.
observationsRouter.post('/:id/generate', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.sentAt || !o.answeredAt || !['draft', 'failed'].includes(o.status)) {
    res.status(o ? 400 : 404).json({ error: o ? 'This observation can’t be written again now.' : 'Observation not found.' })
    return
  }
  const hasRecording = Array.isArray(o.transcript) && o.transcript.length > 0
  const updated = await prisma.observation.update({ where: { id: o.id }, data: { status: hasRecording ? 'transcribed' : 'no_recording' } })
  res.status(202).json(forObserver(updated))
  void generateWhenReady(o.id)
})

// The supervisor's levels and overall comments on the draft.
observationsRouter.put('/:id/report', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  const report = o?.report as ObservationReport | null
  if (!o || !report || o.status !== 'draft') {
    res.status(o ? 400 : 404).json({ error: o ? 'Only a draft can be changed.' : 'Observation not found.' })
    return
  }
  const levels = (req.body?.levels ?? {}) as Record<string, unknown>
  const levelOf = (v: unknown) => (v === null ? null : typeof v === 'number' && [1, 2, 3, 4].includes(v) ? (v as 1 | 2 | 3 | 4) : undefined)
  const next: ObservationReport = {
    ...report,
    components: report.components.map((c) => (levelOf(levels[c.code]) === undefined ? c : { ...c, level: levelOf(levels[c.code])! })),
    planning: report.planning?.map((c) => (levelOf(levels[c.code]) === undefined ? c : { ...c, level: levelOf(levels[c.code])! })) ?? null,
    comments: 'comments' in (req.body ?? {}) ? text(req.body.comments, OBSERVATION_COMMENTS_MAX) : report.comments,
  }
  const updated = await prisma.observation.update({ where: { id: o.id }, data: { report: next } })
  res.json(forObserver(updated))
})

observationsRouter.post('/:id/send', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o || o.status !== 'draft' || !o.report) {
    res.status(o ? 400 : 404).json({ error: o ? 'Only a finished draft can be sent.' : 'Observation not found.' })
    return
  }
  if (!o.teacherId) {
    res.status(400).json({ error: 'Choose the teacher from your school before sending. A typed name can’t receive it in Wivoza.' })
    return
  }
  // The teacher may have left the school since the observation began.
  if (!(await schoolTeacher(o.teacherId, me))) {
    res.status(400).json({ error: 'That teacher is no longer at your school.' })
    return
  }
  const updated = await prisma.observation.update({ where: { id: o.id }, data: { status: 'sent', sentAt: new Date() } })
  res.json(forObserver(updated))
})

observationsRouter.delete('/:id', async (req, res) => {
  const me = await observer(req, res)
  if (!me) return
  const o = await mine(String(req.params.id), me.id)
  if (!o) {
    res.status(404).json({ error: 'Observation not found.' })
    return
  }
  if (o.sentAt) {
    res.status(400).json({ error: 'A sent observation stays with the teacher.' })
    return
  }
  await prisma.observation.delete({ where: { id: o.id } })
  res.json({ ok: true })
})

// ---- writing the report ----

/// Writes the draft once both halves are in: the answers, and the recording
/// (transcribed, or known to be missing). Claimed with a conditional update so
/// the transcription finishing and the answers arriving can't both start it.
export async function generateWhenReady(id: string): Promise<void> {
  const claimed = await prisma.observation.updateMany({
    where: { id, answeredAt: { not: null }, sentAt: null, status: { in: ['transcribed', 'no_recording'] } },
    data: { status: 'generating', failureReason: null },
  })
  if (claimed.count === 0) return
  const o = await prisma.observation.findUnique({ where: { id } })
  if (!o) return
  const fail = (reason: string) => prisma.observation.update({ where: { id }, data: { status: 'failed', failureReason: reason } })

  const denied = await checkAndLogUsage(o.observerId, 'observation_report')
  if (denied) {
    await fail(denied)
    return
  }
  try {
    const transcript = (Array.isArray(o.transcript) ? o.transcript : null) as ObservationUtterance[] | null
    const evidence = observationEvidence(transcript)
    const plan = (o.plan as { sections?: PlanSection[] } | null)?.sections ?? null
    const rules = `${INSTRUCTION_PRIORITY_NOTICE}\n${PRIVACY_NOTICE}\n${TRANSCRIPT_RELIABILITY_NOTICE}`

    // Domain 1 from the plan, the same reading a Self Evaluation gets.
    let planning = null
    if (plan && plan.length > 0 && !(await checkAndLogUsage(o.observerId, 'observation_planning'))) {
      try {
        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 3000,
          system: buildPlanningPrompt(plan, { subject: o.subject, grade: o.gradeLevel }, `${INSTRUCTION_PRIORITY_NOTICE}\n${PRIVACY_NOTICE}`, true),
          messages: [{ role: 'user', content: 'Read the plan for Domain 1 now.' }],
        })
        const parsed = parsePlanning(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), plan)
        planning = parsed.length >= 5 ? parsed : null
      } catch (error) {
        console.error('[observations] planning read failed:', error)
      }
    }

    const answers = readAnswers(o.answers)
    const notes = readNotes(o.notes)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      system: buildObservationPrompt({
        evidence,
        answers,
        notes,
        closingNote: o.closingNote,
        plan,
        context: { subject: o.subject, grade: o.gradeLevel, lessonTitle: o.lessonTitle, durationSec: o.durationSec },
        sharedRules: rules,
      }),
      messages: [{ role: 'user', content: 'Write the observation draft now.' }],
    })
    const report = parseObservationReport(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), {
      items: evidence.items,
      answers,
      notes,
      recordingMissing: evidence.items.length === 0,
      planning,
    })
    if (!report) {
      await fail('Could not write the draft. Please try again.')
      return
    }
    await prisma.observation.update({ where: { id }, data: { status: 'draft', report } })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not write the draft')
    logModelFailure('[observations] report failed:', failure, error)
    await fail(failure.message)
  }
}
