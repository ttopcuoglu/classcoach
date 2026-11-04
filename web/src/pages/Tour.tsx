import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, CheckIcon, LaptopIcon, LockIcon, PhoneIcon, WatchIcon } from '../components/icons'
import { LessonScene, SAMPLE_SCENES } from '../components/SampleScenes'
import { ROOM_COLOR, ROOM_LABEL } from '../components/TalkFlowStrip'
import { PLUS_DEBRIEF_PER_MONTH, PLUS_MONTHLY_PRICE, PLUS_YEARLY_PRICE, INDIVIDUAL_PLAN } from '../lib/pricing'

// A test of the home page as a slideshow: one screen per slide, swiped one at
// a time. Not linked from anywhere and kept out of search (noindex below); the
// real home page is Landing.tsx. Every slide is built to fit a phone screen,
// because snapping only feels like a slideshow when no slide is taller than
// the screen — the reason it could not simply be switched on for the home page.
//
// The snapping is on this page's own scroller, not on <html>, and every slide
// is exactly one screen tall (100svh, the height with the iPhone toolbar
// showing), which is the case iPhone Safari handles cleanly.

const TALK: [keyof typeof ROOM_COLOR, number][] = [
  ['teacher', 39],
  ['student', 26],
  ['other', 23],
  ['quiet', 12],
]
const STRIP = ('tttttttststtsq' + 'ooosoooqoo' + 'tsstst' + 'qtst')
  .split('')
  .map((c) => ({ t: 'teacher', s: 'student', o: 'other', q: 'quiet' })[c] as keyof typeof ROOM_COLOR)

const NOTES = [
  { label: 'What worked', text: 'Asking “what if the cell had no oxygen?” got students predicting before you named fermentation.', card: 'bg-mint-tint', ink: 'text-forest' },
  { label: 'Where it could go further', text: 'Track one glucose molecule through each stage, so students see where the energy leaves.', card: 'bg-peach-tint', ink: 'text-terracotta-600' },
  { label: 'Where students usually get stuck', text: 'Many think plants photosynthesize instead of respiring. Ask what a plant does at night.', card: 'bg-gold-tint', ink: 'text-terracotta-600' },
]

