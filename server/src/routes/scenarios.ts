import { Router } from 'express'
import { pickWeightedCategory, pickWeightedDifficulty } from '../lib/adaptivePractice.ts'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { getCuratedFallback } from '../lib/curatedFallback.ts'
import { prisma } from '../lib/prisma.ts'
import { pickDifficulty, pickGradeBand } from '../lib/scenarioCategories.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const scenariosRouter = Router()

const SCENARIO_SYSTEM_PROMPT = `You write realistic classroom management scenarios so grades 6-12 teachers can practice responding to them.

Rules:
- Write 2-4 sentences. Be concrete and specific — a short, realistic dialogue snippet helps.
- Stay to everyday classroom management challenges. Never include weapons, abuse, self-harm, or other extreme/rare situations.
- Vary the tone and specific situation each time, within the given category and grade band.
- Never include real, identifiable people — use generic descriptions like "a student" or "two students."
- Match the requested difficulty: "beginner" scenarios have a single clear behavior with an obvious response; "intermediate" scenarios add some ambiguity or a mildly reluctant student; "advanced" scenarios have competing considerations (multiple students, conflicting needs, or a defiance layer stacked on the core issue).
- If a subject is given, set the scenario in a context that fits it (e.g. a science lab, a math worksheet, an English discussion) rather than a generic classroom.
- Respond with ONLY the scenario text. No title, label, or preamble.`

scenariosRouter.get('/', async (req, res) => {
  const { category, gradeBand } = req.query
  const scenarios = await prisma.scenario.findMany({
    where: {
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof gradeBand === 'string' ? { gradeBand } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(scenarios)
})

scenariosRouter.post('/generate', async (req, res) => {
  const { category, gradeBand, difficulty, subject } = req.body ?? {}
  const chosenCategory = await pickWeightedCategory(req.user!.userId, category)
  const chosenGradeBand = pickGradeBand(gradeBand)
  const chosenDifficulty = await pickWeightedDifficulty(req.user!.userId, chosenCategory, difficulty)
  const chosenSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : null

  const allowed = await checkAndLogUsage(req.user!.userId, 'scenario_generate')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = [
      `Category: ${chosenCategory}`,
      `Grade band: ${chosenGradeBand}`,
      `Difficulty: ${chosenDifficulty}`,
      chosenSubject ? `Subject: ${chosenSubject}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: SCENARIO_SYSTEM_PROMPT,
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
        category: chosenCategory,
        gradeBand: chosenGradeBand,
        difficulty: chosenDifficulty,
        source: 'generated',
      },
    })
    res.status(201).json(scenario)
  } catch (error) {
    console.error('[scenarios] generate failed, falling back to curated bank:', error)
    const fallback = await getCuratedFallback(chosenCategory, chosenGradeBand, chosenDifficulty)
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
  const { text, category, gradeBand, difficulty, source } = req.body ?? {}
  if (
    typeof text !== 'string' ||
    typeof category !== 'string' ||
    typeof gradeBand !== 'string' ||
    typeof source !== 'string'
  ) {
    res.status(400).json({ error: 'text, category, gradeBand, and source are required strings' })
    return
  }
  const scenario = await prisma.scenario.create({
    data: { text, category, gradeBand, source, difficulty: pickDifficulty(difficulty) },
  })
  res.status(201).json(scenario)
})
