import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { isValidMeetingFormat, isValidRecipientType } from '../lib/communicationOptions.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const conversationPlanRouter = Router()

const RECIPIENT_GUIDANCE: Record<string, string> = {
  parent_caregiver: "You're speaking with the student's parent or caregiver.",
  student: "You're speaking with the student directly.",
  colleague: "You're speaking with a fellow teacher or staff member.",
  administrator: "You're speaking with a school administrator.",
}

const MEETING_FORMAT_GUIDANCE: Record<string, string> = {
  in_person: 'This will happen in person.',
  phone: 'This will happen over the phone.',
  video: 'This will happen over video call.',
  formal_meeting: 'This is a formal meeting (e.g. IEP/504, parent-teacher conference).',
}

const PLAN_SYSTEM_PROMPT = `You are a warm, practical communication coach helping a K-12 teacher prepare for a real, upcoming conversation. Build a concrete plan grounded only in what the teacher told you — never invent facts, names, or details they didn't give you.

Write in plain text only — no markdown (no **bold**, no # headings). Use a leading "-" for list items, one per line.

Respond with exactly these twelve sections and nothing outside them:

<opening>
A suggested opening line or two to start the conversation.
</opening>
<main_concern>
The main concern stated objectively — facts and impact, not judgment or labels.
</main_concern>
<facts>
The important facts to bring, as a short list.
</facts>
<questions>
Questions to ask the other person, as a short list.
</questions>
<reactions>
Possible reactions the other person might have, as a short list.
</reactions>
<responses>
Recommended responses to those reactions, as a short list.
</responses>
<phrases_to_avoid>
Phrases or framings to avoid, as a short list.
</phrases_to_avoid>
<boundaries>
Boundaries the teacher should maintain during the conversation.
</boundaries>
<closing>
A suggested way to close the conversation.
</closing>
<model_response>
A complete, natural example of what the teacher could actually say, start to finish — combining the opening, the main concern, and the closing into one cohesive, ready-to-use response. Not a list, a real spoken example.
</model_response>
<next_steps>
Agreed-upon next steps to propose.
</next_steps>
<admin_involvement>
When (if at all) an administrator should be involved — say plainly if this seems necessary, but never state a definitive legal conclusion, only a suggestion to loop someone in. Leave this section brief ("Not likely necessary for this conversation.") when it doesn't apply.
</admin_involvement>
${CORE_COACHING_RULES}`

const PLAN_CHAT_SYSTEM_PROMPT = `You are a warm, practical communication coach continuing to help a K-12 teacher prepare for a real, upcoming conversation you already built a plan for. This is a live revision/discussion — if the teacher asks a specific question (e.g. "what if they deny it?"), answer it directly and practically in 2-4 sentences. If they ask you to change the plan (e.g. "give me a stronger opening"), revise the plan and say so briefly. Stay grounded in what they've told you; never invent details.
${CORE_COACHING_RULES}`

type PlanContent = {
  opening: string
  mainConcern: string
  facts: string
  questions: string
  reactions: string
  recommendedResponses: string
  phrasesToAvoid: string
  boundaries: string
  closing: string
  modelResponse: string
  nextSteps: string
  adminInvolvement: string
}

function parsePlan(text: string): PlanContent | null {
  const plan: PlanContent = {
    opening: extractTag(text, 'opening') ?? '',
    mainConcern: extractTag(text, 'main_concern') ?? '',
    facts: extractTag(text, 'facts') ?? '',
    questions: extractTag(text, 'questions') ?? '',
    reactions: extractTag(text, 'reactions') ?? '',
    recommendedResponses: extractTag(text, 'responses') ?? '',
    phrasesToAvoid: extractTag(text, 'phrases_to_avoid') ?? '',
    boundaries: extractTag(text, 'boundaries') ?? '',
    closing: extractTag(text, 'closing') ?? '',
    modelResponse: extractTag(text, 'model_response') ?? '',
    nextSteps: extractTag(text, 'next_steps') ?? '',
    adminInvolvement: extractTag(text, 'admin_involvement') ?? '',
  }
  const hasContent = Object.values(plan).some(Boolean)
  return hasContent ? plan : null
}

