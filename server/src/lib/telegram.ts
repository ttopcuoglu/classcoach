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

// Plain text on purpose (no parse_mode): Coach's replies are plain text, and
// Markdown mode rejects a whole message over one unescaped character.
export function sendMessage(chatId: string, text: string): Promise<unknown> {
  return call('sendMessage', { chat_id: chatId, text: text.slice(0, MAX_MESSAGE_CHARS), link_preview_options: { is_disabled: true } })
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
  return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'] })
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
}

export function getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
  return call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] }, signal)
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
