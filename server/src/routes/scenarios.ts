import { Router } from 'express'
import { pickWeightedCategory, pickWeightedDifficulty, pickWeightedFocusArea } from '../lib/adaptivePractice.ts'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { getCuratedFallback } from '../lib/curatedFallback.ts'
import { findFocusArea, focusAreaForSubCategory } from '../lib/focusAreas.ts'
import { scenarioAreaBlock } from '../lib/focusAreaPrompt.ts'
import { prisma } from '../lib/prisma.ts'
import { pickDifficulty, pickGradeBand } from '../lib/scenarioCategories.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const scenariosRouter = Router()

// The one prompt in this feature that genuinely differs per area rather than
// swapping a noun: what a practice scenario physically IS changes from a room
// that has stopped following an explanation, to a misconception in a student's
// own words, to a piece of student work near a rubric boundary, to the text of
// a parent email, to a line a co-teacher said. The shared rules below hold
// across all six; `scenarioAreaBlock` supplies the rest.
const SCENARIO_RULES = `You write realistic practice scenarios so K-12 teachers can rehearse responding to them, in a safe place, before they face the real thing.

Rules that always hold:
- Write 2-5 sentences. Be concrete and specific — real quoted words beat description.
- Put the teacher in the moment, facing a decision. Never write a general question, a tip, or a topic heading.
- Never include real, identifiable people — use generic descriptions like "a student", "a parent", "your co-teacher".
- Vary the tone and specifics each time, within the given area, sub-category, and grade band.
- Never include the answer, a hint, or a judgment about what the teacher should do.
- Respond with ONLY the scenario text. No title, label, or preamble.`

scenariosRouter.get('/', async (req, res) => {
  const { focusArea, category, gradeBand } = req.query
  const scenarios = await prisma.scenario.findMany({
    where: {
      ...(typeof focusArea === 'string' ? { focusArea } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof gradeBand === 'string' ? { gradeBand } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(scenarios)
})

scenariosRouter.post('/generate', async (req, res) => {
  const { focusArea, category, gradeBand, difficulty, subject } = req.body ?? {}
  const chosenArea = await pickWeightedFocusArea(req.user!.userId, focusArea)
  const chosenCategory = await pickWeightedCategory(req.user!.userId, chosenArea.value, category)
  const chosenGradeBand = pickGradeBand(gradeBand)
  const chosenDifficulty = await pickWeightedDifficulty(req.user!.userId, chosenCategory, difficulty)
  const chosenSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : null

  const allowed = await checkAndLogUsage(req.user!.userId, 'scenario_generate')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const subCategoryLabel =
      chosenArea.subCategories.find((c) => c.value === chosenCategory)?.label ?? chosenCategory
    const context = [
      `Sub-category: ${chosenCategory} (${subCategoryLabel})`,
      `Grade band: ${chosenGradeBand}`,
      `Difficulty: ${chosenDifficulty}`,
      chosenSubject ? `Subject: ${chosenSubject}` : null,
      chosenSubject
        ? 'Set the scenario in this subject — its content, its room, its materials — not a generic classroom.'
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: `${SCENARIO_RULES}\n\n${scenarioAreaBlock(chosenArea)}`,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const scenario = await prisma.scenario.create({
      data: {
        text,
        focusArea: chosenArea.value,
        category: chosenCategory,
        gradeBand: chosenGradeBand,
        subject: chosenSubject,
        difficulty: chosenDifficulty,
        source: 'generated',
      },
    })
    res.status(201).json(scenario)
  } catch (error) {
    console.error('[scenarios] generate failed, falling back to curated bank:', error)
    const fallback = await getCuratedFallback(chosenArea.value, chosenCategory, chosenGradeBand, chosenDifficulty)
    if (!fallback) {
      res.status(502).json({ error: 'Claude request failed' })
      return
    }
    res.json({ ...fallback, fallback: true })
  }
})

scenariosRouter.get('/:id', async (req, res) => {
  const scenario = await prisma.scenario.findUnique({ where: { id: req.params.id } })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  res.json(scenario)
})

scenariosRouter.post('/', async (req, res) => {
  const { text, focusArea, category, gradeBand, subject, difficulty, source } = req.body ?? {}
  if (
    typeof text !== 'string' ||
    typeof category !== 'string' ||
    typeof gradeBand !== 'string' ||
    typeof source !== 'string'
  ) {
    res.status(400).json({ error: 'text, category, gradeBand, and source are required strings' })
    return
  }
  // The area is derivable from the category, so callers don't have to send it.
  const area = findFocusArea(focusArea) ?? focusAreaForSubCategory(category)
  const scenario = await prisma.scenario.create({
    data: {
      text,
      focusArea: area?.value ?? null,
      category,
      gradeBand,
      subject: typeof subject === 'string' && subject.trim() ? subject.trim() : null,
      source,
      difficulty: pickDifficulty(difficulty),
    },
  })
  res.status(201).json(scenario)
})
