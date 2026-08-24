import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const profileRouter = Router()

profileRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  res.json(user)
})

profileRouter.put('/', async (req, res) => {
  const { name, gradeLevels, subjects, onboardingProgress } = req.body ?? {}
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' })
    return
  }
  if (gradeLevels !== undefined && typeof gradeLevels !== 'string') {
    res.status(400).json({ error: 'gradeLevels must be a string' })
    return
  }
  if (subjects !== undefined && typeof subjects !== 'string') {
    res.status(400).json({ error: 'subjects must be a string' })
    return
  }
  if (onboardingProgress !== undefined && typeof onboardingProgress !== 'string') {
    res.status(400).json({ error: 'onboardingProgress must be a string' })
    return
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { name, gradeLevels, subjects, onboardingProgress },
  })
  res.json(updated)
})

// Clears the teacher's own data (saved scenarios, attempts, debriefs, parent
// messages, Q&A history) but leaves their account and the scenario bank
// (curated + previously generated scenario text) alone — that's shared
// prompt content, not "their" data.
profileRouter.post('/reset', async (req, res) => {
  const userId = req.user!.userId
  await prisma.scenarioAttempt.deleteMany({ where: { userId } })
  await prisma.debrief.deleteMany({ where: { userId } })
  await prisma.parentMessage.deleteMany({ where: { userId } })
  await prisma.qAExchange.deleteMany({ where: { userId } })
  await prisma.user.update({
    where: { id: userId },
    data: { name: null, gradeLevels: null, subjects: null, onboardingProgress: null },
  })
  res.json({ status: 'ok' })
})
