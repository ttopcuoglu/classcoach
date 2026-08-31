import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import {
  isValidMessageFormat,
  isValidMessagePurpose,
  isValidMessageTone,
  isValidRecipientType,
  isValidStartingAction,
} from '../lib/communicationOptions.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const parentMessageRouter = Router()

const TONE_INSTRUCTIONS: Record<string, string> = {
  warm: 'Warm and supportive — assume good faith, emphasize partnership, keep it gentle.',
  professional: 'Professional and neutral — clear, factual, no strong emotional coloring either way.',
  firm: 'Firm and direct — clear about the issue and the expectation going forward, but still respectful and professional, not harsh.',
  urgent: 'Urgent — convey that this needs prompt attention/response without sounding alarmist.',
}

const RECIPIENT_INSTRUCTIONS: Record<string, string> = {
  parent_caregiver: "the student's parent or caregiver",
  student: 'the student directly — age-appropriate, still professional, not talking down to them',
  colleague: 'a fellow teacher or staff member — collegial, not a formal report',
  administrator: 'a school administrator — concise, gets to the point, professional',
}

const PURPOSE_INSTRUCTIONS: Record<string, string> = {
  academic_concern: 'An academic concern — grades, missing work, or understanding of material.',
  behavior_concern: 'A behavior concern in class.',
  attendance_concern: 'An attendance or tardiness concern.',
  positive_update: 'A positive update — recognize something the student did well.',
  meeting_request: 'Requesting a meeting or call — the goal is to get time scheduled, keep it brief and focused on finding a time.',
  follow_up: 'A follow-up to a previous conversation or message.',
  general_information: 'General information — a neutral, factual update with no particular emotional weight.',
  other: 'See the description below for the specific purpose.',
}

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  email: 'An email — can include a brief greeting and closing.',
  text: 'A text message — short, casual-but-professional, no formal greeting/closing needed.',
  announcement: 'A class or group announcement — written for multiple recipients at once, no individual greeting.',
  phone_call_followup: 'A written follow-up to a phone call that already happened — reference that the call took place.',
}

const MESSAGE_SYSTEM_PROMPT = `You help K-12 teachers draft clear, professional messages and responses.

Rules:
- Write a ready-to-send message, appropriately sized for the format (a few sentences for a text, a short email otherwise).
- Include a greeting, body, and closing when the format calls for it (skip greeting/closing for a text message or announcement); include a brief subject line only for an email, on its own first line as "Subject: ...".
- Frame concerns as a partnership — invite the recipient's perspective or support rather than just reporting a problem. Never accusatory.
- Never include real, identifiable people's full names — use "your student"/"you" as appropriate or a first-name placeholder like "[Student's name]".
- Match the requested tone, recipient, purpose, and format exactly.
- When responding to a received message, address what it actually said. When improving a draft, preserve the teacher's intended meaning and specific details — polish it, don't replace it with something generic.
- Output ONLY the message text (with the optional "Subject:" line as described above). No preamble or explanation.
${CORE_COACHING_RULES}`

const MESSAGE_CHAT_SYSTEM_PROMPT = `You help K-12 teachers revise a draft message, based on what the teacher asks for (e.g. "make it warmer," "shorter," "translate to Spanish"). This is a live revision, not a discussion — your job each turn is to produce the updated message, not to comment on it.

Rules:
- Output ONLY the revised message text (including a "Subject:" line if the original had one). No preamble, no explanation of what you changed.
- Keep it ready-to-send, factual and specific, never accusatory.
- Never include real, identifiable people's full names — use "your student"/"you" or a first-name placeholder like "[Student's name]".
- Apply the teacher's requested change to the most recent version of the message, keeping everything else about it intact unless asked to change it too.
${CORE_COACHING_RULES}`

