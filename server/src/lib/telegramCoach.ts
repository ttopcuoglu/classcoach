// Talk It Through over Telegram: a teacher types to Coach in a Telegram chat
// and gets the same Coach as the app — same rules, memory, usage limits and
// check-ins — with every conversation saved to their Talk It Through history
// (source "talk_to_me", channel "telegram").
//
// Text only. The app's version is spoken, so its prompt is tuned for being
// read aloud; this one keeps the persona and the one-idea-per-reply pacing
// but writes like a message.
//
// A chat is tied to one Wivoza account by a one-time link from Profile
// (POST /api/telegram/link → t.me/<bot>?start=<code>). Messages continue the
// current conversation until it has been quiet for a few hours, gets a
// takeaway (/done), or the teacher sends /new.

import { randomBytes } from 'node:crypto'
import type { CoachFollowUp, Debrief } from '../generated/prisma/client.ts'
import { generateTalkTakeaway, trimIfTruncated } from '../routes/debrief.ts'
import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { hasActivePlanFor, PLAN_USER_SELECT } from './billing.ts'
import { appendTurn, countUserTurns, TALK_TURN_CAP, toClaudeMessages, type ChatMessage } from './coachingChat.ts'
import { applyMemoryUpdate, buildMemoryContextBlock, MEMORY_UPDATE_INSTRUCTION, MEMORY_UPDATE_TOKEN_BUFFER } from './coachMemory.ts'
import { CORE_COACHING_RULES } from './coachPersona.ts'
import { flagIfUnsafe } from './coachSafetyCheck.ts'
import { buildExperienceContextBlock } from './experience.ts'
import { buildFollowUpContextBlock, snoozedCheckInDate } from './followUps.ts'
import { extractTag, stripTag } from './extractTag.ts'
import { prisma } from './prisma.ts'
import {
  deleteWebhook,
  getUpdates,
  isChatGone,
  sendMessage,
  sendTyping,
  setMyCommands,
  setWebhook,
  telegramEnabled,
  type TelegramUpdate,
} from './telegram.ts'
import { checkUsage, logUsage } from './usageLimit.ts'

const APP_URL = process.env.APP_URL ?? 'https://www.wivoza.com'

// A conversation quiet this long is over; the next message starts a new one.
const CONVERSATION_IDLE_MS = 3 * 60 * 60 * 1000
const LINK_CODE_TTL_MS = 15 * 60 * 1000
// Room for two or three short sentences — a message, not a spoken line.
const REPLY_MAX_TOKENS = 220

export const TALK_TEXT_SYSTEM_PROMPT = `You are Coach, a warm, practical coach for K-12 teachers — for classroom management, but just as much for the day-to-day workload, stress, and overwhelm of teaching — chatting with a teacher by text message, often in the few minutes between classes or at the end of a long day. Keep every reply short: one to three sentences, like a thoughtful colleague texting back. Give exactly ONE concrete idea, suggestion, or next step per reply — never a list, never "first... second..." If you have more than one idea, share the single most useful one now and save the rest for later if they want more. Ask at most one question, and only when you genuinely need more information to help. Skip generic openers like "That's a great question" or "I hear you"; a brief, genuine reaction that fits ("Oof, that's a lot." "Oh, nice!") is fine, then go straight to the substance. Match their tone: gentler when they're stressed or discouraged, a little brighter when something went well, never falsely cheerful about something hard. Plain text only — no markdown, no bullet points, no emoji. Stay grounded in what the teacher has actually said; never invent details.
${CORE_COACHING_RULES}`

const COMMANDS = [
  { command: 'done', description: 'Wrap up and get your takeaway' },
  { command: 'new', description: 'Start a fresh conversation' },
  { command: 'help', description: 'How this works' },
  { command: 'disconnect', description: 'Unlink this chat from Wivoza' },
]

const HELP_TEXT = `Talk to me like you'd talk to a colleague after class. Tell me what happened and what's on your mind, and we'll figure out a next step together.

/done: wrap up and get your takeaway (I'll check in a few days later to see how it went)
/new: start a fresh conversation
/disconnect: unlink this chat from your Wivoza account

One ask: please leave out students' full names. "A student in 3rd period" works great.`

const NOT_LINKED_TEXT = `Hi! I'm Coach from Wivoza. To talk with me here, connect this chat to your Wivoza account first: sign in at ${APP_URL}, open Profile, and tap "Connect Telegram." If Telegram doesn't show a Start button, just paste the connect link here.`

