import { useState } from 'react'
import { disconnectCanvas, type CanvasStatus } from '../lib/api'

// Profile's Canvas card, for a teacher who has connected Canvas: what is
// connected, and a way to undo it. Hidden for everyone else — there is
// nothing to set up here; connecting starts from Canvas or Send to Canvas.
// Profile decides whether it shows (its section numbers depend on it).
export default function CanvasConnection({ status, heading }: { status: CanvasStatus; heading: React.ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleDisconnect() {
    if (!confirm('Disconnect Canvas? The Wivoza link in Canvas will ask you to connect again, and Send to Canvas will ask for permission again. Pages you already sent stay in Canvas.')) return
    setBusy(true)
    setError(null)
    try {
      await disconnectCanvas()
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
      {heading}
      {done ? (
        <p className="mt-4 text-sm text-ink">
          <span className="font-semibold text-forest">Disconnected.</span> Canvas no longer signs you in to Wivoza, and Wivoza can no longer add
          pages to your courses. You can connect again any time from the Wivoza link in Canvas.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm text-ink">
            {status.linked && (
              <li>
                <span className="font-semibold text-forest">Signs you in.</span> The Wivoza link in {status.canvasName ?? 'Canvas'} opens Wivoza as
                you.
              </li>
            )}
            {status.connected && (
              <li>
                <span className="font-semibold text-forest">Send to Canvas allowed.</span> Wivoza can list your courses and modules and add pages —
                nothing else.
              </li>
            )}
          </ul>
          {error && <p className="mt-3 text-sm text-terracotta-600">{error}</p>}
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="mt-4 rounded-full border border-terracotta px-4 py-2 text-sm font-semibold text-terracotta-600 transition-colors hover:bg-peach-tint disabled:opacity-60"
          >
            {busy ? 'Disconnecting...' : 'Disconnect Canvas'}
          </button>
        </>
      )}
    </div>
  )
}
