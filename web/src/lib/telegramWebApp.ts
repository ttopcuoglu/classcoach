// Signing in from inside Telegram.
//
// When the bot opens this site in Telegram's own browser — the "Open
// Wivoza" button beside the typing box, or "Open in Wivoza" under a
// takeaway — Telegram attaches a blob identifying the teacher (`initData`)
// to the page URL's fragment, and exposes the same string on
// window.Telegram.WebApp once its script has loaded. It is signed with the
// bot token, so the server can verify it and set an ordinary session
// cookie: everything after that is the normal signed-in app, with no
// password typed on a phone between classes.
//
// Server side: POST /api/auth/telegram-webapp, server/src/lib/telegramWebApp.ts.

import { signInWithTelegramWebApp, type UserProfile } from './api'

type TelegramWebView = {
  initData?: string
  ready?: () => void
  expand?: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebView }
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

// The blob, from whichever source already has it. The fragment is there on
// the first paint while the script is a network round trip away, so sign-in
// never waits for the script.
export function telegramInitData(): string | null {
  const fromSdk = window.Telegram?.WebApp?.initData
  if (fromSdk) return fromSdk
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return fragment.get('tgWebAppData')
}

// Telegram's own script, fetched only inside Telegram so an ordinary
// visitor never pays for it. ready() clears Telegram's loading placeholder
// and expand() takes the sheet to full height — without them the app sits
// in a half-screen panel.
function prepareTelegramChrome() {
  if (document.querySelector(`script[src="${SDK_URL}"]`)) return
  const script = document.createElement('script')
  script.src = SDK_URL
  script.async = true
  script.onload = () => {
    const webApp = window.Telegram?.WebApp
    webApp?.ready?.()
    webApp?.expand?.()
  }
  document.head.appendChild(script)
}

/// Signs in when this page is running inside Telegram; null otherwise.
///
/// Null covers every failure, and all of them are handled the same way: fall
/// back to the ordinary session-cookie check. That is what succeeds on a
/// reload (the blob is minutes-old by then and refused, but the cookie from
/// the first load is still good), and what correctly shows the sign-in page
/// when the chat isn't connected to an account at all.
export async function signInFromTelegram(): Promise<UserProfile | null> {
  const initData = telegramInitData()
  if (!initData) return null
  prepareTelegramChrome()
  try {
    return await signInWithTelegramWebApp(initData)
  } catch {
    return null
  }
}
