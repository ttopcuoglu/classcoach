import { Router } from 'express'
import { snoozedCheckInDate } from '../lib/followUps.ts'
import { prisma } from '../lib/prisma.ts'

export const followUpsRouter = Router()

const FOLLOW_UP_SELECT = {
  id: true,
  plan: true,
  checkInQuestion: true,
  dueAt: true,
  status: true,
  createdAt: true,
  sourceDebriefId: true,
} as const

// Check-ins that are due now, newest plan first. Home shows the first one.
followUpsRouter.get('/due', async (req, res) => {
  const followUps = await prisma.coachFollowUp.findMany({
    where: { userId: req.user!.userId, status: 'pending', dueAt: { lte: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: FOLLOW_UP_SELECT,
  })
  res.json(followUps)
})

// Superadmin-only test switch: makes the caller's own pending check-ins due
// immediately, so the flow can be tried without waiting three days. Never
// touches anyone else's.
followUpsRouter.post('/test/due-now', async (req, res) => {
  if (req.user!.role !== 'superadmin') {
    res.status(403).json({ error: 'Superadmin access required' })
    return
  }
  const { count } = await prisma.coachFollowUp.updateMany({
    where: { userId: req.user!.userId, status: 'pending' },
    data: { dueAt: new Date() },
  })
  res.json({ count })
})

// "Don't check in on this" on a takeaway — the client knows the conversation,
// not the check-in, so it's addressed by source conversation.
followUpsRouter.post('/by-debrief/:debriefId/dismiss', async (req, res) => {
  const { count } = await prisma.coachFollowUp.updateMany({
    where: { sourceDebriefId: req.params.debriefId, userId: req.user!.userId, status: 'pending' },
    data: { status: 'dismissed' },
  })
  res.json({ count })
})

followUpsRouter.get('/:id', async (req, res) => {
  const followUp = await prisma.coachFollowUp.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: FOLLOW_UP_SELECT,
  })
  if (!followUp) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }
  res.json(followUp)
})

// "Remind me later" moves the check-in a couple of days out; "dismiss" drops it.
followUpsRouter.patch('/:id', async (req, res) => {
  const { action } = req.body ?? {}
  if (action !== 'snooze' && action !== 'dismiss') {
    res.status(400).json({ error: 'action must be "snooze" or "dismiss"' })
    return
  }
  const existing = await prisma.coachFollowUp.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }
  const updated = await prisma.coachFollowUp.update({
    where: { id: existing.id },
    // A snoozed check-in goes out on Telegram again when it next comes due.
    data: action === 'snooze' ? { dueAt: snoozedCheckInDate(), telegramSentAt: null } : { status: 'dismissed' },
    select: FOLLOW_UP_SELECT,
  })
  res.json(updated)
})
