import { Router, type Request, type Response } from 'express'
import JSZip from 'jszip'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { Prisma, type LessonPlan } from '../generated/prisma/client.ts'
import { checkFeatureAccess, countUsageLogActionsThisMonth, LESSON_PLANNING_ACTIONS } from '../lib/billing.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { parseSlidesOutput } from '../lib/exportModels.ts'
import { buildLessonDeckPrompt, DECK_LAYOUT_RULES, deckOutputFormat, finishDeck, lessonDeckContext } from '../lib/lessonDeck.ts'
import { extractTag, stripStructuralTags } from '../lib/extractTag.ts'
import {
  ADAPTATION_LABEL,
  adaptUserMessage,
  buildAdaptPrompt,
  buildFullLessonPrompt,
  buildQuickIdeasPrompt,
  INFER_CONTEXT_PROMPT,
  isAdaptation,
  isUsableLesson,
  lessonAsText,
  lessonMinutes,
  parseFullLesson,
  parseInferredContext,
  parseQuickIdeas,
  type LessonSections,
  type LessonStep,
} from '../lib/lessonPlanModel.ts'
import { extractPdfImages, extractPptxImages, orderedSlideParts, type OriginalImage } from '../lib/originalImages.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { loadTemplateOwner, templateForChoice, weekTemplateForChoice } from '../lib/lessonTemplates.ts'
import {
  buildWeekFillPrompt,
  buildWeekObjectivesPrompt,
  cleanObjective,
  dayLessonContext,
  DEFAULT_WEEK_SECTIONS,
  isUsableWeekFill,
  parseWeekFill,
  parseWeekObjectives,
  sanitizeWeekDays,
  weekFillUserMessage,
  weekObjectivesUserMessage,
  type WeekContext,
  type WeekPlan,
} from '../lib/lessonWeekModel.ts'
import {
  buildLayoutPrompt,
  buildOwnPlanLayoutPrompt,
  isUsableLayout,
  layoutSourceKey,
  layoutUserMessage,
  ownPlanLayoutUserMessage,
  parseLayout,
  parseOwnPlanLayout,
  sanitizeSections,
  type TemplateContent,
} from '../lib/lessonTemplateModel.ts'
import { prisma } from '../lib/prisma.ts'
import { activeFocusFor } from '../lib/schoolPriorities.ts'
import { matchSchoolFocusIdea, schoolFocusBlock } from '../lib/schoolFocusBlock.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { THEME_GUIDE, type SlideDeck } from '../lib/slidesPptx.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

// pdf-parse costs 176MB at import, measured — more than every other
// dependency in this server put together. Loaded where it is used, so a
// process that never opens a PDF never pays for one.
async function loadPdfParse() {
  return (await import('pdf-parse')).PDFParse
}


export const lessonPlansRouter = Router()

export const FEEDBACK_SYSTEM_PROMPT = `You are a warm, practical instructional coach for K-12 teachers, reviewing a lesson plan the teacher wrote themselves. Coach, don't grade.

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
  const slideFiles = await orderedSlideParts(zip)

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
  const PDFParse = await loadPdfParse()
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

const REBUILD_CHANGES_NOTE =
  'After the theme, list what you changed in <changes>: 4 to 8 dash-prefixed lines, each one plain sentence a teacher would understand, naming the slide (for example "- Slide 4: turned the routes into a step-by-step diagram"). Only list changes you actually made.'
// Builds the improved deck from a saved presentation review: the teacher's
// slide-by-slide text plus every recommendation Coach gave (and anything the
// teacher asked for in the follow-up chat), applied to a themed deck.
function buildPresentationGeneratePrompt(context: string[]): string {
  return `You are rebuilding a teacher's presentation as an improved, classroom-ready slide deck. Below are their slides (slide by slide, with a note where a slide already has an image) and the review Coach gave them. Apply EVERY recommendation in the review — grade-level fit (simplify or stretch the wording), visuals, ideas (fill gaps, fix the order, clarify confusing slides), length (trim, combine or expand as advised), and implementation (add the pauses, checks for understanding, and pacing the review calls for). Also apply anything the teacher asked for in the follow-up chat.

Stay true to the teacher's presentation: the same topic, the same main ideas, and their own wording wherever the review didn't ask for a change. Do not invent facts, dates, statistics, quotes, or examples that aren't in the slides or the review. Where the review asks for a new example or a visual you can't know, write a plain placeholder in the slide and tell the teacher in the speaker notes to add their own.

${DECK_LAYOUT_RULES}

${deckOutputFormat(REBUILD_CHANGES_NOTE)}

