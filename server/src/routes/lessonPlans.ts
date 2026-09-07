import { Router } from 'express'
import JSZip from 'jszip'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { checkFeatureAccess, countUsageLogActionsThisMonth, LESSON_PLANNING_ACTIONS } from '../lib/billing.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES, INSTRUCTION_PRIORITY_NOTICE } from '../lib/coachPersona.ts'
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
</rating>
${CORE_COACHING_RULES}`

const LESSON_PLAN_CHAT_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, continuing a conversation about a lesson plan or presentation you already gave feedback on. Build on what the teacher says: if they push back, ask a follow-up, or want to think through a change, engage with that directly rather than repeating your first assessment. Keep in mind whether this is a single lesson, a multi-day/weekly plan, or a slide presentation, as established earlier in the conversation. Stay grounded in what's already been discussed; never invent details that weren't given to you.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly this tag and nothing outside it:

<message>
Your reply, 2-4 sentences, conversational.
</message>

If — and only if — the teacher is asking for a concrete change to the plan or presentation's content itself (not just discussing or asking a question), also include a second tag right after </message>:

<revised_plan>
The full plan or slide-by-slide text, reproduced in its entirety with the requested change incorporated. Not a diff or a summary of the change — the whole thing, ready to replace the original.
</revised_plan>

Omit <revised_plan> entirely when the teacher is just asking a question, reflecting, or hasn't asked for an edit.
${CORE_COACHING_RULES}`

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
</homework>
${INSTRUCTION_PRIORITY_NOTICE}`

const DELIVERY_COACHING_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, giving feedback on HOW to actually deliver this lesson to students — not on whether the content itself is well built (that's covered elsewhere). Assume the content is what it is; focus entirely on delivery.

Ground every suggestion in the specific lesson given below — never generic public-speaking advice that could apply to any lesson.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly these five sections and nothing outside them:
<opening_hook>
How to open in a way that grabs attention and connects to the objective — one concrete suggestion grounded in this lesson's actual topic.
</opening_hook>
<pacing>
Realistic pacing/timing guidance for this specific lesson — where to move quickly, where to slow down, and any point that risks running long or short.
</pacing>
<engagement_checkpoints>
1-2 specific moments to check students are following (a quick check for understanding, a turn-and-talk, a show of hands) — tied to this lesson's actual content, not generic.
</engagement_checkpoints>
<explaining_the_hard_part>
Identify the single most likely point of confusion in this lesson and suggest a concrete way to explain or model it.
</explaining_the_hard_part>
<closing>
How to close the lesson so it reinforces the objective and sets up next time.
</closing>
${CORE_COACHING_RULES}`

function buildPresentationReviewSystemPrompt(gradeLevel: string | null, subject: string | null): string {
  return `You are a warm, practical instructional coach for K-12 teachers, reviewing a presentation (slides) the teacher has already built for their class. You are only given the extracted TEXT of each slide, plus a flag on any slide that also contains at least one image — you cannot see what that image actually shows (its content, quality, or relevance), only that one is present. Never claim to have seen or judged an actual visual element's content. A slide with no text and no image flag is a genuinely empty slide, not necessarily a mistake — some decks use blank slides as spacers or for a live demo.

${gradeLevel ? `Grade level: ${gradeLevel}` : 'No grade level was given — infer an appropriate one from the content and vocabulary, and say so.'}
${subject ? `Subject: ${subject}` : ''}

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly these five sections and nothing outside them:
<grade_level_fit>
Is the vocabulary, complexity, and pacing appropriate for this grade level? Call out anything too advanced or too simple, grounded in the actual slide text. If there's too little text to judge this reliably (a mostly image-based deck), say so plainly instead of guessing.
</grade_level_fit>
<visuals>
Use the per-slide image flag: never suggest adding a visual to a slide already flagged as containing one — instead, if it's a slide where that content is doing heavy lifting (e.g. explaining a dense concept), note that it's worth double-checking the image actually shows what's needed. For slides with dense or abstract text and NO image flag, suggest a specific diagram, image, chart, or example. Note any slide that already reads as appropriately sparse/visual on its own.
</visuals>
<ideas>
Is the content clear, logically sequenced, and complete? Flag any gap, ambiguous slide, or place where a student would likely get lost.
</ideas>
<length>
Given the slide count and content density, is this too long or too short for a typical class period at this grade level? Suggest specific slides to trim, combine, or expand.
</length>
<implementation>
Practical delivery guidance: pacing across the deck, where to pause for questions or a check for understanding, and anything worth saying aloud that isn't on the slides themselves.
</implementation>
${CORE_COACHING_RULES}`
}