function buildContext(body: Record<string, unknown>): { context: string; error: string | null } {
  const startingAction = isValidStartingAction(body.startingAction) ? body.startingAction : 'new'
  const recipientType = isValidRecipientType(body.recipientType) ? body.recipientType : null
  const purpose = isValidMessagePurpose(body.purpose) ? body.purpose : null
  const format = isValidMessageFormat(body.format) ? body.format : null

  const lines: string[] = []
  if (recipientType) lines.push(`Recipient: ${RECIPIENT_INSTRUCTIONS[recipientType]}`)
  if (purpose) lines.push(`Purpose: ${PURPOSE_INSTRUCTIONS[purpose]}`)
  if (format) lines.push(`Format: ${FORMAT_INSTRUCTIONS[format]}`)

  if (startingAction === 'respond') {
    const receivedMessage = typeof body.receivedMessage === 'string' ? body.receivedMessage.trim() : ''
    if (!receivedMessage) return { context: '', error: 'receivedMessage is required for "respond" mode' }
    lines.push(`\nMessage received:\n${receivedMessage}`)
    const contextNotes = typeof body.contextNotes === 'string' ? body.contextNotes.trim() : ''
    if (contextNotes) lines.push(`\nImportant facts/context to include:\n${contextNotes}`)
  } else if (startingAction === 'improve') {
    const existingDraft = typeof body.existingDraft === 'string' ? body.existingDraft.trim() : ''
    if (!existingDraft) return { context: '', error: 'existingDraft is required for "improve" mode' }
    lines.push(`\nTeacher's existing draft to improve:\n${existingDraft}`)
  } else {
    const incidentSummary = typeof body.incidentSummary === 'string' ? body.incidentSummary.trim() : ''
    if (!incidentSummary) return { context: '', error: 'incidentSummary is required for "new" mode' }
    lines.push(`\nWhat happened / what to communicate:\n${incidentSummary}`)
  }

  return { context: lines.join('\n'), error: null }
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
  const body = (req.body ?? {}) as Record<string, unknown>
  const { tone } = body
  if (!isValidMessageTone(tone)) {
    res.status(400).json({ error: 'tone must be a known tone' })
    return
  }
  const { context, error: contextError } = buildContext(body)
  if (contextError) {
    res.status(400).json({ error: contextError })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'parent_message')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const fullContext = `${context}\n\nDesired tone: ${TONE_INSTRUCTIONS[tone]}`
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: MESSAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fullContext }],
    })

    const draftText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!draftText) {
      res.status(502).json({ error: 'Could not generate a message. Please try again.' })
      return
    }

    const conversation = appendTurn([], fullContext, draftText)

    const startingAction = isValidStartingAction(body.startingAction) ? body.startingAction : 'new'
    const message = await prisma.parentMessage.create({
      data: {
        userId: req.user!.userId,
        startingAction,
        incidentSummary: typeof body.incidentSummary === 'string' ? body.incidentSummary.trim() : null,
        receivedMessage: typeof body.receivedMessage === 'string' ? body.receivedMessage.trim() : null,
        existingDraft: typeof body.existingDraft === 'string' ? body.existingDraft.trim() : null,
        recipientType: isValidRecipientType(body.recipientType) ? body.recipientType : null,
        purpose: isValidMessagePurpose(body.purpose) ? body.purpose : null,
        format: isValidMessageFormat(body.format) ? body.format : null,
        tone,
        draftText,
        conversation,
      },
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
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: MESSAGE_CHAT_SYSTEM_PROMPT,
      messages: toClaudeMessages(existing, trimmed),
    })
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

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
  const { saved, title } = req.body ?? {}
  const data: { saved?: boolean; title?: string } = {}
  if (saved !== undefined) {
    if (typeof saved !== 'boolean') {
      res.status(400).json({ error: 'saved must be a boolean' })
      return
    }
    data.saved = saved
  }
  if (title !== undefined) {
    if (typeof title !== 'string') {
      res.status(400).json({ error: 'title must be a string' })
      return
    }
    data.title = title.trim() || undefined
  }
  const { count } = await prisma.parentMessage.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data,
  })
  if (count === 0) {
    res.status(404).json({ error: 'Parent message not found' })
    return
  }
  const message = await prisma.parentMessage.findUnique({ where: { id: req.params.id } })
  res.json(message)
})

parentMessageRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.parentMessage.deleteMany({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Parent message not found' })
    return
  }
  res.json({ success: true })
})
