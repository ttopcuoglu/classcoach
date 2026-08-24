import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const shareRouter = Router()

// Public, unauthenticated reads by opaque token — the app has no auth
// system, so a random token is the only access control. Only exposes the
// fields needed to render the shared view, not the full row.
shareRouter.get('/attempt/:token', async (req, res) => {
  const attempt = await prisma.scenarioAttempt.findUnique({
    where: { shareToken: req.params.token },
    include: { scenario: true },
  })
  if (!attempt) {
    res.status(404).json({ error: 'Shared attempt not found' })
    return
  }
  res.json({
    type: 'attempt' as const,
    scenario: attempt.scenario,
    responseText: attempt.responseText,
    feedback: attempt.feedback,
    modelResponse: attempt.modelResponse,
    createdAt: attempt.createdAt,
  })
})

shareRouter.get('/debrief/:token', async (req, res) => {
  const debrief = await prisma.debrief.findUnique({ where: { shareToken: req.params.token } })
  if (!debrief) {
    res.status(404).json({ error: 'Shared debrief not found' })
    return
  }
  res.json({
    type: 'debrief' as const,
    incidentText: debrief.incidentText,
    category: debrief.category,
    feedback: debrief.feedback,
    followUp: debrief.followUp,
    createdAt: debrief.createdAt,
  })
})