// Stateless document-text extraction for the "Upload your presentation"
// intake path — pure local parsing, no Claude call, so this isn't
// usage-capped. Presentations can run larger than a typical document.
const presentationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Pulls the visible text runs (<a:t>...</a:t>) out of each slide's raw XML,
// in slide order — a .pptx is just a zip of XML parts, so this needs no
// heavier office-document library, only a zip reader.
type ExtractedSlide = { text: string; hasImage: boolean }

async function extractPptxSlides(buffer: Buffer): Promise<ExtractedSlide[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return numA - numB
    })

  const slides: ExtractedSlide[] = []
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string')
    const runs = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map((m) => decodeXmlEntities(m[1]))
    // <p:pic> is the Picture-shape element PowerPoint writes for any
    // inserted image — presence alone tells us a slide has visual content
    // this text-only extraction otherwise has no way to know about.
    slides.push({ text: runs.join(' ').trim(), hasImage: xml.includes('<p:pic>') })
  }
  return slides
}

// A PDF export of a slide deck (PowerPoint/Google Slides "Export as PDF")
// keeps one page per slide, so each page's extracted text stands in for a
// slide — no OCR: an exported deck's text layer is real vector text, never
// a scanned image, unlike the scanned-worksheet case Assignment Coach's
// uploader has to handle.
async function extractPdfSlides(buffer: Buffer): Promise<ExtractedSlide[]> {
  const parser = new PDFParse({ data: buffer })
  try {
    const textResult = await parser.getText()

    // Best-effort only: some real-world PDFs (certain embedded image
    // encodings) make pdfjs-dist's getImage() throw internally rather than
    // just skip that image. Image-presence detection is a nice-to-have for
    // the review, never worth failing the whole upload over — fall back to
    // "unknown" (treated as no image) for every page if it errors.
    let imageCountByPage = new Map<number, number>()
    try {
      const imageResult = await parser.getImage({ imageDataUrl: false, imageBuffer: false })
      imageCountByPage = new Map(imageResult.pages.map((p) => [p.pageNumber, p.images.length]))
    } catch (error) {
      console.warn('[lesson-plans] pdf image detection failed, continuing without it:', error)
    }

    return textResult.pages.map((page) => ({
      text: page.text.trim(),
      hasImage: (imageCountByPage.get(page.num) ?? 0) > 0,
    }))
  } finally {
    await parser.destroy()
  }
}

function formatSlidesAsText(slides: ExtractedSlide[]): string {
  return slides
    .map(({ text, hasImage }, i) => {
      const imageNote = hasImage ? ' [This slide also contains at least one image — its visual content is not visible to you.]' : ''
      return `Slide ${i + 1}:${imageNote}\n${text || '(no text detected on this slide)'}`
    })
    .join('\n\n')
}

lessonPlansRouter.post('/extract-presentation', presentationUpload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received' })
    return
  }
  const name = req.file.originalname.toLowerCase()
  try {
    let slides: ExtractedSlide[]
    if (name.endsWith('.pptx')) {
      slides = await extractPptxSlides(req.file.buffer)
    } else if (name.endsWith('.pdf')) {
      slides = await extractPdfSlides(req.file.buffer)
    } else {
      res.status(400).json({ error: 'Please upload a .pptx or .pdf file (export your presentation as PDF if needed).' })
      return
    }
    if (slides.length === 0 || !slides.some((s) => s.text.trim() || s.hasImage)) {
      res.status(422).json({ error: "Couldn't find any text or images in that file. Please try a different export." })
      return
    }
    res.json({ text: formatSlidesAsText(slides), slideCount: slides.length, fileName: req.file.originalname })
  } catch (error) {
    console.error('[lesson-plans] extract-presentation failed:', error)
    res.status(502).json({ error: 'Could not read that file. Please try a different export.' })
  }
})

