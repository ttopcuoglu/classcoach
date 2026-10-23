import { useEffect, useState } from 'react'
import { getSchoolFocus, setSchoolFocus, type SchoolFocusItem, type SchoolFocusState } from '../lib/api'

// A teacher's own control over each school focus (docs/coaching-priorities.md).
// Saves at once. Every privacy sentence below is one the server enforces:
// admin routes never read these choices.

const OPTIONS: { state: SchoolFocusState; label: string }[] = [
  { state: 'on', label: 'On' },
  { state: 'paused', label: 'Pause' },
  { state: 'off', label: 'Off' },
]

function statusLabel(state: SchoolFocusState | null): string {
  if (state === 'on') return 'On'
  if (state === 'paused') return 'Paused'
  return 'Off'
}

export function SchoolFocusSettings() {
  const [items, setItems] = useState<SchoolFocusItem[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSchoolFocus()
      .then(({ items }) => setItems(items))
      .catch(() => setItems([]))
  }, [])

  // Home's "What it covers" links here; the section only exists once loaded.
  useEffect(() => {
    if (items?.length && window.location.hash === '#school-focus') {
      document.getElementById('school-focus')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [items])

  async function choose(id: string, state: SchoolFocusState) {
    setBusyId(id)
    setError(null)
    try {
      const { items } = await setSchoolFocus(id, state)
      setItems(items)
    } catch {
      setError("Couldn't save that. Try again.")
    } finally {
      setBusyId(null)
    }
  }

  if (!items || items.length === 0) return null

  return (
    <div id="school-focus" className="mt-5 border-t border-hairline pt-5">
      <h3 className="font-heading text-base font-bold text-forest">School focus</h3>
      <p className="mt-0.5 text-sm text-ink-soft">
        Focus areas your school shared. Off unless you turn one on, and it only comes up when it fits your lesson or
        the concern you bring.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {items.map((item) => {
          const current = item.state === 'later' ? 'off' : item.state
          return (
            <div key={item.id} className="rounded-2xl border border-hairline p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-forest">{item.name}</p>
                <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-ink">{statusLabel(current)}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{item.purpose}</p>
              <details className="mt-1.5 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-terracotta-600">What it covers</summary>
                <dl className="mt-2 flex flex-col gap-2 text-ink">
                  <div>
                    <dt className="text-xs font-semibold text-ink-soft">What it looks like</dt>
                    <dd className="whitespace-pre-line">{item.looksLike}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-ink-soft">When it fits</dt>
                    <dd className="whitespace-pre-line">{item.whenItFits}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-ink-soft">Ideas you could consider</dt>
                    <dd className="whitespace-pre-line">{item.ideas}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-ink-soft">When it may not fit</dt>
                    <dd className="whitespace-pre-line">{item.whenNotToUse}</dd>
                  </div>
                </dl>
              </details>
              <div role="group" aria-label={`${item.name} setting`} className="mt-3 flex flex-wrap gap-2">
                {OPTIONS.map((o) => {
                  const on = current === o.state || (o.state === 'off' && current === null)
                  return (
                    <button
                      key={o.state}
                      type="button"
                      aria-pressed={on}
                      disabled={busyId === item.id}
                      onClick={() => choose(item.id, o.state)}
                      className={`min-h-[44px] rounded-full border-[1.5px] px-4 text-sm font-semibold disabled:opacity-60 ${
                        on ? 'border-forest bg-forest text-cream' : 'border-hairline text-ink hover:border-forest/40'
                      }`}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="mt-2 text-sm text-terracotta-600">{error}</p>}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-soft">
        <li>Anything it shapes is labelled &ldquo;Connected to your selected school focus&rdquo;.</li>
        <li>
          Your school&rsquo;s administrators can&rsquo;t see whether it&rsquo;s on, or anything from your recordings,
          plans or conversations.
        </li>
        <li>Turning it off stops it from now on. Your past lessons and conversations stay as they are.</li>
      </ul>
    </div>
  )
}