const LIMIT_TEXT = "You've reached today's limit for coaching conversations. Let's pick this up tomorrow."
const ERROR_TEXT = "Sorry, I couldn't come up with a reply just now. Please try sending that again."

// ---------------------------------------------------------------------------
// Linking (called from routes/telegram.ts)
// ---------------------------------------------------------------------------

// A fresh one-time code for the "Connect Telegram" link. Telegram's start
// parameter allows [A-Za-z0-9_-] up to 64 characters; base64url fits.
export async function createLinkCode(userId: string): Promise<string> {
  const code = randomBytes(16).toString('base64url')
  await prisma.user.update({
    where: { id: userId },
    data: { telegramLinkToken: code, telegramLinkTokenExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS) },
  })
  return code
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } })
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramLinkedAt: null, telegramDebriefId: null },
  })
  if (user?.telegramChatId) {
    await sendMessage(user.telegramChatId, `This chat is no longer connected to Wivoza. You can reconnect any time from Profile at ${APP_URL}.`).catch(
      () => {},
    )
  }
}

async function linkChat(chatId: string, code: string, firstName: string | undefined) {
  const user = await prisma.user.findFirst({
    where: { telegramLinkToken: code, telegramLinkTokenExpiresAt: { gt: new Date() } },
    select: { id: true, name: true },
  })
  if (!user) {
    await sendMessage(chatId, `That connect link has expired or was already used. Open Profile at ${APP_URL} and tap "Connect Telegram" for a new one.`)
    return
  }
  // A chat belongs to one account; linking it here releases any other.
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: user.id } },
      data: { telegramChatId: null, telegramLinkedAt: null, telegramDebriefId: null },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: chatId,
        telegramLinkedAt: new Date(),
        telegramLinkToken: null,
        telegramLinkTokenExpiresAt: null,
        telegramDebriefId: null,
      },
    }),
  ])
  const name = user.name?.split(' ')[0] || firstName
  await sendMessage(chatId, `You're connected${name ? `, ${name}` : ''}! Your conversations here are saved to Talk It Through in Wivoza.\n\n${HELP_TEXT}`)
}

// ---------------------------------------------------------------------------
// Incoming messages
// ---------------------------------------------------------------------------

// Telegram retries an update it thinks went undelivered, so the same one can
// arrive twice; the last few hundred ids are enough to catch that.
const recentUpdateIds = new Set<number>()

// One chat's messages are handled strictly in order. A teacher who sends
// three quick messages would otherwise get three replies racing to append
// to the same conversation, and two of the turns would be lost.
const chatQueues = new Map<string, Promise<void>>()

export function dispatchUpdate(update: TelegramUpdate): void {
  if (recentUpdateIds.has(update.update_id)) return
  recentUpdateIds.add(update.update_id)
  if (recentUpdateIds.size > 500) recentUpdateIds.delete(recentUpdateIds.values().next().value!)

  const message = update.message
  // Direct messages only — the bot has no business in a group chat.
  if (!message || message.chat.type !== 'private') return
  const chatId = String(message.chat.id)

  const previous = chatQueues.get(chatId) ?? Promise.resolve()
  const next: Promise<void> = previous
    .then(() => handleMessage(chatId, message.text, message.from?.first_name))
    .catch(async (error) => {
      console.error('[telegram] handling a message failed:', error)
      await sendMessage(chatId, ERROR_TEXT).catch(() => {})
    })
    .finally(() => {
      if (chatQueues.get(chatId) === next) chatQueues.delete(chatId)
    })
  chatQueues.set(chatId, next)
}

const USER_SELECT = {
  ...PLAN_USER_SELECT,
  id: true,
  suspendedAt: true,
  coachMemory: true,
  coachMemoryEnabled: true,
  experienceLevel: true,
  telegramDebriefId: true,
} as const

