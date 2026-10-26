import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { buildExperienceContextBlock } from '../lib/experience.ts'
import { extractTag, stripStructuralTags } from '../lib/extractTag.ts'
import { findFocusArea, focusAreaForSubCategory, type FocusArea } from '../lib/focusAreas.ts'
import { classificationBlock, coachIdentity, ratingStandard, teachingContextBlock } from '../lib/focusAreaPrompt.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { prisma } from '../lib/prisma.ts'
import { OWN_SITUATION, categoryInArea } from '../lib/scenarioCategories.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const attemptsRouter = Router()

// Built per attempt from the scenario's focus area: what "a good response"
// means is not the same standard for de-escalating a defiant student, sequencing
// an explanation, and answering an angry parent email, and the model response
// has to come out in the right channel — words said out loud in a classroom, or
// a sentence that can go in an email.
function feedbackSystemPrompt(area: FocusArea | null, own: boolean, classify: boolean, walkThrough: boolean): string {
  if (walkThrough) return walkThroughSystemPrompt(area, classify)
  return `${coachIdentity(area)} ${own ? OWN_SITUATION_FRAME : "You are reviewing how a teacher says they'd handle a practice scenario. Coach, don't grade."}

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these ${classify ? 'five' : 'three'} sections and nothing outside them:

<feedback>
Constructive feedback on their approach, what worked well, and 1-3 alternative or additional strategies grounded in ${ratingStandard(area)}. Keep it skimmable, encouraging, and practical — never academic or jargon-heavy.
</feedback>
<model_response>
A model example of what the teacher could say, write, or do, in their own words. Match the channel the scenario actually has: spoken words for a moment in front of students, a written reply for an email, an opening line for a conference or a conversation with a colleague, an explanation or question sequence for a teaching problem, a decision with its reasoning for a grading call.
</model_response>
${classify ? `${classificationBlock(null)}\n` : ''}<rating>
A single integer 1-5 rating your honest private assessment of how well this response follows ${ratingStandard(area)}. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>
${CORE_COACHING_RULES}`
}

// "Something I'm facing" with nothing in the response box: the teacher does
// not know what to say yet, so there is nothing to review and nothing to rate.
// The coach walks them through it instead, and ends by inviting them to try
// their own words in the chat — which is where the rehearsal then happens.
function walkThroughSystemPrompt(area: FocusArea | null, classify: boolean): string {
  return `${coachIdentity(area)} A teacher has described a real situation they are facing, in their own words, and does not yet know how to handle it — they left their response blank and asked you to walk them through it. Work only from what they told you — never invent details about the people involved — and where something that matters is missing, say briefly what you are assuming.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these ${classify ? 'four' : 'two'} sections and nothing outside them:

<feedback>
Walk them through it. Start with one or two sentences on what is most likely going on and what matters most here. Then 2-4 concrete moves, in the order they would make them, grounded in ${ratingStandard(area)}. End with one short line inviting them to try saying it in their own words below, so you can coach the words. Keep it skimmable, warm, and practical — never academic or jargon-heavy.
</feedback>
<model_response>
What the teacher could actually say, word for word. Match the channel the situation has: spoken words for a moment in front of students, a written reply for an email, an opening line for a conference or a conversation with a colleague, an explanation or question sequence for a teaching problem, a decision with its reasoning for a grading call.
</model_response>
${classify ? classificationBlock(null) : ''}
${CORE_COACHING_RULES}`
}

// Practice's "Something real": the situation is the teacher's own, written by
// them, so the coach works only from what it was told and says when it is
// assuming — a generated scenario has no gaps worth naming, a real one does.
const OWN_SITUATION_FRAME =
  "You are helping a teacher rehearse a real situation they are facing, described in their own words, by reviewing how they say they would handle it. Coach, don't grade. Work only from what they told you — never invent details about the people involved — and where something that matters is missing, say briefly what you are assuming."

function attemptChatSystemPrompt(area: FocusArea | null, own: boolean): string {
  return `${coachIdentity(area)} You are continuing a conversation about ${own ? 'a real situation the teacher is facing, and how they plan to handle it,' : 'a practice scenario'} you already gave feedback on.${own ? ' When they try their own words — a first try or another one — respond to that version directly: what works, and what to sharpen.' : ''} Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Build on what the teacher says: if they push back, ask a follow-up, or want to try a different angle, engage with that directly rather than repeating your first assessment. Stay grounded in the scenario and their response; never invent details that weren't given to you.
${CORE_COACHING_RULES}`
}

/// A scenario's area: the stored value, or derived from its sub-category for
/// rows written before the area axis existed.
function areaForScenario(scenario: { focusArea: string | null; category: string }): FocusArea | null {
  return findFocusArea(scenario.focusArea) ?? focusAreaForSubCategory(scenario.category)
}

