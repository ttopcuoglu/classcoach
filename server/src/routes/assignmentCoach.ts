import { Router } from 'express'
import mammoth from 'mammoth'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { checkFeatureAccess, countUsageLogActionsThisMonth, LESSON_PLANNING_ACTIONS } from '../lib/billing.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const assignmentCoachRouter = Router()

const START_MESSAGE = 'Start our conversation about this assignment.'

// 'create'/'improve' are retired but may still exist on old rows — the
// workspace falls back to Review-style display for any unrecognized mode.
const VALID_MODES = ['review', 'redesign_ai']

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

const AI_USE_LEVEL_LABELS: Record<string, string> = {
  thinking_partner: 'AI as a thinking partner',
  limited: 'Limited AI use',
  no_ai: 'No AI use',
}
const AI_USE_LEVEL_GUIDANCE: Record<string, string> = {
  thinking_partner:
    'Students may use AI to question, brainstorm, receive feedback, or revise their own work — but the final product must show their own reasoning.',
  limited:
    'AI is permitted only for specific, teacher-approved steps — be explicit in the guidelines about which steps those are, based on what the teacher described.',
  no_ai:
    "The task should be completable without generative AI, and should include authentic evidence of the student's own thinking.",
}
const VALID_AI_USE_LEVELS = Object.keys(AI_USE_LEVEL_GUIDANCE)

const REDESIGN_GUIDING_PRINCIPLE =
  'Do not merely make the assignment harder to complete with AI. Redesign it so student thinking, judgment, voice, and process remain visible.'

const REDESIGN_STRATEGIES_LIST = `- Student-specific choices or local context that AI can't fabricate accurately
- Process checkpoints that make the work-in-progress visible
- Draft-to-final development, not a single final submission
- An oral explanation or brief conference about the work
- An in-class component that can't be outsourced
- Reflection on the decisions and revisions made
- Verification of sources used
- Personal application of the concept
- Required evidence of the student's own reasoning`

const REVIEW_LENSES =
  'purpose and clarity, cognitive demand, student ownership and critical thinking, accessibility and differentiation, success criteria, and potential AI shortcuts'

const MODE_FRAMING: Record<string, string> = {
  review:
    "The teacher wants coaching feedback on an assignment they already have — discuss it with them, and don't rewrite the whole thing unless they ask.",
  redesign_ai:
    'The teacher wants to redesign an assignment for meaningful AI use — discuss it with them, keeping student thinking, judgment, voice, and process visible.',
}

