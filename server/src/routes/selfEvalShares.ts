// Self-Evals shared WITH the signed-in person, as someone's supervisor.
//
// A share is readable only while all three hold: the teacher pressed Share
// to this person (selfEvalSharedWithId), this person is still the teacher's
// supervisor (a superadmin can reassign, and the old supervisor loses every
// share at once), and the lesson still has a Self-Eval. Only the Self-Eval
// leaves the teacher's account — never the transcript, the rest of the
// report, Reflect, or anything else on the session.

import { Router } from 'express'

import { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import type { RubricLensResult } from '../lib/rubricLens.ts'

export const selfEvalSharesRouter = Router()

export function visibleShareWhere(viewerId: string) {
  return {
    selfEvalSharedWithId: viewerId,
    user: { supervisorId: viewerId },
    rubricLens: { not: Prisma.AnyNull },
  }
}

const SHARE_LIST_SELECT = {
  id: true,
  classSubject: true,
  period: true,
  gradeLevel: true,
  sessionDate: true,
  selfEvalSharedAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const

selfEvalSharesRouter.get('/', async (req, res) => {
  const viewerId = req.user!.userId
  const sessions = await prisma.audioSession.findMany({
    where: visibleShareWhere(viewerId),
    select: SHARE_LIST_SELECT,
    orderBy: { selfEvalSharedAt: 'desc' },
  })
  res.json(
    sessions.map((s) => ({
      sessionId: s.id,
      teacherName: s.user.name ?? s.user.email,
      classSubject: s.classSubject,
      period: s.period,
      gradeLevel: s.gradeLevel,
      sessionDate: s.sessionDate,
      sharedAt: s.selfEvalSharedAt,
    })),
  )
})

selfEvalSharesRouter.get('/:sessionId', async (req, res) => {
  const viewerId = req.user!.userId
  const session = await prisma.audioSession.findFirst({
    where: { id: String(req.params.sessionId), ...visibleShareWhere(viewerId) },
    select: { ...SHARE_LIST_SELECT, rubricLens: true },
  })
  if (!session) {
    res.status(404).json({ error: 'This Self-Eval is not shared with you.' })
    return
  }
  const lens = session.rubricLens as RubricLensResult
  res.json({
    sessionId: session.id,
    teacherName: session.user.name ?? session.user.email,
    classSubject: session.classSubject,
    period: session.period,
    gradeLevel: session.gradeLevel,
    sessionDate: session.sessionDate,
    sharedAt: session.selfEvalSharedAt,
    selfEval: lens,
  })
})
