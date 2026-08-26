import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const lessonPlansRouter = Router()

const FEEDBACK_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, reviewing a lesson plan the teacher wrote themselves. Coach, don't grade.

Focus your feedback on: whether the activities actually build toward the stated objective, whether there's a clear gradual release of responsibility (I Do / We Do / You Do or an equivalent path toward independence), whether there's a higher-order-thinking element (not just recall), whether the pacing looks realistic, and whether there's a real closure.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these two sections and nothing outside them:

<feedback>
Specific, practical coaching on this lesson plan — what's working, what to adjust, grounded in the objective the teacher gave. Keep it skimmable and encouraging.
</feedback>
<rating>
A single integer 1-5 rating of your honest private assessment of how well this plan is built. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>`

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

lessonPlansRouter.post('/feedback', async (req, res) => {
  const context = readContext(req.body ?? {})
  const { planText } = req.body ?? {}

  if (!context.objective) {
    res.status(400).json({ error: 'objective is required' })
    return
  }
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
    const promptContext = [
      `Objective: ${context.objective}`,
      context.unitName ? `Unit: ${context.unitName}` : null,
      context.standard ? `Standard: ${context.standard}` : null,
      context.subject ? `Subject: ${context.subject}` : null,
      context.gradeLevel ? `Grade level: ${context.gradeLevel}` : null,
      `\nLesson plan:\n${planText.trim()}`,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: FEEDBACK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: promptContext }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        userId: req.user!.userId,
        mode: 'feedback',
        objective: context.objective,
        unitName: context.unitName,
        essentialQuestion: context.essentialQuestion,
        standard: context.standard,
        subject: context.subject,
        gradeLevel: context.gradeLevel,
        planText: planText.trim(),
        feedback,
        rating,
      },
    })
    res.status(201).json(lessonPlan)
  } catch (error) {
    console.error('[lesson-plans] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
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