Here is what you have to work with:
${context.join('\n\n')}
${CORE_COACHING_RULES}`
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

async function originalImagesFrom(file: Express.Multer.File | undefined): Promise<Map<number, OriginalImage>> {
  if (!file) return new Map()
  const name = file.originalname.toLowerCase()
  try {
    if (name.endsWith('.pptx')) return await extractPptxImages(file.buffer)
    if (name.endsWith('.pdf')) return await extractPdfImages(file.buffer)
  } catch (error) {
    console.warn('[lesson-plans] could not read pictures from the original file:', error)
  }
  return new Map()
}


// Turns a saved presentation review into an improved, themed deck the teacher
// previews and downloads (the file itself is built by the same export-file
// route Assignment Coach uses, from the model returned here).
lessonPlansRouter.post('/:id/presentation-generate', presentationUpload.single('file'), async (req, res) => {
  const plan = await prisma.lessonPlan.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } })
  if (!plan || plan.mode !== 'presentation' || !plan.planText) {
    res.status(404).json({ error: 'Presentation review not found' })
    return
  }
  const review = plan.presentationReview as Record<string, string | null> | null
  if (!review) {
    res.status(400).json({ error: 'Review this presentation first.' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_presentation_generate')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const chat = ((plan.conversation as unknown as ChatMessage[] | null) ?? []).slice(2)
  const teacherAsks = chat.filter((m) => m.role === 'user').map((m) => `- ${m.text}`)
  const context = [
    [plan.subject && `Subject: ${plan.subject}`, plan.gradeLevel && `Grade: ${plan.gradeLevel}`, plan.objective && `About: ${plan.objective}`]
      .filter(Boolean)
      .join('\n'),
    `The teacher's slides:\n${plan.planText}`,
    `Coach's review:\nGrade-level fit: ${review.gradeLevelFit ?? '—'}\n\nVisuals: ${review.visuals ?? '—'}\n\nIdeas: ${review.ideas ?? '—'}\n\nLength: ${review.length ?? '—'}\n\nImplementation: ${review.implementation ?? '—'}`,
    teacherAsks.length ? `What the teacher asked for in the follow-up chat:\n${teacherAsks.join('\n')}` : '',
  ].filter(Boolean)

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      system: buildPresentationGeneratePrompt(context),
      messages: [{ role: 'user', content: 'Build the improved presentation now.' }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const deck = parseSlidesOutput(text)
    if (!deck) {
      res.status(502).json({ error: 'Could not build the presentation. Please try again.' })
      return
    }
    // The teacher's own pictures come from the file they attach here, read in
    // memory for this request and never stored.
    const originals = await originalImagesFrom(req.file)
    await finishDeck(deck, plan.subject, plan.gradeLevel, originals)
    res.json({ kind: 'slides', model: deck })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not build the presentation')
    logModelFailure('[lesson-plans] presentation-generate failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// Builds a classroom-ready lesson deck from a plan and its delivery coaching
// ("Presentation & delivery"), previewed and downloaded like the others.
lessonPlansRouter.post('/:id/lesson-deck', async (req, res) => {
  const plan = await prisma.lessonPlan.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const coaching = plan.deliveryCoaching as Record<string, string | null> | null
  if (!coaching) {
    res.status(400).json({ error: 'Get presentation & delivery feedback first.' })
    return
  }
  // Whatever shape this plan is in — a Planning Coach lesson, a plan the
  // teacher wrote, or one of the old five-slot samples — read as the prose
  // the deck builder works from.
  const content = lessonAsText(plan)
  if (!content.trim()) {
    res.status(400).json({ error: "This plan doesn't have content yet." })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_delivery_deck')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const context = lessonDeckContext(plan, content, coaching)

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      system: buildLessonDeckPrompt(context),
      messages: [{ role: 'user', content: 'Build the lesson presentation now.' }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const deck = parseSlidesOutput(text)
    if (!deck) {
      res.status(502).json({ error: 'Could not build the presentation. Please try again.' })
      return
    }
    await finishDeck(deck, plan.subject, plan.gradeLevel)
    res.json({ kind: 'slides', model: deck })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not build the presentation')
    logModelFailure('[lesson-plans] lesson-deck failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_presentation_review')
  if (denied) {
    res.status(429).json({ error: denied })
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
    const failure = classifyModelError(error, 'Could not review this presentation')
    logModelFailure('[lesson-plans] presentation-review failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

lessonPlansRouter.get('/', async (req, res) => {
  const { saved, mode, includeWeeks } = req.query
  const lessonPlans = await prisma.lessonPlan.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof mode === 'string' ? { mode } : {}),
      // A week only opens on the web. The iPhone app decodes every plan in
      // this list and has no view for one, so it would show an empty lesson.
      ...(includeWeeks === 'true' ? {} : { OR: [{ planKind: null }, { planKind: { not: 'week' } }] }),
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

export function readContext(body: Record<string, unknown>) {
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

  const feedback = extractTag(text, 'feedback') ?? stripStructuralTags(text)
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

export function buildPromptHeader(context: FeedbackContext): string {
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

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const header = buildPromptHeader(context)
    const content = `${header}\n\nLesson plan:\n${planText.trim()}`
    await runFeedback(res, req.user!.userId, context, planText.trim(), content)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[lesson-plans] feedback generation failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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
    res.status(409).json({ error: CONVERSATION_FULL_MESSAGE })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_chat')
  if (denied) {
    res.status(429).json({ error: denied })
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
    const reply = extractTag(text, 'message') ?? stripStructuralTags(text)
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
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[lesson-plans] chat failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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

  const content = lessonAsText(plan)
  if (!content.trim()) {
    res.status(400).json({ error: "This plan doesn't have content yet." })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_delivery_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
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
    const failure = classifyModelError(error, 'Could not put together delivery feedback')
    logModelFailure('[lesson-plans] presentation-feedback failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// How long a class period the lesson is built for. Anything outside this is
// not a class period, and a four-hour "lesson" would make the timings
// meaningless.
const MIN_LESSON_MINUTES = 5
const MAX_LESSON_MINUTES = 240
const DEFAULT_LESSON_MINUTES = 45

function readMinutes(value: unknown, fallback: number | null = null): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n)
  if (rounded < MIN_LESSON_MINUTES || rounded > MAX_LESSON_MINUTES) return fallback
  return rounded
}

/// Everything Build a Lesson asks for. The topic is the only field a teacher
/// has to fill in — unless they uploaded material, which can stand in for it
/// entirely. Everything else sharpens the lesson without gating it.
function readBuildContext(body: Record<string, unknown>) {
  const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
  return {
    objective: str(body.objective),
    unitName: str(body.unitName),
    essentialQuestion: str(body.essentialQuestion),
    standard: str(body.standard),
    subject: str(body.subject),
    gradeLevel: str(body.gradeLevel),
    additionalContext: str(body.additionalContext),
    sourceMaterial: str(body.sourceMaterial),
    durationMinutes: readMinutes(body.durationMinutes, DEFAULT_LESSON_MINUTES),
    kind: body.kind === 'ideas' ? ('ideas' as const) : ('full' as const),
  }
}

// What gets uploaded here is a whole worksheet or deck. Enough of it to plan
// from, capped so one 80-page PDF can't blow out the prompt (or the bill).
const MAX_SOURCE_MATERIAL_CHARS = 12000

function buildUserMessage(context: ReturnType<typeof readBuildContext>): string {
  const material = context.sourceMaterial?.slice(0, MAX_SOURCE_MATERIAL_CHARS)
  return [
    context.objective ? `Topic or learning goal: ${context.objective}` : null,
    context.subject ? `Subject: ${context.subject}` : null,
    context.gradeLevel ? `Grade level: ${context.gradeLevel}` : null,
    `Lesson length: ${context.durationMinutes ?? DEFAULT_LESSON_MINUTES} minutes`,
    context.standard ? `Standard: ${context.standard}` : null,
    context.unitName ? `Unit: ${context.unitName}` : null,
    context.essentialQuestion ? `Essential question: ${context.essentialQuestion}` : null,
    context.additionalContext ? `Other context from the teacher:\n${context.additionalContext}` : null,
    material ? `The teacher's own material, to build this around:\n${material}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/// A full lesson with no HTTP request around it, for the chat's "send me
/// a PDF" — see generateQuickIdeas below for why these mirror /generate
/// rather than sharing with it.
///
/// A full lesson is pages, so the chat never prints it as a message; what
/// it does is hand over the file. Saved like any other, so the teacher
/// can open it in Planning Coach afterwards and adapt it.
export async function generateFullLesson(
  userId: string,
  context: {
    objective: string
    subject?: string | null
    gradeLevel?: string | null
    durationMinutes?: number | null
    additionalContext?: string | null
  },
): Promise<{ plan: LessonPlan } | { error: string }> {
  const access = await checkFeatureAccess(userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) return { error: access.upgradeMessage ?? "Planning Coach isn't included on your plan right now." }

  const denied = await checkAndLogUsage(userId, 'lesson_plan_generate')
  if (denied) return { error: denied }

  const full = {
    objective: context.objective,
    unitName: null,
    essentialQuestion: null,
    standard: null,
    subject: context.subject ?? null,
    gradeLevel: context.gradeLevel ?? null,
    additionalContext: context.additionalContext ?? null,
    sourceMaterial: null,
    durationMinutes: context.durationMinutes ?? DEFAULT_LESSON_MINUTES,
    kind: 'full' as const,
  }

  // The school focus the teacher chose, if any (usually none — then the
  // prompt is exactly what it was before Coaching Priorities).
  const focuses = await activeFocusFor(userId)
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 5000,
      thinking: { type: 'disabled' },
      system: buildFullLessonPrompt() + schoolFocusBlock(focuses, 'planning'),
      messages: [{ role: 'user', content: buildUserMessage(full) }],
    })
    const lesson = parseFullLesson(
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
    )
    if (!isUsableLesson(lesson)) {
      console.error('[lesson-plans] no sequence parsed for chat — stop_reason:', response.stop_reason)
      return { error: 'Could not build the lesson. Please try again.' }
    }
    const plan = await prisma.lessonPlan.create({
      data: {
        userId,
        mode: 'generated',
        planKind: 'full',
        subject: full.subject,
        gradeLevel: full.gradeLevel,
        additionalContext: full.additionalContext,
        durationMinutes: full.durationMinutes,
        objective: lesson.objective ?? full.objective,
        approach: lesson.approach,
        successCriteria: lesson.successCriteria,
        materials: lesson.materials,
        sequence: lesson.sequence,
        checks: lesson.checks,
        misconceptions: lesson.misconceptions,
        exitTicket: lesson.exitTicket ?? undefined,
        schoolFocusIdea: matchSchoolFocusIdea(lesson.schoolFocusIdea, focuses, lesson.schoolFocusCheck) ?? undefined,
      },
    })
    return { plan }
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[lesson-plans] building a lesson for chat failed:', failure, error)
    return { error: failure.message }
  }
}

/// Quick Ideas with no HTTP request around it, so the Telegram Coach can
/// produce the same thing Build a Lesson's form does — the precedent is
/// generateTalkTakeaway in debrief.ts. The plan is saved exactly as the
/// form's would be, so it lands in Your lessons and can be adapted later;
/// the chat gets a copy, not a separate universe.
///
/// Only the ideas kind. A full lesson is pages — fine on a screen, wrong
/// in a chat — so that one stays a handoff.
///
/// The dozen lines below deliberately mirror /generate's ideas branch
/// rather than sharing with it: that route answers both kinds from one
/// Claude call, and splitting it to save a dozen lines would make the
/// common path harder to follow than the repetition does. What must not
/// drift — the prompt and the parser — is shared already.
export async function generateQuickIdeas(
  userId: string,
  context: { objective: string; subject?: string | null; gradeLevel?: string | null; durationMinutes?: number | null },
): Promise<{ plan: LessonPlan } | { error: string }> {
  const access = await checkFeatureAccess(userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(userId, LESSON_PLANNING_ACTIONS),
  )
  // Typed as optional upstream; a denial always has to say something.
  if (!access.allowed) return { error: access.upgradeMessage ?? "Planning Coach isn't included on your plan right now." }

  const denied = await checkAndLogUsage(userId, 'lesson_plan_generate')
  if (denied) return { error: denied }

  const full = {
    objective: context.objective,
    unitName: null,
    essentialQuestion: null,
    standard: null,
    subject: context.subject ?? null,
    gradeLevel: context.gradeLevel ?? null,
    additionalContext: null,
    sourceMaterial: null,
    durationMinutes: context.durationMinutes ?? DEFAULT_LESSON_MINUTES,
    kind: 'ideas' as const,
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      system: buildQuickIdeasPrompt(),
      messages: [{ role: 'user', content: buildUserMessage(full) }],
    })
    const quickIdeas = parseQuickIdeas(
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
    )
    if (quickIdeas.length === 0) {
      console.error('[lesson-plans] no ideas parsed for chat — stop_reason:', response.stop_reason)
      return { error: 'Could not put together teaching ideas. Please try again.' }
    }
    const plan = await prisma.lessonPlan.create({
      data: {
        userId,
        mode: 'generated',
        planKind: 'ideas',
        objective: full.objective,
        subject: full.subject,
        gradeLevel: full.gradeLevel,
        durationMinutes: full.durationMinutes,
        quickIdeas,
      },
    })
    return { plan }
  } catch (error) {
    console.error('[lesson-plans] generating ideas for chat failed:', error)
    return { error: 'Could not put together teaching ideas. Please try again.' }
  }
}

// Reads an uploaded file for what it's about, so the form can be filled in
// with suggestions the teacher checks rather than making them retype what
// their own worksheet already says. Suggestions only — nothing is saved here,
// and the teacher edits every field before anything is generated.
lessonPlansRouter.post('/infer-context', async (req, res) => {
  const { text } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_infer_context')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      thinking: { type: 'disabled' },
      system: INFER_CONTEXT_PROMPT,
      messages: [{ role: 'user', content: text.trim().slice(0, MAX_SOURCE_MATERIAL_CHARS) }],
    })
    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    res.json(parseInferredContext(responseText))
  } catch (error) {
    console.error('[lesson-plans] infer-context failed:', error)
    // A failed guess is not a failed upload: the teacher still has their file
    // and can type the topic themselves, so this reports nothing found rather
    // than an error the form would have to block on.
    res.json({ topic: null, subject: null, gradeLevel: null, followUp: null })
  }
})

lessonPlansRouter.post('/generate', async (req, res) => {
  const context = readBuildContext(req.body ?? {})

  // Opening one day of a week as a full lesson: the week it sits in goes in
  // as context, and the lesson and the week are linked both ways.
  const { weekPlanId, weekDay } = req.body ?? {}
  let fromWeek: { id: string; week: WeekPlan; index: number } | null = null
  if (typeof weekPlanId === 'string') {
    const weekPlan = await prisma.lessonPlan.findFirst({ where: { id: weekPlanId, userId: req.user!.userId, planKind: 'week' } })
    const week = weekPlan?.week as WeekPlan | null | undefined
    const index = typeof weekDay === 'number' ? weekDay : -1
    if (!weekPlan || !week?.days[index]) {
      res.status(404).json({ error: 'That week plan was not found.' })
      return
    }
    fromWeek = { id: weekPlan.id, week, index }
    const weekContext = dayLessonContext(weekContextOf(weekPlan), week, index)
    context.additionalContext = [weekContext, context.additionalContext].filter(Boolean).join('\n\n')
  }

  // A topic or a file — one of the two. The old route required a formally
  // written objective; a teacher who has the worksheet in front of them
  // shouldn't have to write a SWBAT to get a lesson built around it.
  if (!context.objective && !context.sourceMaterial) {
    res.status(400).json({ error: 'Tell us the topic, or upload the material you are starting from.' })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_generate')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const ideasOnly = context.kind === 'ideas'
  // A school focus is offered on full lessons only (see generateFullLesson).
  const focuses = ideasOnly ? [] : await activeFocusFor(req.user!.userId)
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // A full lesson is a sequence plus checks, misconceptions and an exit
      // ticket — the old 1024 was sized for five short template slots and
      // would truncate this one mid-sequence.
      max_tokens: ideasOnly ? 1500 : 5000,
      thinking: { type: 'disabled' },
      system: ideasOnly ? buildQuickIdeasPrompt() : buildFullLessonPrompt() + schoolFocusBlock(focuses, 'planning'),
      messages: [{ role: 'user', content: buildUserMessage(context) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const common = {
      userId: req.user!.userId,
      mode: 'generated',
      unitName: context.unitName,
      essentialQuestion: context.essentialQuestion,
      standard: context.standard,
      subject: context.subject,
      gradeLevel: context.gradeLevel,
      additionalContext: context.additionalContext,
      sourceMaterial: context.sourceMaterial,
      durationMinutes: context.durationMinutes,
    }

    if (ideasOnly) {
      const quickIdeas = parseQuickIdeas(text)
      if (quickIdeas.length === 0) {
        console.error('[lesson-plans] no ideas parsed — stop_reason:', response.stop_reason)
        res.status(502).json({ error: 'Could not put together teaching ideas. Please try again.' })
        return
      }
      const lessonPlan = await prisma.lessonPlan.create({
        data: { ...common, planKind: 'ideas', objective: context.objective, quickIdeas },
      })
      res.status(201).json(lessonPlan)
      return
    }

    const lesson = parseFullLesson(text)
    if (!isUsableLesson(lesson)) {
      console.error('[lesson-plans] no lesson sequence parsed — stop_reason:', response.stop_reason)
      res.status(502).json({ error: 'Could not build the lesson. Please try again.' })
      return
    }

    const lessonPlan = await prisma.lessonPlan.create({
      data: {
        ...common,
        planKind: 'full',
        objective: lesson.objective ?? context.objective,
        approach: lesson.approach,
        successCriteria: lesson.successCriteria,
        materials: lesson.materials,
        sequence: lesson.sequence,
        checks: lesson.checks,
        misconceptions: lesson.misconceptions,
        exitTicket: lesson.exitTicket ?? undefined,
        schoolFocusIdea: matchSchoolFocusIdea(lesson.schoolFocusIdea, focuses, lesson.schoolFocusCheck) ?? undefined,
        weekPlanId: fromWeek?.id ?? null,
      },
    })
    if (fromWeek) {
      // Re-read rather than writing back the copy from before the call: the
      // teacher may have opened another day of the same week meanwhile.
      const current = await prisma.lessonPlan.findUnique({ where: { id: fromWeek.id } })
      const week = current?.week as WeekPlan | null
      if (week?.days[fromWeek.index]) {
        week.days[fromWeek.index].lessonPlanId = lessonPlan.id
        await prisma.lessonPlan.update({ where: { id: fromWeek.id }, data: { week: week as unknown as Prisma.InputJsonValue } })
      }
    }
    res.status(201).json(lessonPlan)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[lesson-plans] generation failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// ---------------------------------------------------------------------------
// Adaptations — Simplify, Add Challenge, Increase Participation, Adjust Time
// ---------------------------------------------------------------------------

/// The lesson's own content, in whichever shape it has, as the sections an
/// adaptation rewrites. A Planning Coach full lesson gives the structured
/// sections; a plan the teacher brought (Improve a Lesson) gives planText;
/// one of the old five-slot samples is flattened into planText, so applying
/// an adaptation to it produces a single revised plan rather than trying to
/// put a lab back into a Do Now / Agenda / Closure template it never fit.
function sectionsOf(plan: {
  planKind: string | null
  planText: string | null
  objective: string | null
  successCriteria: string | null
  materials: string | null
  approach: string | null
  sequence: unknown
  checks: unknown
  misconceptions: unknown
  exitTicket: unknown
  doNow: string | null
  agenda: string | null
  closure: string | null
  hots: string | null
  homework: string | null
}): { sections: LessonSections; structured: boolean } {
  const steps = (plan.sequence as LessonSections['sequence']) ?? []
  if (steps && steps.length > 0) {
    return {
      structured: true,
      sections: {
        objective: plan.objective,
        successCriteria: plan.successCriteria,
        materials: plan.materials,
        approach: plan.approach,
        sequence: steps,
        checks: plan.checks as LessonSections['checks'],
        misconceptions: plan.misconceptions as LessonSections['misconceptions'],
        exitTicket: plan.exitTicket as LessonSections['exitTicket'],
      },
    }
  }
  return { structured: false, sections: { objective: plan.objective, planText: lessonAsText(plan) } }
}

lessonPlansRouter.post('/:id/adapt', async (req, res) => {
  const { action, targetMinutes } = req.body ?? {}
  if (!isAdaptation(action)) {
    res.status(400).json({ error: 'Unknown adaptation' })
    return
  }

  const plan = await prisma.lessonPlan.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const { sections, structured } = sectionsOf(plan)
  const currentMinutes = lessonMinutes(plan)
  if (!structured && !sections.planText?.trim()) {
    res.status(400).json({ error: "This plan doesn't have content yet." })
    return
  }
  // The five-slot sample plans from before Planning Coach have no single
  // field a prose revision could be written back to, and nothing renders one
  // for them — so this refuses rather than spending a Claude call on a
  // revision the teacher would never see. Build the lesson again to adapt it.
  if (!structured && plan.mode === 'generated') {
    res.status(400).json({ error: 'Build this lesson again to adapt it — this one predates the adaptation tools.' })
    return
  }

  const focusIdea = plan.schoolFocusIdea as { text?: string; dismissed?: boolean } | null
  const idea = action === 'school_focus' && focusIdea?.text && !focusIdea.dismissed ? focusIdea.text : null
  if (action === 'school_focus' && !idea) {
    res.status(400).json({ error: 'There is no suggested idea on this lesson to add.' })
    return
  }

  const minutes = action === 'time' ? readMinutes(targetMinutes) : null
  if (action === 'time' && !minutes) {
    res.status(400).json({ error: `Pick a length between ${MIN_LESSON_MINUTES} and ${MAX_LESSON_MINUTES} minutes.` })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_adapt')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 5000,
      thinking: { type: 'disabled' },
      system: buildAdaptPrompt(action, structured, minutes, idea),
      messages: [{ role: 'user', content: adaptUserMessage(sections, currentMinutes) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const summary = extractTag(text, 'what_changed')
    let revised: LessonSections
    if (structured) {
      const lesson = parseFullLesson(text)
      if (!isUsableLesson(lesson)) {
        console.error('[lesson-plans] adapt produced no sequence — stop_reason:', response.stop_reason)
        res.status(502).json({ error: 'Could not revise the lesson. Please try again.' })
        return
      }
      revised = {
        objective: lesson.objective ?? plan.objective,
        successCriteria: lesson.successCriteria,
        materials: lesson.materials,
        approach: lesson.approach ?? plan.approach,
        sequence: lesson.sequence,
        checks: lesson.checks,
        misconceptions: lesson.misconceptions,
        exitTicket: lesson.exitTicket,
      }
    } else {
      const revisedPlan = extractTag(text, 'revised_plan')
      if (!revisedPlan) {
        console.error('[lesson-plans] adapt produced no revised plan — stop_reason:', response.stop_reason)
        res.status(502).json({ error: 'Could not revise the lesson. Please try again.' })
        return
      }
      revised = { planText: revisedPlan }
    }

    const updated = await prisma.lessonPlan.update({
      where: { id: plan.id },
      data: {
        pendingAdaptation: {
          action,
          label: ADAPTATION_LABEL[action],
          summary,
          minutes: minutes ?? null,
          sections: revised,
        },
      },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not revise the lesson')
    logModelFailure('[lesson-plans] adapt failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

type PendingAdaptation = { action: string; label: string; minutes: number | null; sections: LessonSections }

// "Not for this class" on the one school-focus idea: it goes away for this
// lesson and is not offered again on it.
lessonPlansRouter.post('/:id/school-focus-idea/dismiss', async (req, res) => {
  const plan = await prisma.lessonPlan.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: { id: true, schoolFocusIdea: true },
  })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const idea = plan.schoolFocusIdea as Record<string, unknown> | null
  const updated = await prisma.lessonPlan.update({
    where: { id: plan.id },
    data: { schoolFocusIdea: idea ? ({ ...idea, dismissed: true } as Prisma.InputJsonValue) : Prisma.DbNull },
  })
  res.json(updated)
})

/// Writes a drafted adaptation into the plan, keeping the version it replaced.
/// versionHistory is append-only and index 0 is therefore always the original,
/// which is what makes "revert" below honest after four adaptations rather
/// than only after one.
lessonPlansRouter.post('/:id/apply-adaptation', async (req, res) => {
  const plan = await prisma.lessonPlan.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const pending = plan.pendingAdaptation as PendingAdaptation | null
  if (!pending?.sections) {
    res.status(400).json({ error: 'No revision to apply' })
    return
  }

  const { sections: current } = sectionsOf(plan)
  const history = (plan.versionHistory as Prisma.InputJsonValue[] | null) ?? []
  const s = pending.sections
  const replaced = {
    label: history.length === 0 ? 'Original' : `Before ${pending.label}`,
    savedAt: new Date().toISOString(),
    sections: current,
    durationMinutes: plan.durationMinutes,
  } as unknown as Prisma.InputJsonValue

  const updated = await prisma.lessonPlan.update({
    where: { id: plan.id },
    data: {
      versionHistory: [...history, replaced],
      pendingAdaptation: Prisma.DbNull,
      // Every section falls back to what the plan already had. A revision that
      // came back missing one section is a parse that went short, not an
      // instruction to delete the teacher's materials list.
      ...(s.planText != null
        ? { planText: s.planText }
        : {
            objective: s.objective ?? plan.objective,
            approach: s.approach ?? plan.approach,
            successCriteria: s.successCriteria ?? plan.successCriteria,
            materials: s.materials ?? plan.materials,
            sequence: s.sequence ?? undefined,
            checks: s.checks ?? undefined,
            misconceptions: s.misconceptions ?? undefined,
            exitTicket: s.exitTicket ?? undefined,
          }),
      ...(pending.minutes ? { durationMinutes: pending.minutes } : {}),
      // The school-focus idea is now part of the lesson, so it isn't offered
      // again. Undo brings the lesson back but not the offer, which is fine:
      // the teacher has already seen and answered it.
      ...(pending.action === 'school_focus' && plan.schoolFocusIdea
        ? { schoolFocusIdea: { ...(plan.schoolFocusIdea as Record<string, unknown>), added: true } as Prisma.InputJsonValue }
        : {}),
    },
  })
  res.json(updated)
})

lessonPlansRouter.post('/:id/discard-adaptation', async (req, res) => {
  const { count } = await prisma.lessonPlan.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { pendingAdaptation: Prisma.DbNull },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const lessonPlan = await prisma.lessonPlan.findUnique({ where: { id: req.params.id } })
  res.json(lessonPlan)
})

/// Back to the lesson as it was first drafted. The adapted versions are not
/// kept on top of it: a teacher reverting wants the original back, and
/// keeping the discarded branch would only make "which one am I looking at"
/// harder to answer.
lessonPlansRouter.post('/:id/revert', (req, res) => restoreVersion(req, res, 'original'))

/// One step back: the version the last applied adaptation replaced, with the
/// versions before it kept, so Undo after a second adaptation lands on the
/// first rather than all the way back at the original.
lessonPlansRouter.post('/:id/undo-adaptation', (req, res) => restoreVersion(req, res, 'previous'))

async function restoreVersion(req: Request, res: Response, which: 'original' | 'previous') {
  const plan = await prisma.lessonPlan.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const history = (plan.versionHistory as { sections: LessonSections; durationMinutes?: number | null }[] | null) ?? []
  const original = which === 'original' ? history[0] : history[history.length - 1]
  if (!original?.sections) {
    res.status(400).json({ error: 'This is the original version.' })
    return
  }
  const s = original.sections

  const updated = await prisma.lessonPlan.update({
    where: { id: plan.id },
    data: {
      versionHistory: which === 'original' ? [] : (history.slice(0, -1) as unknown as Prisma.InputJsonValue[]),
      pendingAdaptation: Prisma.DbNull,
      ...(s.planText != null
        ? { planText: s.planText }
        : {
            objective: s.objective ?? plan.objective,
            approach: s.approach ?? null,
            successCriteria: s.successCriteria ?? null,
            materials: s.materials ?? null,
            sequence: s.sequence ?? undefined,
            checks: s.checks ?? undefined,
            misconceptions: s.misconceptions ?? undefined,
            exitTicket: s.exitTicket ?? undefined,
          }),
      ...(original.durationMinutes != null ? { durationMinutes: original.durationMinutes } : {}),
    },
  })
  res.json(updated)
}

// ---------------------------------------------------------------------------
// Plan a Week
// ---------------------------------------------------------------------------

function weekContextOf(plan: {
  objective: string | null
  subject: string | null
  gradeLevel: string | null
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  additionalContext: string | null
  sourceMaterial: string | null
}): WeekContext {
  return {
    goal: plan.objective ?? '',
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    unitName: plan.unitName,
    essentialQuestion: plan.essentialQuestion,
    standard: plan.standard,
    additionalContext: plan.additionalContext,
    sourceMaterial: plan.sourceMaterial?.slice(0, MAX_SOURCE_MATERIAL_CHARS) ?? null,
  }
}

/// Step one: the week's goal and days in, an objective for each day out.
/// Saved straight away as a week with nothing filled in yet, so the teacher
/// can leave and come back to check the objectives.
lessonPlansRouter.post('/week', async (req, res) => {
  const context = readBuildContext(req.body ?? {})
  if (!context.objective && !context.sourceMaterial) {
    res.status(400).json({ error: 'Tell us what the class is learning this week.' })
    return
  }
  const days = sanitizeWeekDays(req.body?.days, (v) => readMinutes(v), context.durationMinutes ?? DEFAULT_LESSON_MINUTES)
  if (!days) {
    res.status(400).json({ error: 'Pick the days you teach this week.' })
    return
  }

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_planning', () =>
    countUsageLogActionsThisMonth(req.user!.userId, LESSON_PLANNING_ACTIONS),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }
  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_plan_week')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const weekContext = weekContextOf({ ...context, sourceMaterial: context.sourceMaterial })
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      system: buildWeekObjectivesPrompt(),
      messages: [{ role: 'user', content: weekObjectivesUserMessage(weekContext, days) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const objectives = parseWeekObjectives(text, days.length)
    if (objectives.some((o) => !o)) {
      console.error('[lesson-plans] week objectives incomplete — stop_reason:', response.stop_reason)
      res.status(502).json({ error: 'Could not plan the week. Please try again.' })
      return
    }
    const week: WeekPlan = { days: days.map((d, i) => ({ ...d, objective: objectives[i]! })), content: null }
    const plan = await prisma.lessonPlan.create({
      data: {
        userId: req.user!.userId,
        mode: 'generated',
        planKind: 'week',
        objective: context.objective || null,
        unitName: context.unitName,
        essentialQuestion: context.essentialQuestion,
        standard: context.standard,
        subject: context.subject,
        gradeLevel: context.gradeLevel,
        additionalContext: context.additionalContext,
        sourceMaterial: context.sourceMaterial,
        durationMinutes: context.durationMinutes,
        week: week as unknown as Prisma.InputJsonValue,
      },
    })
    res.status(201).json(plan)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not plan the week')
    logModelFailure('[lesson-plans] week objectives failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

/// Step two: the week filled in. Takes the objectives as the teacher left
/// them (when sent) and the format to use (when sent: a weekly format id or
/// "wivoza"), and fills every day in one call.
lessonPlansRouter.post('/:id/week/fill', async (req, res) => {
  const userId = req.user!.userId
  const plan = await prisma.lessonPlan.findFirst({ where: { id: String(req.params.id), userId, planKind: 'week' } })
  const stored = plan?.week as WeekPlan | null | undefined
  if (!plan || !stored?.days?.length) {
    res.status(404).json({ error: 'Week plan not found' })
    return
  }

  const { objectives, choice } = req.body ?? {}
  if (objectives !== undefined && (!Array.isArray(objectives) || objectives.length !== stored.days.length)) {
    res.status(400).json({ error: 'Send one objective per day.' })
    return
  }
  if (choice !== undefined && choice !== null && typeof choice !== 'string') {
    res.status(400).json({ error: 'choice must be a format id, "wivoza", or null' })
    return
  }
  const days = stored.days.map((day, i) => {
    const edited = Array.isArray(objectives) ? cleanObjective(objectives[i]) : null
    // A day whose objective changed no longer matches the lesson opened from
    // it, so the link goes; the lesson itself stays in their history.
    return edited && edited !== day.objective ? { ...day, objective: edited, lessonPlanId: null } : day
  })
  const templateChoice = choice === undefined ? plan.templateChoice : choice

  const owner = await loadTemplateOwner(userId)
  const template = owner ? await weekTemplateForChoice(owner, templateChoice) : null
  const sections = (template && sanitizeSections(template.sections)) || DEFAULT_WEEK_SECTIONS

  const denied = await checkAndLogUsage(userId, 'lesson_plan_week_fill')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      system: buildWeekFillPrompt(),
      messages: [{ role: 'user', content: weekFillUserMessage(weekContextOf(plan), days, sections) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const filled = parseWeekFill(text, sections, days)
    if (!isUsableWeekFill(filled)) {
      console.error('[lesson-plans] week fill came back empty — stop_reason:', response.stop_reason)
      res.status(502).json({ error: 'Could not fill in the week. Please try again.' })
      return
    }
    const week: WeekPlan = {
      days,
      content: { templateId: template?.id ?? null, templateName: template?.name ?? 'Wivoza weekly plan', ...filled },
    }
    const updated = await prisma.lessonPlan.update({
      where: { id: plan.id },
      data: { week: week as unknown as Prisma.InputJsonValue, templateChoice: templateChoice ?? null },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not fill in the week')
    logModelFailure('[lesson-plans] week fill failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// ---------------------------------------------------------------------------
// Lesson plan formats — the lesson laid out in a school's or teacher's template
// ---------------------------------------------------------------------------

/// Layouts already being written, by plan and source key, so a second request
/// for the same layout (the page opening twice, a double click) waits for the
/// first instead of paying for it again.
const layoutsInFlight = new Map<string, Promise<TemplateContent | null>>()

/// Sets which format this lesson uses (when `choice` is sent) and returns the
/// lesson laid out in it. A layout that is still current costs nothing: the
/// stored one is returned as it is. Only a Planning Coach full lesson has a
/// layout — anything else comes back unchanged with no template applied.
lessonPlansRouter.post('/:id/layout', async (req, res) => {
  const userId = req.user!.userId
  let plan = await prisma.lessonPlan.findFirst({ where: { id: String(req.params.id), userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }

  const body = req.body ?? {}
  if ('choice' in body) {
    const choice = body.choice
    if (choice !== null && typeof choice !== 'string') {
      res.status(400).json({ error: 'choice must be a format id, "wivoza", or null' })
      return
    }
    plan = await prisma.lessonPlan.update({ where: { id: plan.id }, data: { templateChoice: choice } })
  }

  const owner = await loadTemplateOwner(userId)
  const template = owner ? await templateForChoice(owner, plan.templateChoice) : null
  const structured = ((plan.sequence as unknown[] | null) ?? []).length > 0
  // A plan the teacher wrote (Improve a Lesson) is laid out from their own
  // text; Quick Ideas and the old five-slot samples are not lesson plans to
  // hand in, so they have no layout.
  const ownPlan = !structured && plan.mode === 'feedback' && !!plan.planText?.trim()
  const sections = template ? sanitizeSections(template.sections) : null
  if (!template || !sections || (!structured && !ownPlan)) {
    res.json({ plan, appliedTemplateId: null })
    return
  }

  const sourceKey = layoutSourceKey(plan, { id: template.id, updatedAt: template.updatedAt, sections })
  const stored = plan.templateContent as TemplateContent | null
  if (stored?.sourceKey === sourceKey) {
    res.json({ plan, appliedTemplateId: template.id })
    return
  }

  const flightKey = `${plan.id}:${sourceKey}`
  let flight = layoutsInFlight.get(flightKey)
  if (!flight) {
    const denied = await checkAndLogUsage(userId, 'lesson_plan_layout')
    if (denied) {
      res.status(429).json({ error: denied })
      return
    }
    const lesson = plan
    flight = (async () => {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        // A teacher's own plan comes back whole, in their words, so it can
        // run longer than placing a Wivoza lesson's steps.
        max_tokens: ownPlan ? 6000 : 4000,
        thinking: { type: 'disabled' },
        system: ownPlan ? buildOwnPlanLayoutPrompt() : buildLayoutPrompt(),
        messages: [
          {
            role: 'user',
            content: ownPlan ? ownPlanLayoutUserMessage({ ...lesson, planText: lesson.planText! }, sections) : layoutUserMessage(lesson, sections),
          },
        ],
      })
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      const laidOut = ownPlan ? parseOwnPlanLayout(text, sections) : parseLayout(text, sections, (lesson.sequence as unknown as LessonStep[] | null) ?? [])
      if (!isUsableLayout(laidOut)) {
        console.error('[lesson-plans] layout came back empty — stop_reason:', response.stop_reason)
        return null
      }
      return { templateId: template.id, templateName: template.name, sourceKey, sections: laidOut }
    })().finally(() => layoutsInFlight.delete(flightKey))
    layoutsInFlight.set(flightKey, flight)
  }

  try {
    const content = await flight
    if (!content) {
      res.status(502).json({ error: "Could not put this lesson in your school's format. Please try again." })
      return
    }
    const updated = await prisma.lessonPlan.update({
      where: { id: plan.id },
      data: { templateContent: content as unknown as Prisma.InputJsonValue },
    })
    res.json({ plan: updated, appliedTemplateId: template.id })
  } catch (error) {
    const failure = classifyModelError(error, "Could not put this lesson in your school's format")
    logModelFailure('[lesson-plans] layout failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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
