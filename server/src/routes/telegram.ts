import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma.ts'
import { getBotUsername, getWebhookInfo, telegramEnabled, type TelegramUpdate } from '../lib/telegram.ts'
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
    const url = `https://t.me/${username}?start=${code}`
    // On a computer, scanning this with a phone camera opens the link
    // straight in the Telegram app, which is where teachers actually chat.
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 480 })
    res.json({ url, qr })
  } catch (error) {
    console.error('[telegram] creating a link failed:', error)
    res.status(502).json({ error: 'Could not reach Telegram. Please try again.' })
  }
})

// Why this exists: messages were arriving and button presses were not,
// which from the outside is indistinguishable between "the webhook isn't
// allowed to send callback_query", "the bot is erroring on them" and
// "the buttons are wrong". Only Telegram knows the first one, and this is
// the only way to ask it from a running deploy.
//
// Signed-in only, and deliberately nothing secret: the webhook URL is
// already guessable, and the secret lives in a header rather than here.
telegramRouter.get('/webhook-info', async (_req, res) => {
  if (!telegramEnabled()) {
    res.status(503).json({ error: 'Telegram is not configured on this deploy.' })
    return
  }
  try {
    const info = await getWebhookInfo()
    res.json({
      url: info.url,
      allowedUpdates: info.allowed_updates ?? '(default — every type except chat_member)',
      // The giveaway for the case this was written for.
      deliversButtonPresses: info.allowed_updates == null || info.allowed_updates.includes('callback_query'),
      pendingUpdates: info.pending_update_count,
      lastError: info.last_error_message ?? null,
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    })
  } catch (error) {
    console.error('[telegram] getWebhookInfo failed:', error)
    res.status(502).json({ error: 'Could not reach Telegram.' })
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
