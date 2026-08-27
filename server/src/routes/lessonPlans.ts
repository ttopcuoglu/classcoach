import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const lessonPlansRouter = Router()

const FEEDBACK_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, reviewing a lesson plan the teacher wrote themselves. Coach, don't grade.

First, work out whether this is a single day's lesson or a multi-day/weekly plan covering several class periods, and adjust your lens accordingly:
- For a single-day lesson: focus on that lesson's internal structure — whether the activities build toward the objective, a clear gradual release of responsibility (I Do / We Do / You Do or equivalent), a higher-order-thinking element (not just recall), realistic pacing, and a real closure.
- For a multi-day/weekly plan: focus on pacing and coherence across the days — whether each day builds on the last, whether skills develop appropriately toward the unit's objective(s) over the week, and whether the week as a whole reaches real closure. Don't expect a full gradual-release arc crammed into every single day.

An explicit objective may not have been provided. If so, look for one stated or implied in the plan itself and coach around that — don't just note that none was given.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these two sections and nothing outside them:

<feedback>
Specific, practical coaching on this lesson plan — what's working, what to adjust, grounded in the plan's own scope (single lesson vs. the week). Keep it skimmable and encouraging.
</feedback>
<rating>
A single integer 1-5 rating of your honest private assessment of how well this plan is built. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>`

const LESSON_PLAN_CHAT_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, continuing a conversation about a lesson plan you already gave feedback on. Build on what the teacher says: if they push back, ask a follow-up, or want to think through a change, engage with that directly rather than repeating your first assessment. Keep in mind whether the plan is a single lesson or a multi-day/weekly plan, as established earlier in the conversation. Stay grounded in what's already been discussed; never invent details about the plan that weren't given to you.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly this tag and nothing outside it:

<message>
Your reply, 2-4 sentences, conversational.
</message>

If — and only if — the teacher is asking for a concrete change to the plan itself (not just discussing or asking a question), also include a second tag right after </message>:

<revised_plan>
The full plan, reproduced in its entirety with the requested change incorporated. Not a diff or a summary of the change — the whole plan, ready to replace the original.
</revised_plan>

Omit <revised_plan> entirely when the teacher is just asking a question, reflecting, or hasn't asked for an edit.`

const GENERATE_SYSTEM_PROMPT = `You write sample single-day lesson plans for K-12 teachers, modeled on a standard gradual-release template, to give a teacher ideas — this is inspiration, not a plan they're required to follow.

Structure:
- Objective (SWBAT): what students will be able to do.
- Do Now: a short warm-up/bell-ringer.
- Agenda: the main lesson body, organized as I Do / We Do / You Do, moving students toward independence — each part labeled, with an approximate time in minutes.
- Closure: a short wrap-up.
- HOTS: one or two higher-order-thinking questions students will engage with, and where (discussion or writing).
- Homework: a suggested task, or "None" if not appropriate for this lesson.

Rules:
- Ground everything in the given objective, subject, and grade level — don't invent a different topic.
- Keep it concrete and realistic, not generic filler.
- Write in plain text only — no markdown (no **bold**, no # headings).
- Respond with exactly these six sections and nothing outside them:

<objective>
A clear, refined SWBAT-style objective based on what the teacher gave.
</objective>
<do_now>
The warm-up activity, with a suggested time in minutes.
</do_now>
<agenda>
The I Do / We Do / You Do sequence, each part labeled and timed, blank line between parts.
</agenda>
<closure>
The wrap-up activity.
</closure>
<hots>
The higher-order question(s) and where students engage with them.
</hots>
<homework>
The homework suggestion, or "None".
</homework>`

lessonPlansRouter.get('/', async (req, res) => {
  const { saved, mode } = req.query
  const lessonPlans = await prisma.lessonPlan.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof mode === 'string' ? { mode } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(lessonPlans)
})

lessonPlansRouter.get('/:id', async (req, res) => {
  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!lessonPlan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  res.json(lessonPlan)
})

function readContext(body: Record<string, unknown>) {
  const { objective, unitName, essentialQuestion, standard, subject, gradeLevel } = body
  return {
    objective: typeof objective === 'string' ? objective.trim() : '',
    unitName: typeof unitName === 'string' && unitName.trim() ? unitName.trim() : null,
    essentialQuestion: typeof essentialQuestion === 'string' && essentialQuestion.trim() ? essentialQuestion.trim() : null,
    standard: typeof standard === 'string' && standard.trim() ? standard.trim() : null,
    subject: typeof subject === 'string' && subject.trim() ? subject.trim() : null,
    gradeLevel: typeof gradeLevel === 'string' && gradeLevel.trim() ? gradeLevel.trim() : null,
  }
}

type FeedbackContext = ReturnType<typeof readContext>

