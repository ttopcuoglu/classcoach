import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { verifyWebAppInitData } from './telegramWebApp.ts'

// This check is the whole door: anything it accepts gets signed in as that
// Wivoza account without a password. So the cases pinned here are the ones
// that would quietly turn it into a way in — a blob signed with some other
// token, a field edited after signing, and one replayed long after it was
// issued. The last test covers the `signature` field newer Telegram clients
// add, which must not break a teacher's sign-in.

const BOT_TOKEN = '123456:test-bot-token'
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN

const NOW = Date.UTC(2026, 9, 9, 15, 0, 0)

function sign(fields: Record<string, string>, token = BOT_TOKEN): URLSearchParams {
  const params = new URLSearchParams(fields)
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  params.set('hash', createHmac('sha256', secret).update(dataCheckString).digest('hex'))
  return params
}

function freshFields(extra: Record<string, string> = {}) {
  return {
    auth_date: String(Math.floor(NOW / 1000) - 5),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: 8675309, first_name: 'Dana', username: 'dana' }),
    ...extra,
  }
}

test('a blob Telegram signed names its user', () => {
  const identity = verifyWebAppInitData(sign(freshFields()).toString(), NOW)
  assert.deepEqual(identity, { telegramUserId: '8675309', firstName: 'Dana' })
})

test('a blob signed with another bot token is refused', () => {
  const forged = sign(freshFields(), '123456:someone-elses-bot').toString()
  assert.equal(verifyWebAppInitData(forged, NOW), null)
})

test('swapping the user after signing is refused', () => {
  const params = sign(freshFields())
  params.set('user', JSON.stringify({ id: 999, first_name: 'Not Dana' }))
  assert.equal(verifyWebAppInitData(params.toString(), NOW), null)
})

test('a blob older than the window is refused', () => {
  const stale = sign(freshFields({ auth_date: String(Math.floor(NOW / 1000) - 60 * 60) })).toString()
  assert.equal(verifyWebAppInitData(stale, NOW), null)
})

test('a blob with no hash at all is refused', () => {
  assert.equal(verifyWebAppInitData(new URLSearchParams(freshFields()).toString(), NOW), null)
})

test("a client that leaves `signature` out of the signed string still signs in", () => {
  // Newer clients send an Ed25519 `signature` alongside the HMAC. This is the
  // shape where it is not covered by the HMAC: sign without it, then add it.
  const params = sign(freshFields())
  params.set('signature', 'dGhpcy1pcy1ub3QtY2hlY2tlZC1oZXJl')
  const identity = verifyWebAppInitData(params.toString(), NOW)
  assert.equal(identity?.telegramUserId, '8675309')
})

test('a client that signs `signature` too still signs in', () => {
  const identity = verifyWebAppInitData(
    sign(freshFields({ signature: 'dGhpcy1vbmUtaXMtc2lnbmVk' })).toString(),
    NOW,
  )
  assert.equal(identity?.telegramUserId, '8675309')
})
