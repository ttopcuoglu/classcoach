import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { describeClassContext } from '../lib/classProfile.ts'
import {
  extractDocumentText,
  countPages,
  NoTextFoundError,
  UnsupportedFileError,
} from '../lib/documentText.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import {
  acceptedCount,
  applyAcceptedEdits,
  exportLabel,
  isEditStatus,
  parseEdits,
  parseTimingBasis,
  setEditStatus,
  unanchoredEdits,
  type ReviewEdit,
} from '../lib/reviewEdits.ts'
import {
  DOC_TYPE_LABELS,
  LENSES,
  REVIEW_LIMITS,
  allowedLensKeys,
  defaultLensesFor,
  detectDocType,
  isDocType,
  type DocType,
} from '../lib/reviewLenses.ts'
import { findTopic, TOPICS } from '../lib/topics.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const reviewsRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

/// Long enough for a unit test or a multi-page packet, short enough that one
/// pasted textbook chapter cannot cost a teacher their daily usage on a
/// review that was never going to be useful.
const MAX_DOCUMENT_CHARS = 60_000

type StoredLens = { key: string; on: boolean; finding?: string | null }

function parseLenses(value: unknown, docType: DocType): StoredLens[] {
  const allowed = allowedLensKeys(docType)
  if (!Array.isArray(value)) return defaultLensesFor(docType)
  const parsed = value
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .filter((l) => typeof l.key === 'string' && allowed.includes(l.key))
    .map((l) => ({
      key: l.key as string,
      on: l.on === true,
      finding: typeof l.finding === 'string' ? l.finding : null,
    }))
  // A stored list that has drifted from the type's lens set (the teacher
  // corrected the type after the review ran) is topped up rather than
  // replaced, so findings already produced survive the correction.
  for (const fallback of defaultLensesFor(docType)) {
    if (!parsed.some((l) => l.key === fallback.key)) parsed.push({ ...fallback, finding: null })
  }
  return allowed.map((key) => parsed.find((l) => l.key === key)!).filter(Boolean)
}

/// What the client renders. Everything derived lives here rather than in each
/// client, so the web app and any later one cannot disagree about the export
/// label or which edits failed to anchor.
function toReview(row: {
  id: string
  docType: string
  detectedType: string | null
  docTypeConfirmed: boolean
  sourceKind: string
  fileName: string | null
  pageCount: number | null
  originalText: string
  focusArea: string | null
  classProfileId: string | null
  lenses: unknown
  oneThing: string | null
  edits: unknown
  timingBasis: unknown
  status: string
  saved: boolean
  createdAt: Date
}) {
  const docType = isDocType(row.docType) ? row.docType : 'assignment'
  const edits = parseEdits(row.edits)
  return {
    id: row.id,
    docType,
    docTypeLabel: DOC_TYPE_LABELS[docType],
    detectedType: row.detectedType,
    docTypeConfirmed: row.docTypeConfirmed,
    sourceKind: row.sourceKind,
    fileName: row.fileName,
    pageCount: row.pageCount,
    originalText: row.originalText,
    focusArea: row.focusArea,
    classProfileId: row.classProfileId,
    lenses: parseLenses(row.lenses, docType).map((l) => ({
      ...l,
      label: LENSES[l.key]?.label ?? l.key,
      blurb: LENSES[l.key]?.blurb ?? '',
    })),
    oneThing: row.oneThing,
    edits,
    /// Surfaced rather than hidden: an edit quoting text that is not in the
    /// document is the one failure that could attribute an invented sentence
    /// to the teacher.
    unanchoredEditIds: unanchoredEdits(row.originalText, edits).map((e) => e.id),
    acceptedCount: acceptedCount(edits),
    exportLabel: exportLabel(edits),
    timingBasis: parseTimingBasis(row.timingBasis),
    status: row.status,
    saved: row.saved,
    createdAt: row.createdAt,
    limits: REVIEW_LIMITS,
  }
}

const SELECT = {
  id: true,
  docType: true,
  detectedType: true,
  docTypeConfirmed: true,
  sourceKind: true,
  fileName: true,
  pageCount: true,
  originalText: true,
  focusArea: true,
  classProfileId: true,
  lenses: true,
  oneThing: true,
  edits: true,
  timingBasis: true,
  status: true,
  saved: true,
  createdAt: true,
} as const

