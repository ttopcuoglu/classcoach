import { Link } from 'react-router-dom'
import { ArrowRightIcon, ChartBarIcon, SparkleIcon } from '../components/icons'

type QA = { q: string; a: React.ReactNode }
type Category = { id: string; label: string; tint: string; items: QA[] }

const CATEGORIES: Category[] = [
  {
    id: 'privacy',
    label: 'Privacy & trust',
    tint: 'bg-mint-tint text-forest',
    items: [
      {
        q: 'Does my principal or administrator see my recordings or feedback?',
        a: 'No. Admins — at the school level or platform-wide — only ever see aggregate trends across their staff, like overall activity levels or category breakdowns. They never see an individual teacher\'s recordings, transcripts, answers, or ratings. Every admin view says this plainly on screen.',
      },
      {
        q: 'Is Wivoza used to evaluate me?',
        a: 'No. Wivoza is a private self-coaching companion, not an evaluation tool. Coach never assigns a grade, score, or rating you can see, and it\'s explicitly built to avoid language that functions like one.',
      },
      {
        q: 'Does Wivoza keep my voice or video?',
        a: 'No audio is ever kept. Talk It Through and Lesson Debrief both transcribe a recording and then immediately discard it — only the resulting text and metrics remain. Wivoza doesn\'t use a camera or video anywhere in the app.',
      },
      {
        q: 'Are student names or identifying details stored?',
        a: 'Coach is built to avoid it — it refers to people by role ("a student," "the class") even if you type a real name yourself, and it\'s instructed to avoid quoting anything that could indirectly identify a specific student.',
      },
      {
        q: 'What is "Coach\'s memory," and can I turn it off?',
        a: 'A short, running note Coach keeps about your recurring strengths and any ongoing challenges — built only from your real Ask and Talk It Through conversations, never from Practice rehearsals. It\'s on by default, but you can view it, turn it off, or clear it anytime from Profile & Settings.',
      },
      {
        q: 'Can I delete my data?',
        a: 'Yes. Profile & Settings has a "Reset & clear data" option that permanently removes your saved scenarios, answers, messages, and Lesson Debrief sessions.',
      },
    ],
  },
  {
    id: 'using-wivoza',
    label: 'Using Wivoza',
    tint: 'bg-gold-tint text-terracotta-600',
    items: [
      {
        q: 'Is the feedback from a real person or AI?',
        a: 'It\'s AI-generated, grounded only in real evidence — Wivoza is built not to invent a quote, number, or moment that wasn\'t actually said or measured. When something is unclear or missing, it says so rather than guessing.',
      },
      {
        q: 'What if Coach gets something wrong or misses something?',
        a: 'Treat it the way you\'d treat a colleague\'s read on a moment they weren\'t fully present for — a useful outside perspective, not the final word. Your own judgment always comes first.',
      },
      {
        q: 'Do I need to install an app?',
        a: 'No — Wivoza is a website that works in any modern browser, on your phone, tablet, or computer. No download required.',
      },
      {
        q: 'What devices does it work on?',
        a: 'Any device with a browser and a microphone. Talk It Through and Lesson Debrief have both been specifically tuned to work reliably on mobile, not just desktop.',
      },
    ],
  },
  {
    id: 'schools-districts',
    label: 'For schools & districts',
    tint: 'bg-peach-tint text-terracotta',
    items: [
      {
        q: 'Do I need my school\'s permission to sign up?',
        a: 'No — any teacher can create an individual account on their own, with nothing tied to a school. If your school later joins Wivoza, you can add yourself to it with a code without losing anything you\'ve already done.',
      },
      {
        q: 'If my school joins, does my admin see what I\'ve been doing?',
        a: 'Only in aggregate — overall activity levels and category trends across the whole staff, never your individual recordings, answers, or ratings. That boundary doesn\'t change based on how you were brought on.',
      },
      {
        q: 'What if I switch schools?',
        a: 'Your account and everything in it belongs to you — it isn\'t tied to a specific school. You can join a different district\'s code anytime from Profile & Settings.',
      },
    ],
  },
  {
    id: 'cost-getting-started',
    label: 'Cost & getting started',
    tint: 'bg-lavender-tint text-[#6B5FA0]',
    items: [
      {
        q: 'Is Wivoza free?',
        a: 'Yes, Wivoza is free to start today. Pricing for individuals and for school districts is still being finalized as the product grows.',
      },
      {
        q: 'How long does it take to get started?',
        a: 'A few minutes — sign up, walk through a short six-step welcome (skippable at any point), and you\'re on your dashboard.',
      },
      {
        q: 'Where can I see everything Wivoza can do?',
        a: (
          <>
            The <Link to="/guide" className="font-semibold text-terracotta-600 hover:underline">full feature guide</Link> covers every tool, field, and button in detail.
          </>
        ),
      },
    ],
  },
]

function FaqItem({ q, a }: QA) {
  return (
    <details className="group rounded-2xl border border-hairline bg-cream-card p-5 open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-heading text-base font-bold text-forest marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-tint text-lg font-bold leading-none text-forest transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{a}</p>
    </details>
  )
}

export default function Faq() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-4 w-4" />
            </span>
            <span className="font-heading text-base font-bold text-forest">Wivoza</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Guide
            </Link>
            <Link
              to="/#get-started"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Try Wivoza
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-3xl px-6 pb-14 pt-16 text-center">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-mint-tint px-4 py-2 text-sm font-semibold text-forest">
          <SparkleIcon className="h-4 w-4" />
          Frequently asked questions
        </span>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-forest sm:text-5xl">
          Good questions.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">
          The things teachers and school leaders actually ask before trying Wivoza — on privacy, evaluation,
          and how it works.
        </p>
      </section>

      {/* Quick nav */}
      <nav className="border-y border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-6 py-4">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-full border border-hairline bg-cream px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
            >
              {c.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        {CATEGORIES.map((category) => (
          <section key={category.id} id={category.id} className="scroll-mt-20 pb-14">
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${category.tint}`}>
              {category.label}
            </span>
            <div className="mt-6 flex flex-col gap-3">
              {category.items.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border border-hairline bg-cream-card p-7 text-center">
          <p className="font-heading text-lg font-bold text-forest">Still have a question?</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Take a look at the <Link to="/guide" className="font-semibold text-terracotta-600 hover:underline">full feature guide</Link>, or reach out through the app once you're signed in.
          </p>
        </div>
      </div>

      {/* Closing CTA */}
      <section className="bg-forest py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-forest">
            <ChartBarIcon className="h-6 w-6" />
          </span>
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream sm:text-4xl">
            Ready to try it yourself?
          </h2>
          <p className="max-w-md text-cream/70">Free to start, private by design.</p>
          <Link
            to="/#get-started"
            className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Start growing—free
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-cream py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-soft sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-3.5 w-3.5" />
            </span>
            <p className="font-heading font-bold text-forest">Wivoza</p>
            <span className="hidden sm:inline">Practice. Reflect. Grow.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hover:text-ink">
              Guide
            </Link>
            <Link to="/faq" className="hover:text-ink">
              FAQ
            </Link>
            <a href="/terms" className="hover:text-ink">
              Privacy
            </a>
            <a href="/terms" className="hover:text-ink">
              Terms
            </a>
            <span>&copy; 2026 Wivoza. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