attemptsRouter.get('/', async (req, res) => {
  const { scenarioId, saved } = req.query
  const attempts = await prisma.scenarioAttempt.findMany({
    where: {
      userId: req.user!.userId,
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
  // The bank, or this teacher's own situation — never someone else's.
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, OR: [{ userId: null }, { userId: req.user!.userId }] },
  })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  if (scenario.source !== 'teacher' && !responseText.trim()) {
    res.status(400).json({ error: 'Say how you would handle it, then get feedback.' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'attempt_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { experienceLevel: true } })
    const own = scenario.source === 'teacher'
    // A teacher's own situation is classified once, on its first coaching,
    // as tags on the reply already being written rather than a separate call.
    const classify = own && scenario.category === OWN_SITUATION
    // Only a teacher's own situation may come without a response — a generated
    // scenario with nothing to review would be a blank attempt.
    const walkThrough = own && !responseText.trim()
    const context = `${own ? "The situation, in the teacher's own words" : 'Scenario'}: ${scenario.text}\n\n${
      walkThrough ? "The teacher hasn't decided what to say yet — walk them through it." : `Teacher's response: ${responseText}`
    }`
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // The per-area prompts and the scenarios they produce are both longer
      // than the single classroom-management pair they replaced, and the
      // rating sits at the end of the response where a tight cap eats it.
      max_tokens: 1400,
      // This model defaults to adaptive extended thinking when the param is
      // omitted, and thinking tokens come out of the same max_tokens budget —
      // on a dense scenario it spent the whole budget thinking and returned
      // zero text blocks, which stored a blank attempt and showed a teacher
      // empty coaching. Same trap already documented in lessonPlans.ts.
      thinking: { type: 'disabled' },
      system: `${feedbackSystemPrompt(areaForScenario(scenario), own, classify, walkThrough)}${teachingContextBlock(scenario)}${buildExperienceContextBlock(user?.experienceLevel)}`,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    // An empty response means no usable coaching. Fail so the teacher sees
    // "please try again" and can resubmit, rather than banking a blank attempt
    // in their history that can never be recovered.
    if (!text.trim()) {
      console.error('[attempts] empty completion; stop_reason:', response.stop_reason)
      // A reply that came back blank rather than a call that failed, so this
      // genuinely is worth another go — unlike most of what used to say so.
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    const feedback = extractTag(text, 'feedback') ?? stripStructuralTags(text)
    const modelResponse = extractTag(text, 'model_response')
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const seedReply = [feedback, modelResponse ? `Model response: ${modelResponse}` : null].filter(Boolean).join('\n\n')
    const conversation = appendTurn([], context, seedReply)

    if (classify) {
      const area = findFocusArea(extractTag(text, 'focus_area'))
      const categoryTag = extractTag(text, 'category')
      // A malformed or "none" category keeps the placeholder; the area alone
      // still gives the follow-up chat the right coaching voice.
      const category = area && categoryInArea(categoryTag, area.value) ? categoryTag! : OWN_SITUATION
      if (area) {
        await prisma.scenario.update({ where: { id: scenario.id }, data: { focusArea: area.value, category } })
      }
    }

    const attempt = await prisma.scenarioAttempt.create({
      data: { userId: req.user!.userId, scenarioId, responseText, feedback, modelResponse, rating, conversation },
      include: { scenario: true },
    })
    res.status(201).json(attempt)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[attempts] feedback generation failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

attemptsRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  // Includes the scenario so follow-up turns keep the area's coaching voice
  // rather than drifting back to a generic one.
  const attempt = await prisma.scenarioAttempt.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { scenario: true },
  })
  if (!attempt) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }

  const existing = (attempt.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: CONVERSATION_FULL_MESSAGE })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'attempt_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { experienceLevel: true } })
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      // Same reason as the feedback call above — at 300 tokens a single
      // thinking block would swallow the entire reply.
      thinking: { type: 'disabled' },
      system: `${attemptChatSystemPrompt(areaForScenario(attempt.scenario), attempt.scenario.source === 'teacher')}${teachingContextBlock(attempt.scenario)}${buildExperienceContextBlock(user?.experienceLevel)}`,
      messages: toClaudeMessages(existing, trimmed),
    })
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const updated = await prisma.scenarioAttempt.update({
      where: { id: attempt.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
      include: { scenario: true },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[attempts] chat failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

attemptsRouter.patch('/:id', async (req, res) => {
  const { saved, markTried, reflectionNote } = req.body ?? {}
  if (saved === undefined && markTried === undefined && reflectionNote === undefined) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }
  if (saved !== undefined && typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  if (markTried !== undefined && markTried !== true) {
    res.status(400).json({ error: 'markTried must be true' })
    return
  }
  if (reflectionNote !== undefined && typeof reflectionNote !== 'string') {
    res.status(400).json({ error: 'reflectionNote must be a string' })
    return
  }
  const { count } = await prisma.scenarioAttempt.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: {
      ...(saved !== undefined ? { saved } : {}),
      ...(markTried === true ? { triedAt: new Date() } : {}),
      ...(reflectionNote !== undefined ? { reflectionNote } : {}),
    },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }
  const attempt = await prisma.scenarioAttempt.findUnique({
    where: { id: req.params.id },
    include: { scenario: true },
  })
  res.json(attempt)
})

attemptsRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.scenarioAttempt.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
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