// Text out of an uploaded file, plus what it looks like. Separate from
// creating the review so the teacher sees the detected type and can correct
// it before anything is stored — and so a file that turns out to be
// unreadable never leaves an empty review behind.
reviewsRouter.post('/extract', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received' })
    return
  }
  try {
    const text = await extractDocumentText(req.file.buffer, req.file.originalname)
    const detection = detectDocType(text, req.file.originalname)
    res.json({
      text: text.slice(0, MAX_DOCUMENT_CHARS),
      truncated: text.length > MAX_DOCUMENT_CHARS,
      fileName: req.file.originalname,
      pageCount: await countPages(req.file.buffer, req.file.originalname),
      ...detection,
    })
  } catch (error) {
    if (error instanceof UnsupportedFileError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof NoTextFoundError) {
      res.status(422).json({ error: error.message })
      return
    }
    console.error('[reviews] extract failed:', error)
    res.status(502).json({ error: 'Could not read that file. Please try pasting the text instead.' })
  }
})

// Detection on pasted text, without storing anything. Same answer the upload
// path gives, so the confirmation strip reads identically however the
// document arrived.
reviewsRouter.post('/detect', (req, res) => {
  const { text } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  res.json(detectDocType(text))
})

reviewsRouter.get('/', async (req, res) => {
  const { saved } = req.query
  const rows = await prisma.review.findMany({
    where: { userId: req.user!.userId, ...(saved === 'true' ? { saved: true } : {}) },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  })
  res.json(rows.map(toReview))
})

reviewsRouter.get('/:id', async (req, res) => {
  const row = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: SELECT,
  })
  if (!row) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(toReview(row))
})

reviewsRouter.post('/', async (req, res) => {
  const { text, docType, sourceKind, fileName, pageCount, classProfileId } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  const originalText = text.trim().slice(0, MAX_DOCUMENT_CHARS)
  const detection = detectDocType(originalText, typeof fileName === 'string' ? fileName : null)
  // A type the teacher already corrected wins over detection — they looked at
  // their own document.
  const chosen = isDocType(docType) ? docType : detection.docType

  // A prep that is not this teacher's is ignored rather than refused: the
  // class only grounds the timing and grade-level judgments, so a bad id is
  // worth nothing and never worth failing an upload over.
  const prep =
    typeof classProfileId === 'string'
      ? await prisma.classProfile.findFirst({
          where: { id: classProfileId, userId: req.user!.userId },
          select: { id: true },
        })
      : null

  const created = await prisma.review.create({
    data: {
      userId: req.user!.userId,
      docType: chosen,
      detectedType: detection.docType,
      docTypeConfirmed: isDocType(docType),
      sourceKind: sourceKind === 'paste' || sourceKind === 'photo' ? sourceKind : 'file',
      fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 200) : null,
      pageCount: Number.isInteger(pageCount) ? (pageCount as number) : null,
      originalText,
      classProfileId: prep?.id ?? null,
      lenses: defaultLensesFor(chosen),
      edits: [],
    },
    select: SELECT,
  })
  res.status(201).json({ ...toReview(created), detectionConfident: detection.confident })
})

// Confirming or correcting the type, toggling lenses, saving.
//
// Correcting the type swaps in that type's own lens set — the findings a
// quiz's lenses produced mean nothing once the teacher says it is a lesson
// plan, and keeping them would leave a result page arguing with its own
// heading.
reviewsRouter.patch('/:id', async (req, res) => {
  const { docType, lenses, saved } = req.body ?? {}
  const existing = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: SELECT,
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const typeChanged = isDocType(docType) && docType !== existing.docType
  const nextType: DocType = isDocType(docType)
    ? docType
    : isDocType(existing.docType)
      ? existing.docType
      : 'assignment'

  const updated = await prisma.review.update({
    where: { id: existing.id },
    data: {
      docType: nextType,
      // Any explicit type in the body means the teacher answered the
      // "Looks like a quiz — right?" question, whether they agreed or not.
      docTypeConfirmed: isDocType(docType) ? true : existing.docTypeConfirmed,
      ...(typeChanged
        ? {
            lenses: defaultLensesFor(nextType),
            oneThing: null,
            edits: [],
            status: 'draft',
            // Prisma writes a JSON null for `null` here; `undefined` is how
            // the rest of this codebase clears a nullable Json column.
            timingBasis: undefined,
          }
        : lenses !== undefined
          ? { lenses: parseLenses(lenses, nextType) }
          : {}),
      ...(typeof saved === 'boolean' ? { saved } : {}),
    },
    select: SELECT,
  })
  res.json(toReview(updated))
})

