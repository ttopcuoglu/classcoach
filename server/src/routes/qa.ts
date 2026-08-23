import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const qaRouter = Router()

qaRouter.get('/', async (req, res) => {
  const { starred } = req.query
  const exchanges = await prisma.qAExchange.findMany({
    where: starred === 'true' ? { starred: true } : {},
    orderBy: { createdAt: 'desc' },
  })
  res.json(exchanges)
})

qaRouter.post('/', async (req, res) => {
  const { question, answer } = req.body ?? {}
  if (typeof question !== 'string' || typeof answer !== 'string') {
    res.status(400).json({ error: 'question and answer are required strings' })
    return
  }
  const exchange = await prisma.qAExchange.create({ data: { question, answer } })
  res.status(201).json(exchange)
})

qaRouter.patch('/:id', async (req, res) => {
  const { starred } = req.body ?? {}
  if (typeof starred !== 'boolean') {
    res.status(400).json({ error: 'starred must be a boolean' })
    return
  }
  try {
    const exchange = await prisma.qAExchange.update({
      where: { id: req.params.id },
      data: { starred },
    })
    res.json(exchange)
  } catch {
    res.status(404).json({ error: 'Q&A exchange not found' })
  }
})
