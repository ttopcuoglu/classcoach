import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { checkFeatureAccess, countUsageLogActionsThisMonth, LESSON_PLANNING_ACTIONS } from '../lib/billing.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const assignmentCoachRouter = Router()

const START_MESSAGE = 'Start our conversation about this assignment.'

const MODE_LENS: Record<string, string> = {
  create:
    'Help them turn a learning objective into a concrete, well-scoped task. Ask about the objective, the students, and roughly how much time this should take before proposing an approach.',
  review:
    "Look at what they've shared through the lens of clarity, rigor, workload, and engagement. Start with whichever of those is most obviously worth discussing, not all four at once.",
  differentiate:
    "Focus on scaffolds, extensions, and accommodations that don't lower the expectation — ask who in the room needs more support and who needs more challenge before suggesting anything.",
  rubric:
    'Help them define clear success criteria tied to the actual skill or standard, not generic rubric language. Ask what a strong response actually looks like in their own words first.',
  ai_aware:
    "Help them think through AI's role in this task. Ask what their school or department's existing AI policy is before suggesting anything — never assume none exists, and never issue a ruling on whether AI should be allowed; offer considerations (process evidence, requiring students to explain their reasoning, in-class components) and let the teacher decide.",
}
const VALID_MODES = Object.keys(MODE_LENS)

function buildAssignmentCoachSystemPrompt(mode: string, context: string[]): string {
  return `You are Coach, a warm, practical instructional coach helping a teacher design or improve an assignment, piece of homework, or classroom task. This is a live, back-and-forth conversation, not a one-shot generator: your job is to understand the teacher's actual purpose before producing anything, not to rewrite their work on the first message.

Ask one specific, useful question at a time. Before suggesting any change, identify what's already working — name it plainly. Then identify 2-3 meaningful improvements to discuss, not an exhaustive list — depth over coverage. Never produce a full revised version during this conversation; that happens in a separate step once the teacher says they're ready.

Ground every suggestion in what the teacher has actually told you. Never invent a fact about their class or students that wasn't given to you. When you offer an interpretation rather than a plain observation, say so ("One thing I'd watch for is...", "This might land as...") rather than stating it as certain.

Coach, don't grade — you're a thinking partner, not an evaluator. Never rate the assignment on any scale, implicit or explicit.

${MODE_LENS[mode]}

Write in plain conversational text only — no markdown, no bullet lists in the chat itself.

Here is what the teacher has shared so far:
${context.map((line) => `- ${line}`).join('\n')}
${CORE_COACHING_RULES}`
}

const ASSIGNMENT_FINALIZE_SYSTEM_PROMPT = `You are Coach, wrapping up a conversation about an assignment with a teacher. Produce the final materials based on everything actually discussed — never introduce a new idea that wasn't part of the conversation.

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for any list-like content.

Respond with only the sections that were actually relevant to this conversation, each in its own tag, and omit any tag that doesn't apply:
<assignment>
The final assignment text — instructions, questions, or task description as the student would see it.
</assignment>
<rubric>
Success criteria, only if a rubric was discussed.
</rubric>
<scaffolds>
Scaffolds, extensions, or accommodations, only if differentiation was discussed.
</scaffolds>
<ai_use_statement>
A short statement for students about AI use on this task, only if AI-awareness was discussed.
</ai_use_statement>
${CORE_COACHING_RULES}`

type FinalMaterials = {
  assignment: string | null
  rubric: string | null
  scaffolds: string | null
  aiUseStatement: string | null
}

function buildContext(
  body: Record<string, unknown>,
  mode: string,
): { context: string[]; error: string | null } {
  const gradeLevel = typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim() : ''
  const originalText = typeof body.originalText === 'string' ? body.originalText.trim() : ''

  if (mode === 'create' && !objective) {
    return { context: [], error: 'objective is required for this mode' }
  }
  if (mode !== 'create' && !originalText) {
    return { context: [], error: 'originalText is required for this mode' }
  }

  const lines = [
    gradeLevel ? `Grade level: ${gradeLevel}` : null,
    subject ? `Subject: ${subject}` : null,
    mode === 'create' ? `Learning objective: ${objective}` : null,
    mode !== 'create' ? `The existing assignment:\n${originalText}` : null,
  ].filter((line): line is string => line != null)

  return { context: lines, error: null }
}

assignmentCoachRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const sessions = await prisma.assignmentCoachSession.findMany({
    where: { userId: req.user!.userId, ...(saved === 'true' ? { saved: true } : {}) },
    orderBy: { createdAt: 'desc' },
  })
  res.json(sessions)
})

assignmentCoachRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const mode = typeof body.mode === 'string' ? body.mode : ''
  if (!VALID_MODES.includes(mode)) {
    res.status(400).json({ error: 'Invalid mode' })
    return
  }

  const { context, error: contextError } = buildContext(body, mode)
  if (contextError) {
    res.status(400).json({ error: contextError })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'assignment_coach')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      thinking: { type: 'disabled' },
      system: buildAssignmentCoachSystemPrompt(mode, context),
      messages: [{ role: 'user', content: START_MESSAGE }],
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

    // Seeded with only Coach's opening reply — no synthetic user turn ever
    // renders, matching Reflect's own "start" convention.
    const conversation: ChatMessage[] = [{ role: 'assistant', text: reply, createdAt: new Date().toISOString() }]

    const session = await prisma.assignmentCoachSession.create({
      data: {
        userId: req.user!.userId,
        mode,
        gradeLevel: typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() || null : null,
        subject: typeof body.subject === 'string' ? body.subject.trim() || null : null,
        objective: typeof body.objective === 'string' ? body.objective.trim() || null : null,
        originalText: typeof body.originalText === 'string' ? body.originalText.trim() || null : null,
        conversation,
      },
    })
    res.status(201).json(session)
  } catch (error) {
    console.error('[assignment-coach] start failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

assignmentCoachRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }

  const existing = (session.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'assignment_coach_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const { context } = buildContext(
    {
      gradeLevel: session.gradeLevel,
      subject: session.subject,
      objective: session.objective,
      originalText: session.originalText,
    },
    session.mode,
  )

  const trimmed = message.trim()
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: buildAssignmentCoachSystemPrompt(session.mode, context),
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

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

assignmentCoachRouter.post('/:id/finalize', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }

  const existing = (session.conversation as unknown as ChatMessage[] | null) ?? []
  if (existing.length === 0) {
    res.status(400).json({ error: 'Nothing to finalize yet.' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'assignment_coach_finalize')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const transcript = existing.map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`).join('\n')
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      system: ASSIGNMENT_FINALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const finalMaterials: FinalMaterials = {
      assignment: extractTag(text, 'assignment'),
      rubric: extractTag(text, 'rubric'),
      scaffolds: extractTag(text, 'scaffolds'),
      aiUseStatement: extractTag(text, 'ai_use_statement'),
    }
    if (!Object.values(finalMaterials).some(Boolean)) {
      res.status(502).json({ error: 'Could not put together the final materials. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { finalMaterials },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] finalize failed:', error)
    res.status(502).json({ error: 'Could not put together the final materials. Please try again.' })
  }
})

assignmentCoachRouter.patch('/:id', async (req, res) => {
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
  const { count } = await prisma.assignmentCoachSession.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data,
  })
  if (count === 0) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  const session = await prisma.assignmentCoachSession.findUnique({ where: { id: req.params.id } })
  res.json(session)
})

assignmentCoachRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.assignmentCoachSession.deleteMany({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  res.json({ success: true })
})