const RULES = `You are reviewing a document a K-12 teacher made, so they can decide what to change before students see it. You are reading the document and nothing else.

Write in plain text only — no markdown.

How to be useful here:
- Be specific to THIS document. Quote its actual words. A note that would fit any document of this kind is worth nothing.
- Lead with what is working, and mean it — not as a cushion, but because a teacher needs to know what to protect when they start editing.
- One clear problem beats five hedged ones.
- Never imply the teacher was careless, naive, or should have known. They are showing you unfinished work on purpose.
- You cannot see the students, last week, or what the teacher will say out loud while running this. Where the page is genuinely ambiguous, say what you cannot tell rather than guessing.
- Never invent a standard, a page number, or a sentence the document does not contain.
${CORE_COACHING_RULES}`

/// The one-thing card, the per-lens findings, and the edits.
function buildRunPrompt(docType: DocType, lensKeys: string[], classLine: string | null): string {
  const lensBlocks = lensKeys
    .map((key, i) => `<lens_${i + 1} key="${key}">\n${LENSES[key].label}: ${LENSES[key].instruction}\n</lens_${i + 1}>`)
    .join('\n')

  return `${RULES}

This document is a ${DOC_TYPE_LABELS[docType].toLowerCase()}.${classLine ? `\nIt is for this class: ${classLine}. Judge grade-level fit and timing against that room.` : '\nThe teacher has not said which class this is for, so do not assume a grade level — say what you cannot tell.'}

Respond with exactly these sections and nothing outside them.

<one_thing>
If the teacher changes one thing, what should it be? One or two sentences, naming the specific part of the document. This is the first thing they will read, so it has to be the single highest-value change — not the easiest one, and not a summary of everything below.
</one_thing>

Then one block per lens, using the exact tag names given:
${lensBlocks}

<edits>
Specific text replacements, as a JSON array and nothing else. Each entry:
{"anchor": "...", "revision": "...", "why": "...", "lens": "<the lens key this came from>"}

Rules that matter more than the content:
- "anchor" MUST be a verbatim substring of the document, copied exactly, character for character. If you cannot copy it exactly, leave the edit out.
- Keep the anchor short — the sentence or phrase being replaced, not a paragraph around it.
- "revision" is what that text should become, in the teacher's own register.
- "why" is one sentence. An edit without a reason is not offered to the teacher.
- Never anchor two edits to overlapping text.
- Offer at most 6. Fewer, better-chosen edits are more useful than a marked-up page.
- These are suggestions the teacher accepts or declines one at a time. Do not rewrite the document.
</edits>

<timing>
Only if a lens above estimated time. A JSON object: {"minutes": [low, high], "assumption": "..."}. Never a single number — a bare figure reads as a measurement. If no lens estimated time, output the word none.
</timing>

<topic>
Which ONE of these this document is most about. Output the value exactly, or the word none.
${TOPICS.filter((t) => t.value !== 'something_else')
  .map((t) => `${t.value} — ${t.blurb}`)
  .join('\n')}
</topic>`
}

