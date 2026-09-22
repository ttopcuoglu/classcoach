import { useEffect, useState } from 'react'
import { createTelegramLink, disconnectTelegram, getTelegramStatus, type TelegramStatus } from '../lib/api'

// Profile's "Coach on Telegram" card: connect a Telegram chat to type to
// Coach (Talk It Through) and get check-ins there. The connect link opens
// Telegram, where the bot finishes the link itself — so while a link is
// out, this polls until the connection shows up.
export default function TelegramConnect({
  status,
  onStatusChange,
  heading,
}: {
  status: TelegramStatus
  onStatusChange: (status: TelegramStatus) => void
  heading: React.ReactNode
}) {
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!linkUrl || status.linked) return
    const timer = setInterval(() => {
      getTelegramStatus()
        .then((next) => {
          if (next.linked) {
            setLinkUrl(null)
            onStatusChange(next)
          }
        })
        .catch(() => {})
    }, 3000)
    // The link is only good for 15 minutes; stop asking after that.
    const expiry = setTimeout(() => setLinkUrl(null), 15 * 60 * 1000)
    return () => {
      clearInterval(timer)
      clearTimeout(expiry)
    }
  }, [linkUrl, status.linked, onStatusChange])

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const { url } = await createTelegramLink()
      setLinkUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a link. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Telegram? Coach will stop replying and sending check-ins there.')) return
    setBusy(true)
    setError(null)
    try {
      await disconnectTelegram()
      onStatusChange({ ...status, linked: false, linkedAt: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
      {heading}

      {status.linked ? (
        <>
          <p className="mt-4 text-sm text-ink">
            <span className="font-semibold text-forest">Connected.</span> Open Telegram and message Coach any time. Send{' '}
            <span className="font-semibold">/done</span> to wrap up and get your takeaway.
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="mt-4 rounded-full border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:bg-peach-tint disabled:opacity-60"
          >
            {busy ? 'Disconnecting...' : 'Disconnect Telegram'}
          </button>
        </>
      ) : linkUrl ? (
        <>
          <p className="mt-4 text-sm text-ink">
            Open Telegram and tap <span className="font-semibold">Start</span> to finish connecting. The link works for 15
            minutes.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
            >
              Open Telegram
            </a>
            <span className="text-xs text-ink-soft">Waiting for you to tap Start...</span>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={busy}
          className="mt-4 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
        >
          {busy ? 'Getting your link...' : 'Connect Telegram'}
        </button>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        Messages go through Telegram, so please leave out students' names. "A student in 3rd period" works great.
      </p>
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
    </div>
  )
}
