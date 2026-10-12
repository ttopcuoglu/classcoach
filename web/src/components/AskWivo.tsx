import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Wivo on Home: the front desk for a teacher who has not chosen a tool.
//
// Deliberately ONE turn. Wivo asks, the teacher types a sentence, and the
// answer is a short reply plus the right door with the form already filled —
// then Wivo steps aside. If it kept the conversation going it would be the
// chat front door we decided against, where every teacher pays a model call
// to reach a page they could have clicked in the sidebar.
//
// The character is the face of Coach, not a second personality: same voice,
// same name in the copy. It has no nav entry, which is the whole point — it
// is for the teacher who does not already know where to go.

type Offer = {
  key: string
  label: string
  path: string
}

type RouteAnswer = {
  reply: string
  offer: Offer | null
}

// Three, and they appear only while the box is focused and empty — a
// teacher who knows what to ask never sees them, and they float over the
// cards below rather than pushing them down the page.
//
// Their real job is teaching the range, not saving typing, so they point at
// three different doors: something to think through, something to send, and
// something to build. Written the way a teacher would actually say it — a
// chip reading "Analyze my lesson" teaches the product's words instead of
// inviting the teacher's own.
const EXAMPLES = [
  'My 4th period is slipping away from me',
  'I have to tell a parent their kid is failing',
  'I am teaching fractions Thursday and have nothing',
]

type Phase = 'idle' | 'thinking' | 'answered'

// One character, three states — not three characters. A static mascot reads
// as a sticker; these are the only three moments it has.
const POSE: Record<Phase, string> = {
  idle: '/mascot/wivo-wave.png',
  thinking: '/mascot/wivo-thinking.png',
  answered: '/mascot/wivo-offer.png',
}

export default function AskWivo() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [answer, setAnswer] = useState<RouteAnswer | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function ask(question: string) {
    if (!question || phase === 'thinking') return
    setText(question)
    setFocused(false)
    setPhase('thinking')
    try {
      const res = await fetch('/api/coach/route', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: question }),
      })
      setAnswer((await res.json()) as RouteAnswer)
    } catch {
      setAnswer({ reply: 'Coach could not be reached just now. The tools in the sidebar all still work.', offer: null })
    }
    setPhase('answered')
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    void ask(text.trim())
  }

  // Only while the box is focused AND empty: the moment a teacher starts
  // typing they have their own question and the list is in the way.
  const showExamples = focused && !text.trim() && phase === 'idle'

  function reset() {
    setPhase('idle')
    setText('')
    setAnswer(null)
    // Focus follows the reset, so "ask something else" lands the cursor
    // where the next sentence goes.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    // Idle: Wivo stands on the same baseline as the input. Answered: the
    // panel is taller than it is, so bottom-aligning leaves it stranded in
    // the corner — it centres against the answer instead.
    <div className={`mt-4 flex flex-wrap gap-x-4 gap-y-3 ${phase === 'answered' ? 'items-center' : 'items-end'}`}>
      {/* Decorative: the real question is the label and the placeholder
          beside it, so a screen reader should not also announce the
          drawing. Body is already a speech bubble — never put a second
          bubble graphic next to it. */}
      <img
        src={POSE[phase]}
        alt=""
        aria-hidden="true"
        width={168}
        height={140}
        className={`h-24 w-auto shrink-0 select-none sm:h-40 ${phase === 'thinking' ? 'animate-pulse' : ''}`}
      />

      <div className="min-w-0 flex-1 basis-full sm:max-w-2xl sm:basis-0">
        {phase === 'answered' && answer ? (
          <div className="rounded-2xl bg-cream/5 p-4 ring-1 ring-cream/10">
            <p className="text-sm leading-relaxed text-cream/90">{answer.reply}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {answer.offer && (
                <Link
                  to={answer.offer.path}
                  className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90"
                >
                  {answer.offer.label} →
                </Link>
              )}
              <button type="button" onClick={reset} className="text-xs font-medium text-cream/60 underline underline-offset-2 hover:text-cream">
                Ask something else
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="relative">
            <label htmlFor="ask-wivo" className="block text-lg text-cream/80 sm:text-xl">
              What do you need help with right now?
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-full bg-cream/10 p-1.5 pl-5 ring-1 ring-cream/15 focus-within:ring-gold">
              <input
                id="ask-wivo"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => e.key === 'Escape' && setFocused(false)}
                disabled={phase === 'thinking'}
                autoComplete="off"
                placeholder="A lesson, a parent, a hard class..."
                className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-cream/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={phase === 'thinking' || !text.trim()}
                className="shrink-0 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-forest transition-opacity disabled:opacity-40"
              >
                {phase === 'thinking' ? 'Thinking...' : 'Ask'}
              </button>
            </div>

            {/* Absolutely positioned on purpose: an inline list would shove
                the action cards down the page every time the box is
                focused, and a layout that jumps under the cursor is worse
                than no examples at all. */}
            {showExamples && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-hairline bg-cream-card p-2 shadow-xl">
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                  Not sure? Try one of these
                </p>
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    // The input keeps focus through the click, so the blur
                    // that would close this list never fires before the
                    // click lands on it.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void ask(example)}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-gold-tint/60"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