function buildContext(body: Record<string, unknown>): { context: string; error: string | null } {
  const situationText = typeof body.situationText === 'string' ? body.situationText.trim() : ''
  if (!situationText) return { context: '', error: 'situationText is required' }

  const recipientType = isValidRecipientType(body.recipientType) ? body.recipientType : null
  const meetingFormat = isValidMeetingFormat(body.meetingFormat) ? body.meetingFormat : null
  const desiredOutcome = typeof body.desiredOutcome === 'string' ? body.desiredOutcome.trim() : ''
  const concerns = typeof body.concerns === 'string' ? body.concerns.trim() : ''
  const background = typeof body.background === 'string' ? body.background.trim() : ''

  const lines = [
    recipientType ? RECIPIENT_GUIDANCE[recipientType] : null,
    meetingFormat ? MEETING_FORMAT_GUIDANCE[meetingFormat] : null,
    `What happened:\n${situationText}`,
    desiredOutcome ? `Desired outcome:\n${desiredOutcome}` : null,
    concerns ? `Concerns about the conversation:\n${concerns}` : null,
    background ? `Relevant background/evidence:\n${background}` : null,
  ].filter(Boolean)

  return { context: lines.join('\n\n'), error: null }
}

conversationPlanRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const plans = await prisma.conversationPlan.findMany({
    where: { userId: req.user!.userId, ...(saved === 'true' ? { saved: true } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  res.json(plans)
})

conversationPlanRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const { context, error: contextError } = buildContext(body)
  if (contextError) {
    res.status(400).json({ error: contextError })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_plan_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // 12 tagged sections including a full model-response script — 1400
      // risked cutting the response off before the last section(s), same
      // issue hit in conversationPrep.ts's practice report.
      max_tokens: 2400,
      thinking: { type: 'disabled' },
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const planContent = parsePlan(text)
    if (!planContent) {
      res.status(502).json({ error: 'Could not generate a plan. Please try again.' })
      return
    }

    const seedReply = `Opening: ${planContent.opening}\n\nMain concern: ${planContent.mainConcern}`
    const conversation = appendTurn([], context, seedReply)

    const plan = await prisma.conversationPlan.create({
      data: {
        userId: req.user!.userId,
        recipientType: isValidRecipientType(body.recipientType) ? body.recipientType : null,
        situationText: (body.situationText as string).trim(),
        desiredOutcome: typeof body.desiredOutcome === 'string' ? body.desiredOutcome.trim() : null,
        concerns: typeof body.concerns === 'string' ? body.concerns.trim() : null,
        background: typeof body.background === 'string' ? body.background.trim() : null,
        meetingFormat: isValidMeetingFormat(body.meetingFormat) ? body.meetingFormat : null,
        planContent,
        conversation,
      },
    })
    res.status(201).json(plan)
  } catch (error) {
    console.error('[conversation-plan] generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

conversationPlanRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const plan = await prisma.conversationPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!plan) {
    res.status(404).json({ error: 'Conversation plan not found' })
    return
  }

  const existing = (plan.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_plan_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = message.trim()
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: PLAN_CHAT_SYSTEM_PROMPT,
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

    const updated = await prisma.conversationPlan.update({
      where: { id: plan.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
    })
    res.json(updated)
  } catch (error) {
    console.error('[conversation-plan] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

conversationPlanRouter.patch('/:id', async (req, res) => {
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
  const { count } = await prisma.conversationPlan.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data,
  })
  if (count === 0) {
    res.status(404).json({ error: 'Conversation plan not found' })
    return
  }
  const plan = await prisma.conversationPlan.findUnique({ where: { id: req.params.id } })
  res.json(plan)
})

conversationPlanRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.conversationPlan.deleteMany({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Conversation plan not found' })
    return
  }
  res.json({ success: true })
})
