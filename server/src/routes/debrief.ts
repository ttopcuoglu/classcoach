import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { SCENARIO_CATEGORIES } from '../lib/scenarioCategories.ts'
import { generateShareToken } from '../lib/shareToken.ts'

export const debriefRouter = Router()

const DEBRIEF_SYSTEM_PROMPT = `You are a warm, practical classroom management coach for grades 6-12 teachers. A teacher is debriefing something that ALREADY HAPPENED in their classroom today — this is a real incident, not a hypothetical to solve. Respond with reflective, forward-looking coaching: help them make sense of what happened and plan for next time. Coach, don't grade.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these three sections and nothing outside them:

<feedback>
Reflective feedback on how they handled it in the moment: what worked, what to consider differently, grounded in classroom management best practice (clear/consistent expectations, de-escalation, restorative practices). Keep it skimmable, encouraging, and practical.
</feedback>
<follow_up>
A concrete next step — how to follow up with the student(s) involved, repair the relationship if needed, or handle it differently if it happens again. Written as practical guidance for what to actually do next, not a script for a moment that's already passed.
</follow_up>
<rating>
A single integer 1-5 rating your honest private assessment of how effectively this was handled, per classroom management best practice. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>`

function isValidCategory(value: unknown): value is string {
  return typeof value === 'string' && (SCENARIO_CATEGORIES as readonly string[]).includes(value)
}

debriefRouter.get('/', async (req, res) => {
  const { saved, category } = req.query
  const debriefs = await prisma.debrief.findMany({
    where: {
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof category === 'string' ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(debriefs)
})

debriefRouter.post('/', async (req, res) => {
  const { incidentText, category } = req.body ?? {}
  if (typeof incidentText !== 'string' || incidentText.trim().length === 0) {
    res.status(400).json({ error: 'incidentText is required' })
    return
  }
  if (category !== undefined && !isValidCategory(category)) {
    res.status(400).json({ error: 'category must be one of the known scenario categories' })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: DEBRIEF_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `What happened: ${incidentText}` }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const followUp = extractTag(text, 'follow_up')
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const debrief = await prisma.debrief.create({
      data: { incidentText, category: category ?? null, feedback, followUp, rating },
    })
    res.status(201).json(debrief)
  } catch (error) {
    console.error('[debrief] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

debriefRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  try {
    const debrief = await prisma.debrief.update({ where: { id: req.params.id }, data: { saved } })
    res.json(debrief)
  } catch {
    res.status(404).json({ error: 'Debrief not found' })
  }
})

debriefRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.debrief.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const debrief = await prisma.debrief.update({ where: { id: req.params.id }, data: { shareToken } })
  res.json({ shareToken: debrief.shareToken })
})
