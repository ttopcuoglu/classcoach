import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { prisma } from '../lib/prisma.ts'

export const parentMessageRouter = Router()

const TONES = ['warm', 'firm', 'informational', 'requesting_meeting'] as const

const TONE_INSTRUCTIONS: Record<(typeof TONES)[number], string> = {
  warm: 'Warm and supportive — assume good faith, emphasize partnership, keep it gentle.',
  firm: 'Firm and direct — clear about the issue and the expectation going forward, but still respectful and professional, not harsh.',
  informational: 'Informational — a neutral, factual FYI with no particular emotional weight, just keeping the parent in the loop.',
  requesting_meeting: 'Requesting a meeting — the goal is to get a call or in-person conversation scheduled, so keep it brief and focused on finding a time.',
}

const PARENT_MESSAGE_SYSTEM_PROMPT = `You help grades 6-12 teachers draft clear, professional messages to a student's parent or guardian about a classroom incident.

Rules:
- Write a ready-to-send message: 3-6 sentences, factual and specific to what the teacher described, never accusatory toward the student or the parent.
- Frame it as a partnership — invite the parent's perspective or support rather than just reporting a problem.
- Never include real, identifiable people's full names — use "your student" or a first-name placeholder like "[Student's name]".
- Match the requested tone exactly.
- Output ONLY the message text. No subject line, no "Dear ___" placeholder instructions, no preamble or explanation.`

function isValidTone(value: unknown): value is (typeof TONES)[number] {
  return typeof value === 'string' && (TONES as readonly string[]).includes(value)
}

parentMessageRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const messages = await prisma.parentMessage.findMany({
    where: saved === 'true' ? { saved: true } : {},
    orderBy: { createdAt: 'desc' },
  })
  res.json(messages)
})

parentMessageRouter.post('/', async (req, res) => {
  const { incidentSummary, tone } = req.body ?? {}
  if (typeof incidentSummary !== 'string' || incidentSummary.trim().length === 0) {
    res.status(400).json({ error: 'incidentSummary is required' })
    return
  }
  if (!isValidTone(tone)) {
    res.status(400).json({ error: `tone must be one of: ${TONES.join(', ')}` })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: PARENT_MESSAGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Incident: ${incidentSummary}\n\nDesired tone: ${TONE_INSTRUCTIONS[tone]}`,
        },
      ],
    })

    const draftText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const message = await prisma.parentMessage.create({
      data: { incidentSummary, tone, draftText },
    })
    res.status(201).json(message)
  } catch (error) {
    console.error('[parentMessage] draft generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

parentMessageRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  try {
    const message = await prisma.parentMessage.update({ where: { id: req.params.id }, data: { saved } })
    res.json(message)
  } catch {
    res.status(404).json({ error: 'Parent message not found' })
  }
})
