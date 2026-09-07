import { tmpdir } from 'node:os'
import { Router } from 'express'
import mammoth from 'mammoth'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import { createWorker, type Worker } from 'tesseract.js'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { Prisma } from '../generated/prisma/client.ts'
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

// Appended to both start prompts so a single Claude call can both analyze
// the assignment AND infer the context a teacher used to have to fill in
// on a separate form. "Unclear" (normalized to null downstream) is only
// for genuinely undeterminable fields — Claude should make its best
// judgment otherwise, since a wrong-but-editable guess beats a blocking
// question every time.
const DETECTION_INSTRUCTIONS = `Also infer the following from the assignment text itself — make your best judgment even when something is only implied, and use "Unclear" only when there's truly nothing to go on:
<detected_title>A short title (2-6 words). If the assignment already has a heading or title printed at the top of the text, use it verbatim (cleaned up if it's garbled) — otherwise invent a short, specific, descriptive name from the content, e.g. "Forest Food Web." Always provide a real title here — never "Unclear," even for a plain worksheet.</detected_title>
<detected_grade_level>A single grade, or a narrow band like "6th-8th" only if genuinely ambiguous.</detected_grade_level>
<detected_subject>The subject area, e.g. "Math" or "English / ELA".</detected_subject>
<detected_assignment_type>One of: classwork, homework, project, assessment, group_task, exit_ticket, other.</detected_assignment_type>
<detected_estimated_time>Your own estimate, e.g. "20-30 min".</detected_estimated_time>
<detected_objective>The likely learning objective, one sentence.</detected_objective>

Only if one of the details above is both genuinely uncertain AND would materially change your review, include one clarifying question — never more than one, and never for something you can reasonably assume:
<clarifying_question>A single specific question, e.g. "This could fit Grades 6-8. Which grade is it intended for?"</clarifying_question>
<clarifying_options>2-4 short answers, comma-separated.</clarifying_options>`

const RIGOR_AND_AI_RISK_GROUNDING = `Rate cognitive demand against what students actually have to DO, not how much work is involved — recall information, apply a learned procedure, explain reasoning, analyze relationships, make decisions, create or defend a solution, or transfer learning to a new situation. More steps or more time is not the same as more rigor.

For "AI completion risk," judge how much of the response a student could get from pasting the directions into an AI tool with no personal input — never claim an assignment is "AI-proof." Ground the reasons in: whether the final answer is predictable, whether classroom-specific evidence is required, whether any draft or process is visible, whether student decisions require explanation, and whether a follow-up or transfer task exists.`

const REVIEW_SNAPSHOT_TAGS = `<purpose>
What this assignment actually asks students to learn or demonstrate — or, if unclear, say so plainly rather than guessing.
</purpose>
<grade_fit_rating>
below | appropriate | above | need_more_context
</grade_fit_rating>
<grade_fit_explanation>
Reference vocabulary/reading complexity, prerequisite knowledge, conceptual complexity, independence required, and workload.
</grade_fit_explanation>
<rigor_label>
A short phrase, e.g. "Mostly application."
</rigor_label>
<rigor_explanation>
What students actually have to do, and — if it would raise the ceiling — one concrete way to add deeper reasoning.
</rigor_explanation>
<meaningful_work_rating>
clear_value | some_repetition | purpose_unclear | mostly_completion
</meaningful_work_rating>
<meaningful_work_explanation>
Whether every task supports the objective, whether students make meaningful decisions, and whether repetition serves a clear practice purpose.
</meaningful_work_explanation>
<meaningful_work_suggestion>
One concrete low-value step to cut — omit this section entirely if nothing genuinely qualifies.
</meaningful_work_suggestion>
<ai_risk_rating>
high | moderate | low
</ai_risk_rating>
<ai_risk_explanation>
...
</ai_risk_explanation>
<ai_risk_reasons>
Dash-prefixed short reasons, one per line, drawn only from what's actually true of this assignment.
</ai_risk_reasons>
<workload_summary>
Estimated time, steps, reading/writing, materials, likely points of confusion, and whether it's completable independently — 2-3 sentences.
</workload_summary>
<main_opportunity_title>
A short, specific title, e.g. "Make student reasoning visible."
</main_opportunity_title>
<main_opportunity_description>
1-2 sentences on what to add or change.
</main_opportunity_description>`

function buildReviewStartPrompt(originalText: string, extraNote?: string): string {
  return `You are Coach, giving a teacher a coaching review of an assignment they've shared, and opening a conversation about it. Do not rewrite the assignment — review it.

${RIGOR_AND_AI_RISK_GROUNDING}

Never state or imply a numeric score, rating, grade, or evaluative label of any kind.

Write in plain text only — no markdown.
${extraNote ? `\n${extraNote}\n` : ''}
Here is the assignment:
${originalText}

Respond with exactly these sections and nothing else:
<reply>
A short, warm 1-2 sentence message introducing the review below and inviting the teacher to ask about anything or request changes.
</reply>
${REVIEW_SNAPSHOT_TAGS}
${DETECTION_INSTRUCTIONS}
${CORE_COACHING_RULES}`
}