async function handleMessage(chatId: string, rawText: string | undefined, firstName: string | undefined) {
  if (rawText === undefined) {
    await sendMessage(chatId, "I can only read text messages for now. Type it out and I'm all yours.")
    return
  }
  const text = rawText.trim()
  if (!text) return

  // "/start <code>" is what the Connect link sends. Commands may arrive as
  // "/done@WivozaBot" when picked from the menu.
  const [head, ...rest] = text.split(/\s+/)
  const command = head.startsWith('/') ? head.slice(1).split('@')[0].toLowerCase() : null
  if (command === 'start' && rest[0]) {
    await linkChat(chatId, rest[0], firstName)
    return
  }

  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: USER_SELECT })
  if (!user) {
    // Telegram only shows the Start button the first time a chat is opened
    // from a link, so a teacher who messaged the bot before can paste the
    // link (or just its code) instead.
    const pastedCode = text.match(/[?&]start=([A-Za-z0-9_-]{16,64})/)?.[1] ?? (/^[A-Za-z0-9_-]{22}$/.test(text) ? text : null)
    if (pastedCode) await linkChat(chatId, pastedCode, firstName)
    else await sendMessage(chatId, NOT_LINKED_TEXT)
    return
  }
  if (user.suspendedAt) {
    await sendMessage(chatId, "This Wivoza account isn't active right now.")
    return
  }

  // Plain "done" / "new" work too; typing a slash on a phone is fiddly.
  const word = command ?? (/^(done|new)[.!]?$/i.test(text) ? text.replace(/[.!]$/, '').toLowerCase() : null)
  switch (word) {
    case 'start':
    case 'help':
      await sendMessage(chatId, HELP_TEXT)
      return
    case 'new':
      await prisma.user.update({ where: { id: user.id }, data: { telegramDebriefId: null } })
      await sendMessage(chatId, "Fresh start. What's on your mind?")
      return
    case 'done':
      await finishConversation(chatId, user)
      return
    case 'later':
    case 'skip':
      await answerCheckInCommand(chatId, user.id, word)
      return
    case 'disconnect':
      await unlinkTelegram(user.id)
      return
  }
  if (command) {
    await sendMessage(chatId, `I don't know that command. ${HELP_TEXT}`)
    return
  }

  await coachReply(chatId, user, text)
}

type BotUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>
function loadUser(id: string) {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT })
}

function lastActivity(debrief: Debrief): Date {
  const conversation = (debrief.conversation as ChatMessage[] | null) ?? []
  const last = conversation[conversation.length - 1]
  return last ? new Date(last.createdAt) : debrief.createdAt
}

// The conversation this chat is in the middle of, if any.
async function findOpenConversation(user: BotUser): Promise<Debrief | null> {
  if (!user.telegramDebriefId) return null
  const debrief = await prisma.debrief.findFirst({
    where: { id: user.telegramDebriefId, userId: user.id, source: 'talk_to_me' },
  })
  if (!debrief || debrief.talkTakeaway) return null
  if (Date.now() - lastActivity(debrief).getTime() > CONVERSATION_IDLE_MS) return null
  return debrief
}

// The check-in most recently sent to this chat that the teacher hasn't
// answered yet.
function findSentCheckIn(userId: string) {
  return prisma.coachFollowUp.findFirst({
    where: { userId, status: 'pending', telegramSentAt: { not: null } },
    orderBy: { telegramSentAt: 'desc' },
  })
}

// Keeps "typing…" showing while Claude writes; Telegram drops it after ~5s.
function keepTyping(chatId: string): () => void {
  void sendTyping(chatId).catch(() => {})
  const timer = setInterval(() => void sendTyping(chatId).catch(() => {}), 4000)
  return () => clearInterval(timer)
}

