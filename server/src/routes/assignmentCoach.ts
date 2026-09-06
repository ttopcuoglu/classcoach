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

const VALID_MODES = ['create', 'improve']

const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  classwork: 'classwork',
  homework: 'homework',
  project: 'project',
  assessment: 'assessment',
  group_task: 'group task',
  exit_ticket: 'exit ticket',
  other: 'assignment',
}
const VALID_ASSIGNMENT_TYPES = Object.keys(ASSIGNMENT_TYPE_LABELS)

// One short, type-aware coaching note folded into the conversational
// prompt — kept intentionally light (the teacher's own typeDetails
// answers, when given, already carry the specifics) rather than a full
// branch per type.
const TYPE_COACHING_NOTES: Record<string, string> = {
  classwork: 'Keep in mind the available class time and whether this is individual, partner, or group work.',
  homework:
    "Keep in mind how long this should realistically take, whether students can complete it independently, and whether it truly needs to happen outside class.",
  project:
    'Keep in mind the project timeline and milestones, and how individual accountability works within any group components.',
  assessment: 'Keep in mind whether this is formative or summative, and how AI use should factor into it.',
  group_task: 'Keep in mind group roles, individual accountability, and how participation will be documented.',
  exit_ticket: 'Keep this tight — an exit ticket should be answerable in the time remaining and tied to one clear learning target.',
  other: '',
}

const MODE_FRAMING: Record<string, string> = {
  create: 'The teacher wants to create a new {type} together, starting from their objective or idea.',
  improve: 'The teacher already has a {type} they want to improve — discuss it with them before suggesting changes.',
}

function buildAssignmentCoachSystemPrompt(mode: string, assignmentType: string, context: string[]): string {
  const typeLabel = ASSIGNMENT_TYPE_LABELS[assignmentType] ?? 'assignment'
  const modeFraming = (MODE_FRAMING[mode] ?? MODE_FRAMING.improve).replace('{type}', typeLabel)
  const typeNote = TYPE_COACHING_NOTES[assignmentType] ?? ''

  return `You are Coach, a warm, practical instructional coach helping a teacher design or improve an assignment, piece of homework, or classroom task. This is a live, back-and-forth conversation, not a one-shot generator: your job is to understand the teacher's actual purpose before producing anything, not to rewrite their work on the first message.

${modeFraming}

Ask one specific, useful question at a time. Before suggesting any change, identify what's already working — name it plainly. Then identify 2-3 meaningful improvements to discuss, not an exhaustive list — depth over coverage. Never produce a full revised version during this conversation; that happens in a separate step once the teacher says they're ready.

Ground every suggestion in what the teacher has actually told you. Never invent a fact about their class or students that wasn't given to you. When you offer an interpretation rather than a plain observation, say so ("One thing I'd watch for is...", "This might land as...") rather than stating it as certain.

Coach, don't grade — you're a thinking partner, not an evaluator. Never rate the assignment on any scale, implicit or explicit.

${typeNote}

Write in plain conversational text only — no markdown, no bullet lists in the chat itself.

Here is what the teacher has shared so far:
${context.map((line) => `- ${line}`).join('\n')}
${CORE_COACHING_RULES}`
}

// Coach places a real, deterministic diagram directly in the assignment
// text using this inline syntax, instead of writing a prose instruction
// like "draw a fraction bar" — the client (web/src/lib/assignmentDiagrams.ts)
// parses it and renders an actual SVG. Only relevant to prompts that
// produce the assignment artifact itself — never the conversational ones.
const DIAGRAM_SYNTAX_INSTRUCTIONS = `When a visual model would genuinely help (a fraction bar, a number line), insert the actual diagram using this exact inline syntax instead of describing it in words — never write an instruction like "draw a fraction bar" when you can place the real thing:
[[diagram:fraction_bar|segments=N|shaded=M]] — a bar split into N equal parts with M shaded, representing the fraction M/N.
[[diagram:number_line|start=S|end=E|points=v1,v2,...|labels=l1,l2,...]] — a number line from S to E, points as decimals (e.g. 0.25 for 1/4), each labeled with the matching entry in labels (e.g. "1/4").
Use these only where a visual genuinely clarifies the task, not on every line.`

