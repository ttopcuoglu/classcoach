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
import { generateTalkTakeaway } from '../routes/debrief.ts'
import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { trimIfTruncated } from './coachStream.ts'
import { hasActivePlanFor, PLAN_USER_SELECT } from './billing.ts'
import { appendTurn, countUserTurns, TALK_TURN_CAP, toClaudeMessages, type ChatMessage } from './coachingChat.ts'
import {
  BETTER_TOOL_INSTRUCTION,
  BETTER_TOOL_TOKEN_BUFFER,
  readBetterTool,
  type HandoffDetails,
  type ToolKey,
  type ToolOffer,
} from './betterTool.ts'
import { createHandoff } from './coachHandoff.ts'
import { buildMemoryContextBlock, MEMORY_UPDATE_INSTRUCTION, MEMORY_UPDATE_TOKEN_BUFFER, persistMemoryUpdate, shouldWriteMemory } from './coachMemory.ts'
import { CORE_COACHING_RULES } from './coachPersona.ts'
import { flagIfUnsafe } from './coachSafetyCheck.ts'
import { buildExperienceContextBlock } from './experience.ts'
import { buildFollowUpContextBlock, snoozedCheckInDate } from './followUps.ts'
import { extractTag, stripTag } from './extractTag.ts'
import { prisma } from './prisma.ts'
import {
  answerButtonTap,
  deleteWebhook,
  getUpdates,
  isChatGone,
  removeInlineButtons,
  sendMessage,
  sendTyping,
  setChatMenuButton,
  setMyCommands,
  setWebhook,
  telegramEnabled,
  type ReplyMarkup,
  type TelegramUpdate,
} from './telegram.ts'
import { checkUsage, logUsage } from './usageLimit.ts'

const APP_URL = process.env.APP_URL ?? 'https://www.wivoza.com'

// A conversation quiet this long is over; the next message starts a new one.
const CONVERSATION_IDLE_MS = 3 * 60 * 60 * 1000
const LINK_CODE_TTL_MS = 15 * 60 * 1000
// Room for two or three short sentences — a message, not a spoken line.
const REPLY_MAX_TOKENS = 220

export const TALK_TEXT_SYSTEM_PROMPT = `You are Coach, a warm, practical coach for K-12 teachers — for classroom management, but just as much for the day-to-day workload, stress, and overwhelm of teaching — chatting with a teacher by text message, often in the few minutes between classes or at the end of a long day. Keep every reply short: one to three sentences, like a thoughtful colleague texting back. Give exactly ONE concrete idea, suggestion, or next step per reply — never a list, never "first... second..." If you have more than one idea, share the single most useful one now and save the rest for later if they want more. Ask at most one question, and only when you genuinely need more information to help. Often, but not every time, open with a brief, genuine reaction — a few words, then straight to the substance: feeling it with them ("Oof." "Ugh, that's rough." "That's a long day."), genuinely pleased ("Oh, nice!" "Okay, that's a win."), or landing on something together ("Yeah, exactly." "Right, that tracks."). Better than any stock phrase is a reaction to the specific thing they said, in their own words — "Third period again, huh." "Six of them at once? Oof." Lean lighter on these than you would out loud, though: a bare backchannel ("Mm-hmm." "I see.") reads as filler once it's typed, and plenty of replies should just start with the answer. One reaction or none — never stack two ("Oof, yeah, I hear you"), and don't reuse the same opener twice in a row. Skip the assistant tics however friendly they sound: "That's a great question," "I hear you," "Absolutely!", "I totally get it," "That makes so much sense," "I'm so sorry you're dealing with that." Never let a reaction stand in for actually engaging with what they said. Match their tone: gentler when they're stressed or discouraged, a little brighter when something went well, never falsely cheerful about something hard. Plain text only — no markdown, no bullet points, no emoji. Stay grounded in what the teacher has actually said; never invent details.
${CORE_COACHING_RULES}`