function Slide({ tone, children, label }: { tone: 'dark' | 'cream' | 'mint' | 'peach'; children: ReactNode; label: string }) {
  const bg = { dark: 'bg-forest text-cream', cream: 'bg-cream text-ink', mint: 'bg-mint-tint text-ink', peach: 'bg-peach-tint text-ink' }[tone]
  return (
    <section
      aria-label={label}
      className={`relative flex h-[100svh] snap-start snap-always flex-col items-center justify-center overflow-hidden px-6 pb-10 pt-20 ${bg}`}
    >
      <div className="w-full max-w-md">{children}</div>
    </section>
  )
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${light ? 'text-gold' : 'text-terracotta-600'}`}>{children}</p>
  )
}

function Title({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <h2 className={`mt-2 font-heading text-3xl font-extrabold leading-tight ${light ? 'text-cream' : 'text-forest'}`}>{children}</h2>
  )
}

export default function Tour() {
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const count = INDIVIDUAL_PLAN ? 9 : 8

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const onScroll = () => {
    const el = scroller.current
    if (el) setActive(Math.round(el.scrollTop / el.clientHeight))
  }
  const goTo = (i: number) => {
    const el = scroller.current
    el?.scrollTo({ top: Math.max(0, Math.min(count - 1, i)) * el.clientHeight, behavior: 'smooth' })
  }

  // On a laptop, one wheel click or arrow key is one slide. Snapping alone
  // returns a single small wheel step to the slide it started on, so the page
  // seemed stuck. Phones send no wheel events and keep the native swipe.
  const lockUntil = useRef(0)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const step = (dir: number) => {
      const now = Date.now()
      if (now < lockUntil.current) return
      lockUntil.current = now + 700
      goTo(Math.round(el.scrollTop / el.clientHeight) + dir)
    }
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4) return
      e.preventDefault()
      step(Math.sign(e.deltaY))
    }
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        step(1)
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        step(-1)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scenes = [SAMPLE_SCENES.talk, SAMPLE_SCENES.improve, SAMPLE_SCENES.email]

  return (
    <div className="relative h-[100svh] overflow-hidden bg-forest">
      {/* Top bar over every slide. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        <Link to="/" className="pointer-events-auto rounded-full bg-cream/90 px-3 py-1.5 shadow-sm">
          <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-6 w-auto" />
        </Link>
        {/* A plain link, not a router Link: a full load is what scrolls the home
            page to its sign-up form. */}
        <a
          href="/#get-started"
          className="pointer-events-auto rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream shadow"
        >
          Start free
        </a>
      </div>

      {/* Where you are, and a way to jump. */}
      <nav aria-label="Slides" className="absolute right-2.5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            aria-current={i === active}
            onClick={() => goTo(i)}
            className={`h-2 w-2 rounded-full ring-1 ring-forest/20 transition-all ${i === active ? 'h-5 bg-gold' : 'bg-cream/70'}`}
          />
        ))}
      </nav>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* 1. The promise, over the empty classroom. */}
        <section aria-label="A coach after every lesson" className="relative flex h-[100svh] snap-start snap-always flex-col justify-end overflow-hidden px-6 pb-16 pt-20 text-cream">
          <img src="/hero-classroom.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[62%_30%]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(27,46,40,.2)_0%,rgba(27,46,40,.75)_45%,#1b2e28_80%)]" />
          <div className="relative mx-auto w-full max-w-md">
            <Eyebrow light>Coaching for your content and your teaching</Eyebrow>
            <h1 className="mt-3 font-heading text-5xl font-extrabold leading-[1.02]">
              A coach after every <span className="text-gold">lesson.</span>
            </h1>
            <p className="mt-4 text-lg text-cream/80">Record a class. See how you taught it, and one thing to try next.</p>
            <p className="mt-10 flex items-center gap-2 text-sm font-semibold text-cream/70">
              <ArrowRightIcon className="h-4 w-4 -rotate-90 animate-bounce" />
              Swipe up
            </p>
          </div>
        </section>

        {/* 2. What arrives after class. */}
        <Slide tone="cream" label="Your Lesson Debrief">
          <Eyebrow>After every lesson</Eyebrow>
          <Title>Your lesson, read back to you.</Title>
          <div className="mt-5 rounded-2xl border border-hairline bg-cream-card p-1.5 shadow-xl">
            <div className="h-[44svh] overflow-hidden rounded-xl">
              <img src="/samples/hero-debrief-summary.png" alt="A sample Lesson Debrief for an invented biology lesson." className="w-full" />
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">One focus for next lesson, what the lesson covered, and how it moved. A sample, an invented class.</p>
        </Slide>

        {/* 3. The content half. */}
        <Slide tone="dark" label="Content Specialist">
          <div className="h-28">
            <LessonScene />
          </div>
          <Eyebrow light>Content Specialist</Eyebrow>
          <Title light>How you taught the content.</Title>
          <div className="mt-4 flex flex-col gap-2.5">
            {NOTES.map((n) => (
              <div key={n.label} className={`rounded-xl px-3.5 py-2.5 ${n.card}`}>
                <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${n.ink}`}>{n.label}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink">{n.text}</p>
              </div>
            ))}
          </div>
        </Slide>

        {/* 4. The teaching half. */}
        <Slide tone="mint" label="Talk and participation">
          <Eyebrow>How the lesson ran</Eyebrow>
          <Title>Who talked, and when.</Title>
          <div className="mt-6 rounded-2xl border border-hairline bg-cream-card p-5 shadow-lg">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest">Talk &amp; Participation</p>
            <div className="mt-3 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
              {TALK.map(([k, pct]) => (
                <span key={k} style={{ width: `${pct}%`, background: ROOM_COLOR[k] }} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 whitespace-nowrap text-[13px] font-semibold">
              {TALK.map(([k, pct]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ROOM_COLOR[k] }} />
                  {ROOM_LABEL[k]}
                  <span className="ml-auto pl-1 text-ink-soft">{pct}%</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Minute by minute</p>
            <div className="mt-1.5 flex h-6 gap-px">
              {STRIP.map((k, i) => (
                <span key={i} className="flex-1 rounded-[2px]" style={{ background: ROOM_COLOR[k] }} />
              ))}
            </div>
          </div>
          <p className="mt-5 text-ink-soft">Plus the questions you asked, your pace, and your think time. Never a score.</p>
        </Slide>

        {/* 5. How to record. */}
        <Slide tone="cream" label="Record your way">
          <Eyebrow>Record your way</Eyebrow>
          <Title>Wrist, phone, or laptop.</Title>
          <div className="mt-6 flex flex-col gap-3">
            {[
              { Icon: WatchIcon, title: 'Apple Watch', text: 'Tap once and keep teaching.', tint: 'bg-gold-tint/60' },
              { Icon: PhoneIcon, title: 'iPhone', text: 'Pocket it and walk the room.', tint: 'bg-mint-tint/70' },
              { Icon: LaptopIcon, title: 'Laptop', text: 'Record in the browser. Nothing to install.', tint: 'bg-peach-tint/70' },
            ].map(({ Icon, title, text, tint }) => (
              <div key={title} className={`flex items-center gap-4 rounded-2xl p-4 ${tint}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-heading text-lg font-bold text-forest">{title}</p>
                  <p className="text-sm text-ink-soft">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <a href="https://apps.apple.com/us/app/wivoza/id6808223345" target="_blank" rel="noreferrer" className="mt-6 inline-block">
            <img src="/badges/app-store-badge.svg" alt="Download on the App Store" className="h-10 w-auto" />
          </a>
        </Slide>

        {/* 6. The rest of the coach. */}
        <Slide tone="peach" label="Between lessons">
          <Eyebrow>Between lessons</Eyebrow>
          <Title>Talk it through. Plan the next one.</Title>
          <div className="mt-5 flex flex-col gap-3">
            {[
              { title: 'Talk It Through', text: 'Talk out a hard class with Coach.' },
              { title: 'Planning Coach', text: 'Build or improve a lesson.' },
              { title: 'Communication Coach', text: 'A parent email, read before you send it.' },
            ].map(({ title, text }, i) => {
              const { Scene, tint } = scenes[i]
              return (
                <div key={title} className="flex items-center gap-3 rounded-2xl bg-cream-card p-3 shadow-sm">
                  <div className={`h-16 w-28 shrink-0 overflow-hidden rounded-xl px-1 pt-1 ${tint}`}>
                    <Scene />
                  </div>
                  <div>
                    <p className="font-heading text-base font-bold text-forest">{title}</p>
                    <p className="text-sm text-ink-soft">{text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Slide>

        {/* 7. Privacy. */}
        <Slide tone="dark" label="Private by design">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-forest">
            <LockIcon className="h-7 w-7" />
          </span>
          <div className="mt-5">
            <Eyebrow light>Private by design</Eyebrow>
          </div>
          <Title light>Your reports are yours.</Title>
          <ul className="mt-6 flex flex-col gap-3 text-lg">
            {['Only you see your reports', 'Never scored, never an evaluation', 'Audio never kept, only the transcript', 'Your school sees trends, never your lessons'].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckIcon className="mt-1 h-5 w-5 shrink-0 text-gold" />
                <span className="text-cream/90">{t}</span>
              </li>
            ))}
          </ul>
        </Slide>

        {/* 8. Price. Hidden while INDIVIDUAL_PLAN is off. */}
        {INDIVIDUAL_PLAN && (
        <Slide tone="mint" label="Pricing">
          <Eyebrow>Simple, honest pricing</Eyebrow>
          <Title>Start free.</Title>
          <div className="mt-5 flex flex-col gap-3">
            <div className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-heading text-xl font-bold text-forest">Free</p>
                <p className="font-heading text-3xl font-extrabold text-forest">$0</p>
              </div>
              <p className="mt-1 text-sm text-ink-soft">Talk It Through, Practice, and 3 Lesson Debriefs a month.</p>
            </div>
            <div className="rounded-2xl border-2 border-terracotta bg-cream-card p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-heading text-xl font-bold text-forest">Wivoza Plus</p>
                <p className="font-heading text-3xl font-extrabold text-forest">
                  {PLUS_MONTHLY_PRICE}
                  <span className="text-sm font-semibold text-ink-soft">/mo</span>
                </p>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                Up to {PLUS_DEBRIEF_PER_MONTH} Lesson Debriefs a month, Planning and Communication Coach. Or {PLUS_YEARLY_PRICE} a year.
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">No credit card to sign up.</p>
        </Slide>
        )}

        {/* 9. Start. */}
        <section aria-label="Start free" className="relative flex h-[100svh] snap-start snap-always flex-col items-center justify-center overflow-hidden px-6 text-center text-cream">
          <img src="/hero-classroom.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[62%_30%]" />
          <div aria-hidden="true" className="absolute inset-0 bg-forest/85" />
          <div className="relative w-full max-w-md">
            <h2 className="font-heading text-4xl font-extrabold leading-tight">
              Your next lesson,<br />
              <span className="text-gold">coached.</span>
            </h2>
            <p className="mt-4 text-cream/80">Two minutes to start. Nothing to set up.</p>
            <a
              href="/#get-started"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-4 font-semibold text-cream shadow-lg"
            >
              Start free
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <p className="mt-6 text-sm">
              <Link to="/" className="font-semibold text-gold underline-offset-4 hover:underline">
                See the full site
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