const ASSIGNMENT_FINALIZE_SYSTEM_PROMPT = `You are Coach, wrapping up a conversation about an assignment with a teacher. Produce the final assignment text based on everything actually discussed — never introduce a new idea that wasn't part of the conversation.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for any list-like content.

Respond with exactly this block and nothing else:
<assignment>
The final assignment text — instructions, questions, or task description as the student would see it.
</assignment>
${CORE_COACHING_RULES}`

function buildCreateDraftSystemPrompt(assignmentType: string, context: string[]): string {
  const typeLabel = ASSIGNMENT_TYPE_LABELS[assignmentType] ?? 'assignment'
  return `You are Coach, helping a teacher create a new ${typeLabel} from their learning objective or idea. Produce a solid first draft right away, grounded only in what they've told you — never invent facts about their class or students. The teacher will refine it with you afterward, so this draft doesn't need to be perfect, just a genuine, usable starting point.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for list-like content.

Here is what the teacher has shared:
${context.map((line) => `- ${line}`).join('\n')}

Respond with exactly these two sections and nothing else:
<reply>
A short, warm 1-2 sentence message introducing the draft and inviting the teacher to say what they'd like to adjust.
</reply>
<assignment>
The full draft assignment text, ready for a student to read.
</assignment>
${CORE_COACHING_RULES}`
}

const REVIEW_SYSTEM_PROMPT = `You are Coach, giving a teacher a concise coaching review of an assignment they're working on. Do not rewrite it — just review it.

Never state or imply a numeric score, rating, grade, or evaluative label of any kind.

Write in plain text only — no markdown.

Respond with exactly these three sections and nothing else:
<working>
One or two meaningful strengths, named plainly and specifically — not generic praise.
</working>
<misunderstand>
Unclear directions, missing expectations, or a likely student misconception — grounded in the actual text, not a guess about students you weren't told about.
</misunderstand>
<opportunity>
The single highest-impact improvement to make next, stated as one clear recommendation.
</opportunity>
${CORE_COACHING_RULES}`

const AI_RESISTANT_SYSTEM_PROMPT = `You are Coach, helping a teacher make an assignment more resistant to being fully outsourced to AI, while still allowing students to responsibly use AI as a tutor or thinking partner. The goal is not to make the assignment "AI-proof" — that's not realistic — but to keep student thinking visible and make it hard to skip the learning process entirely.

Ground every suggestion in the actual assignment below. Never invent details about the class or students that weren't given to you.

Favor concrete, low-lift moves: requiring a brief plan or prediction before starting, referencing something specific from class (a discussion, a text, an activity), asking students to show their process (drafts, an explanation of what they tried), or a short in-class or reflective piece that doesn't rely on AI.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for list-like content.

Respond with exactly these three sections and nothing else:
<strategies>
2-3 concrete strategies tailored to this specific assignment, each one sentence.
</strategies>
<guidelines>
A short, plain-language statement for students about how AI may and may not be used on this task.
</guidelines>
<revised_assignment>
The full assignment text, incorporating the strategies above naturally into the instructions.
</revised_assignment>
${CORE_COACHING_RULES}`