const COMMANDS = [
  { command: 'done', description: 'Wrap up and get your takeaway' },
  { command: 'new', description: 'Start a fresh conversation' },
  { command: 'help', description: 'How this works' },
  { command: 'disconnect', description: 'Unlink this chat from Wivoza' },
]

// Teachers won't remember commands, so the two that matter live on buttons
// that stay above the typing box. Tapping one just sends its text.
const WRAP_UP_BUTTON = '✅ Wrap up'
const NEW_TOPIC_BUTTON = '🆕 New topic'
const MAIN_KEYBOARD: ReplyMarkup = {
  keyboard: [[{ text: WRAP_UP_BUTTON }, { text: NEW_TOPIC_BUTTON }]],
  resize_keyboard: true,
  is_persistent: true,
}
// For a chat that isn't (or is no longer) connected, where the buttons do nothing.
const NO_KEYBOARD: ReplyMarkup = { remove_keyboard: true }

// Every message to a connected teacher carries the buttons, so a teacher
// who connected before they existed gets them with their next reply.
function reply(chatId: string, text: string) {
  return sendMessage(chatId, text, MAIN_KEYBOARD)
}

// ---------------------------------------------------------------------------
// The Mini App: Wivoza itself, opened in Telegram's own browser
// ---------------------------------------------------------------------------
//
// A takeaway that ends "it's saved in Wivoza" is a dead end on a phone — it
// means leaving Telegram, finding the site and signing in. These buttons
// open the real app inside Telegram instead, already signed in: Telegram
// hands the page a blob signed with the bot token, and the server trades it
// for a session (lib/telegramWebApp.ts, POST /api/auth/telegram-webapp).
//
// Telegram only opens an https URL this way, so in local development, where
// APP_URL is http://localhost, none of these buttons exist.
const MINI_APP_AVAILABLE = APP_URL.startsWith('https://')

function miniAppUrl(path: string): string | null {
  return MINI_APP_AVAILABLE ? `${APP_URL.replace(/\/$/, '')}${path}` : null
}

// A button under a message that opens the app at one page.
function openInAppButton(text: string, path: string): ReplyMarkup | undefined {
  const url = miniAppUrl(path)
  return url ? { inline_keyboard: [[{ text, web_app: { url } }]] } : undefined
}

// Puts "Open Wivoza" in place of the ☰ commands list beside the typing box,
// for this chat only: a chat with no account behind it has no app to open,
// and would just land on the sign-in page.
//
// Fire and forget on purpose — a cosmetic button is not worth failing a
// teacher's message over, and every takeaway offers the same door anyway.
function setMiniAppMenuButton(chatId: string) {
  const url = miniAppUrl('/')
  if (!url) return
  void setChatMenuButton(chatId, { type: 'web_app', text: 'Open Wivoza', web_app: { url } }).catch((error) =>
    console.error('[telegram] setting the menu button failed:', error),
  )
}

function resetMenuButton(chatId: string) {
  menuButtonSet.delete(chatId)
  void setChatMenuButton(chatId, { type: 'commands' }).catch(() => {})
}

// Chats whose button has been set since this process started. Telegram has
// no cheap way to ask whether it's already set, and setting it is harmless
// and idempotent — but not worth a round trip on every message, so: once per
// chat per deploy, on whatever the teacher sends next. That also fixes up a
// chat that connected before the Mini App existed without waiting for the
// one command they might never send.
//
// Marked before the call, not after: a chat whose button genuinely can't be
// set should be logged once, not retried on every message.
const menuButtonSet = new Set<string>()

function ensureMiniAppMenuButton(chatId: string) {
  if (menuButtonSet.has(chatId)) return
  menuButtonSet.add(chatId)
  setMiniAppMenuButton(chatId)
}

