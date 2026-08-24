import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { prisma } from '../lib/prisma.ts'
import { pickCategory, pickGradeBand } from '../lib/scenarioCategories.ts'

export const scenariosRouter = Router()

const SCENARIO_SYSTEM_PROMPT = `You write realistic classroom management scenarios so grades 6-12 teachers can practice responding to them.

Rules:
- Write 2-4 sentences. Be concrete and specific — a short, realistic dialogue snippet helps.
- Stay to everyday classroom management challenges. Never include weapons, abuse, self-harm, or other extreme/rare situations.
- Vary the tone, difficulty, and specific situation each time, within the given category and grade band.
- Never include real, identifiable people — use generic descriptions like "a student" or "two students."
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
  const { category, gradeBand } = req.body ?? {}
  const chosenCategory = pickCategory(category)
  const chosenGradeBand = pickGradeBand(gradeBand)

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: SCENARIO_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Category: ${chosenCategory}\nGrade band: ${chosenGradeBand}` },
      ],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const scenario = await prisma.scenario.create({
      data: { text, category: chosenCategory, gradeBand: chosenGradeBand, source: 'generated' },
    })
    res.status(201).json(scenario)
  } catch (error) {
    console.error('[scenarios] generate failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
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

// For seeding the curated fallback bank.
scenariosRouter.post('/', async (req, res) => {
  const { text, category, gradeBand, source } = req.body ?? {}
  if (
    typeof text !== 'string' ||
    typeof category !== 'string' ||
    typeof gradeBand !== 'string' ||
    typeof source !== 'string'
  ) {
    res.status(400).json({ error: 'text, category, gradeBand, and source are required strings' })
    return
  }
  const scenario = await prisma.scenario.create({ data: { text, category, gradeBand, source } })
  res.status(201).json(scenario)
})
