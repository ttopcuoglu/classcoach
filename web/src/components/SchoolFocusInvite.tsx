import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSchoolFocus, setSchoolFocus, type SchoolFocusItem } from '../lib/api'
import { ChatBubbleIcon, CheckIcon } from './icons'

// The one-time invitation to a school focus (docs/coaching-priorities.md).
// Shown once per version of a priority: "Maybe later" is an answer, stored on
// the server, so it never comes back — unless the school changes what the
// priority means. Off until the teacher says otherwise, and nothing about the
// answer goes to the school.
export function SchoolFocusInvite() {
  const [item, setItem] = useState<SchoolFocusItem | null>(null)
  const [answered, setAnswered] = useState<'on' | 'later' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getSchoolFocus()
      .then(({ items }) => setItem(items.find((i) => i.needsChoice) ?? null))
      .catch(() => {})
  }, [])

  async function answer(state: 'on' | 'later') {
    if (!item) return
    setBusy(true)
    try {
      await setSchoolFocus(item.id, state)
      setAnswered(state)
    } catch {
      // The card stays, so they can try again.
    } finally {
      setBusy(false)
    }
  }

  if (!item) return null

  if (answered === 'on') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl bg-mint-tint px-5 py-4 text-sm text-ink">
        <CheckIcon className="h-4 w-4 shrink-0 text-forest" />
        <span>
          {item.name} is on. You&rsquo;ll see it labelled where it comes up. Pause or remove it any time in{' '}
          <Link to="/profile#school-focus" className="font-semibold text-forest underline underline-offset-2">
            your profile
          </Link>
          .
        </span>
      </div>
    )
  }
  if (answered === 'later') {
    return (
      <div role="status" className="rounded-2xl border border-hairline bg-cream-card px-5 py-4 text-sm text-ink">
        No problem. Wivoza won&rsquo;t ask again about this focus. You can turn it on in your profile whenever you like.
      </div>
    )
  }

  return (
    <section aria-labelledby="school-focus-invite" className="rounded-3xl border-l-8 border-gold bg-gold-tint/50 p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
          <ChatBubbleIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
            {item.changed ? 'Your school updated a focus' : 'From your school'}
          </p>
          <h2 id="school-focus-invite" className="mt-1.5 font-heading text-lg font-bold text-forest">
            Your school is exploring {item.name}
          </h2>
          {item.changed && item.changeNote && <p className="mt-1 text-sm text-ink">What changed: {item.changeNote}</p>}
          <p className="mt-1 text-sm text-ink">
            {item.purpose} Would you like Wivoza to suggest relevant opportunities when you plan lessons and talk things
            through?
          </p>
          <p className="mt-1.5 text-xs text-ink-soft">
            Only when it fits what you&rsquo;re working on. Your choice is private: your school&rsquo;s administrators
            can&rsquo;t see whether it&rsquo;s on.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => answer('on')}
              className="min-h-[44px] rounded-full bg-forest px-5 text-sm font-semibold text-cream disabled:opacity-60"
            >
              Include this focus
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => answer('later')}
              className="min-h-[44px] rounded-full border-[1.5px] border-hairline px-5 text-sm font-semibold text-ink disabled:opacity-60"
            >
              Maybe later
            </button>
            <Link to="/profile#school-focus" className="text-sm font-semibold text-terracotta-600 underline underline-offset-2">
              What it covers
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