function buildContext(
  body: Record<string, unknown>,
  mode: string,
): { context: string[]; error: string | null } {
  const gradeLevel = typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim() : ''
  const originalText = typeof body.originalText === 'string' ? body.originalText.trim() : ''
  const estimatedTime = typeof body.estimatedTime === 'string' ? body.estimatedTime.trim() : ''
  const specificNeeds = typeof body.specificNeeds === 'string' ? body.specificNeeds.trim() : ''
  const assignmentType = typeof body.assignmentType === 'string' ? body.assignmentType : ''
  const typeDetails =
    body.typeDetails && typeof body.typeDetails === 'object' ? (body.typeDetails as Record<string, string>) : {}

  if (mode === 'create' && !objective) {
    return { context: [], error: 'objective is required for this mode' }
  }
  if (mode !== 'create' && !originalText) {
    return { context: [], error: 'originalText is required for this mode' }
  }

  const typeDetailLines = Object.entries(typeDetails)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)

  const lines = [
    assignmentType ? `Assignment type: ${ASSIGNMENT_TYPE_LABELS[assignmentType] ?? assignmentType}` : null,
    gradeLevel ? `Grade level: ${gradeLevel}` : null,
    subject ? `Subject: ${subject}` : null,
    estimatedTime ? `Estimated student work time: ${estimatedTime}` : null,
    specificNeeds ? `Specific learning needs to keep in mind: ${specificNeeds}` : null,
    ...typeDetailLines,
    mode === 'create' ? `Learning objective: ${objective}` : null,
    mode !== 'create' ? `The existing assignment:\n${originalText}` : null,
  ].filter((line): line is string => line != null)

  return { context: lines, error: null }
}

// Rebuilds the same context array from a persisted session — used by
// every stateless-system-prompt call site (chat, review) after the
// initial POST /.
function contextFromSession(session: {
  assignmentType: string | null
  typeDetails: unknown
  gradeLevel: string | null
  subject: string | null
  objective: string | null
  originalText: string | null
  liveAssignmentText: string | null
  estimatedTime: string | null
  specificNeeds: string | null
  mode: string
}): string[] {
  const { context } = buildContext(
    {
      assignmentType: session.assignmentType,
      typeDetails: session.typeDetails,
      gradeLevel: session.gradeLevel,
      subject: session.subject,
      objective: session.objective,
      // Once a live assignment exists, ground the conversation in its
      // current (possibly edited) text rather than the original.
      originalText: session.liveAssignmentText ?? session.originalText,
      estimatedTime: session.estimatedTime,
      specificNeeds: session.specificNeeds,
    },
    session.mode,
  )
  return context
}

assignmentCoachRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const sessions = await prisma.assignmentCoachSession.findMany({
    where: { userId: req.user!.userId, ...(saved === 'true' ? { saved: true } : {}) },
    orderBy: { updatedAt: 'desc' },
  })
  res.json(sessions)
})

assignmentCoachRouter.get('/:id', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  res.json(session)
})

