import type { DocBlock } from '../lib/exportModels.ts'
import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { checkFeatureAccess, COMMUNICATIONS_ACTIONS, countUsageLogActionsThisMonth } from '../lib/billing.ts'
import { isValidMeetingFormat, isValidMeetingType, isValidRecipientType } from '../lib/communicationOptions.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { extractTag } from '../lib/extractTag.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const conversationPlanRouter = Router()

const RECIPIENT_GUIDANCE: Record<string, string> = {
  parent_caregiver: "You're speaking with the student's parent or caregiver.",
  student: "You're speaking with the student directly.",
  colleague: "You're speaking with a fellow teacher or staff member.",
  administrator: "You're speaking with a school administrator.",
  other: "You're speaking with someone whose role the teacher hasn't named — read it from what they describe.",
}

const MEETING_FORMAT_GUIDANCE: Record<string, string> = {
  in_person: 'This will happen in person.',
  phone: 'This will happen over the phone.',
  video: 'This will happen over video call.',
  formal_meeting: 'This is a formal meeting (e.g. IEP/504, parent-teacher conference).',
}

const MEETING_TYPE_GUIDANCE: Record<string, string> = {
  parent_family: 'This is a conference with a parent or family member.',
  student: 'This is a conference directly with the student.',
  iep_504: 'This is an IEP or 504 meeting — a formal, team-based meeting with specific procedural expectations.',
  team_department: 'This is a team or department meeting with colleagues.',
  administrator: "This is a meeting with a school administrator — the teacher's own supervisor or a school leader.",
  post_observation: 'This is a post-observation meeting, following a classroom observation.',
  difficult_colleague: 'This is a difficult conversation with a colleague.',
}

export const PLAN_SYSTEM_PROMPT = `You are a warm, practical communication coach helping a K-12 teacher prepare for a real, upcoming conversation. Build a concrete plan grounded only in what the teacher told you — never invent facts, names, or details they didn't give you.

Write in plain text only — no markdown (no **bold**, no # headings). Use a leading "-" for list items, one per line.

Respond with exactly these thirteen sections and nothing outside them:

<agenda>
A short suggested agenda for the meeting — the 3-5 items it should cover, in order. Skip this section's usefulness check only if the situation clearly isn't a multi-item meeting (e.g. a single quick check-in) — even then, give a minimal one-line agenda rather than omitting it.
</agenda>
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

// The plan itself, handed to the coach rather than left behind. The chat used to
// start from a two-line seed (opening + main concern), so Coach could answer
// "give me a stronger opening" and not "what was I going to avoid saying?" — ten
// of the twelve sections it had just written were invisible to it.
function renderPlan(plan: PlanContent | null): string {
  if (!plan) return ''
  const section = (label: string, body: string) => (body?.trim() ? `${label}:\n${body.trim()}` : null)
  const parts = [
    section('Suggested agenda', plan.agenda),
    section('Suggested opening', plan.opening),
    section('The main concern to land', plan.mainConcern),
    section('Facts worth bringing', plan.facts),
    section('Questions to ask', plan.questions),
    section('Reactions to expect', plan.reactions),
    section('Recommended responses', plan.recommendedResponses),
    section('Phrases to avoid', plan.phrasesToAvoid),
    section('Boundaries to hold', plan.boundaries),
    section('Suggested closing', plan.closing),
    section('Next steps', plan.nextSteps),
    section('On involving an administrator', plan.adminInvolvement),
  ].filter(Boolean)
  return parts.length ? `\n\nThe plan you already wrote for this teacher:\n\n${parts.join('\n\n')}` : ''
}

/// The same plan as printable blocks, for the PDF the chat sends.
///
/// renderPlan above is for a prompt — one string, read by a model. This
/// is for a teacher holding a page outside a meeting room, so each
/// section is a heading they can find with a thumb. The model response
/// is included here and not there: a script is what you want in your
/// hand, and noise in a system prompt.
export function planDocBlocks(plan: PlanContent | null): DocBlock[] {
  if (!plan) return []
  const sections: [string, string | undefined][] = [
    ['Suggested agenda', plan.agenda],
    ['How to open', plan.opening],
    ['The main concern to land', plan.mainConcern],
    ['Facts worth bringing', plan.facts],
    ['Questions to ask', plan.questions],
    ['Reactions to expect', plan.reactions],
    ['Recommended responses', plan.recommendedResponses],
    ['Phrases to avoid', plan.phrasesToAvoid],
    ['Boundaries to hold', plan.boundaries],
    ['If you need the words', plan.modelResponse],
    ['How to close', plan.closing],
    ['Next steps', plan.nextSteps],
    ['On involving an administrator', plan.adminInvolvement],
  ]
  return sections.flatMap(([label, body]): DocBlock[] =>
    body?.trim() ? [{ type: 'heading', text: label }, { type: 'paragraph', text: body.trim() }] : [],
  )
}

const PLAN_CHAT_SYSTEM_PROMPT = `You are a warm, practical communication coach continuing to help a K-12 teacher prepare for a real, upcoming conversation you already built a plan for. This is a live revision/discussion — if the teacher asks a specific question (e.g. "what if they deny it?"), answer it directly and practically in 2-4 sentences. If they ask you to change the plan (e.g. "give me a stronger opening"), revise the plan and say so briefly. Stay grounded in what they've told you; never invent details.
${CORE_COACHING_RULES}`

// Rehearsal is the plan out loud. Coach plays the other person from the
// "reactions to expect" it wrote, then steps out and coaches the teacher's reply
// against their own prep — their boundaries, their phrases to avoid — rather
// than against generic advice. The step-out marker matters: a teacher who cannot
// tell the parent from the coach is being confused, not trained.
const PLAN_REHEARSE_SYSTEM_PROMPT = `You are running a spoken rehearsal with a K-12 teacher for a real conversation you already built a plan for. You play two parts and must always make clear which one is speaking.