// Used by /:id/review's "Refresh review" regenerate action — same
// snapshot shape, no <reply> (not a new conversation turn) and no
// detection block (context was already set at creation / via Edit details).
const REVIEW_SYSTEM_PROMPT = `You are Coach, giving a teacher a concise coaching review of an assignment they're working on. Do not rewrite it — just review it.

${RIGOR_AND_AI_RISK_GROUNDING}

Never state or imply a numeric score, rating, grade, or evaluative label of any kind.

Write in plain text only — no markdown.

Respond with exactly these sections and nothing else:
${REVIEW_SNAPSHOT_TAGS}
${CORE_COACHING_RULES}`

function buildRedesignAiStartPrompt(aiUseLevel: string, originalText: string, extraNote?: string): string {
  const levelGuidance = AI_USE_LEVEL_GUIDANCE[aiUseLevel] ?? AI_USE_LEVEL_GUIDANCE.thinking_partner
  return `You are Coach, helping a teacher redesign an assignment for meaningful AI use, and opening a conversation about it. The goal is not to make the assignment "AI-proof" — that's not realistic — but to keep student thinking, judgment, voice, and process visible throughout the task.

${REDESIGN_GUIDING_PRINCIPLE}

The teacher has said students should use AI this way: ${levelGuidance}

Choose from these kinds of strategies where they genuinely fit this assignment — don't force all of them in:
${REDESIGN_STRATEGIES_LIST}

Ground every suggestion in the actual assignment below. Never invent details about the class or students that weren't given to you.

${DIAGRAM_SYNTAX_INSTRUCTIONS}

Write in plain text only — no markdown. Use a dash ("-") at the start of a line for list-like content.
${extraNote ? `\n${extraNote}\n` : ''}
Here is the assignment:
${originalText}

Respond with exactly these sections and nothing else:
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
${DETECTION_INSTRUCTIONS}
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

type ReviewSnapshot = {
  purpose: string | null
  gradeFit: { rating: string | null; explanation: string | null }
  rigor: { label: string | null; explanation: string | null }
  meaningfulWork: { rating: string | null; explanation: string | null; suggestion: string | null }
  aiRisk: { rating: string | null; explanation: string | null; reasons: string | null }
  workloadSummary: string | null
  mainOpportunity: { title: string | null; description: string | null }
}

function parseReviewSnapshot(text: string): ReviewSnapshot {
  return {
    purpose: extractTag(text, 'purpose'),
    gradeFit: { rating: extractTag(text, 'grade_fit_rating'), explanation: extractTag(text, 'grade_fit_explanation') },
    rigor: { label: extractTag(text, 'rigor_label'), explanation: extractTag(text, 'rigor_explanation') },
    meaningfulWork: {
      rating: extractTag(text, 'meaningful_work_rating'),
      explanation: extractTag(text, 'meaningful_work_explanation'),
      suggestion: extractTag(text, 'meaningful_work_suggestion'),
    },
    aiRisk: {
      rating: extractTag(text, 'ai_risk_rating'),
      explanation: extractTag(text, 'ai_risk_explanation'),
      reasons: extractTag(text, 'ai_risk_reasons'),
    },
    workloadSummary: extractTag(text, 'workload_summary'),
    mainOpportunity: { title: extractTag(text, 'main_opportunity_title'), description: extractTag(text, 'main_opportunity_description') },
  }
}

function isReviewSnapshotEmpty(snapshot: ReviewSnapshot): boolean {
  return (
    !snapshot.purpose &&
    !snapshot.gradeFit.rating &&
    !snapshot.rigor.label &&
    !snapshot.meaningfulWork.rating &&
    !snapshot.aiRisk.rating &&
    !snapshot.workloadSummary &&
    !snapshot.mainOpportunity.title
  )
}

type DetectedContext = {
  title: string | null
  assignmentType: string
  gradeLevel: string | null
  subject: string | null
  estimatedTime: string | null
  objective: string | null
}
type ClarifyingQuestion = { question: string; options: string[] } | null

// "Unclear" (or empty) means Claude genuinely had nothing to go on for
// that field — treated as null so it doesn't overwrite an already-known
// value (e.g. one set earlier via Edit details) with a meaningless string.
function normalizeDetected(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || /^unclear$/i.test(trimmed)) return null
  return trimmed
}

function parseDetection(text: string): { detected: DetectedContext; clarifyingQuestion: ClarifyingQuestion } {
  const rawType = (extractTag(text, 'detected_assignment_type') ?? '').trim().toLowerCase()
  const assignmentType = VALID_ASSIGNMENT_TYPES.includes(rawType) ? rawType : 'other'

  const question = extractTag(text, 'clarifying_question')
  const rawOptions = extractTag(text, 'clarifying_options')
  const options = rawOptions
    ? rawOptions
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : []
  const clarifyingQuestion = question && options.length > 0 ? { question, options } : null

  return {
    detected: {
      title: normalizeDetected(extractTag(text, 'detected_title')),
      assignmentType,
      gradeLevel: normalizeDetected(extractTag(text, 'detected_grade_level')),
      subject: normalizeDetected(extractTag(text, 'detected_subject')),
      estimatedTime: normalizeDetected(extractTag(text, 'detected_estimated_time')),
      objective: normalizeDetected(extractTag(text, 'detected_objective')),
    },
    clarifyingQuestion,
  }
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

// Lazily created once per server process and reused across requests — the
// English trained-data download only happens on the very first OCR call,
// not on every upload. Never terminated: this route may be hit again at
// any time for the life of the process.
let ocrWorkerPromise: Promise<Worker> | null = null
function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    // Cache the downloaded English trained-data in the OS temp dir, not the
    // working directory — keeps this out of the repo regardless of where
    // the process runs.
    ocrWorkerPromise = createWorker('eng', undefined, { cachePath: tmpdir() })
  }
  return ocrWorkerPromise
}

// Plain OCR has no concept of math notation, fractions, or a blank
// coordinate-grid graph — it just pattern-matches pixel shapes into
// letters, so dense equations and graph grids come out as unreadable
// noise no confidence threshold can turn into real math. Rather than
// showing that noise, this drops any line OCR itself isn't confident
// about — real prose (titles, instructions, word problems) reliably
// scores well above this line; garbled equations and grid noise don't.
// The tradeoff is explicit: some real content is lost along with the
// noise, but nothing gibberish reaches the teacher or Coach.
const OCR_MIN_LINE_CONFIDENCE = 60

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true })
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((para) => para.lines))
  const confident = lines.filter((line) => line.confidence >= OCR_MIN_LINE_CONFIDENCE)
  return confident.map((line) => line.text).join('')
}

// pdf-parse's own text output for a page with no real text layer is just
// this separator artifact, not an empty string — strip it before judging
// whether OCR is actually needed.
function stripPdfPageMarkers(text: string): string {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim()
}

// Scanned/photographed pages are just an embedded image with no text
// layer at all — pdf-parse (or any text-layer extractor) correctly finds
// nothing. Falls back to OCR by rendering each page to an image via
// pdf-parse's own built-in (pure-JS, no native/poppler dependency)
// screenshot renderer. Capped at a handful of pages to bound latency/cost
// on an unexpectedly long scanned packet.
const MAX_OCR_PAGES = 5

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const direct = stripPdfPageMarkers((await parser.getText()).text)
    if (direct.length >= 15) return direct

    const screenshot = await parser.getScreenshot({ scale: 2 })
    const pages = screenshot.pages.slice(0, MAX_OCR_PAGES)
    const ocrTexts = await Promise.all(pages.map((page) => ocrImageBuffer(Buffer.from(page.data))))
    return ocrTexts.join('\n\n').trim()
  } finally {
    await parser.destroy()
  }
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']

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
      text = await extractPdfText(req.file.buffer)
    } else if (name.endsWith('.txt')) {
      text = req.file.buffer.toString('utf-8')
    } else if (IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      text = await ocrImageBuffer(req.file.buffer)
    } else {
      res.status(400).json({ error: 'Please upload a .docx, .pdf, .txt, .jpg, or .png file.' })
      return
    }
    if (!text.trim()) {
      res.status(422).json({ error: "Couldn't find any text in that file — if it's a scan or photo, make sure the writing is clear and well-lit." })
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

// The only inputs left: what the assignment is, and (for redesign_ai) how
// students should use AI — a real policy choice, not something to infer.
// Everything else (grade/subject/type/estimated time/objective) is
// detected from the text itself in the same Claude call that produces the
// review/redesign, never collected via a separate required form.
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
    const systemPrompt = mode === 'review' ? buildReviewStartPrompt(originalText) : buildRedesignAiStartPrompt(aiUseLevel!, originalText)
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
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

    const { detected, clarifyingQuestion } = parseDetection(text)

    let liveAssignmentText: string
    let reviewSnapshot: ReviewSnapshot | undefined
    let aiResistant: Record<string, string | null> | undefined

    if (mode === 'review') {
      reviewSnapshot = parseReviewSnapshot(text)
      if (isReviewSnapshotEmpty(reviewSnapshot)) {
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
        title: detected.title,
        assignmentType: detected.assignmentType,
        gradeLevel: detected.gradeLevel,
        subject: detected.subject,
        estimatedTime: detected.estimatedTime,
        objective: detected.objective,
        originalText,
        liveAssignmentText,
        conversation,
        reviewSnapshot,
        aiResistant,
        clarifyingQuestion: clarifyingQuestion ?? undefined,
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

// Regenerates the Review structured snapshot, grounded in the CURRENT
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
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context.join('\n') }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const reviewSnapshot = parseReviewSnapshot(text)
    if (isReviewSnapshotEmpty(reviewSnapshot)) {
      res.status(502).json({ error: 'Could not put together a review. Please try again.' })
      return
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: { reviewSnapshot },
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

// Answers the one optional clarifying question from the initial analysis
// (or a prior refine) — re-runs the same start-prompt logic grounded in
// the original text plus the confirmed detail, and clears the question.
// Never a chat turn (nothing is appended to `conversation`), and for the
// Redesign path never touches liveAssignmentText on its own — same
// "teacher applies explicitly" rule /:id/ai-resistant's regenerate uses.
assignmentCoachRouter.post('/:id/refine', async (req, res) => {
  const { answer } = req.body ?? {}
  if (typeof answer !== 'string' || !answer.trim()) {
    res.status(400).json({ error: 'answer is required' })
    return
  }

  const session = await prisma.assignmentCoachSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Assignment Coach session not found' })
    return
  }
  if (!session.originalText) {
    res.status(400).json({ error: 'Nothing to refine yet.' })
    return
  }

  const isRedesign = session.mode === 'redesign_ai'
  const usageAction = isRedesign ? 'assignment_coach_ai_resistant' : 'assignment_coach_review'
  const allowed = await checkAndLogUsage(req.user!.userId, usageAction)
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const extraNote = `Confirmed detail: ${answer.trim()}`
    const systemPrompt = isRedesign
      ? buildRedesignAiStartPrompt(session.aiUseLevel ?? 'thinking_partner', session.originalText, extraNote)
      : buildReviewStartPrompt(session.originalText, extraNote)

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: START_MESSAGE }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const { detected } = parseDetection(text)

    let reviewSnapshot: ReviewSnapshot | undefined
    let aiResistant: Record<string, string | null> | undefined

    if (isRedesign) {
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
    } else {
      reviewSnapshot = parseReviewSnapshot(text)
      if (isReviewSnapshotEmpty(reviewSnapshot)) {
        res.status(502).json({ error: 'Could not put together a review. Please try again.' })
        return
      }
    }

    const updated = await prisma.assignmentCoachSession.update({
      where: { id: session.id },
      data: {
        assignmentType: detected.assignmentType,
        gradeLevel: detected.gradeLevel ?? session.gradeLevel,
        subject: detected.subject ?? session.subject,
        estimatedTime: detected.estimatedTime ?? session.estimatedTime,
        objective: detected.objective ?? session.objective,
        reviewSnapshot: reviewSnapshot ?? undefined,
        aiResistant: aiResistant ?? undefined,
        clarifyingQuestion: Prisma.JsonNull,
      },
    })
    res.json(updated)
  } catch (error) {
    console.error('[assignment-coach] refine failed:', error)
    res.status(502).json({ error: 'Could not refine this. Please try again.' })
  }
})

assignmentCoachRouter.patch('/:id', async (req, res) => {
  const { saved, title, liveAssignmentText, status, assignmentType, gradeLevel, subject, estimatedTime } = req.body ?? {}
  const data: {
    saved?: boolean
    title?: string
    liveAssignmentText?: string
    status?: string
    assignmentType?: string
    gradeLevel?: string | null
    subject?: string | null
    estimatedTime?: string | null
  } = {}
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
  if (assignmentType !== undefined) {
    if (typeof assignmentType !== 'string' || !VALID_ASSIGNMENT_TYPES.includes(assignmentType)) {
      res.status(400).json({ error: 'Invalid assignmentType' })
      return
    }
    data.assignmentType = assignmentType
  }
  if (gradeLevel !== undefined) {
    if (typeof gradeLevel !== 'string') {
      res.status(400).json({ error: 'gradeLevel must be a string' })
      return
    }
    data.gradeLevel = gradeLevel.trim() || null
  }
  if (subject !== undefined) {
    if (typeof subject !== 'string') {
      res.status(400).json({ error: 'subject must be a string' })
      return
    }
    data.subject = subject.trim() || null
  }
  if (estimatedTime !== undefined) {
    if (typeof estimatedTime !== 'string') {
      res.status(400).json({ error: 'estimatedTime must be a string' })
      return
    }
    data.estimatedTime = estimatedTime.trim() || null
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