async function coachReply(chatId: string, user: BotUser, text: string) {
  let debrief = await findOpenConversation(user)

  // A reply to a check-in Coach sent starts its own conversation, with the
  // plan in the prompt — the same as opening a check-in from Home.
  let followUp: CoachFollowUp | null = null
  const sentCheckIn = await findSentCheckIn(user.id)
  if (sentCheckIn && (!debrief || sentCheckIn.telegramSentAt! > lastActivity(debrief))) {
    followUp = sentCheckIn
    debrief = null
  }

  const existing = (debrief?.conversation as ChatMessage[] | null) ?? []
  if (debrief && countUserTurns(existing) >= TALK_TURN_CAP) {
    await sendMessage(chatId, 'This conversation has reached its length limit. Send /done for your takeaway, or /new to start fresh.')
    return
  }

  const action = debrief ? 'talk_to_me_chat' : 'talk_to_me'
  if (!(await checkUsage(user.id, action, user))) {
    await sendMessage(chatId, LIMIT_TEXT)
    return
  }
  void logUsage(user.id, action)

  const memoryOn = user.coachMemoryEnabled && hasActivePlanFor(user)
  const basePrompt = `${TALK_TEXT_SYSTEM_PROMPT}${buildExperienceContextBlock(user.experienceLevel)}${followUp ? buildFollowUpContextBlock(followUp) : ''}`

  const stopTyping = keepTyping(chatId)
  let raw: string
  let reply: string
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: memoryOn ? REPLY_MAX_TOKENS + MEMORY_UPDATE_TOKEN_BUFFER : REPLY_MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: memoryOn ? `${basePrompt}${buildMemoryContextBlock(user.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}` : basePrompt,
      messages: toClaudeMessages(existing, text),
    })
    raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(raw, debrief ? 'telegram.talk.chat' : 'telegram.talk')
    reply = trimIfTruncated(stripTag(raw, 'memory_update'), response.stop_reason)
  } finally {
    stopTyping()
  }
  if (!reply) {
    await sendMessage(chatId, ERROR_TEXT)
    return
  }

  const saved = debrief
    ? await prisma.debrief.update({ where: { id: debrief.id }, data: { conversation: appendTurn(existing, text, reply) } })
    : await prisma.debrief.create({
        data: { userId: user.id, incidentText: text, source: 'talk_to_me', channel: 'telegram', conversation: appendTurn([], text, reply) },
      })
  await prisma.user.update({ where: { id: user.id }, data: { telegramDebriefId: saved.id } })
  if (followUp) {
    await prisma.coachFollowUp.update({ where: { id: followUp.id }, data: { status: 'talked', respondedDebriefId: saved.id } })
  }

  await sendMessage(chatId, reply)

  // Bookkeeping for the next turn, after the teacher already has this one.
  if (memoryOn) {
    const updated = applyMemoryUpdate(extractTag(raw, 'memory_update'), user.coachMemory)
    if (updated !== user.coachMemory) await prisma.user.update({ where: { id: user.id }, data: { coachMemory: updated } })
  }
}

function weekdayName(date: Date): string {
  // Wivoza's teachers are US-based; Eastern is the safe default for a day name.
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
}

async function finishConversation(chatId: string, user: BotUser) {
  // /done works on a conversation that has gone quiet too — wrapping up the
  // next morning is exactly when a teacher would think to do it.
  const debrief = user.telegramDebriefId
    ? await prisma.debrief.findFirst({ where: { id: user.telegramDebriefId, userId: user.id, source: 'talk_to_me' } })
    : null
  const conversation = (debrief?.conversation as ChatMessage[] | null) ?? []
  if (!debrief || debrief.talkTakeaway || conversation.length === 0) {
    await sendMessage(chatId, "There's nothing to wrap up yet. Tell me what's going on and we'll talk it through.")
    return
  }
  if (!(await checkUsage(user.id, 'talk_to_me_takeaway', user))) {
    await sendMessage(chatId, LIMIT_TEXT)
    return
  }
  void logUsage(user.id, 'talk_to_me_takeaway')

  const stopTyping = keepTyping(chatId)
  let result: Awaited<ReturnType<typeof generateTalkTakeaway>>
  try {
    result = await generateTalkTakeaway(user.id, debrief)
  } finally {
    stopTyping()
  }
  if (!result) {
    await sendMessage(chatId, "Sorry, I couldn't put your takeaway together just now. Send /done to try again.")
    return
  }
  await prisma.user.update({ where: { id: user.id }, data: { telegramDebriefId: null } })

  const takeaway = result.debrief.talkTakeaway as { explored: string; tryNext: string; notice: string }
  const checkInLine = result.followUp
    ? `\n\nI'll check in on ${weekdayName(result.followUp.dueAt)} to see how it went.`
    : ''
  await sendMessage(
    chatId,
    `Here's your takeaway.\n\nWhat we talked about\n${takeaway.explored}\n\nTry next\n${takeaway.tryNext}\n\nNotice\n${takeaway.notice}${checkInLine}\n\nIt's saved in Wivoza under Talk It Through.`,
  )
}

async function answerCheckInCommand(chatId: string, userId: string, word: 'later' | 'skip') {
  const checkIn = await findSentCheckIn(userId)
  if (!checkIn) {
    await sendMessage(chatId, "There's no check-in waiting right now.")
    return
  }
  if (word === 'later') {
    const dueAt = snoozedCheckInDate()
    await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { dueAt, telegramSentAt: null } })
    await sendMessage(chatId, `No problem. I'll ask again on ${weekdayName(dueAt)}.`)
  } else {
    await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { status: 'dismissed' } })
    await sendMessage(chatId, "Got it, I won't ask about that one again.")
  }
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------
//
// Due check-ins go out to linked chats, on weekdays during US school hours
// only (13:00-22:00 UTC is 9am-6pm Eastern, 6am-3pm Pacific) — a check-in
// about 3rd period shouldn't buzz a teacher's phone at 11pm. A check-in
// stays on Home in the app either way.