IN CHARACTER: play the other person in this conversation, drawing on the reactions the plan says to expect. Be realistic, not cartoonish — one to three sentences, the way a person actually talks. Prefix these lines with "THEM: ".

AS THE COACH: after the teacher answers, step out and react to what they actually said, in two to four sentences. Prefix these with "COACH: ". Say what landed, then the one thing to change, and offer the better wording as a sentence they could say out loud — "try: ...". Judge their answer against their own plan: the boundaries they set, the phrases they decided to avoid, the responses they chose. Only fall back on general advice when the plan says nothing about it.

Then go back in character with the other person's next line, so the rehearsal keeps moving. Stop and hand control back when the teacher has handled the hard part, or when they ask to stop.

Never invent facts about the student, family or school beyond what the teacher and the plan have told you. Plain text only — no markdown.
${CORE_COACHING_RULES}`

type PlanContent = {
  agenda: string
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

// Every section this prompt writes. Passed to each extraction so a
// section that loses its closing tag stops at the next one rather than
// swallowing it — see extractTag. Most are single words, which nothing
// can recognise as ours from the outside.
const PLAN_TAGS = [
  'agenda',
  'opening',
  'main_concern',
  'facts',
  'questions',
  'reactions',
  'responses',
  'phrases_to_avoid',
  'boundaries',
  'closing',
  'model_response',
  'next_steps',
  'admin_involvement',
] as const

export function parsePlan(text: string): PlanContent | null {
  const section = (tag: string) => extractTag(text, tag, PLAN_TAGS) ?? ''
  const plan: PlanContent = {
    agenda: section('agenda'),
    opening: section('opening'),
    mainConcern: section('main_concern'),
    facts: section('facts'),
    questions: section('questions'),
    reactions: section('reactions'),
    recommendedResponses: section('responses'),
    phrasesToAvoid: section('phrases_to_avoid'),
    boundaries: section('boundaries'),
    closing: section('closing'),
    modelResponse: section('model_response'),
    nextSteps: section('next_steps'),
    adminInvolvement: section('admin_involvement'),
  }
  const hasContent = Object.values(plan).some(Boolean)
  return hasContent ? plan : null
}

export function buildContext(body: Record<string, unknown>): { context: string; error: string | null } {
  const situationText = typeof body.situationText === 'string' ? body.situationText.trim() : ''
  if (!situationText) return { context: '', error: 'situationText is required' }

  const recipientType = isValidRecipientType(body.recipientType) ? body.recipientType : null
  const meetingType = isValidMeetingType(body.meetingType) ? body.meetingType : null
  const meetingFormat = isValidMeetingFormat(body.meetingFormat) ? body.meetingFormat : null
  const attendees = typeof body.attendees === 'string' ? body.attendees.trim() : ''
  const desiredOutcome = typeof body.desiredOutcome === 'string' ? body.desiredOutcome.trim() : ''
  const concerns = typeof body.concerns === 'string' ? body.concerns.trim() : ''
  const background = typeof body.background === 'string' ? body.background.trim() : ''

  const lines = [
    meetingType ? MEETING_TYPE_GUIDANCE[meetingType] : null,
    recipientType ? RECIPIENT_GUIDANCE[recipientType] : null,
    meetingFormat ? MEETING_FORMAT_GUIDANCE[meetingFormat] : null,
    attendees ? `Who will attend:\n${attendees}` : null,
    `What the meeting is about:\n${situationText}`,
    desiredOutcome ? `Desired outcome:\n${desiredOutcome}` : null,
    concerns ? `Anything sensitive or difficult:\n${concerns}` : null,
    background ? `Relevant background/agenda/notes:\n${background}` : null,
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

/// A conversation plan with no HTTP request around it, so the Telegram
/// Coach can hand over the file — the precedent is generateTalkTakeaway
/// in debrief.ts.
///
/// Thirteen sections, including a full model response: far too long to
/// read as a message, and exactly the thing a teacher wants on paper
/// walking into the room. Saved like any other, so it can be opened and
/// talked through afterwards.
export async function generateConversationPlan(
  userId: string,
  input: Record<string, unknown>,
): Promise<{ plan: Awaited<ReturnType<typeof prisma.conversationPlan.create>> } | { error: string }> {
  const { context, error: contextError } = buildContext(input)
  if (contextError) return { error: contextError }

  const access = await checkFeatureAccess(userId, 'communications', () =>
    countUsageLogActionsThisMonth(userId, COMMUNICATIONS_ACTIONS),
  )
  if (!access.allowed) {
    return { error: access.upgradeMessage ?? "Communication Coach isn't included on your plan right now." }
  }

  const denied = await checkAndLogUsage(userId, 'conversation_plan_feedback')
  if (denied) return { error: denied }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2800,
      thinking: { type: 'disabled' },
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })
    const planContent = parsePlan(
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
    )
    if (!planContent) return { error: 'Could not generate a plan. Please try again.' }

    const plan = await prisma.conversationPlan.create({
      data: {
        userId,
        recipientType: isValidRecipientType(input.recipientType) ? input.recipientType : null,
        meetingType: isValidMeetingType(input.meetingType) ? input.meetingType : null,
        attendees: null,
        situationText: (input.situationText as string).trim(),
        desiredOutcome: typeof input.desiredOutcome === 'string' ? input.desiredOutcome.trim() : null,
        concerns: typeof input.concerns === 'string' ? input.concerns.trim() : null,
        background: null,
        meetingFormat: isValidMeetingFormat(input.meetingFormat) ? input.meetingFormat : null,
        planContent,
        conversation: appendTurn([], context, `Opening: ${planContent.opening}\n\nMain concern: ${planContent.mainConcern}`),
      },
    })
    return { plan }
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[conversation-plan] building for chat failed:', failure, error)
    return { error: failure.message }
  }
}

conversationPlanRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const { context, error: contextError } = buildContext(body)
  if (contextError) {
    res.status(400).json({ error: contextError })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'communications', () =>
    countUsageLogActionsThisMonth(req.user!.userId, COMMUNICATIONS_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'conversation_plan_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // 13 tagged sections including a full model-response script — 1400
      // risked cutting the response off before the last section(s), same
      // issue hit in conversationPrep.ts's practice report.
      max_tokens: 2800,
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
        meetingType: isValidMeetingType(body.meetingType) ? body.meetingType : null,
        attendees: typeof body.attendees === 'string' ? body.attendees.trim() || null : null,
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
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[conversation-plan] generation failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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
    res.status(409).json({ error: CONVERSATION_FULL_MESSAGE })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'conversation_plan_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmed = message.trim()
  const rehearsing = req.body?.mode === 'rehearse'
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system:
        (rehearsing ? PLAN_REHEARSE_SYSTEM_PROMPT : PLAN_CHAT_SYSTEM_PROMPT) +
        renderPlan(plan.planContent as PlanContent | null),
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
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[conversation-plan] chat failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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
