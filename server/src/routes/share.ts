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

shareRouter.get('/lesson-plan/:token', async (req, res) => {
  const lessonPlan = await prisma.lessonPlan.findUnique({ where: { shareToken: req.params.token } })
  if (!lessonPlan) {
    res.status(404).json({ error: 'Shared lesson plan not found' })
    return
  }
  res.json({
    type: 'lesson-plan' as const,
    mode: lessonPlan.mode,
    objective: lessonPlan.objective,
    unitName: lessonPlan.unitName,
    essentialQuestion: lessonPlan.essentialQuestion,
    standard: lessonPlan.standard,
    subject: lessonPlan.subject,
    gradeLevel: lessonPlan.gradeLevel,
    planText: lessonPlan.planText,
    feedback: lessonPlan.feedback,
    doNow: lessonPlan.doNow,
    agenda: lessonPlan.agenda,
    closure: lessonPlan.closure,
    hots: lessonPlan.hots,
    homework: lessonPlan.homework,
    createdAt: lessonPlan.createdAt,
  })
})

shareRouter.get('/conversation-prep/:token', async (req, res) => {
  const prep = await prisma.conversationPrep.findUnique({ where: { shareToken: req.params.token } })
  if (!prep) {
    res.status(404).json({ error: 'Shared conversation prep not found' })
    return
  }
  res.json({
    type: 'conversation-prep' as const,
    category: prep.category,
    situationText: prep.situationText,
    responseText: prep.responseText,
    feedback: prep.feedback,
    modelResponse: prep.modelResponse,
    createdAt: prep.createdAt,
  })
})