// The button under a reply that offers another tool. When Coach collected
// enough to fill that tool's form, the button carries a one-time id for it
// (lib/coachHandoff.ts) and says so — "Build this lesson", not "Open
// Planning Coach" — because landing on a filled-in form is a different
// promise from landing on an empty one.
function toolOfferButton(
  offer: ToolOffer,
  details: HandoffDetails | null,
  userId: string,
  debriefId: string,
): ReplyMarkup | undefined {
  const prefill = details && offer.prefillLabel
  // A prefilled offer may land somewhere more specific than the tool's
  // front door — Communication Coach's hub has three tools behind it, and
  // only the writing one takes what Coach collected.
  const base = prefill ? (offer.prefillPath ?? offer.path) : offer.path
  const path = prefill
    ? `${base}${base.includes('?') ? '&' : '?'}handoff=${createHandoff(userId, offer.key, details)}&build=1`
    : base
  const url = miniAppUrl(path)
  if (!url) return undefined
  return {
    inline_keyboard: [
      [{ text: prefill ? offer.prefillLabel! : offer.label, web_app: { url } }],
      // Telegram allows one keyboard per message, so a message carrying this
      // offer can't also carry the Wrap up / New topic keyboard. On a client
      // where that keyboard is collapsed, an offer with nothing beside it
      // reads as the only way forward — so the message carries the same two
      // exits the chat always has, saying the same things.
      //
      // Both, not one. After being handed a lesson, the usual next move is
      // "done with that, now the parent thing" — which is New topic, and
      // costs nothing. Wrap up writes a takeaway and schedules a check-in,
      // which is right for a conversation worth remembering and wrong for
      // an errand.
      [
        { text: NEW_TOPIC_BUTTON, callback_data: 'new' },
        { text: WRAP_UP_BUTTON, callback_data: `wrap:${debriefId}` },
      ],
    ],
  }
}

// How often Coach has offered each tool in a conversation — see
// betterTool.ts. A button under every reply would be a nag: the teacher
// came here to think, not to be routed.
//
// Counted per tool, not per conversation, because one conversation really
// does change subject: a teacher handed a lesson says "different thing,
// this parent emailed me" in the same breath, and one offer for the whole
// conversation leaves the second half of what they said with no door.
//
// Twice each, because the second time is usually the teacher saying yes.
// They answer "go on then", Coach asks how long the period is, and the
// button it can hand them now is better than the one further up the chat
// — and a reply agreeing to build something, with nothing to tap, is the
// dead end this was supposed to fix. What two stops is Coach pressing a
// tool the teacher has twice declined to take.
//
// In memory rather than a column, like the menu button above: losing the
// record on a deploy costs one extra offer, which is cheaper than a
// migration.
const MAX_OFFERS_PER_TOOL = 2
// A ceiling on carrying the instruction at all, so a long wandering
// conversation stops paying ~250 tokens a turn for a door it keeps not
// taking.
const MAX_OFFERS_PER_CONVERSATION = 4
const offersByConversation = new Map<string, Map<ToolKey, number>>()

function offersMade(debriefId: string | null | undefined): Map<ToolKey, number> {
  return (debriefId && offersByConversation.get(debriefId)) || new Map<ToolKey, number>()
}

function offerTotal(debriefId: string | null | undefined): number {
  let total = 0
  for (const count of offersMade(debriefId).values()) total += count
  return total
}

function rememberToolOffer(debriefId: string, tool: ToolKey) {
  const made = offersByConversation.get(debriefId) ?? new Map<ToolKey, number>()
  made.set(tool, (made.get(tool) ?? 0) + 1)
  offersByConversation.set(debriefId, made)
  if (offersByConversation.size > 500) {
    offersByConversation.delete(offersByConversation.keys().next().value!)
  }
}

const MINI_APP_HELP = MINI_APP_AVAILABLE
  ? '\n\nTap "Open Wivoza" beside the typing box to open your account right here — this conversation once it\'s wrapped up, and the rest of your tools.'
  : ''

const HELP_TEXT = `Talk to me like you'd talk to a colleague after class. Tell me what happened and what's on your mind, and we'll figure out a next step together.

When you're finished, tap "Wrap up" below for your takeaway, and I'll check in a few days later to see how it went. Tap "New topic" to start fresh.

One ask: please leave out students' full names. "A student in 3rd period" works great.${MINI_APP_HELP}

(To unlink this chat from your Wivoza account, send /disconnect.)`