lessonPlansRouter.post('/presentation-review', async (req, res) => {
  const { text, fileName, slideCount, gradeLevel, subject, objective } = req.body ?? {}

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'lesson_plan_presentation_review')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const gradeLevelStr = typeof gradeLevel === 'string' && gradeLevel.trim() ? gradeLevel.trim() : null
  const subjectStr = typeof subject === 'string' && subject.trim() ? subject.trim() : null

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Generous headroom for five verbose sections grounded in a full
      // slide-by-slide transcript — same truncation risk already fixed for
      // the delivery-coaching route above.
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system: buildPresentationReviewSystemPrompt(gradeLevelStr, subjectStr),
      messages: [{ role: 'user', content: text.trim() }],
    })
    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const presentationReview = {
      gradeLevelFit: extractTag(responseText, 'grade_level_fit'),
      visuals: extractTag(responseText, 'visuals'),
      ideas: extractTag(responseText, 'ideas'),
      length: extractTag(responseText, 'length'),
      implementation: extractTag(responseText, 'implementation'),
    }
    if (!Object.values(presentationReview).some(Boolean)) {
      res.status(502).json({ error: 'Could not review this presentation. Please try again.' })
      return
    }

    const conversation = appendTurn([], text.trim(), 'Here is my review of your presentation.')

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        userId: req.user!.userId,
        mode: 'presentation',
        objective: typeof objective === 'string' && objective.trim() ? objective.trim() : null,
        gradeLevel: gradeLevelStr,
        subject: subjectStr,
        planText: text.trim(),
        fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim() : null,
        slideCount: typeof slideCount === 'number' && Number.isFinite(slideCount) ? Math.round(slideCount) : null,
        presentationReview,
        conversation,
      },
    })
    res.status(201).json(lessonPlan)
  } catch (error) {
    console.error('[lesson-plans] presentation-review failed:', error)
    res.status(502).json({ error: 'Could not review this presentation. Please try again.' })
  }
})

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

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
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

lessonPlansRouter.post('/:id/presentation-feedback', async (req, res) => {
  const plan = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }

  const content =
    plan.mode === 'feedback'
      ? plan.planText
      : [plan.doNow, plan.agenda, plan.closure, plan.hots, plan.homework].filter(Boolean).join('\n\n')
  if (!content?.trim()) {
    res.status(400).json({ error: "This plan doesn't have content yet." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'lesson_plan_delivery_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Generous headroom — a verbose response across all five sections can
      // otherwise get truncated before the closing tag, silently dropping
      // the last section (the exact 502-truncation risk fixed elsewhere in
      // this app for Assignment Coach).
      max_tokens: 2500,
      thinking: { type: 'disabled' },
      system: DELIVERY_COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const deliveryCoaching = {
      openingHook: extractTag(text, 'opening_hook'),
      pacing: extractTag(text, 'pacing'),
      engagementCheckpoints: extractTag(text, 'engagement_checkpoints'),
      explainingTheHardPart: extractTag(text, 'explaining_the_hard_part'),
      closing: extractTag(text, 'closing'),
    }
    if (!Object.values(deliveryCoaching).some(Boolean)) {
      res.status(502).json({ error: 'Could not put together delivery feedback. Please try again.' })
      return
    }

    const updated = await prisma.lessonPlan.update({
      where: { id: plan.id },
      data: { deliveryCoaching },
    })
    res.json(updated)
  } catch (error) {
    console.error('[lesson-plans] presentation-feedback failed:', error)
    res.status(502).json({ error: 'Could not put together delivery feedback. Please try again.' })
  }
})

lessonPlansRouter.post('/generate', async (req, res) => {
  const context = readContext(req.body ?? {})

  if (!context.objective) {
    res.status(400).json({ error: 'objective is required' })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
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
