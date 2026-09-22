// A thin client for the Telegram Bot API — just the handful of methods the
// Talk It Through bot uses, over plain fetch, so there is no SDK to keep up
// with. Everything here is inert until TELEGRAM_BOT_TOKEN is set.

const API_BASE = process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org'

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message)
  }
}

export function telegramEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN)
}

async function call<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  })
  const data = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; error_code: number; description: string }
    | null
  if (!data) throw new TelegramError(`Telegram ${method} failed with status ${res.status}`, res.status)
  if (!data.ok) throw new TelegramError(`Telegram ${method}: ${data.description}`, data.error_code)
  return data.result
}

// Telegram refuses anything longer. Coach's replies are far shorter; this
// only guards against a pathological one failing to send at all.
const MAX_MESSAGE_CHARS = 4096

export type InlineButton = { text: string; callback_data: string }

// Buttons that go with a message: a keyboard that stays above the typing box
// (tapping a button just sends its text), inline buttons under the message
// itself (tapping sends a callback_query), or an instruction to take the
// keyboard away.
export type ReplyMarkup =
  | { keyboard: { text: string }[][]; resize_keyboard: true; is_persistent: true }
  | { inline_keyboard: InlineButton[][] }
  | { remove_keyboard: true }

// Plain text on purpose (no parse_mode): Coach's replies are plain text, and
// Markdown mode rejects a whole message over one unescaped character.
export function sendMessage(chatId: string, text: string, replyMarkup?: ReplyMarkup): Promise<{ message_id: number }> {
  return call('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, MAX_MESSAGE_CHARS),
    link_preview_options: { is_disabled: true },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

// Takes the inline buttons off a message once one has been tapped, so the
// same choice can't be made twice.
export function removeInlineButtons(chatId: string, messageId: number): Promise<unknown> {
  return call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
}

// Every button tap must be answered, or Telegram shows a spinner on it.
export function answerButtonTap(callbackQueryId: string): Promise<unknown> {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId })
}

// "Coach is typing…" in the chat header. Lasts about five seconds or until a
// message arrives, so callers refresh it while a reply is being written.
export function sendTyping(chatId: string): Promise<unknown> {
  return call('sendChatAction', { chat_id: chatId, action: 'typing' })
}

export function setMyCommands(commands: { command: string; description: string }[]): Promise<unknown> {
  return call('setMyCommands', { commands })
}

export function setWebhook(url: string, secretToken: string): Promise<unknown> {
  return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'] })
}

export function deleteWebhook(): Promise<unknown> {
  return call('deleteWebhook', {})
}

export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { first_name?: string }
    text?: string
  }
  // A tap on one of the inline buttons under a message.
  callback_query?: {
    id: string
    data?: string
    message?: { message_id: number; chat: { id: number; type: string } }
  }
}

export function getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
  return call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }, signal)
}

let cachedUsername: string | null = null

// The bot's @username, for building t.me links. Fetched once per process;
// TELEGRAM_BOT_USERNAME skips the lookup.
export async function getBotUsername(): Promise<string> {
  if (process.env.TELEGRAM_BOT_USERNAME) return process.env.TELEGRAM_BOT_USERNAME
  if (!cachedUsername) cachedUsername = (await call<{ username: string }>('getMe')).username
  return cachedUsername
}

// Telegram answers 403 once a teacher blocks the bot or deletes the chat —
// nothing sent to that chat will ever arrive again.
export function isChatGone(error: unknown): boolean {
  return error instanceof TelegramError && error.code === 403
}