const NOT_LINKED_TEXT = `Hi! I'm Coach from Wivoza. To talk with me here, connect this chat to your Wivoza account first: sign in at ${APP_URL}, open Profile, and tap "Connect Telegram." If Telegram doesn't show a Start button, just paste the connect link here.`

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
    resetMenuButton(user.telegramChatId)
    await sendMessage(
      user.telegramChatId,
      `This chat is no longer connected to Wivoza. You can reconnect any time from Profile at ${APP_URL}.`,
      NO_KEYBOARD,
    ).catch(() => {})
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
  ensureMiniAppMenuButton(chatId)
  const name = user.name?.split(' ')[0] || firstName
  await reply(chatId, `You're connected${name ? `, ${name}` : ''}! Your conversations here are saved to Talk It Through in Wivoza.\n\n${HELP_TEXT}`)
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

  const message = update.message ?? update.callback_query?.message
  // Direct messages only — the bot has no business in a group chat.
  if (!message || message.chat.type !== 'private') return
  const chatId = String(message.chat.id)
  const tap = update.callback_query

  const previous = chatQueues.get(chatId) ?? Promise.resolve()
  const next: Promise<void> = previous
    .then(() =>
      tap ? handleButtonTap(chatId, tap) : handleMessage(chatId, update.message!.text, update.message!.from?.first_name),
    )
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
    else await sendMessage(chatId, NOT_LINKED_TEXT, NO_KEYBOARD)
    return
  }
  if (user.suspendedAt) {
    await sendMessage(chatId, "This Wivoza account isn't active right now.", NO_KEYBOARD)
    return
  }

  ensureMiniAppMenuButton(chatId)

  // The buttons send their own label; plain "done" / "new" work too.
  const word = command ?? plainWordCommand(text)
  switch (word) {
    case 'start':
    case 'help':
      await reply(chatId, HELP_TEXT)
      return
    case 'new':
      await startNewTopic(chatId, user.id)
      return
    case 'done':
      await finishConversation(chatId, user, user.telegramDebriefId)
      return
    case 'later':
    case 'skip':
      await answerCheckIn(chatId, user.id, word)
      return
    case 'disconnect':
      await unlinkTelegram(user.id)
      return
  }
  if (command) {
    await reply(chatId, `I don't know that command. ${HELP_TEXT}`)
    return
  }

  await coachReply(chatId, user, text)
}

// Closes the current conversation without a takeaway: nothing to sum up,
// nothing to check in about, just a different subject. Shared by the
// command, the keyboard button and the one under a tool offer.
async function startNewTopic(chatId: string, userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { telegramDebriefId: null } })
  await reply(chatId, "Fresh start. What's on your mind?")
}

function plainWordCommand(text: string): 'done' | 'new' | null {
  const t = text.replace(/[.!]+$/, '').trim().toLowerCase()
  if (text === WRAP_UP_BUTTON || t === 'done' || t === 'wrap up' || t === 'wrap it up') return 'done'
  if (text === NEW_TOPIC_BUTTON || t === 'new' || t === 'new topic') return 'new'
  return null
}

