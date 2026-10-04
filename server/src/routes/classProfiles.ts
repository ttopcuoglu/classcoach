import { Router } from 'express'
import {
  describeClassContext,
  inferClassProfile,
  needsReconfirmation,
  normalizeClassContext,
  schoolYearOf,
  type ClassContext,
} from '../lib/classProfile.ts'
import { prisma } from '../lib/prisma.ts'

export const classProfilesRouter = Router()

const SELECT = {
  id: true,
  label: true,
  gradeBand: true,
  subject: true,
  course: true,
  courseLevel: true,
  classMakeup: true,
  isDefault: true,
  source: true,
  confirmedAt: true,
  schoolYear: true,
} as const

type Row = {
  id: string
  label: string | null
  gradeBand: string
  subject: string | null
  course: string | null
  courseLevel: string | null
  classMakeup: string[]
  isDefault: boolean
  source: string
  confirmedAt: Date | null
  schoolYear: string | null
}

/// `confirmedAt` and `source` collapse to the two booleans a client actually
/// renders from. `line` is computed here rather than in each client, so the
/// web app, the iOS app and an export can never disagree about how a room
/// reads.
function toContext(row: Row): ClassContext & { line: string; needsConfirmation: boolean } {
  const context: ClassContext = {
    id: row.id,
    label: row.label,
    gradeBand: row.gradeBand,
    subject: row.subject,
    course: row.course,
    courseLevel: row.courseLevel,
    classMakeup: row.classMakeup,
    isDefault: row.isDefault,
    confirmed: row.confirmedAt != null,
    inferred: row.source === 'inferred',
    schoolYear: row.schoolYear,
  }
  return {
    ...context,
    line: row.label || describeClassContext(row),
    needsConfirmation: needsReconfirmation(context),
  }
}

/// The default prep first, then the rest oldest-first so the list does not
/// reshuffle under a teacher who is editing it.
const ORDER = [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }]

