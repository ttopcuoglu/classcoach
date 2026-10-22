import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { extractInChild } from '../lib/extractInChild.ts'
import { sendExtractionError } from '../lib/extractHttp.ts'
import {
  MAX_NAME,
  parseTemplateRead,
  READ_TEMPLATE_PROMPT,
  readCadence,
  sanitizeSections,
} from '../lib/lessonTemplateModel.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'
import { listTemplatesFor, loadTemplateOwner, type TemplateOwner } from '../lib/lessonTemplates.ts'

// Lesson plan formats: a school's, managed by its org admins, and a teacher's
// own. Reading an upload proposes sections and saves nothing; the person
// checks them on the review screen and only then creates the template.

export const lessonTemplatesRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

/// A template form is a page or two. Anything past this is an example plan
/// with its content filled in, and the content is not what is being read.
const MAX_TEMPLATE_CHARS = 15_000

function canManageSchool(owner: TemplateOwner): boolean {
  return !!owner.organizationId && (owner.role === 'org_admin' || owner.role === 'superadmin')
}

lessonTemplatesRouter.get('/', async (req, res) => {
  const owner = await loadTemplateOwner(req.user!.userId)
  if (!owner) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  const { personal, school, defaultId } = await listTemplatesFor(owner)
  res.json({
    personal,
    school,
    schoolName: owner.organizationName,
    canManageSchool: canManageSchool(owner),
    defaultId,
  })
})

lessonTemplatesRouter.post('/read', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received' })
    return
  }

  let text: string
  try {
    text = (await extractInChild(req.file.buffer, req.file.originalname)).text
  } catch (error) {
    if (sendExtractionError(res, error, 'lesson-templates', req.file)) return
    console.error('[lesson-templates] reading the file failed:', error)
    res.status(502).json({ error: 'Could not read that file. Try a Word document or a PDF.' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'lesson_template_read')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      thinking: { type: 'disabled' },
      system: READ_TEMPLATE_PROMPT,
      messages: [{ role: 'user', content: text.trim().slice(0, MAX_TEMPLATE_CHARS) }],
    })
    const responseText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const read = parseTemplateRead(responseText)
    if (read.sections.length === 0) {
      res.status(422).json({
        error: read.note ?? "That doesn't look like a lesson plan template. Try the blank form your school hands out.",
      })
      return
    }
    res.json({ ...read, sourceFileName: req.file.originalname })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not read that template')
    logModelFailure('[lesson-templates] read failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

function readName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_NAME) : null
}

lessonTemplatesRouter.post('/', async (req, res) => {
  const owner = await loadTemplateOwner(req.user!.userId)
  if (!owner) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  const { scope, name, cadence, sections, sourceFileName } = req.body ?? {}
  if (scope !== 'school' && scope !== 'personal') {
    res.status(400).json({ error: 'scope must be "school" or "personal"' })
    return
  }
  if (scope === 'school' && !canManageSchool(owner)) {
    res.status(403).json({ error: "Only your school's Wivoza admins can set its lesson plan format." })
    return
  }
  const cleanName = readName(name)
  const cleanSections = sanitizeSections(sections)
  if (!cleanName || !cleanSections) {
    res.status(400).json({ error: 'A format needs a name and at least one section.' })
    return
  }

  const ownerWhere = scope === 'school' ? { organizationId: owner.organizationId! } : { userId: owner.id }
  // The first format an owner saves is the one their lessons use; any later
  // one waits until it is picked.
  const hasDefault = await prisma.lessonTemplate.count({ where: { ...ownerWhere, archivedAt: null, isDefault: true } })

  const created = await prisma.lessonTemplate.create({
    data: {
      ...ownerWhere,
      createdByUserId: owner.id,
      name: cleanName,
      cadence: readCadence(cadence),
      sections: cleanSections,
      sourceFileName: typeof sourceFileName === 'string' ? sourceFileName.slice(0, 200) : null,
      isDefault: hasDefault === 0,
    },
  })
  res.status(201).json(created)
})

/// The template, if this person may change it: their own, or their school's
/// when they manage the school.
async function editableTemplate(owner: TemplateOwner, id: string) {
  const template = await prisma.lessonTemplate.findFirst({ where: { id, archivedAt: null } })
  if (!template) return null
  if (template.userId && template.userId === owner.id) return template
  if (template.organizationId && template.organizationId === owner.organizationId && canManageSchool(owner)) return template
  return null
}

lessonTemplatesRouter.patch('/:id', async (req, res) => {
  const owner = await loadTemplateOwner(req.user!.userId)
  if (!owner) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  const template = await editableTemplate(owner, String(req.params.id))
  if (!template) {
    res.status(404).json({ error: 'Lesson plan format not found' })
    return
  }

  const { name, cadence, sections, isDefault } = req.body ?? {}
  const data: { name?: string; cadence?: string; sections?: object; isDefault?: boolean } = {}
  if (name !== undefined) {
    const cleanName = readName(name)
    if (!cleanName) {
      res.status(400).json({ error: 'A format needs a name.' })
      return
    }
    data.name = cleanName
  }
  if (cadence !== undefined) data.cadence = readCadence(cadence)
  if (sections !== undefined) {
    const cleanSections = sanitizeSections(sections)
    if (!cleanSections) {
      res.status(400).json({ error: 'A format needs at least one section.' })
      return
    }
    data.sections = cleanSections
  }
  if (typeof isDefault === 'boolean') data.isDefault = isDefault

  const ownerWhere = template.organizationId ? { organizationId: template.organizationId } : { userId: template.userId! }
  const updated = await prisma.$transaction(async (tx) => {
    // One default per owner: making this one the default unsets the other.
    if (data.isDefault) {
      await tx.lessonTemplate.updateMany({ where: { ...ownerWhere, isDefault: true, NOT: { id: template.id } }, data: { isDefault: false } })
    }
    return tx.lessonTemplate.update({ where: { id: template.id }, data })
  })
  res.json(updated)
})

/// Archived, not deleted: lessons already laid out in it keep their own copy
/// of its sections, and an archived row costs nothing.
lessonTemplatesRouter.delete('/:id', async (req, res) => {
  const owner = await loadTemplateOwner(req.user!.userId)
  if (!owner) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  const template = await editableTemplate(owner, String(req.params.id))
  if (!template) {
    res.status(404).json({ error: 'Lesson plan format not found' })
    return
  }
  await prisma.lessonTemplate.update({ where: { id: template.id }, data: { archivedAt: new Date(), isDefault: false } })
  res.status(204).end()
})