// Inline buttons carry "action:id" — see the wrap-up offer and check-ins.
async function handleButtonTap(chatId: string, tap: { id: string; data?: string; message?: { message_id: number } }) {
  await answerButtonTap(tap.id).catch(() => {})
  const user = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: USER_SELECT })
  if (!user || user.suspendedAt) return
  if (tap.message) await removeInlineButtons(chatId, tap.message.message_id).catch(() => {})

  const [action, id] = (tap.data ?? '').split(':')
  if (action === 'wrap') await finishConversation(chatId, user, id)
  else if (action === 'nowrap') await reply(chatId, 'No problem. Tap "Wrap up" whenever you\'re ready.')
  else if (action === 'new') await startNewTopic(chatId, user.id)
  else if (action === 'later' || action === 'skip') await answerCheckIn(chatId, user.id, action, id)
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
    await reply(chatId, 'This conversation has reached its length limit. Tap "Wrap up" for your takeaway, or "New topic" to start fresh.')
    return
  }

  const action = debrief ? 'talk_to_me_chat' : 'talk_to_me'
  const denied = await checkUsage(user.id, action, user)
  if (denied) {
    await reply(chatId, denied)
    return
  }
  void logUsage(user.id, action)

  const memoryOn = user.coachMemoryEnabled && hasActivePlanFor(user)
  // Memory is read every turn but rewritten only on some — see shouldWriteMemory.
  const writeMemory = memoryOn && shouldWriteMemory(countUserTurns(existing) + 1)
  // Not on a reply to a check-in: that turn is Coach asking how something
  // went, and a button changing the subject is the wrong answer to it.
  // Not twice in one conversation either — so once an offer is made, the
  // instruction leaves the prompt and Coach stops looking for one.
  const offerAllowed = MINI_APP_AVAILABLE && !followUp && offerTotal(debrief?.id) < MAX_OFFERS_PER_CONVERSATION
  const basePrompt = `${TALK_TEXT_SYSTEM_PROMPT}${buildExperienceContextBlock(user.experienceLevel)}${followUp ? buildFollowUpContextBlock(followUp) : ''}${offerAllowed ? BETTER_TOOL_INSTRUCTION : ''}`

  const stopTyping = keepTyping(chatId)
  let raw: string
  let coachText: string
  let offer: ToolOffer | null = null
  let details: HandoffDetails | null = null
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens:
        REPLY_MAX_TOKENS +
        (writeMemory ? MEMORY_UPDATE_TOKEN_BUFFER : 0) +
        (offerAllowed ? BETTER_TOOL_TOKEN_BUFFER : 0),
      thinking: { type: 'disabled' },
      system: memoryOn ? `${basePrompt}${buildMemoryContextBlock(user.coachMemory)}${writeMemory ? MEMORY_UPDATE_INSTRUCTION : ''}` : basePrompt,
      messages: toClaudeMessages(existing, text),
    })
    raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(raw, debrief ? 'telegram.talk.chat' : 'telegram.talk')
    const read = readBetterTool(stripTag(raw, 'memory_update'))
    offer = read.offer
    details = read.details
    coachText = trimIfTruncated(read.text, response.stop_reason)
  } finally {
    stopTyping()
  }
  if (!coachText) {
    await reply(chatId, ERROR_TEXT)
    return
  }

  const saved = debrief
    ? await prisma.debrief.update({ where: { id: debrief.id }, data: { conversation: appendTurn(existing, text, coachText) } })
    : await prisma.debrief.create({
        data: { userId: user.id, incidentText: text, source: 'talk_to_me', channel: 'telegram', conversation: appendTurn([], text, coachText) },
      })
  await prisma.user.update({ where: { id: user.id }, data: { telegramDebriefId: saved.id } })
  if (followUp) {
    await prisma.coachFollowUp.update({ where: { id: followUp.id }, data: { status: 'talked', respondedDebriefId: saved.id } })
  }

  // The offer rides under the reply as a button, so the words stay a
  // colleague's answer and the routing stays optional. The persistent
  // Wrap up / New topic keyboard is unaffected — an inline button sits with
  // the message, not above the typing box.
  const spent = offer != null && (offersMade(saved.id).get(offer.key) ?? 0) >= MAX_OFFERS_PER_TOOL
  const button = offer && !spent ? toolOfferButton(offer, details, user.id, saved.id) : undefined
  await sendMessage(chatId, coachText, button ?? MAIN_KEYBOARD)
  if (button && offer) rememberToolOffer(saved.id, offer.key)

  // Bookkeeping for the next turn, after the teacher already has this one.
  if (writeMemory) {
    await persistMemoryUpdate(user.id, extractTag(raw, 'memory_update'), user.coachMemory)
  }
}

function weekdayName(date: Date): string {
  // Wivoza's teachers are US-based; Eastern is the safe default for a day name.
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
}

