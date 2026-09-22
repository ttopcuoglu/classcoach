import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'
import { getBotUsername, telegramEnabled, type TelegramUpdate } from '../lib/telegram.ts'
import { createLinkCode, dispatchUpdate, unlinkTelegram } from '../lib/telegramCoach.ts'

// Signed-in teacher's Telegram connection, for Profile.
export const telegramRouter = Router()

telegramRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { telegramChatId: true, telegramLinkedAt: true },
  })
  res.json({ available: telegramEnabled(), linked: Boolean(user?.telegramChatId), linkedAt: user?.telegramLinkedAt ?? null })
})

// A one-time t.me link. Opening it in Telegram sends "/start <code>" to the
// bot, which ties that chat to this account.
telegramRouter.post('/link', async (req, res) => {
  if (!telegramEnabled()) {
    res.status(503).json({ error: 'Telegram is not available right now.' })
    return
  }
  try {
    const [code, username] = await Promise.all([createLinkCode(req.user!.userId), getBotUsername()])
    res.json({ url: `https://t.me/${username}?start=${code}` })
  } catch (error) {
    console.error('[telegram] creating a link failed:', error)
    res.status(502).json({ error: 'Could not reach Telegram. Please try again.' })
  }
})

telegramRouter.delete('/link', async (req, res) => {
  await unlinkTelegram(req.user!.userId)
  res.json({ linked: false })
})

// Public: Telegram's own servers post every message here. The secret header
// is the one registered with setWebhook, so nobody else can post fake
// messages. Answers at once and handles the message after — Telegram
// re-sends anything it doesn't see acknowledged quickly, and a Claude reply
// takes a few seconds.
export const telegramWebhookRouter = Router()

function secretMatches(given: unknown): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

telegramWebhookRouter.post('/', (req, res) => {
  if (!telegramEnabled() || !secretMatches(req.get('x-telegram-bot-api-secret-token'))) {
    res.sendStatus(401)
    return
  }
  res.sendStatus(200)
  const update = req.body as TelegramUpdate
  if (typeof update?.update_id === 'number') dispatchUpdate(update)
})
