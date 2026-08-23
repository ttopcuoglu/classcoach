import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const attemptsRouter = Router()

attemptsRouter.get('/', async (req, res) => {
  const { scenarioId, saved } = req.query
  const attempts = await prisma.scenarioAttempt.findMany({
    where: {
      ...(typeof scenarioId === 'string' ? { scenarioId } : {}),
      ...(saved === 'true' ? { saved: true } : {}),
    },
    include: { scenario: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(attempts)
})

attemptsRouter.post('/', async (req, res) => {
  const { scenarioId, responseText, feedback, modelResponse } = req.body ?? {}
  if (typeof scenarioId !== 'string' || typeof responseText !== 'string') {
    res.status(400).json({ error: 'scenarioId and responseText are required strings' })
    return
  }
  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  const attempt = await prisma.scenarioAttempt.create({
    data: {
      scenarioId,
      responseText,
      feedback: typeof feedback === 'string' ? feedback : null,
      modelResponse: typeof modelResponse === 'string' ? modelResponse : null,
    },
  })
  res.status(201).json(attempt)
})

attemptsRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  try {
    const attempt = await prisma.scenarioAttempt.update({
      where: { id: req.params.id },
      data: { saved },
    })
    res.json(attempt)
  } catch {
    res.status(404).json({ error: 'Attempt not found' })
  }
})
