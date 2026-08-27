import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

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

const PARENT_MESSAGE_CHAT_SYSTEM_PROMPT = `You help grades 6-12 teachers revise a draft message to a student's parent or guardian, based on what the teacher asks for (e.g. "make it warmer," "shorter," "less formal"). This is a live revision, not a discussion — your job each turn is to produce the updated message, not to comment on it.

Rules:
- Output ONLY the revised message text. No subject line, no preamble, no explanation of what you changed.
- Keep it a ready-to-send message, factual and specific, never accusatory toward the student or the parent.
- Never include real, identifiable people's full names — use "your student" or a first-name placeholder like "[Student's name]".
- Apply the teacher's requested change to the most recent version of the message, keeping everything else about it intact unless asked to change it too.`

function isValidTone(value: unknown): value is (typeof TONES)[number] {
  return typeof value === 'string' && (TONES as readonly string[]).includes(value)
}

parentMessageRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const messages = await prisma.parentMessage.findMany({
    where: { userId: req.user!.userId, ...(saved === 'true' ? { saved: true } : {}) },
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

  const allowed = await checkAndLogUsage(req.user!.userId, 'parent_message')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = `Incident: ${incidentSummary}\n\nDesired tone: ${TONE_INSTRUCTIONS[tone]}`
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: PARENT_MESSAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })

    const draftText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const conversation = appendTurn([], context, draftText)

    const message = await prisma.parentMessage.create({
      data: { userId: req.user!.userId, incidentSummary, tone, draftText, conversation },
    })
    res.status(201).json(message)
  } catch (error) {
    console.error('[parentMessage] draft generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

parentMessageRouter.post('/:id/chat', async (req, res) => {
  const { message: userMessage } = req.body ?? {}
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const parentMessage = await prisma.parentMessage.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!parentMessage) {
    res.status(404).json({ error: 'Parent message not found' })
    return
  }

  const existing = (parentMessage.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'parent_message_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = userMessage.trim()
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: PARENT_MESSAGE_CHAT_SYSTEM_PROMPT,
      messages: toClaudeMessages(existing, trimmed),
    })
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const updated = await prisma.parentMessage.update({
      where: { id: parentMessage.id },
      data: { conversation: appendTurn(existing, trimmed, reply), draftText: reply },
    })
    res.json(updated)
  } catch (error) {
    console.error('[parentMessage] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

parentMessageRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  const { count } = await prisma.parentMessage.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { saved },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Parent message not found' })
    return
  }
  const message = await prisma.parentMessage.findUnique({ where: { id: req.params.id } })
  res.json(message)
})
