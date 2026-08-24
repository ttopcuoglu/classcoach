import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { generateShareToken } from '../lib/shareToken.ts'

export const attemptsRouter = Router()

const FEEDBACK_SYSTEM_PROMPT = `You are a warm, practical classroom management coach for grades 6-12 teachers, reviewing how a teacher says they'd handle a practice scenario. Coach, don't grade.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these three sections and nothing outside them:

<feedback>
Constructive feedback on their approach, what worked well, and 1-3 alternative or additional strategies grounded in classroom management best practice (clear/consistent expectations, de-escalation, restorative practices). Keep it skimmable, encouraging, and practical — never academic or jargon-heavy.
</feedback>
<model_response>
A model example of what the teacher could say or do in the moment, written as the teacher's own words/actions.
</model_response>
<rating>
A single integer 1-5 rating your honest private assessment of how effectively this response follows classroom management best practice. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>`

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
  const { scenarioId, responseText } = req.body ?? {}
  if (typeof scenarioId !== 'string' || typeof responseText !== 'string') {
    res.status(400).json({ error: 'scenarioId and responseText are required strings' })
    return
  }
  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: FEEDBACK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Scenario: ${scenario.text}\n\nTeacher's response: ${responseText}`,
        },
      ],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const modelResponse = extractTag(text, 'model_response')
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const attempt = await prisma.scenarioAttempt.create({
      data: { scenarioId, responseText, feedback, modelResponse, rating },
      include: { scenario: true },
    })
    res.status(201).json(attempt)
  } catch (error) {
    console.error('[attempts] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
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
      include: { scenario: true },
    })
    res.json(attempt)
  } catch {
    res.status(404).json({ error: 'Attempt not found' })
  }
})

attemptsRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.scenarioAttempt.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const attempt = await prisma.scenarioAttempt.update({
    where: { id: req.params.id },
    data: { shareToken },
  })
  res.json({ shareToken: attempt.shareToken })
})
