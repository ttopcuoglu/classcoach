import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'

export const profileRouter = Router()

// No auth in v1 — a single local profile row represents "the teacher using
// this install." Created lazily on first read.
async function getOrCreateProfile() {
  const existing = await prisma.userProfile.findFirst()
  if (existing) return existing
  return prisma.userProfile.create({ data: {} })
}

profileRouter.get('/', async (_req, res) => {
  const profile = await getOrCreateProfile()
  res.json(profile)
})

profileRouter.put('/', async (req, res) => {
  const { name, gradeLevels, subjects } = req.body ?? {}
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' })
    return
  }
  if (gradeLevels !== undefined && typeof gradeLevels !== 'string') {
    res.status(400).json({ error: 'gradeLevels must be a string' })
    return
  }
  if (subjects !== undefined && typeof subjects !== 'string') {
    res.status(400).json({ error: 'subjects must be a string' })
    return
  }

  const profile = await getOrCreateProfile()
  const updated = await prisma.userProfile.update({
    where: { id: profile.id },
    data: { name, gradeLevels, subjects },
  })
  res.json(updated)
})
