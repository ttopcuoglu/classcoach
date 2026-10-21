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
        a: 'No. Admins — at the school level or platform-wide — only ever see aggregate trends across their staff, like how many teachers are using Wivoza, or how often clear directions or wait time come up across recorded lessons. No number is tied to a teacher, and they never see anyone\'s recordings, transcripts, reports, answers, or ratings. Every admin view says this plainly on screen.',
      },
      {
        q: 'Is Wivoza used to evaluate me?',
        a: 'No. Wivoza is a private self-coaching companion, not an evaluation tool. Coach never assigns a grade, score, or rating you can see, and it\'s explicitly built to avoid language that functions like one.',
      },
      {
        q: 'Does Wivoza keep my voice or video?',
        a: 'No audio is ever kept. Talk It Through and Lesson Debrief both transcribe a recording and then immediately discard it — only the resulting text and metrics remain. Wivoza never records video. A camera is used only if you choose to photograph a worksheet or lesson materials, and that photo is read for its text and not stored.',
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
        a: 'A short, running note Coach keeps about your recurring strengths and any ongoing challenges — built only from your real Talk It Through conversations and Lesson Debrief reflections, never from Practice rehearsals. It\'s on by default, but you can view it, turn it off, or clear it anytime from Profile & Settings.',
      },
      {
        q: 'What happens to what I send Coach on Telegram?',
        a: 'The text of the conversation is saved in your account like any Talk It Through conversation, and you can delete it the same way. A voice note is transcribed and a photo is read, and neither file is kept. An email you forward is saved with the draft reply it produced. Messages reach Wivoza through Telegram, which handles them under its own privacy policy, and you can disconnect the chat at any time.',
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
        q: 'Can I reach Coach without opening Wivoza?',
        a: 'Yes. Connect Telegram from Profile & Settings and Coach is a chat on your phone: type, send a voice note, photograph a worksheet, or forward an email you need to answer. Short things, like a few lesson ideas or a draft reply, arrive in the chat; longer ones arrive as a PDF or open in Wivoza already signed in.',
      },
      {
        q: 'Will Coach follow up with me?',
        a: 'A few days after a Talk It Through conversation, Coach checks in once on the next step you chose. It is one check-in at a time, and you can skip it or turn check-ins off.',
      },
      {
        q: 'What do I get from a Lesson Debrief?',
        a: 'A private report with six tabs. Summary is the 60-second read: one thing to try next lesson, what the lesson covered, how the lesson moved, its numbers (your share of the talk and the students’, sound and quiet, pace, questions, Teacher-Anchored Wait Time and checks for understanding), and one thing to keep doing. Insights has the detail in those four sections — Talk & Participation, Questioning & Checking, Clarity & Content, and Climate & Routines — always shown in your own words, with the time you said them. Content Specialist offers a subject specialist\'s ideas for teaching the topic. Rubric lens, Reflect, and My Growth cover the rest.',
      },
      {
        q: 'What is Teacher-Anchored Wait Time (TAWT)?',
        a: 'After each question that asks students to explain or reason, how long you left it with the class before you spoke again, with any student answer included. The report lists each of those questions with its time, and whether a student answered, no one did, or you kept talking. It measures your side of the pause, which the microphone hears reliably even when students are faint. When no one answered, three seconds or more of silence gives most students time to think.',
      },
      {
        q: 'Can I save or share a Lesson Debrief?',
        a: 'Yes. On the Summary, choose Save the full report as a PDF. You get the Summary and all four Insights sections, each on its own page, with every list opened up. The Hard Look is never included. The PDF is yours to keep or pass on; nothing is shared unless you send it.',
      },
      {
        q: 'What if the recording only caught part of the lesson?',
        a: 'The report says so at the top — how much of the recording came through as audible speech — and its numbers come only from that part. Anything it could not measure shows as unavailable rather than as a zero.',
      },
      {
        q: 'What is the Hard Look?',
        a: 'An optional second reading of a Lesson Debrief that says the least generous thing the evidence can support, with the moments it is based on — for the whole lesson from the Summary, or for one section from the foot of that section. You ask for it; it never appears on its own. Where the recording cannot carry a criticism it says so, and it is left out of the PDF, so it stays between you and Coach.',
      },
      {
        q: 'Does the Rubric lens rate my lesson?',
        a: 'No. On request, it sorts what your recording captured under the Danielson rubric’s classroom domains and gives one next step for each component. It never assigns a level or a score.',
      },
      {
        q: 'Do I need to install an app?',
        a: (
          <>
            No — Wivoza works in any modern browser, on your phone, tablet, or computer, with nothing to download. If you
            prefer an app, Wivoza is also{' '}
            <a href="https://apps.apple.com/us/app/wivoza/id6808223345" target="_blank" rel="noreferrer" className="font-semibold text-terracotta-600 hover:underline">
              on the App Store for iPhone
            </a>
            , using the same account.
          </>
        ),
      },
      {
        q: 'What devices does it work on?',
        a: 'Any device with a browser and a microphone, plus the iPhone app. Talk It Through and Lesson Debrief have both been specifically tuned to work reliably on mobile, not just desktop.',
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
        a: 'Only in aggregate — activity levels and patterns across the whole staff\'s recorded lessons, never your individual recordings, reports, answers, or ratings. That boundary doesn\'t change based on how you were brought on.',
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
        a: 'Yes — Talk It Through and Practice are free for everyone, always, plus 3 Lesson Debrief recordings a month. Wivoza Plus is $14.99/month, or $119/year (about $9.92 a month), for Lesson Debrief on up to 20 lessons a month, Planning Coach, Communication Coach, and Coach’s memory. Schools and districts can get Plus-level access for every teacher through a license — tell us about your school at wivoza.com/for-schools and we’ll be in touch.',
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
            <Link to="/research" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Research
            </Link>
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
            <Link to="/research" className="hover:text-ink">
              Research
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