async function runFeedback(
  res: import('express').Response,
  userId: string,
  context: FeedbackContext,
  planTextForDisplay: string,
  content: string,
) {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    // This model defaults to adaptive extended thinking when the param is
    // omitted, and thinking tokens are drawn from the same max_tokens
    // budget — on a long, complex plan it spent the whole budget thinking
    // and returned zero actual output. Disabled here since this call
    // expects a short, structured tagged response, not open-ended reasoning.
    thinking: { type: 'disabled' },
    system: FEEDBACK_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const feedback = extractTag(text, 'feedback') ?? text.trim()
  if (!feedback) {
    console.error(
      '[lesson-plans] empty feedback from Claude — stop_reason:',
      response.stop_reason,
      'block types:',
      response.content.map((b) => b.type),
    )
    res.status(502).json({ error: 'Could not generate coaching feedback. Please try again.' })
    return
  }
  const ratingText = extractTag(text, 'rating')
  const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
  const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

  const conversation = appendTurn([], content, feedback)

  const lessonPlan = await prisma.lessonPlan.create({
    data: {
      userId,
      mode: 'feedback',
      objective: context.objective || null,
      unitName: context.unitName,
      essentialQuestion: context.essentialQuestion,
      standard: context.standard,
      subject: context.subject,
      gradeLevel: context.gradeLevel,
      planText: planTextForDisplay,
      feedback,
      rating,
      conversation,
    },
  })
  res.status(201).json(lessonPlan)
}

function buildPromptHeader(context: FeedbackContext): string {
  return [
    context.objective ? `Objective: ${context.objective}` : null,
    context.unitName ? `Unit: ${context.unitName}` : null,
    context.standard ? `Standard: ${context.standard}` : null,
    context.subject ? `Subject: ${context.subject}` : null,
    context.gradeLevel ? `Grade level: ${context.gradeLevel}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

lessonPlansRouter.post('/feedback', async (req, res) => {
  const context = readContext(req.body ?? {})
  const { planText } = req.body ?? {}

  if (typeof planText !== 'string' || !planText.trim()) {
    res.status(400).json({ error: 'planText is required' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'lesson_plan_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const header = buildPromptHeader(context)
    const content = `${header}\n\nLesson plan:\n${planText.trim()}`
    await runFeedback(res, req.user!.userId, context, planText.trim(), content)
  } catch (error) {
    console.error('[lesson-plans] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

lessonPlansRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!lessonPlan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }

  const existing = (lessonPlan.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'lesson_plan_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = message.trim()
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Large enough to reproduce the entire plan when a revision is
      // warranted (not just a short chat reply) — thinking is disabled so
      // the whole budget goes to visible output.
      max_tokens: 4096,
      thinking: { type: 'disabled' },
      system: LESSON_PLAN_CHAT_SYSTEM_PROMPT,
      messages: toClaudeMessages(existing, trimmed),
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const reply = extractTag(text, 'message') ?? text.trim()
    const revisedPlan = extractTag(text, 'revised_plan')

    const updated = await prisma.lessonPlan.update({
      where: { id: lessonPlan.id },
      data: {
        conversation: appendTurn(existing, trimmed, reply),
        ...(revisedPlan ? { suggestedRevision: revisedPlan } : {}),
      },
    })
    res.json(updated)
  } catch (error) {
    console.error('[lesson-plans] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

lessonPlansRouter.post('/:id/apply-revision', async (req, res) => {
  const lessonPlan = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!lessonPlan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  if (!lessonPlan.suggestedRevision) {
    res.status(400).json({ error: 'No suggested revision to apply' })
    return
  }
  const updated = await prisma.lessonPlan.update({
    where: { id: lessonPlan.id },
    data: { planText: lessonPlan.suggestedRevision, suggestedRevision: null },
  })
  res.json(updated)
})

lessonPlansRouter.post('/generate', async (req, res) => {
  const context = readContext(req.body ?? {})

  if (!context.objective) {
    res.status(400).json({ error: 'objective is required' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'lesson_plan_generate')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const promptContext = [
      `Objective: ${context.objective}`,
      context.unitName ? `Unit: ${context.unitName}` : null,
      context.essentialQuestion ? `Essential question: ${context.essentialQuestion}` : null,
      context.standard ? `Standard: ${context.standard}` : null,
      context.subject ? `Subject: ${context.subject}` : null,
      context.gradeLevel ? `Grade level: ${context.gradeLevel}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: promptContext }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const refinedObjective = extractTag(text, 'objective') ?? context.objective

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        userId: req.user!.userId,
        mode: 'generated',
        objective: refinedObjective,
        unitName: context.unitName,
        essentialQuestion: context.essentialQuestion,
        standard: context.standard,
        subject: context.subject,
        gradeLevel: context.gradeLevel,
        doNow: extractTag(text, 'do_now'),
        agenda: extractTag(text, 'agenda'),
        closure: extractTag(text, 'closure'),
        hots: extractTag(text, 'hots'),
        homework: extractTag(text, 'homework'),
      },
    })
    res.status(201).json(lessonPlan)
  } catch (error) {
    console.error('[lesson-plans] generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

lessonPlansRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  const { count } = await prisma.lessonPlan.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { saved },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const lessonPlan = await prisma.lessonPlan.findUnique({ where: { id: req.params.id } })
  res.json(lessonPlan)
})

lessonPlansRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const lessonPlan = await prisma.lessonPlan.update({ where: { id: req.params.id }, data: { shareToken } })
  res.json({ shareToken: lessonPlan.shareToken })
})
