// Account emails, sent through Resend's HTTP API — same pattern (and same
// API key) as the school-inquiry alert in inquiryAlert.ts.
//
//   RESEND_API_KEY   required to send at all; unset = "forgot password" is
//                    accepted and does nothing, so check it is set wherever
//                    this runs
//   AUTH_EMAIL_FROM  default "Wivoza <no-reply@send.wivoza.com>" — the
//                    domain must be verified in Resend
//   APP_URL          where the reset link points, default www.wivoza.com

const APP_URL = process.env.APP_URL ?? 'https://www.wivoza.com'
// Overridable so tests can point at a stand-in instead of sending real mail.
const RESEND_API_BASE = process.env.RESEND_API_BASE ?? 'https://api.resend.com'

async function send(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[auth-email] RESEND_API_KEY is not set — no email sent')
    return false
  }
  try {
    const response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM || 'Wivoza <no-reply@send.wivoza.com>',
        to: [to],
        subject,
        // Plain text on purpose: nothing here needs markup, and a text part
        // can't turn a teacher's own data into a link.
        text,
      }),
    })
    if (!response.ok) {
      console.error('[auth-email] Resend rejected the message:', response.status, await response.text().catch(() => ''))
      return false
    }
    return true
  } catch (error) {
    console.error('[auth-email] could not send:', error)
    return false
  }
}

export function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const link = `${APP_URL}/reset-password?token=${token}`
  return send(
    to,
    'Reset your Wivoza password',
    [
      'Someone asked to reset the password for your Wivoza account.',
      '',
      'Open this link to choose a new one:',
      link,
      '',
      'The link works for one hour and can only be used once.',
      "If you didn't ask for this, you can ignore this email — your password stays as it is.",
    ].join('\n'),
  )
}

// Sent instead of a reset link when the account has no password at all, so
// a teacher who signed up with Google or Apple isn't left waiting for an
// email that was never going to arrive. Which of the two it was isn't
// recorded, so the message names both.
export function sendNoPasswordEmail(to: string): Promise<boolean> {
  return send(
    to,
    'Signing in to Wivoza',
    [
      'Someone asked to reset the password for your Wivoza account.',
      '',
      "That account doesn't have a password — it signs in with Google or Apple.",
      `Open ${APP_URL} and use the "Continue with Google" or "Continue with Apple" button instead.`,
      '',
      "If you didn't ask for this, you can ignore this email.",
    ].join('\n'),
  )
}