reviewsRouter.post('/:id/run', async (req, res) => {
  const userId = req.user!.userId
  const existing = await prisma.review.findFirst({ where: { id: req.params.id, userId }, select: SELECT })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const docType = isDocType(existing.docType) ? existing.docType : 'assignment'
  const lenses = parseLenses(existing.lenses, docType)
  const onKeys = lenses.filter((l) => l.on).map((l) => l.key)
  if (onKeys.length === 0) {
    res.status(400).json({ error: 'Turn on at least one lens to review this.' })
    return
  }

  const denied = await checkAndLogUsage(userId, 'review_document')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const prep = existing.classProfileId
    ? await prisma.classProfile.findFirst({ where: { id: existing.classProfileId, userId } })
    : null

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      // Same trap as lessonPlans and attempts: this model defaults to adaptive
      // extended thinking out of the same budget, and a dense document spent
      // all of it thinking and returned no text at all.
      thinking: { type: 'disabled' },
      system: buildRunPrompt(docType, onKeys, prep ? describeClassContext(prep) : null),
      messages: [{ role: 'user', content: existing.originalText }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'reviews.run')

    if (!text.trim()) {
      console.error('[reviews] empty completion; stop_reason:', response.stop_reason)
      res.status(502).json({ error: 'Could not read that through. Please try again.' })
      return
    }

    const withFindings = lenses.map((lens) => {
      if (!lens.on) return lens
      const index = onKeys.indexOf(lens.key)
      return { ...lens, finding: extractTag(text, `lens_${index + 1}`) ?? lens.finding ?? null }
    })

    // An edit list that will not parse is dropped rather than failing the
    // whole review — the lens findings are the bulk of the value, and a
    // teacher would rather read them with no suggested edits than see an
    // error.
    let edits: ReviewEdit[] = []
    const rawEdits = extractTag(text, 'edits')
    if (rawEdits) {
      try {
        edits = parseEdits(JSON.parse(rawEdits))
      } catch {
        console.warn('[reviews] edits block was not valid JSON; continuing without edits')
      }
    }
    // An anchor the model could not copy exactly is unusable as a diff, and
    // showing it would mean rendering a strikethrough over text the teacher
    // never wrote. Dropped here rather than at display time.
    edits = edits.filter((e) => existing.originalText.includes(e.anchor))

    const rawTiming = extractTag(text, 'timing')
    let timingBasis = null
    if (rawTiming && rawTiming.trim().toLowerCase() !== 'none') {
      try {
        timingBasis = parseTimingBasis(JSON.parse(rawTiming))
      } catch {
        timingBasis = null
      }
    }

    const updated = await prisma.review.update({
      where: { id: existing.id },
      data: {
        lenses: withFindings,
        oneThing: extractTag(text, 'one_thing'),
        edits,
        timingBasis: timingBasis ?? undefined,
        focusArea: existing.focusArea ?? findTopic(extractTag(text, 'topic'))?.value ?? null,
        status: 'reviewed',
      },
      select: SELECT,
    })
    res.json(toReview(updated))
  } catch (error) {
    console.error('[reviews] run failed:', error)
    res.status(502).json({ error: 'Could not read that through. Please try again.' })
  }
})

// "Keep mine" / "Use this" on one edit.
reviewsRouter.patch('/:id/edits/:editId', async (req, res) => {
  const { status } = req.body ?? {}
  if (!isEditStatus(status)) {
    res.status(400).json({ error: 'status must be pending, accepted, or kept_mine' })
    return
  }
  const existing = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: SELECT,
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const edits = parseEdits(existing.edits)
  if (!edits.some((e) => e.id === req.params.editId)) {
    res.status(404).json({ error: 'Edit not found' })
    return
  }
  const updated = await prisma.review.update({
    where: { id: existing.id },
    data: { edits: setEditStatus(edits, req.params.editId, status) },
    select: SELECT,
  })
  res.json(toReview(updated))
})

// The document as it stands: the teacher's original with accepted edits
// applied and nothing else. What the export button downloads.
reviewsRouter.get('/:id/document', async (req, res) => {
  const existing = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: SELECT,
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const edits = parseEdits(existing.edits)
  res.json({
    text: applyAcceptedEdits(existing.originalText, edits),
    acceptedCount: acceptedCount(edits),
    label: exportLabel(edits),
  })
})

// "Redesign for meaningful AI use" — an action from an assignment's result
// rather than a tool of its own.
//
// Hands off to the existing Assignment Coach redesign workspace, pre-seeded
// with this document, instead of reimplementing it: that flow already has the
// AI-use levels, the strategies output and the export path, and a second
// implementation would drift from it immediately.
reviewsRouter.post('/:id/redesign-ai', async (req, res) => {
  const userId = req.user!.userId
  const existing = await prisma.review.findFirst({ where: { id: req.params.id, userId } })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  // Offered only where it means something. A lesson plan or a parent message
  // has no student work for a chatbot to do.
  if (!['assignment', 'homework', 'project', 'quiz'].includes(existing.docType)) {
    res.status(400).json({ error: 'Redesigning for AI use only applies to student work.' })
    return
  }

  const prep = existing.classProfileId
    ? await prisma.classProfile.findFirst({ where: { id: existing.classProfileId, userId } })
    : null

  const session = await prisma.assignmentCoachSession.create({
    data: {
      userId,
      mode: 'redesign_ai',
      assignmentType: existing.docType === 'quiz' ? 'assessment' : existing.docType,
      originalText: existing.originalText,
      liveAssignmentText: existing.originalText,
      gradeLevel: prep?.gradeBand ?? null,
      subject: prep?.subject ?? null,
      title: existing.fileName,
    },
    select: { id: true },
  })
  res.status(201).json({ assignmentCoachSessionId: session.id })
})

reviewsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.review.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: { id: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  await prisma.review.delete({ where: { id: existing.id } })
  res.json({ ok: true })
})