// Wraps up a conversation: the Wrap up button, "done", /done, or "Yes" on
// the wrap-up offer (which names its conversation, since the teacher may
// have moved on to a new one since it was sent).
async function finishConversation(chatId: string, user: BotUser, debriefId: string | null | undefined) {
  // Works on a conversation that has gone quiet too — wrapping up the next
  // morning is exactly when a teacher would think to do it.
  const debrief = debriefId
    ? await prisma.debrief.findFirst({ where: { id: debriefId, userId: user.id, source: 'talk_to_me' } })
    : null
  const conversation = (debrief?.conversation as ChatMessage[] | null) ?? []
  if (!debrief || conversation.length === 0) {
    await reply(chatId, "There's nothing to wrap up yet. Tell me what's going on and we'll talk it through.")
    return
  }
  if (debrief.talkTakeaway) {
    await reply(chatId, "That conversation is already wrapped up. It's in Wivoza under Talk It Through.")
    return
  }
  const denied = await checkUsage(user.id, 'talk_to_me_takeaway', user)
  if (denied) {
    await reply(chatId, denied)
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
    await reply(chatId, 'Sorry, I couldn\'t put your takeaway together just now. Tap "Wrap up" to try again.')
    return
  }
  if (user.telegramDebriefId === debrief.id) {
    await prisma.user.update({ where: { id: user.id }, data: { telegramDebriefId: null } })
  }

  const takeaway = result.debrief.talkTakeaway as { explored: string; tryNext: string; notice: string }
  const checkInLine = result.followUp
    ? `\n\nI'll check in on ${weekdayName(result.followUp.dueAt)} to see how it went.`
    : ''
  // Opens straight to this conversation in the app, signed in — the one
  // moment a teacher might actually want to look at what's saved. The
  // persistent Wrap up / New topic keyboard stays where it is; an inline
  // button sits under the message and doesn't replace it.
  await sendMessage(
    chatId,
    `Here's your takeaway.\n\nWhat we talked about\n${takeaway.explored}\n\nTry next\n${takeaway.tryNext}\n\nNotice\n${takeaway.notice}${checkInLine}\n\nIt's saved in Wivoza under Talk It Through.`,
    openInAppButton('Open in Wivoza', `/talk-to-me?open=${debrief.id}`) ?? MAIN_KEYBOARD,
  )
}

// "Ask me later" / "Skip this one" on a check-in (or /later, /skip). A
// button names its check-in; a typed command means the latest one sent.
async function answerCheckIn(chatId: string, userId: string, word: 'later' | 'skip', followUpId?: string) {
  const checkIn = followUpId
    ? await prisma.coachFollowUp.findFirst({ where: { id: followUpId, userId, status: 'pending' } })
    : await findSentCheckIn(userId)
  if (!checkIn) {
    await reply(chatId, "There's no check-in waiting right now.")
    return
  }
  if (word === 'later') {
    const dueAt = snoozedCheckInDate()
    await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { dueAt, telegramSentAt: null } })
    await reply(chatId, `No problem. I'll ask again on ${weekdayName(dueAt)}.`)
  } else {
    await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { status: 'dismissed' } })
    await reply(chatId, "Got it, I won't ask about that one again.")
  }
}

// ---------------------------------------------------------------------------
// Check-ins and wrap-up offers
// ---------------------------------------------------------------------------
//
// Both go out on weekdays during US school hours only (13:00-22:00 UTC is
// 9am-6pm Eastern, 6am-3pm Pacific) — a message about 3rd period shouldn't
// buzz a teacher's phone at 11pm. Anything that comes due outside the
// window simply waits for the next one.

const SWEEP_EVERY_MS = 10 * 60 * 1000
const SEND_WINDOW_UTC_HOURS = { start: 13, end: 22 }

function inSendWindow(now: Date): boolean {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  return day >= 1 && day <= 5 && hour >= SEND_WINDOW_UTC_HOURS.start && hour < SEND_WINDOW_UTC_HOURS.end
}

// Blocked or deleted chats: unlink, so nothing more is tried. Anything the
// teacher would have been sent is still in the app.
async function unlinkGoneChat(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramLinkedAt: null, telegramDebriefId: null },
  })
}

