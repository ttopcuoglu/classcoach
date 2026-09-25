import { Link } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import { ArrowRightIcon, SparkleIcon } from '../components/icons'
import FooterContact from '../components/FooterContact'

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
        q: 'What happens to a presentation or document I upload?',
        a: 'The file itself is not stored. It is read in memory to pull out its text (and, if you choose to keep them, its pictures) and then discarded. The text is kept with that work like anything else you submit. When you attach your original file so your own pictures are carried into a new deck or document, those pictures are used only for that request and go straight into the file you download.',
      },
      {
        q: 'Where do the pictures Wivoza adds come from?',
        a: 'When a slide needs a picture you didn\'t supply, Wivoza searches Wikimedia Commons using a few words about the slide\'s topic — never your name, your file, or student details. It uses only public-domain and Creative Commons pictures, shows the credit line on the slide, and skips anything that isn\'t classroom-safe. If nothing fits well, it leaves a marked spot instead of a random photo.',
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
        a: 'Yes — Talk It Through and Ask & Practice are free for everyone, always, plus 3 Lesson Debrief recordings a month. Wivoza Plus is $9.99/month for unlimited Lesson Debrief, Lesson Planning, Messages, and Coach’s memory. Schools and districts can get Plus-level access for every teacher through a license — tell us about your school at wivoza.com/for-schools and we’ll be in touch.',
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
    <details className="group rounded-2xl border border-hairline bg-cream-card p-5 transition-colors open:border-gold/60 open:bg-gold-tint/30">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-heading text-base font-bold text-forest marker:content-none [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-lg font-bold leading-none text-forest transition-transform duration-200 group-open:rotate-45 group-open:bg-terracotta group-open:text-cream">
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
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Guide
            </Link>
            <Link
              to="/#get-started"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Start free
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10">
        <div className="rounded-3xl bg-forest px-6 py-12 text-center text-cream sm:px-12 sm:py-16">
        <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm font-semibold text-gold">
          <SparkleIcon className="h-4 w-4" />
          Frequently asked questions
        </span>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-cream sm:text-5xl">
          Good questions<span className="text-gold">.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-cream/70">
          The things teachers and school leaders actually ask before trying Wivoza — on privacy, evaluation,
          and how it works.
        </p>
        </div>
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
        {CATEGORIES.map((category, i) => (
          <section key={category.id} id={category.id} className="scroll-mt-20 pb-14">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
                  ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold'][i % 3]
                }`}
              >
                {i + 1}
              </span>
              <h2 className="font-heading text-2xl font-extrabold text-forest">{category.label}</h2>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              {category.items.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-7 text-center">
          <p className="font-heading text-lg font-bold text-forest">Still have a question?</p>
          <p className="mt-1.5 text-sm text-ink-soft">
            Take a look at the <Link to="/guide" className="font-semibold text-terracotta-600 hover:underline">full feature guide</Link>, or reach out through the app once you're signed in.
          </p>
        </div>
      </div>

      {/* Closing CTA */}
      <section className="bg-forest py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 text-center">
          <img src="/logo/wivoza-lockup-dark.png" alt="Wivoza" className="h-12 w-auto" />
          <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream sm:text-4xl">
            Ready to try it yourself?
          </h2>
          <p className="max-w-md text-cream/70">Free to start, private by design.</p>
          <Link
            to="/#get-started"
            className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
          >
            Start free
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-cream py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-soft sm:flex-row">
          <div className="flex items-center gap-2.5">
            <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-6 w-auto" />
            <span className="hidden sm:inline">Practice. Reflect. Grow.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
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
            <span>&copy; 2026 Edinexa Technologies LLC. All rights reserved.</span>
          </div>
        </div>
        <FooterContact />
      </footer>
      <SupportChat />
    </div>
  )
}