assignmentCoachRouter.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const mode = typeof body.mode === 'string' ? body.mode : ''
  if (!VALID_MODES.includes(mode)) {
    res.status(400).json({ error: 'Invalid mode' })
    return
  }
  const assignmentType = typeof body.assignmentType === 'string' ? body.assignmentType : ''
  if (!VALID_ASSIGNMENT_TYPES.includes(assignmentType)) {
    res.status(400).json({ error: 'Invalid assignmentType' })
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
    const originalText = typeof body.originalText === 'string' ? body.originalText.trim() || null : null
    let conversation: ChatMessage[]
    // The workspace never opens empty. "Improve" already has the
    // teacher's own pasted/described text; "create" gets a real drafted
    // assignment in the same call that starts the conversation, instead
    // of forcing a back-and-forth before anything exists to look at.
    let liveAssignmentText: string | null = mode === 'improve' ? originalText : null

    if (mode === 'create') {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        thinking: { type: 'disabled' },
        system: buildCreateDraftSystemPrompt(assignmentType, context),
        messages: [{ role: 'user', content: START_MESSAGE }],
      })
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      const reply = extractTag(text, 'reply')
      const assignment = extractTag(text, 'assignment')
      if (!reply || !assignment) {
        res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
        return
      }
      conversation = [{ role: 'assistant', text: reply, createdAt: new Date().toISOString() }]
      liveAssignmentText = assignment
    } else {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        thinking: { type: 'disabled' },
        system: buildAssignmentCoachSystemPrompt(mode, assignmentType, context),
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
      // Seeded with only Coach's opening reply — no synthetic user turn
      // ever renders, matching Reflect's own "start" convention.
      conversation = [{ role: 'assistant', text: reply, createdAt: new Date().toISOString() }]
    }

    const session = await prisma.assignmentCoachSession.create({
      data: {
        userId: req.user!.userId,
        mode,
        assignmentType,
        typeDetails: body.typeDetails && typeof body.typeDetails === 'object' ? body.typeDetails : undefined,
        estimatedTime: typeof body.estimatedTime === 'string' ? body.estimatedTime.trim() || null : null,
        specificNeeds: typeof body.specificNeeds === 'string' ? body.specificNeeds.trim() || null : null,
        gradeLevel: typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() || null : null,
        subject: typeof body.subject === 'string' ? body.subject.trim() || null : null,
        objective: typeof body.objective === 'string' ? body.objective.trim() || null : null,
        originalText,
        liveAssignmentText,
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

  const context = contextFromSession(session)
  const trimmed = message.trim()
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: buildAssignmentCoachSystemPrompt(session.mode, session.assignmentType ?? 'other', context),
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

// Generates the Review tool's structured 3-part card, grounded in the
// CURRENT liveAssignmentText — regenerate-able on demand as the teacher
// edits, never blended into the free-form chat.
assignmentCoachRouter.post('/:id/review', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  if (!session.liveAssignmentText || !session.liveAssignmentText.trim()) {
    res.status(400).json({ error: 'Add some assignment text before requesting a review.' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'assignment_coach_review')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = contextFromSession(session)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      thinking: { type: 'disabled' },
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context.join('\n') }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const reviewSummary = {
      working: extractTag(text, 'working'),
      misunderstand: extractTag(text, 'misunderstand'),
      opportunity: extractTag(text, 'opportunity'),
    }
    if (!Object.values(reviewSummary).some(Boolean)) {
      res.status(502).json({ error: 'Could not put together a review. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { reviewSummary },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] review failed:', error)
    res.status(502).json({ error: 'Could not put together a review. Please try again.' })
  }
})

// Generates the AI-Resistant tool's output, grounded in the CURRENT
// liveAssignmentText. Never applied automatically — the teacher explicitly
// accepts the revised text via a separate action on the client.
assignmentCoachRouter.post('/:id/ai-resistant', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  if (!session.liveAssignmentText || !session.liveAssignmentText.trim()) {
    res.status(400).json({ error: 'Add some assignment text before making it AI-resistant.' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'assignment_coach_ai_resistant')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = contextFromSession(session)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      system: AI_RESISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context.join('\n') }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const aiResistant = {
      strategies: extractTag(text, 'strategies'),
      guidelines: extractTag(text, 'guidelines'),
      revisedAssignment: extractTag(text, 'revised_assignment'),
    }
    if (!Object.values(aiResistant).some(Boolean)) {
      res.status(502).json({ error: 'Could not put this together. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { aiResistant },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] ai-resistant failed:', error)
    res.status(502).json({ error: 'Could not put this together. Please try again.' })
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
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      system: ASSIGNMENT_FINALIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const assignment = extractTag(text, 'assignment')
    if (!assignment) {
      res.status(502).json({ error: 'Could not put together the assignment. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { liveAssignmentText: assignment },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] finalize failed:', error)
    res.status(502).json({ error: 'Could not put together the assignment. Please try again.' })
  }
})

assignmentCoachRouter.patch('/:id', async (req, res) => {
  const { saved, title, liveAssignmentText, status } = req.body ?? {}
  const data: { saved?: boolean; title?: string; liveAssignmentText?: string; status?: string } = {}
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
  if (liveAssignmentText !== undefined) {
    if (typeof liveAssignmentText !== 'string') {
      res.status(400).json({ error: 'liveAssignmentText must be a string' })
      return
    }
    data.liveAssignmentText = liveAssignmentText
  }
  if (status !== undefined) {
    if (status !== 'draft' && status !== 'completed') {
      res.status(400).json({ error: 'status must be draft or completed' })
      return
    }
    data.status = status
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