const CHECK_IN_SWEEP_MS = 10 * 60 * 1000
const SEND_WINDOW_UTC_HOURS = { start: 13, end: 22 }

function inSendWindow(now: Date): boolean {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  return day >= 1 && day <= 5 && hour >= SEND_WINDOW_UTC_HOURS.start && hour < SEND_WINDOW_UTC_HOURS.end
}

export async function sendDueCheckIns(now = new Date()): Promise<number> {
  if (!inSendWindow(now)) return 0
  const due = await prisma.coachFollowUp.findMany({
    where: {
      status: 'pending',
      dueAt: { lte: now },
      telegramSentAt: null,
      user: { telegramChatId: { not: null }, suspendedAt: null },
    },
    select: { id: true, userId: true, checkInQuestion: true, user: { select: { telegramChatId: true } } },
    take: 50,
  })

  let sent = 0
  for (const checkIn of due) {
    // Claim it first, so an overlapping sweep can't send it twice.
    const { count } = await prisma.coachFollowUp.updateMany({
      where: { id: checkIn.id, telegramSentAt: null },
      data: { telegramSentAt: new Date() },
    })
    if (count === 0) continue
    try {
      await sendMessage(
        checkIn.user.telegramChatId!,
        `${checkIn.checkInQuestion}\n\nJust reply here to tell me how it went. Send /later to be asked again in a couple of days, or /skip to drop it.`,
      )
      sent++
    } catch (error) {
      if (isChatGone(error)) {
        // Blocked or deleted: unlink, and leave the check-in for Home.
        await prisma.user.update({
          where: { id: checkIn.userId },
          data: { telegramChatId: null, telegramLinkedAt: null, telegramDebriefId: null },
        })
      } else {
        console.error('[telegram] sending a check-in failed:', error)
      }
      await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { telegramSentAt: null } })
    }
  }
  return sent
}

async function checkInSweep() {
  try {
    const sent = await sendDueCheckIns()
    if (sent > 0) console.log(`[telegram] sent ${sent} check-in(s)`)
  } catch (error) {
    console.error('[telegram] check-in sweep failed:', error)
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function pollForUpdates() {
  // getUpdates and a webhook can't both be active on one bot.
  await deleteWebhook()
  console.log('[telegram] polling for messages')
  let offset = 0
  for (;;) {
    try {
      const updates = await getUpdates(offset, 30)
      for (const update of updates) {
        offset = update.update_id + 1
        dispatchUpdate(update)
      }
    } catch (error) {
      console.error('[telegram] polling failed, retrying shortly:', error)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

// Nothing runs unless TELEGRAM_BOT_TOKEN is set. Like the retention sweep,
// the bot only switches itself on when hosted on Render: a developer's local
// server can point at the real database and share the real bot token, and
// taking over the production bot's messages should be a deliberate
// TELEGRAM_MODE=polling (ideally with a separate test bot), not a side
// effect of `npm run dev`.
export function startTelegramBot() {
  if (!telegramEnabled()) return
  const onRender = process.env.RENDER === 'true'
  const mode = process.env.TELEGRAM_MODE ?? (onRender ? 'webhook' : 'off')

  if (mode !== 'off') {
    void setMyCommands(COMMANDS).catch((error) => console.error('[telegram] setMyCommands failed:', error))
  }
  if (mode === 'webhook') {
    const base = process.env.TELEGRAM_WEBHOOK_BASE_URL ?? process.env.RENDER_EXTERNAL_URL
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!base || !secret) {
      console.warn('[telegram] webhook mode needs TELEGRAM_WEBHOOK_SECRET and a public base URL; bot not started')
    } else {
      void setWebhook(`${base.replace(/\/$/, '')}/api/telegram/webhook`, secret)
        .then(() => console.log('[telegram] webhook registered'))
        .catch((error) => console.error('[telegram] setWebhook failed:', error))
    }
  } else if (mode === 'polling') {
    void pollForUpdates()
  }

  const checkIns = process.env.TELEGRAM_CHECKINS
  if (checkIns === 'on' || (checkIns !== 'off' && onRender)) {
    setInterval(() => void checkInSweep(), CHECK_IN_SWEEP_MS).unref()
  }
}
