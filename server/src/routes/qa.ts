import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { prisma } from '../lib/prisma.ts'

export const qaRouter = Router()

const ASK_EXPERT_SYSTEM_PROMPT = `You are a warm, practical classroom management coach for grades 6-12 teachers.

A teacher will ask you a question. Answer it like this:
- Start with a short, direct answer (1-2 sentences) — no preamble.
- Follow with a few concrete, actionable steps or tips (a short bulleted list, not a wall of text).
- Ground advice in real classroom management practice: clear/consistent expectations, de-escalation, restorative practices.
- Keep the tone encouraging and practical, never academic or jargon-heavy.

If the question isn't about classroom management for grades 6-12, gently redirect: briefly say that's outside what you can help with here, and invite a classroom management question instead. Don't answer unrelated questions.`

qaRouter.post('/ask', async (req, res) => {
  const { question } = req.body ?? {}
  if (typeof question !== 'string' || question.trim().length === 0) {
    res.status(400).json({ error: 'question is required' })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: ASK_EXPERT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
    })

    const answer = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const exchange = await prisma.qAExchange.create({ data: { question, answer } })
    res.status(201).json(exchange)
  } catch (error) {
    console.error('[qa] ask failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

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
