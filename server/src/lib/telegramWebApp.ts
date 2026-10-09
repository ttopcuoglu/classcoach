// Mini App sign-in: proving who a teacher is from inside Telegram.
//
// When the bot opens www.wivoza.com in Telegram's own browser (a Web App
// button, or the "Open Wivoza" menu button next to the typing box),
// Telegram hands the page an `initData` blob — the Telegram user, a
// timestamp, and an HMAC over all of it keyed by the bot token. Only
// Telegram and this server know that token, so a blob that verifies here
// really came from Telegram and really names that Telegram user.
//
// That is the whole trick: the teacher never types a password, because the
// chat they opened the page from was already tied to their Wivoza account
// when they connected it from Profile (see telegramCoach.ts). This module
// does the verification only; trading an identity for a session is
// POST /api/auth/telegram-webapp.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type TelegramWebAppIdentity = {
  // Telegram's numeric user id, as a string. In a private chat the chat id
  // and the user id are the same number, which is why this can be matched
  // straight against User.telegramChatId.
  telegramUserId: string
  firstName: string | null
}

// How old a blob may be. This mints a 30-day session from a credential that
// sits in a URL fragment, so the window is kept to minutes rather than the
// day or more other implementations allow: a blob that leaks from a log or a
// shared screenshot should already be useless. It only has to survive the
// first page load — once that sets the session cookie, every later request
// and reload inside the Mini App authenticates the ordinary way.
const MAX_AUTH_AGE_MS = 15 * 60 * 1000
// Telegram stamps auth_date from its own clock, so allow for a little skew
// in the other direction rather than rejecting a blob from "the future".
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000

// All received fields except the ones listed, sorted by key, one "k=v" per
// line — the exact string Telegram signed.
function dataCheckString(params: URLSearchParams, skip: Set<string>): string {
  return [...params.entries()]
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
}

function hmacHex(key: string | Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

function hashesMatch(a: string, b: string): boolean {
  // Both are hex digests of the same algorithm, so a length difference is
  // malformed input rather than a near miss — and timingSafeEqual throws on
  // mismatched lengths.
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/// Verifies one initData blob and returns who it names, or null.
///
/// Null covers every failure — bad signature, expired, malformed, no bot
/// token configured — on purpose: the caller has nothing useful to tell a
/// client apart from "that didn't check out", and distinguishing the cases
/// in a response would describe the check to whoever is probing it.
export function verifyWebAppInitData(initData: string, now = Date.now()): TelegramWebAppIdentity | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  // HMAC_SHA256(bot_token) keyed by the literal string "WebAppData" — the
  // key Telegram derives for Mini App data specifically, so a login-widget
  // blob (which derives its key the other way round) can't be replayed here.
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()

  // `signature` is a newer Ed25519 field for validating a blob WITHOUT the
  // bot token, aimed at third parties. Telegram's documented data check
  // string excludes only `hash`, but clients in the wild differ on whether
  // `signature` is covered by the HMAC, and a wrong guess here reads as
  // "sign-in is broken" on some Telegram versions and not others. Both are
  // one HMAC, so try the documented string first and fall back.
  const signed =
    hashesMatch(hash, hmacHex(secret, dataCheckString(params, new Set(['hash'])))) ||
    hashesMatch(hash, hmacHex(secret, dataCheckString(params, new Set(['hash', 'signature']))))
  if (!signed) return null

  // Everything below this line is now trusted — it is covered by the HMAC.
  const authDateSec = Number(params.get('auth_date'))
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) return null
  const ageMs = now - authDateSec * 1000
  if (ageMs > MAX_AUTH_AGE_MS || ageMs < -MAX_CLOCK_SKEW_MS) return null

  let user: { id?: unknown; first_name?: unknown }
  try {
    user = JSON.parse(params.get('user') ?? 'null')
  } catch {
    return null
  }
  // Absent when the Mini App is opened somewhere a user can't be identified
  // (an inline query, a channel). The bot only ever opens it from a private
  // chat, so no user means something unexpected.
  if (typeof user?.id !== 'number' || !Number.isInteger(user.id)) return null

  return {
    telegramUserId: String(user.id),
    firstName: typeof user.first_name === 'string' ? user.first_name : null,
  }
}
