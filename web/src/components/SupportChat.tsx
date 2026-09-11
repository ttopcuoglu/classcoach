import { useEffect, useRef, useState } from 'react'
import { sendSupportChat, type SupportTurn } from '../lib/api'

const OPENER =
  'Hi — I can answer questions about Wivoza: what it does, what it costs, and how your data is handled. What would you like to know?'

const SUGGESTIONS = [
  'Does my principal see my recordings?',
  'What does it cost?',
  'What can I do with the free plan?',
]

const CONTACT_EMAIL = 'hello@wivoza.com'

// A public-page assistant for visitors who have no account yet. Deliberately
// separate from Coach: it answers questions ABOUT Wivoza, grounded server-side
// in a fixed fact sheet, and hands off to email whenever it can't.
// A small, deliberately low-fi face — this is the one bit of the site that
// should feel like a person rather than a product. Drawn rather than imported
// so it scales cleanly and stays on-palette.
//
// Two things are load-bearing at the 34px it actually renders at on the
// launcher: the cream ring, which is what separates a gold face from the
// terracotta pill it sits on (without it the two warm tones go muddy), and
// the deliberately heavy eyes and smile, since finer strokes turn to mush at
// that size. The raised brow and lopsided smile are what keep it from reading
// as a stock smiley; the cheeks only show at larger sizes and that is fine.
function CoachFace({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r="20" fill="#F7F3EA" />
      <circle cx="20" cy="20" r="17.6" fill="#E4B84A" />
      <circle cx="14" cy="18" r="3.1" fill="#1B2E28" />
      <circle cx="26" cy="18" r="2.7" fill="#1B2E28" />
      <path d="M23 12.4q3-1.8 5.8 0" stroke="#1B2E28" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <path d="M13 25.2q7 5.6 13.6-1.2" stroke="#1B2E28" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="10.5" cy="24" r="2" fill="#C96A45" opacity="0.35" />
      <circle cx="29.5" cy="23" r="2" fill="#C96A45" opacity="0.35" />
    </svg>
  )
}

export default function SupportChat() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<SupportTurn[]>([{ role: 'assistant', text: OPENER }])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // rAF, not a bare call: on the turn where a reply arrives the effect runs
    // before the new bubble has been laid out, so scrollHeight is still the
    // old value and the answer ends up clipped with the list short of the
    // bottom. Waiting one frame measures the real height.
    const id = requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [turns, sending, open])

  async function send(text: string) {
    const question = text.trim()
    if (!question || sending) return
    setDraft('')
    // History is sent without the canned opener — it isn't a real turn.
    const history = turns.filter((t, i) => !(i === 0 && t.role === 'assistant'))
    setTurns((prev) => [...prev, { role: 'user', text: question }])
    setSending(true)
    try {
      const reply = await sendSupportChat(question, history)
      setTurns((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: `I couldn’t reach the server. Email ${CONTACT_EMAIL} and a person will reply.` },
      ])
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-terracotta py-2 pl-2 pr-5 text-sm font-semibold text-cream shadow-lg transition-opacity hover:opacity-90"
      >
        <CoachFace />
        Questions about Wivoza?
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[28rem] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-hairline bg-cream-card shadow-xl">
      <div className="flex items-center justify-between border-b border-hairline bg-forest px-4 py-3">
        <div className="flex items-center gap-2">
          <CoachFace size={26} />
          <p className="font-heading text-sm font-bold text-cream">Ask about Wivoza</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-cream/70 hover:text-cream">
          ✕
        </button>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              t.role === 'user'
                ? 'self-end bg-mint-tint text-forest'
                : 'self-start border border-hairline bg-cream text-ink'
            }`}
          >
            {t.text}
          </div>
        ))}

        {turns.length === 1 && !sending && (
          <div className="mt-1 flex flex-col gap-2">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="rounded-xl border border-hairline bg-cream px-3.5 py-2 text-left text-sm text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {sending && (
          <div className="self-start rounded-2xl border border-hairline bg-cream px-3.5 py-2.5 text-sm text-ink-soft">
            <span className="inline-flex gap-1" aria-label="Thinking">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-terracotta/70" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* The email is always visible, not just offered when the bot gives up. */}
      <p className="border-t border-hairline px-4 py-2 text-center text-xs text-ink-soft">
        Need a person?{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-terracotta-600 hover:text-terracotta">
          {CONTACT_EMAIL}
        </a>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-2 border-t border-hairline p-3"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={600}
          placeholder="Ask a question…"
          className="min-w-0 flex-1 rounded-full border border-hairline bg-cream px-3.5 py-2 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="shrink-0 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
