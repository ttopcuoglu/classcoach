import { useEffect, useState } from 'react'
import { createTelegramLink, disconnectTelegram, getTelegramStatus, type TelegramStatus } from '../lib/api'

// Profile's "Coach on Telegram" card: connect a Telegram chat to type to
// Coach (Talk It Through) and get check-ins there. The connect link (a
// button on a phone, a QR code to scan from a computer) opens Telegram,
// where the bot finishes the link itself — so while a link is out, this
// polls until the connection shows up.
export default function TelegramConnect({
  status,
  onStatusChange,
  heading,
}: {
  status: TelegramStatus
  onStatusChange: (status: TelegramStatus) => void
  heading: React.ReactNode
}) {
  const [link, setLink] = useState<{ url: string; qr: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!link || status.linked) return
    const timer = setInterval(() => {
      getTelegramStatus()
        .then((next) => {
          if (next.linked) {
            setLink(null)
            onStatusChange(next)
          }
        })
        .catch(() => {})
    }, 3000)
    // The link is only good for 15 minutes; stop asking after that.
    const expiry = setTimeout(() => setLink(null), 15 * 60 * 1000)
    return () => {
      clearInterval(timer)
      clearTimeout(expiry)
    }
  }, [link, status.linked, onStatusChange])

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      setLink(await createTelegramLink())
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a link. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setError('Could not copy. Press and hold "Open Telegram" and choose Copy Link instead.')
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
      ) : link ? (
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <img
            src={link.qr}
            alt="QR code that opens Coach in Telegram"
            className="h-40 w-40 shrink-0 rounded-2xl border border-hairline bg-white p-2"
          />
          <div className="text-sm text-ink">
            <p>
              <span className="font-semibold">On a computer:</span> scan this with your phone's camera.
            </p>
            <p className="mt-1">
              <span className="font-semibold">On your phone:</span> tap Open Telegram.
            </p>
            <p className="mt-1">
              Then tap <span className="font-semibold">Start</span> in Telegram.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                Open Telegram
              </a>
              <span className="text-xs text-ink-soft">Waiting for you to tap Start...</span>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              No Start button?{' '}
              <button type="button" onClick={handleCopy} className="font-semibold text-terracotta-600 underline">
                {copied ? 'Link copied' : 'Copy the link'}
              </button>{' '}
              and paste it into the chat with Coach. The link works for 15 minutes.
            </p>
          </div>
        </div>
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