function buildAssignmentCoachSystemPrompt(mode: string, assignmentType: string, context: string[]): string {
  const typeLabel = ASSIGNMENT_TYPE_LABELS[assignmentType] ?? 'assignment'
  const modeFraming = (MODE_FRAMING[mode] ?? MODE_FRAMING.review).replace('{type}', typeLabel)

  return `You are Coach, a warm, practical instructional coach helping a teacher with an assignment, piece of homework, or classroom task. This is a live, back-and-forth conversation, not a one-shot generator.

${modeFraming}

Ask one specific, useful question at a time when it helps. Before suggesting any change, identify what's already working — name it plainly. Ground every suggestion in what the teacher has actually told you. Never invent a fact about their class or students that wasn't given to you. When you offer an interpretation rather than a plain observation, say so ("One thing I'd watch for is...", "This might land as...") rather than stating it as certain.

Coach, don't grade — you're a thinking partner, not an evaluator. Never rate the assignment on any scale, implicit or explicit.

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

function buildReviewStartPrompt(context: string[]): string {
  return `You are Coach, giving a teacher a coaching review of an assignment they've shared, and opening a conversation about it. Do not rewrite the assignment — review it.

Look at it through these lenses: ${REVIEW_LENSES}. You don't need to comment on every lens — focus on what's most worth saying.

Never state or imply a numeric score, rating, grade, or evaluative label of any kind.

Write in plain text only — no markdown.

Here is what the teacher has shared:
${context.map((line) => `- ${line}`).join('\n')}

Respond with exactly these four sections and nothing else:
<reply>
A short, warm 1-2 sentence message introducing the review below and inviting the teacher to ask about anything or request changes.
</reply>
<working>
One or two meaningful strengths, named plainly and specifically — not generic praise.
</working>
<needs_attention>
What may need attention — unclear directions, missing expectations, a likely student misconception, or a place where the cognitive demand, accessibility, or success criteria could be stronger.
</needs_attention>
<suggestions>
1-3 concrete, actionable suggested improvements.
</suggestions>
${CORE_COACHING_RULES}`
}

const REVIEW_SYSTEM_PROMPT = `You are Coach, giving a teacher a concise coaching review of an assignment they're working on. Do not rewrite it — just review it.

Look at it through these lenses: ${REVIEW_LENSES}. You don't need to comment on every lens — focus on what's most worth saying.

Never state or imply a numeric score, rating, grade, or evaluative label of any kind.

Write in plain text only — no markdown.

Respond with exactly these three sections and nothing else:
<working>
One or two meaningful strengths, named plainly and specifically — not generic praise.
</working>
<needs_attention>
What may need attention — unclear directions, missing expectations, a likely student misconception, or a place where the cognitive demand, accessibility, or success criteria could be stronger.
</needs_attention>
<suggestions>
1-3 concrete, actionable suggested improvements.
</suggestions>
${CORE_COACHING_RULES}`

function buildRedesignAiStartPrompt(aiUseLevel: string, context: string[]): string {
  const levelGuidance = AI_USE_LEVEL_GUIDANCE[aiUseLevel] ?? AI_USE_LEVEL_GUIDANCE.thinking_partner
  return `You are Coach, helping a teacher redesign an assignment for meaningful AI use, and opening a conversation about it. The goal is not to make the assignment "AI-proof" — that's not realistic — but to keep student thinking, judgment, voice, and process visible throughout the task.

${REDESIGN_GUIDING_PRINCIPLE}

The teacher has said students should use AI this way: ${levelGuidance}

Choose from these kinds of strategies where they genuinely fit this assignment — don't force all of them in:
${REDESIGN_STRATEGIES_LIST}

Ground every suggestion in the actual assignment below. Never invent details about the class or students that weren't given to you.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for list-like content.

Here is what the teacher has shared:
${context.map((line) => `- ${line}`).join('\n')}

Respond with exactly these four sections and nothing else:
<reply>
A short, warm 1-2 sentence message introducing the redesign below and inviting the teacher to ask about anything or request changes.
</reply>
<strategies>
2-3 concrete strategies actually used in the revised assignment below, each one sentence.
</strategies>
<guidelines>
A short, plain-language statement for students about how AI may and may not be used on this task, consistent with what the teacher chose.
</guidelines>
<revised_assignment>
The full redesigned assignment text, ready for a student to read.
</revised_assignment>
${CORE_COACHING_RULES}`
}

function buildAiResistantSystemPrompt(aiUseLevel: string | null): string {
  const levelGuidance = AI_USE_LEVEL_GUIDANCE[aiUseLevel ?? ''] ?? AI_USE_LEVEL_GUIDANCE.thinking_partner
  return `You are Coach, helping a teacher redesign an assignment for meaningful AI use. The goal is not to make the assignment "AI-proof" — that's not realistic — but to keep student thinking, judgment, voice, and process visible throughout the task.

${REDESIGN_GUIDING_PRINCIPLE}

The teacher has said students should use AI this way: ${levelGuidance}

Choose from these kinds of strategies where they genuinely fit this assignment — don't force all of them in:
${REDESIGN_STRATEGIES_LIST}

Ground every suggestion in the actual assignment below. Never invent details about the class or students that weren't given to you.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for list-like content.

Respond with exactly these three sections and nothing else:
<strategies>
2-3 concrete strategies tailored to this specific assignment, each one sentence.
</strategies>
<guidelines>
A short, plain-language statement for students about how AI may and may not be used on this task, consistent with what the teacher chose.
</guidelines>
<revised_assignment>
The full assignment text, incorporating the strategies above naturally into the instructions.
</revised_assignment>
${CORE_COACHING_RULES}`
}

function buildStartContext(body: Record<string, unknown>, originalText: string, assignmentType: string): string[] {
  const gradeLevel = typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const estimatedTime = typeof body.estimatedTime === 'string' ? body.estimatedTime.trim() : ''
  const specificNeeds = typeof body.specificNeeds === 'string' ? body.specificNeeds.trim() : ''
  const objective = typeof body.objective === 'string' ? body.objective.trim() : ''

  return [
    assignmentType ? `Assignment type: ${ASSIGNMENT_TYPE_LABELS[assignmentType] ?? assignmentType}` : null,
    gradeLevel ? `Grade level: ${gradeLevel}` : null,
    subject ? `Subject: ${subject}` : null,
    estimatedTime ? `Estimated student work time: ${estimatedTime}` : null,
    specificNeeds ? `Specific learning needs to keep in mind: ${specificNeeds}` : null,
    objective ? `Learning objective or standard: ${objective}` : null,
    `The current assignment:\n${originalText}`,
  ].filter((line): line is string => line != null)
}

// Rebuilds the context array from a persisted session — used by every
// stateless-system-prompt call site (chat, review, ai-resistant/revise)
// after the initial POST /. Always includes the CURRENT assignment text,
// mode-agnostic by design (see the git history for why this matters: a
// prior version branched on mode here and a "create"-mode session could
// never see its own drafted assignment in later calls).
function contextFromSession(session: {
  assignmentType: string | null
  gradeLevel: string | null
  subject: string | null
  objective: string | null
  originalText: string | null
  liveAssignmentText: string | null
  estimatedTime: string | null
  specificNeeds: string | null
  aiUseLevel: string | null
}): string[] {
  const currentText = session.liveAssignmentText ?? session.originalText

  return [
    session.assignmentType ? `Assignment type: ${ASSIGNMENT_TYPE_LABELS[session.assignmentType] ?? session.assignmentType}` : null,
    session.gradeLevel ? `Grade level: ${session.gradeLevel}` : null,
    session.subject ? `Subject: ${session.subject}` : null,
    session.estimatedTime ? `Estimated student work time: ${session.estimatedTime}` : null,
    session.specificNeeds ? `Specific learning needs to keep in mind: ${session.specificNeeds}` : null,
    session.objective ? `Learning objective or standard: ${session.objective}` : null,
    session.aiUseLevel ? `Chosen AI use level: ${AI_USE_LEVEL_LABELS[session.aiUseLevel] ?? session.aiUseLevel}` : null,
    currentText ? `The current assignment:\n${currentText}` : null,
  ].filter((line): line is string => line != null)
}

// Stateless document-text extraction for the "Upload a file" intake path —
// pure local parsing, no Claude call, so this isn't usage-capped.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })

assignmentCoachRouter.post('/extract-text', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received' })
    return
  }
  const name = req.file.originalname.toLowerCase()
  try {
    let text = ''
    if (name.endsWith('.docx')) {
      text = (await mammoth.extractRawText({ buffer: req.file.buffer })).value
    } else if (name.endsWith('.pdf')) {
      const parser = new PDFParse({ data: req.file.buffer })
      try {
        text = (await parser.getText()).text
      } finally {
        await parser.destroy()
      }
    } else if (name.endsWith('.txt')) {
      text = req.file.buffer.toString('utf-8')
    } else {
      res.status(400).json({ error: 'Please upload a .docx, .pdf, or .txt file.' })
      return
    }
    if (!text.trim()) {
      res.status(422).json({ error: "Couldn't find any text in that file." })
      return
    }
    res.json({ text: text.trim() })
  } catch (error) {
    console.error('[assignment-coach] extract-text failed:', error)
    res.status(502).json({ error: 'Could not read that file. Please try pasting the text instead.' })
  }
})

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

  const originalText = typeof body.originalText === 'string' ? body.originalText.trim() : ''
  if (!originalText) {
    res.status(400).json({ error: 'originalText is required' })
    return
  }

  let aiUseLevel: string | null = null
  if (mode === 'redesign_ai') {
    const rawLevel = typeof body.aiUseLevel === 'string' ? body.aiUseLevel : ''
    if (!VALID_AI_USE_LEVELS.includes(rawLevel)) {
      res.status(400).json({ error: 'Invalid aiUseLevel' })
      return
    }
    aiUseLevel = rawLevel
  }

  const rawType = typeof body.assignmentType === 'string' ? body.assignmentType : ''
  const assignmentType = VALID_ASSIGNMENT_TYPES.includes(rawType) ? rawType : 'other'

  const context = buildStartContext(body, originalText, assignmentType)

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
    const systemPrompt = mode === 'review' ? buildReviewStartPrompt(context) : buildRedesignAiStartPrompt(aiUseLevel!, context)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: mode === 'review' ? 1000 : 1400,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: START_MESSAGE }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const reply = extractTag(text, 'reply')
    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    let liveAssignmentText: string
    let reviewSummary: Record<string, string | null> | undefined
    let aiResistant: Record<string, string | null> | undefined

    if (mode === 'review') {
      reviewSummary = {
        working: extractTag(text, 'working'),
        needsAttention: extractTag(text, 'needs_attention'),
        suggestions: extractTag(text, 'suggestions'),
      }
      if (!Object.values(reviewSummary).some(Boolean)) {
        res.status(502).json({ error: 'Could not put together a review. Please try again.' })
        return
      }
      liveAssignmentText = originalText
    } else {
      const revisedAssignment = extractTag(text, 'revised_assignment')
      if (!revisedAssignment) {
        res.status(502).json({ error: 'Could not put this together. Please try again.' })
        return
      }
      aiResistant = {
        strategies: extractTag(text, 'strategies'),
        guidelines: extractTag(text, 'guidelines'),
        revisedAssignment,
      }
      liveAssignmentText = revisedAssignment
    }

    const conversation: ChatMessage[] = [{ role: 'assistant', text: reply, createdAt: new Date().toISOString() }]

    const session = await prisma.assignmentCoachSession.create({
      data: {
        userId: req.user!.userId,
        mode,
        aiUseLevel,
        assignmentType,
        estimatedTime: typeof body.estimatedTime === 'string' ? body.estimatedTime.trim() || null : null,
        specificNeeds: typeof body.specificNeeds === 'string' ? body.specificNeeds.trim() || null : null,
        gradeLevel: typeof body.gradeLevel === 'string' ? body.gradeLevel.trim() || null : null,
        subject: typeof body.subject === 'string' ? body.subject.trim() || null : null,
        objective: typeof body.objective === 'string' ? body.objective.trim() || null : null,
        originalText,
        liveAssignmentText,
        conversation,
        reviewSummary,
        aiResistant,
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

// Regenerates the Review structured card, grounded in the CURRENT
// liveAssignmentText — a "Refresh review" action once more chat has
// happened, never blended into the free-form chat.
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
      needsAttention: extractTag(text, 'needs_attention'),
      suggestions: extractTag(text, 'suggestions'),
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

// Regenerates the Redesign path's output, grounded in the CURRENT
// liveAssignmentText and the session's chosen aiUseLevel. Never applied
// automatically — the teacher explicitly accepts the revised text via a
// separate action on the client.
assignmentCoachRouter.post('/:id/ai-resistant', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  if (!session.liveAssignmentText || !session.liveAssignmentText.trim()) {
    res.status(400).json({ error: 'Add some assignment text before redesigning it.' })
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
      system: buildAiResistantSystemPrompt(session.aiUseLevel),
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

// "Revise the whole assignment" — a distinct, explicit action (separate
// from "Improve specific areas," which stays a chat message). Reuses the
// same finalize mechanism the workspace already relies on: summarize the
// full conversation so far into one rewritten assignment.
assignmentCoachRouter.post('/:id/revise', async (req, res) => {
  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }

  const existing = (session.conversation as unknown as ChatMessage[] | null) ?? []
  if (existing.length === 0) {
    res.status(400).json({ error: 'Nothing to revise yet.' })
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
      res.status(502).json({ error: 'Could not revise the assignment. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { liveAssignmentText: assignment },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] revise failed:', error)
    res.status(502).json({ error: 'Could not revise the assignment. Please try again.' })
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
