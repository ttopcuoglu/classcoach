import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const scenariosRouter = Router()

scenariosRouter.get('/', async (req, res) => {
  const { category, gradeBand } = req.query
  const scenarios = await prisma.scenario.findMany({
    where: {
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof gradeBand === 'string' ? { gradeBand } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(scenarios)
})

scenariosRouter.get('/:id', async (req, res) => {
  const scenario = await prisma.scenario.findUnique({ where: { id: req.params.id } })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  res.json(scenario)
})

scenariosRouter.post('/', async (req, res) => {
  const { text, category, gradeBand, source } = req.body ?? {}
  if (
    typeof text !== 'string' ||
    typeof category !== 'string' ||
    typeof gradeBand !== 'string' ||
    typeof source !== 'string'
  ) {
    res.status(400).json({ error: 'text, category, gradeBand, and source are required strings' })
    return
  }
  const scenario = await prisma.scenario.create({ data: { text, category, gradeBand, source } })
  res.status(201).json(scenario)
})