/// Everything already on record about this teacher's rooms, for the seed.
///
/// Three queries rather than one join because they are three unrelated
/// tables, and each is a tiny indexed read on userId. Newest first, because
/// the most recent piece of work is the best evidence of what they teach now.
async function inferenceSources(userId: string) {
  const [user, plans, assignments, sessions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { gradeLevels: true, subjects: true } }),
    prisma.lessonPlan.findMany({
      where: { userId },
      select: { gradeLevel: true, subject: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.assignmentCoachSession.findMany({
      where: { userId },
      select: { gradeLevel: true, subject: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.audioSession.findMany({
      where: { userId },
      select: { gradeLevel: true, classSubject: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])
  return {
    gradeLevels: user?.gradeLevels ?? null,
    subjects: user?.subjects ?? null,
    priorWork: [
      ...plans,
      ...assignments,
      ...sessions.map((s) => ({ gradeLevel: s.gradeLevel, subject: s.classSubject })),
    ],
  }
}

// A teacher's preps. Seeds one by inference on the first read that finds none,
// so an existing teacher never retypes what the app already knows — the
// migration that created this table deliberately did no backfill, because the
// inference reads four tables and has to be the same tested code every later
// signup uses.
//
// The seeded row is marked source="inferred" with confirmedAt null, so it
// arrives flagged `needsConfirmation` and no caller may treat it as fact.
// When there is nothing to infer from, the list is simply empty: the teacher
// is asked once, inline, the first time a coach actually needs the room.
classProfilesRouter.get('/', async (req, res) => {
  const userId = req.user!.userId
  const existing = await prisma.classProfile.findMany({ where: { userId }, orderBy: ORDER, select: SELECT })
  if (existing.length > 0) {
    res.json(existing.map(toContext))
    return
  }

  const inferred = inferClassProfile(await inferenceSources(userId))
  if (!inferred) {
    res.json([])
    return
  }

  // Two tabs opening at once would both find an empty list and both seed. The
  // unique-ish guard is a re-check inside the create, and a duplicate here is
  // harmless rather than worth a transaction: the teacher sees two identical
  // unconfirmed guesses and deletes one. Re-reading after the write keeps the
  // response consistent with whatever actually landed.
  await prisma.classProfile.create({
    data: {
      userId,
      gradeBand: inferred.gradeBand,
      subject: inferred.subject ?? null,
      classMakeup: [],
      isDefault: true,
      source: 'inferred',
    },
  })
  const seeded = await prisma.classProfile.findMany({ where: { userId }, orderBy: ORDER, select: SELECT })
  res.json(seeded.map(toContext))
})

classProfilesRouter.post('/', async (req, res) => {
  const userId = req.user!.userId
  let normalized
  try {
    normalized = normalizeClassContext(req.body ?? {})
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }

  const count = await prisma.classProfile.count({ where: { userId } })
  // A teacher's first prep is their default whether they asked for it or not —
  // a list of one with nothing marked default would leave every surface with
  // no room to start from.
  const isDefault = normalized.isDefault || count === 0
  if (isDefault && count > 0) {
    await prisma.classProfile.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } })
  }

  const created = await prisma.classProfile.create({
    data: {
      userId,
      label: normalized.label ?? null,
      gradeBand: normalized.gradeBand,
      subject: normalized.subject ?? null,
      course: normalized.course ?? null,
      courseLevel: normalized.courseLevel ?? null,
      classMakeup: normalized.classMakeup ?? [],
      isDefault,
      // Entered by hand, so it is confirmed by definition — the teacher just
      // typed it.
      source: 'teacher',
      confirmedAt: new Date(),
      schoolYear: schoolYearOf(new Date()),
    },
    select: SELECT,
  })
  res.status(201).json(toContext(created))
})

// Edit one prep. Also the confirm path: `confirm: true` marks it agreed to for
// the current school year and promotes an inferred row to a teacher-owned one,
// which is what the "Saved to your class — not quite?" strip does when the
// teacher leaves it alone.
//
// The response carries `previous`, the row as it was before this call, so a
// client can offer a real undo without the server holding undo state. That is
// what makes the inline one-question save reversible rather than merely
// cancellable.
classProfilesRouter.patch('/:id', async (req, res) => {
  const userId = req.user!.userId
  const before = await prisma.classProfile.findFirst({ where: { id: req.params.id, userId }, select: SELECT })
  if (!before) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { confirm, ...fields } = req.body ?? {}
  let normalized
  try {
    // Merged onto the existing row so a one-field edit (which is what the
    // inline question sends) does not blank everything it left out.
    normalized = normalizeClassContext({
      label: fields.label !== undefined ? fields.label : before.label,
      gradeBand: fields.gradeBand !== undefined ? fields.gradeBand : before.gradeBand,
      subject: fields.subject !== undefined ? fields.subject : before.subject,
      course: fields.course !== undefined ? fields.course : before.course,
      courseLevel: fields.courseLevel !== undefined ? fields.courseLevel : before.courseLevel,
      classMakeup: fields.classMakeup !== undefined ? fields.classMakeup : before.classMakeup,
      isDefault: fields.isDefault !== undefined ? fields.isDefault : before.isDefault,
    })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
    return
  }

  if (normalized.isDefault && !before.isDefault) {
    await prisma.classProfile.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    })
  }

  const confirming = confirm === true
  const updated = await prisma.classProfile.update({
    where: { id: before.id },
    data: {
      label: normalized.label ?? null,
      gradeBand: normalized.gradeBand,
      subject: normalized.subject ?? null,
      course: normalized.course ?? null,
      courseLevel: normalized.courseLevel ?? null,
      classMakeup: normalized.classMakeup ?? [],
      // The last prep standing stays the default — nothing may end up with no
      // default while a prep exists.
      isDefault: normalized.isDefault === true ? true : before.isDefault,
      ...(confirming
        ? { source: 'teacher', confirmedAt: new Date(), schoolYear: schoolYearOf(new Date()) }
        : {}),
    },
    select: SELECT,
  })

  res.json({ ...toContext(updated), previous: toContext(before) })
})

classProfilesRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.userId
  const existing = await prisma.classProfile.findFirst({ where: { id: req.params.id, userId } })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await prisma.classProfile.delete({ where: { id: existing.id } })

  // Deleting the default would leave a teacher with preps and no room to start
  // from, so the oldest survivor takes over.
  if (existing.isDefault) {
    const next = await prisma.classProfile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (next) await prisma.classProfile.update({ where: { id: next.id }, data: { isDefault: true } })
  }

  const remaining = await prisma.classProfile.findMany({ where: { userId }, orderBy: ORDER, select: SELECT })
  res.json(remaining.map(toContext))
})