// A check-in stays on Home in the app either way; this also sends it to a
// connected chat.
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
      await sendMessage(checkIn.user.telegramChatId!, `${checkIn.checkInQuestion}\n\nJust reply here to tell me how it went.`, {
        inline_keyboard: [
          [
            { text: 'Ask me later', callback_data: `later:${checkIn.id}` },
            { text: 'Skip this one', callback_data: `skip:${checkIn.id}` },
          ],
        ],
      })
      sent++
    } catch (error) {
      if (isChatGone(error)) await unlinkGoneChat(checkIn.userId)
      else console.error('[telegram] sending a check-in failed:', error)
      await prisma.coachFollowUp.update({ where: { id: checkIn.id }, data: { telegramSentAt: null } })
    }
  }
  return sent
}

// Most teachers stop replying when they're finished rather than tapping
// Wrap up, and the takeaway is what schedules the check-in. So once a real
// conversation (two or more exchanges) goes quiet, Coach offers to wrap it
// up — once per conversation, and not for one that's days old.
const WRAP_UP_OFFER_AFTER_MS = 30 * 60 * 1000
const WRAP_UP_OFFER_WITHIN_MS = 3 * 24 * 60 * 60 * 1000
const WRAP_UP_MIN_EXCHANGES = 2

export async function sendWrapUpOffers(now = new Date()): Promise<number> {
  if (!inSendWindow(now)) return 0
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, telegramDebriefId: { not: null }, suspendedAt: null },
    select: { id: true, telegramChatId: true, telegramDebriefId: true },
  })
  if (users.length === 0) return 0
  const debriefs = await prisma.debrief.findMany({
    where: {
      id: { in: users.map((u) => u.telegramDebriefId!) },
      telegramWrapUpOfferedAt: null,
      createdAt: { gte: new Date(now.getTime() - WRAP_UP_OFFER_WITHIN_MS - CONVERSATION_IDLE_MS) },
    },
  })

  let sent = 0
  for (const debrief of debriefs) {
    const user = users.find((u) => u.telegramDebriefId === debrief.id && u.id === debrief.userId)
    if (!user || debrief.talkTakeaway) continue
    const idleMs = now.getTime() - lastActivity(debrief).getTime()
    const conversation = (debrief.conversation as ChatMessage[] | null) ?? []
    if (countUserTurns(conversation) < WRAP_UP_MIN_EXCHANGES) continue
    if (idleMs < WRAP_UP_OFFER_AFTER_MS || idleMs > WRAP_UP_OFFER_WITHIN_MS) continue

    const { count } = await prisma.debrief.updateMany({
      where: { id: debrief.id, telegramWrapUpOfferedAt: null },
      data: { telegramWrapUpOfferedAt: now },
    })
    if (count === 0) continue
    try {
      await sendMessage(
        user.telegramChatId!,
        "Want me to wrap up our conversation with a takeaway? I'll check in a few days later to see how it went.",
        {
          inline_keyboard: [
            [
              { text: 'Yes, wrap it up', callback_data: `wrap:${debrief.id}` },
              { text: 'Not now', callback_data: `nowrap:${debrief.id}` },
            ],
          ],
        },
      )
      sent++
    } catch (error) {
      if (isChatGone(error)) await unlinkGoneChat(user.id)
      else console.error('[telegram] sending a wrap-up offer failed:', error)
    }
  }
  return sent
}

async function sweep() {
  try {
    const checkIns = await sendDueCheckIns()
    const offers = await sendWrapUpOffers()
    if (checkIns + offers > 0) console.log(`[telegram] sent ${checkIns} check-in(s), ${offers} wrap-up offer(s)`)
  } catch (error) {
    console.error('[telegram] sweep failed:', error)
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

  // Check-ins and wrap-up offers.
  const outreach = process.env.TELEGRAM_CHECKINS
  if (outreach === 'on' || (outreach !== 'off' && onRender)) {
    setInterval(() => void sweep(), SWEEP_EVERY_MS).unref()
  }
}
