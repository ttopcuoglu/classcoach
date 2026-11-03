import { useState } from 'react'
import SupportChat from '../components/SupportChat'
import { Link, useLocation } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import {
  ArrowRightIcon,
  BookIcon,
  BrainIcon,
  BrowserIcon,
  ChartBarIcon,
  CheckIcon,
  ChatBubbleIcon,
  CloseIcon,
  GraduationCapIcon,
  HeadsetIcon,
  LessonPlanIcon,
  LockIcon,
  MailIcon,
  MenuIcon,
  PhoneIcon,
  PlayIcon,
  QuoteIcon,
  SparkleIcon,
  TargetIcon,
  TelegramIcon,
  YouTubeIcon,
} from '../components/icons'
import { introVideo, MEET_PLAYLIST_ID, VideoFacade } from '../components/TrainingVideos'
import FooterContact from '../components/FooterContact'
import RecordYourWay from '../components/RecordYourWay'
import { ROOM_COLOR, ROOM_LABEL } from '../components/TalkFlowStrip'
import { PLUS_DEBRIEF_PER_MONTH, PLUS_MONTHLY_PRICE, PLUS_YEARLY_PER_MONTH, PLUS_YEARLY_PRICE } from '../lib/pricing'

const PROCESS = [
  {
    icon: HeadsetIcon,
    tint: 'bg-mint-tint text-forest',
    title: 'Teach the lesson',
    description: 'Record a class on your phone or in your browser — or talk through a moment while it is still fresh.',
  },
  {
    icon: BrainIcon,
    tint: 'bg-peach-tint text-terracotta',
    title: 'See how the content landed',
    description: 'What worked and why, where it could go further, and where students usually get stuck in this topic — not a wall of scores.',
  },
  {
    icon: TargetIcon,
    tint: 'bg-gold-tint text-terracotta-600',
    title: 'Plan the next one',
    description: 'Your one thing to try carries straight into Planning Coach, so the next lesson starts from what you learned in this one.',
  },
]

// All six features, grouped by the moment in a teacher's day they serve. Six
// separate tools is a list to read; three moments is a shape to remember —
// and it keeps the home page from showing four features in one place and six
// in another. Icons match the ones each feature uses inside the app.
const MOMENTS = [
  {
    moment: 'Prepare',
    when: 'Before class — plans and assignments that ask for real thinking.',
    features: [
      {
        icon: LessonPlanIcon,
        tint: 'bg-lavender-tint text-[#6B5FA0]',
        title: 'Planning Coach',
        slug: 'lesson-planning',
        description: 'Build a lesson from a topic — or strengthen the one you wrote — then adapt it to simplify, add challenge, or fit the time you actually have.',
      },
      {
        icon: BookIcon,
        tint: 'bg-gold-tint text-terracotta-600',
        // A tab inside Planning Coach now, not a tool of its own. It keeps a
        // card because it is a different job from writing a lesson.
        title: 'Assignment review',
        slug: 'lesson-planning',
        description: 'Inside Planning Coach: paste, upload, or photograph an assignment to see what it really asks, redesign it for meaningful AI use, then save it as Word, PDF, or PowerPoint.',
      },
    ],
  },
  {
    moment: 'Reflect',
    when: 'After class — see what happened, and think it through.',
    features: [
      {
        icon: ChartBarIcon,
        tint: 'bg-peach-tint text-terracotta',
        title: 'Lesson Debrief',
        slug: 'lesson-debrief',
        description: 'See how you taught the content — what worked, where it could go further, where students usually get stuck — plus the questions you asked, talk and pace, and one focus for next lesson. Add the Danielson rubric or the Hard Look.',
      },
      {
        icon: HeadsetIcon,
        tint: 'bg-mint-tint text-forest',
        title: 'Talk It Through',
        slug: 'talk-it-through',
        description: 'A live voice coach for sorting through what happened and what to do next. Type instead whenever you can’t talk.',
      },
    ],
  },
  {
    // Not "Communicate": Practice is mostly about classroom moments —
    // resistance, disruption, disengagement — not messages to adults.
    moment: 'Handle the hard moments',
    when: 'When it gets difficult — find the words, then practice them.',
    features: [
      {
        icon: ChatBubbleIcon,
        tint: 'bg-mint-tint text-forest',
        title: 'Practice',
        slug: 'ask-practice',
        description: 'Rehearse a hard moment — a classroom situation or a conversation — judgment-free.',
      },
      {
        icon: MailIcon,
        tint: 'bg-peach-tint text-terracotta',
        title: 'Communication Coach',
        slug: 'communication-coach',
        description: 'Write the message, prepare for the meeting, or rehearse the conversation.',
      },
    ],
  },
]

// Old pastel icon tints mapped onto the app's solid badge + tinted card pairs,
// so the landing page's feature cards match the cards inside the app.
const TINT_STYLES: Record<string, { badge: string; card: string; ink: string }> = {
  'bg-mint-tint text-forest': { badge: 'bg-forest text-gold', card: 'bg-mint-tint/50', ink: 'text-forest' },
  'bg-peach-tint text-terracotta': { badge: 'bg-terracotta text-cream', card: 'bg-peach-tint/50', ink: 'text-terracotta-600' },
  'bg-gold-tint text-terracotta-600': { badge: 'bg-gold text-forest', card: 'bg-gold-tint/50', ink: 'text-terracotta-600' },
  'bg-lavender-tint text-[#6B5FA0]': { badge: 'bg-forest text-gold', card: 'bg-mint-tint/50', ink: 'text-forest' },
}
const COLUMN_BADGES = ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold']

// The three places Coach can be reached. Telegram and the iPhone app shipped
// without the home page ever saying so.
const PLACES = [
  {
    icon: BrowserIcon,
    tint: 'bg-mint-tint text-forest',
    brand: false,
    title: 'In your browser',
    description: 'Every tool, on a phone, tablet, or laptop. Nothing to install.',
    href: null,
    cta: null,
  },
  {
    icon: PhoneIcon,
    tint: 'bg-peach-tint text-terracotta',
    brand: false,
    title: 'On your iPhone',
    description: 'Record a lesson from the phone in your pocket, with the same account.',
    href: 'https://apps.apple.com/us/app/wivoza/id6808223345',
    cta: 'Download on the App Store',
  },
  {
    icon: TelegramIcon,
    tint: 'bg-gold-tint text-terracotta-600',
    // Telegram's own mark, shown whole instead of on a tinted badge.
    brand: true,
    title: 'In Telegram',
    description: 'Text Coach, send a voice note on the way home, photograph the worksheet in front of you, or forward the email you need to answer. Connect it from your Profile.',
    href: null,
    cta: null,
  },
]

const VALUE_PROPS = ['Private by design', 'Judgment-free', 'Built for busy educators', 'Actionable, not overwhelming']

// Sample reports. A shrunken screenshot of a page shows the shape of a report
// but not one readable sentence, so it proves nothing at card size. Each card
// instead shows the single moment that makes the point — the problem, then what
// Wivoza did about it — as real text, with the full printed report a click away.
// Excerpts are quoted, or closely paraphrased, from the reports themselves;
// every scenario is invented.
const SAMPLES = [
  {
    feature: 'Talk It Through',
    eyebrow: 'Talk it through',
    title: 'A tough class, talked through out loud',
    before: {
      label: 'You said',
      text: '“I’ve got about five kids who just call out constantly … and honestly the quiet kids have just stopped trying.”',
    },
    after: {
      label: 'What you’ll try',
      text: 'Written answers first, a ten-second neighbor check, then call on students by name — opening class by saying you want to hear more voices.',
    },
    pdf: '/samples/talk-it-through.pdf',
  },
  {
    feature: 'Communication Coach',
    eyebrow: 'Review my communication',
    title: 'A parent email, read before you send it',
    before: {
      label: 'Your draft',
      text: '“If he had paid closer attention and followed the directions, his grade would have been higher. … The grade will remain as entered.”',
    },
    after: {
      label: 'Revised',
      text: '“I’m glad to sit down with your son, walk through the rubric point by point, and show him exactly where points were earned or lost.”',
    },
    pdf: '/samples/second-read.pdf',
  },
  {
    feature: 'Planning Coach',
    eyebrow: 'Redesign for AI',
    title: 'An assignment, redesigned for AI',
    before: {
      label: 'Where AI does the thinking',
      text: 'Writing the full 500-word essay on food chains and food webs.',
    },
    after: {
      label: 'The safeguard',
      text: 'A short check-in where students explain their food chain and defend what would happen if one organism disappeared.',
    },
    pdf: '/samples/redesign-ai.pdf',
  },
  {
    feature: 'Planning Coach',
    eyebrow: 'Improve a lesson',
    title: 'Feedback that makes a good plan better',
    before: {
      label: 'Your plan',
      text: '“Thirty seconds on your own first. Then with your partner, agree on one claim and one piece of evidence from the testimony.”',
    },
    after: {
      label: 'Coach’s suggestion',
      text: 'Model the move once before pairs try it: read one sentence together and think aloud, “this line makes me think X, because it says Y.”',
    },
    pdf: '/samples/lesson-plan-feedback.pdf',
  },
]

function SampleCard({ feature, eyebrow, title, before, after, pdf }: (typeof SAMPLES)[number]) {
  return (
    <a
      href={pdf}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col rounded-2xl border border-hairline bg-cream-card p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Title first, held to two lines, so the three cards line up across the
          row no matter how long each excerpt below runs. */}
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">{feature}</span>
      <h3 className="mt-2 min-h-[3.25rem] font-heading text-lg font-bold leading-snug text-forest">{title}</h3>

      {/* A small replica of the printed report: its cover band, then the moment. */}
      <div className="mt-4 flex flex-1 flex-col rounded-xl border border-hairline bg-white p-3.5">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-forest px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gold">{eyebrow}</p>
          <span className="shrink-0 rounded-full bg-cream/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
            Sample
          </span>
        </div>
        <div className="mt-3 rounded-lg bg-peach-tint/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-terracotta-600">{before.label}</p>
          <p className="mt-1 text-sm leading-snug text-ink">{before.text}</p>
        </div>
        <div className="my-1.5 flex justify-center text-ink-soft/60" aria-hidden="true">
          <ArrowRightIcon className="h-4 w-4 rotate-90" />
        </div>
        <div className="rounded-lg bg-mint-tint/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-forest">{after.label}</p>
          <p className="mt-1 text-sm leading-snug text-ink">{after.text}</p>
        </div>
      </div>

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-forest">
        View the full sample
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}

// The sample band: the Content Specialist's notes in miniature, as real text.
// Same invented class as the hero and the published sample report
// (/samples/lesson-debrief.pdf, made by scripts/capture-full-sample.mjs) — a
// biology lesson on cellular respiration, not a real one — and the frame says
// "Sample" so nobody reads them as someone's results.
const SAMPLE_NOTES = [
  {
    label: 'What worked',
    text: 'Asking “what if the cell had no oxygen?” before naming fermentation made students predict first, so the new term arrived as an answer to their own question.',
    card: 'bg-mint-tint',
    ink: 'text-forest',
  },
  {
    label: 'Where it could go further',
    text: 'The equation went up as one line. Next time, track a single glucose molecule through each stage so students see where the energy actually leaves.',
    card: 'bg-peach-tint',
    ink: 'text-terracotta-600',
  },
  {
    label: 'Where students usually get stuck',
    text: 'Many students think plants photosynthesize instead of respiring. Ask what a plant does at night, and the misconception surfaces before the test does.',
    card: 'bg-gold-tint',
    ink: 'text-terracotta-600',
  },
]

// The hero's sample Talk & Participation card: shares and a minute-by-minute
// strip for the invented lesson (teacher-led opening, questions, group work,
// wrap-up). Kept in step with the share card, scripts/og-image.html.
const HERO_TALK: [keyof typeof ROOM_COLOR, number][] = [
  ['teacher', 39],
  ['student', 26],
  ['other', 23],
  ['quiet', 12],
]
const HERO_TALK_STRIP = (
  'tttttttststtsq' + 'ooosoooqoo' + 'tsstst' + 'qtst'
)
  .split('')
  .map((c) => ({ t: 'teacher', s: 'student', o: 'other', q: 'quiet' })[c] as keyof typeof ROOM_COLOR)

// A screenshot of the real report's Summary, taken from the dev preview with
// the lesson swapped for an invented one (topic, date and every quoted line),
// so no real class appears on the public site (see scripts/capture-hero.mjs),
// with one Content Specialist note from the same lesson laid over it as text.
// Retake the screenshot when the Summary's layout changes.
function ReportMockup() {
  return (
    <div className="relative w-full max-w-md">
      <div aria-hidden="true" className="absolute -inset-16 -z-10 rounded-full bg-gold-tint/60 blur-3xl" />
      <div className="rounded-2xl border border-hairline bg-cream-card p-2 shadow-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-terracotta/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-forest/30" />
          </div>
          <p className="text-xs text-ink-soft">Your Lesson Debrief · Sample</p>
          <LockIcon className="h-4 w-4 text-ink-soft" />
        </div>
        {/* The top of the Summary: the one focus, the lesson, how it moved and
            its numbers. The rest is cut off on purpose. */}
        <div className="h-[30rem] overflow-hidden rounded-xl bg-cream sm:h-[34rem]">
          <img
            src="/samples/hero-debrief-summary.png"
            alt="A sample Lesson Debrief Summary for an invented biology lesson: one thing to try next lesson, what the lesson covered, how the lesson moved, and the lesson's numbers."
            width={1440}
            height={2179}
            className="w-full"
          />
        </div>
      </div>

      {/* A Content Specialist note from the same invented lesson: the thing
          the home page leads with, as real text rather than a screenshot. */}
      <div className="absolute -bottom-20 -right-3 w-72 rounded-xl border border-hairline bg-cream-card p-4 text-left shadow-lg sm:-right-12 sm:w-96">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-terracotta-600">Content Specialist</p>
          <p className="text-[11px] text-ink-soft">at 13:00</p>
        </div>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-forest">Where it could go further</p>
        <p className="mt-0.5 text-sm leading-snug text-ink">
          Track a single glucose molecule through each stage, so students see where the energy actually leaves.
        </p>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-forest">Where students usually get stuck</p>
        <p className="mt-0.5 text-sm leading-snug text-ink">
          Many students think plants photosynthesize instead of respiring. Ask what a plant does at night.
        </p>
      </div>

      {/* The teaching half of the headline, beside the content half: the Talk &
          Participation card in the report's own colours. The numbers and the
          minute-by-minute strip belong to the same invented lesson, not a real
          class. Hidden on a phone, where it would cover the report. */}
      <div className="absolute -left-12 top-[19rem] hidden w-64 rounded-xl border border-hairline bg-cream-card p-3.5 text-left shadow-lg sm:block">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-forest">Talk &amp; Participation</p>
        <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {HERO_TALK.map(([kind, pct]) => (
            <span key={kind} style={{ width: `${pct}%`, background: ROOM_COLOR[kind] }} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-semibold text-ink">
          {HERO_TALK.map(([kind, pct]) => (
            <div key={kind} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ROOM_COLOR[kind] }} />
              {ROOM_LABEL[kind]}
              <span className="ml-auto text-ink-soft">{pct}%</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex h-4 gap-px" aria-hidden="true">
          {HERO_TALK_STRIP.map((kind, i) => (
            <span key={i} className="flex-1 rounded-[2px]" style={{ background: ROOM_COLOR[kind] }} />
          ))}
        </div>
      </div>

      {/* Beside the report header, clear of the chart. Hidden on a phone, where
          there is no room for it; the chips beside the headline say it. */}
      <div className="absolute -left-3 top-36 hidden items-center gap-2 rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 shadow-lg sm:-left-12 sm:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest">
          <LockIcon className="h-4 w-4 text-gold" />
        </span>
        <div className="text-left">
          <p className="text-sm font-bold text-ink">Only you see this</p>
          <p className="text-xs text-ink-soft">never scored, never shared</p>
        </div>
      </div>

      <div className="absolute -right-3 -top-6 flex items-center gap-2 rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 shadow-lg sm:-right-10">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold">
          <CheckIcon className="h-4 w-4 text-forest" />
        </span>
        <p className="text-sm font-medium text-ink">Next step saved</p>
      </div>
    </div>
  )
}

export default function Landing({ onSignedIn }: { onSignedIn: () => void }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // ?v=veteran and friends swap the intro film for the cut that matches the ad
  // someone just clicked; everyone else gets the default.
  const intro = introVideo(useLocation().search)
  return (
    // overflow-x-clip: the hero mockup's glow and floating badges deliberately
    // hang past its edges, and at 1024px they ran past the window too, so the
    // whole page scrolled sideways. clip rather than hidden, which would make
    // this a scroll container.
    <div className="min-h-screen overflow-x-clip bg-cream text-ink">
      {/* Nav */}
      <header className="bg-cream">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="h-11 w-auto" />
          {/* Five items, not eight: the three reading pages share one
              Resources menu, and "Why Wivoza" is a scroll away on the page
              itself (it stays in the phone menu). Eight links in a row read as
              a wall at laptop width. */}
          <nav className="hidden items-center gap-7 whitespace-nowrap text-sm font-medium text-ink-soft lg:flex">
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#what-you-can-do" className="hover:text-ink">
              Features
            </a>
            <a href="#pricing" className="hover:text-ink">
              Pricing
            </a>
            <Link to="/for-schools" className="hover:text-ink">
              For Schools
            </Link>
            <div className="group relative">
              <button
                type="button"
                aria-haspopup="true"
                className="flex items-center gap-1 hover:text-ink group-focus-within:text-ink"
              >
                Resources
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180">
                  <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {/* pt-3 bridges the gap so the menu stays open while the
                  pointer moves down onto it. */}
              <div className="invisible absolute left-1/2 top-full z-20 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="flex w-56 flex-col rounded-2xl border border-hairline bg-cream-card p-2 shadow-lg">
                  {[
                    { to: '/guide', label: 'Guide', sub: 'Every feature, in full' },
                    { to: '/faq', label: 'FAQ', sub: 'Privacy, cost, and how it works' },
                    { to: '/research', label: 'Research', sub: 'The studies behind the design' },
                  ].map((r) => (
                    <Link key={r.to} to={r.to} className="rounded-xl px-3 py-2.5 hover:bg-cream">
                      <span className="block font-semibold text-forest">{r.label}</span>
                      <span className="block text-xs font-normal text-ink-soft">{r.sub}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>
          <div className="flex items-center gap-2 sm:gap-5">
            <a href="#get-started" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              Log in
            </a>
            <a
              href="#get-started"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-forest px-3.5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 sm:px-4"
            >
              Start free
              <ArrowRightIcon className="h-4 w-4 shrink-0" />
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-forest lg:hidden"
            >
              {mobileNavOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="flex flex-col gap-1 border-t border-hairline bg-cream-card px-6 py-3 lg:hidden">
            <a
              href="#get-started"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink sm:hidden"
            >
              Log in
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              How it works
            </a>
            <a
              href="#what-you-can-do"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              Features
            </a>
            <a
              href="#why-wivoza"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              Why Wivoza
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              Pricing
            </a>
            <Link
              to="/for-schools"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              For Schools
            </Link>
            <Link
              to="/research"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              Research
            </Link>
            <Link
              to="/guide"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              Guide
            </Link>
            <Link
              to="/faq"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              FAQ
            </Link>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-6 sm:pt-12">
        <div className="grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-mint-tint px-4 py-2 text-sm font-semibold text-forest">
              <SparkleIcon className="h-4 w-4" />
              Coaching for your content and your teaching
            </span>
            <h1 className="mt-6 font-heading text-5xl font-extrabold leading-[1.05] tracking-tight text-forest sm:text-6xl">
              A coach after every{' '}
              <span className="relative inline-block text-terracotta">
                lesson.
                <svg
                  viewBox="0 0 220 14"
                  className="absolute -bottom-1.5 left-0 w-full text-gold"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 10c40-9 150-9 214 0"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-ink-soft">
              Record a lesson and Wivoza reads how you taught the content (your explanations, examples
              and models) and how the lesson ran: the questions you asked and who did the talking. You
              get what worked, where it could go further, and one thing to try next class, each tied to
              a moment in your own words.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a
                href="#get-started"
                className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90"
              >
                Start free
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a href="#see-it" className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                <PlayIcon className="h-8 w-8 text-ink" />
                See how it works
              </a>
            </div>

            {/* The stars and initials that sat here read as reviews from real
                teachers, which they were not. This makes only a claim that is
                true. */}
            <p className="mt-5 text-sm text-ink-soft">
              No class to record yet?{' '}
              <a href="#get-started" className="font-semibold text-terracotta-600 hover:underline">
                Start with Talk It Through
              </a>{' '}
              — two minutes, nothing to set up.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {['Only you see your reports', 'Never scored', 'Audio never kept'].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-mint-tint px-3 py-1.5 text-xs font-semibold text-forest"
                >
                  <LockIcon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2.5 text-sm text-ink-soft">
              <GraduationCapIcon className="h-5 w-5 text-forest" />
              Built with educators, for educators
            </p>
          </div>

          <div className="flex justify-center pb-24 pt-6 lg:justify-end lg:pb-20 lg:pt-0">
            <ReportMockup />
          </div>
        </div>
      </section>

      {/* Value-prop band */}
      <section className="bg-forest py-5">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-6 text-center text-xs font-semibold uppercase tracking-wider text-cream/90 sm:gap-x-4">
          {VALUE_PROPS.map((label, i) => (
            <span key={label} className="flex items-center gap-x-3 sm:gap-x-4">
              {label}
              {i < VALUE_PROPS.length - 1 && <span className="text-gold">&middot;</span>}
            </span>
          ))}
        </div>
      </section>

      {/* Intro video */}
      <section id="see-it" className="mx-auto w-full max-w-4xl scroll-mt-20 px-6 pt-16">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">See it in action</span>
          <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            Meet your coach.
          </h2>
          <p className="mt-4 text-ink-soft">
            A quick look at how Wivoza helps you prepare, reflect, and try one next step.
          </p>
        </div>
        <VideoFacade {...intro} list={MEET_PLAYLIST_ID} />
      </section>

      {/* Process */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto mb-11 max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            Teach it. See how it landed. Plan the next one.
          </h2>
          <p className="mt-4 text-ink-soft">
            The content coaching most teachers never get, after every lesson you record — without
            evaluation, paperwork, or pressure.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {PROCESS.map(({ icon: Icon, tint, title, description }, index) => (
            <div key={title} className="relative flex items-start gap-6 sm:block">
              <div className={`flex-1 rounded-3xl p-7 ${TINT_STYLES[tint].card}`}>
                <div className="flex items-start justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TINT_STYLES[tint].badge}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="font-heading text-3xl font-extrabold text-forest/15">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-xl font-bold text-forest">{title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{description}</p>
              </div>
              {index < PROCESS.length - 1 && (
                <ArrowRightIcon className="hidden h-5 w-5 shrink-0 self-center text-ink-soft/50 sm:absolute sm:-right-8 sm:top-1/2 sm:block sm:-translate-y-1/2" />
              )}
            </div>
          ))}
        </div>
      </section>

      <RecordYourWay />

      {/* Features, as three teacher moments */}
      <section id="what-you-can-do" className="bg-mint-tint/50 py-16">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto mb-11 max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
              One coach. The whole practice.
            </span>
            <h2 className="mt-3 font-heading text-3xl font-extrabold leading-tight text-forest sm:text-4xl">
              Support for the moments that shape your day.
            </h2>
            <p className="mt-4 text-ink-soft">
              Whether you have thirty seconds before a meeting or a full class recording to reflect
              on, Wivoza meets you where you are.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {MOMENTS.map(({ moment, when, features }, columnIndex) => (
              <div key={moment} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
                      COLUMN_BADGES[columnIndex % COLUMN_BADGES.length]
                    }`}
                  >
                    {columnIndex + 1}
                  </span>
                  <h3 className="font-heading text-xl font-extrabold text-forest">{moment}</h3>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{when}</p>
                <div className="mt-4 flex flex-1 flex-col gap-3">
                  {features.map(({ icon: Icon, tint, title, slug, description }) => (
                    <div
                      key={title}
                      className="flex flex-1 items-start gap-4 rounded-3xl bg-cream-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TINT_STYLES[tint].badge}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-heading text-base font-bold text-forest">{title}</h4>
                        <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
                        <Link
                          to={`/guide#video-${slug}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-terracotta-600 hover:text-terracotta"
                        >
                          <PlayIcon className="h-4 w-4" />
                          Watch how it works
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The full training library lives on the Guide now; this is the one
              pointer to it from the home page. */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#get-started"
              className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Start free
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <Link to="/guide#videos" className="inline-flex items-center gap-2 text-sm font-semibold text-forest hover:text-terracotta-600">
              <PlayIcon className="h-5 w-5" />
              Browse all training videos
            </Link>
          </div>
        </div>
      </section>

      {/* Where Coach is */}
      <section id="wherever-you-are" className="mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Wherever you are</span>
          <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            At your desk, in the hallway, on the drive home.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {PLACES.map(({ icon: Icon, tint, brand, title, description, href, cta }) => (
            <div key={title} className={`flex flex-col rounded-3xl p-7 ${TINT_STYLES[tint].card}`}>
              {brand ? (
                <Icon className="h-12 w-12" />
              ) : (
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TINT_STYLES[tint].badge}`}>
                  <Icon className="h-6 w-6" />
                </span>
              )}
              <h3 className="mt-5 font-heading text-xl font-bold text-forest">{title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{description}</p>
              {/* Apple's own badge, unaltered and at its minimum 40px height, as
                  its marketing guidelines ask; it replaces a text link. */}
              {href && (
                <a href={href} target="_blank" rel="noreferrer" className="mt-4 inline-block self-start">
                  <img src="/badges/app-store-badge.svg" alt={cta ?? ''} className="h-10 w-auto" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Sample reports */}
      <section id="samples" className="mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Example results</span>
          <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            See what you walk away with.
          </h2>
          <p className="mt-4 text-ink-soft">
            Not a wall of scores — the specific catch, and what to do about it. Every sample is an
            invented scenario.
          </p>
        </div>
        <a
          href="/samples/lesson-debrief.pdf"
          target="_blank"
          rel="noreferrer"
          className="group mb-6 grid gap-6 rounded-3xl bg-forest p-6 text-cream shadow-sm transition-shadow hover:shadow-md sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:items-center"
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Lesson Debrief · Sample report</span>
            <h3 className="mt-2 font-heading text-2xl font-bold leading-snug sm:text-3xl">
              Twenty-two minutes of class, read like a content specialist would<span className="text-gold">.</span>
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-cream/75">
              How you explained the idea, the examples and models you chose, the key terms students picked
              up, and the questions that asked them to think — each with the exact moment and timestamp.
              Then one focus for next lesson that carries straight into your next plan. Talk time, pace
              and checks for understanding are there too, when you want them. An invented class; no real teacher or student.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold">
              View the full sample report
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Content Specialist · Biology</p>
            {SAMPLE_NOTES.map((n) => (
              <div key={n.label} className={`rounded-xl px-3.5 py-3 ${n.card}`}>
                <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${n.ink}`}>{n.label}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink">{n.text}</p>
              </div>
            ))}
          </div>
        </a>
        <div className="grid gap-6 md:grid-cols-2">
          {SAMPLES.map((sample) => (
            <SampleCard key={sample.title} {...sample} />
          ))}
        </div>
      </section>

      {/* Quote / growth stat */}
      <section id="why-wivoza" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <QuoteIcon className="h-10 w-10 text-gold" />
            <blockquote className="mt-4 font-heading text-3xl font-extrabold leading-tight text-forest sm:text-4xl">
              Coaching should build confidence—not create another thing to manage.
            </blockquote>
            <p className="mt-5 max-w-md text-ink-soft">
              Wivoza keeps feedback focused, private, and useful. You leave every session knowing
              what you noticed, what you can celebrate, and what to try next.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {['Private reflection', 'Specific next steps', 'Growth over time'].map((label) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full bg-mint-tint px-3.5 py-1.5 text-sm font-medium text-forest"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-gold" />
            <div className="relative rounded-3xl bg-forest p-8 text-cream">
              {/* One of the seven measures My Growth really charts — questions
                  beyond recall, the ones asking students to explain or reason —
                  with an illustration's numbers, said to be an example. The
                  card claims only what the chart shows. */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Example growth · My Growth</p>
                <p className="text-xs text-cream/60">Across four lessons</p>
              </div>
              <p className="mt-6 font-heading text-5xl font-extrabold">7 questions</p>
              <p className="mt-1 text-sm text-cream/70">beyond recall in the latest lesson</p>
              <p className="mt-1 text-sm text-gold">Up from 2 across four lessons</p>
              <div className="mt-7 flex items-end gap-3" aria-hidden="true">
                {[24, 36, 60, 84].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-lg bg-gold" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="mt-7 rounded-xl bg-forest-soft p-4">
                <p className="text-sm font-semibold">More of your questions asked students to think.</p>
                <p className="mt-1 text-xs text-cream/70">
                  Each bar is one recorded lesson: the questions that asked students to explain or reason.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-mint-tint/50 py-16">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto mb-11 max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
              Simple, honest pricing
            </span>
            <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
              Start free. Upgrade when you&rsquo;re ready.
            </h2>
            <p className="mt-4 text-ink-soft">No credit card to sign up, no surprise fees.</p>
          </div>

          <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-hairline bg-cream-card p-8 shadow-sm">
              <h3 className="font-heading text-xl font-bold text-forest">Free</h3>
              <p className="mt-1 text-sm text-ink-soft">For getting started</p>
              <p className="mt-6 font-heading text-4xl font-extrabold text-forest">$0</p>
              <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                  Talk It Through, free for everyone
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                  Practice, free for everyone
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                  3 Lesson Debrief recordings/month
                </li>
              </ul>
              <a
                href="#get-started"
                className="mt-8 block rounded-full border border-forest px-5 py-3 text-center text-sm font-semibold text-forest transition-opacity hover:opacity-80"
              >
                Start free
              </a>
            </div>

            <div className="relative rounded-2xl border-2 border-terracotta bg-cream-card p-8 shadow-md">
              <span className="absolute -top-3 left-8 rounded-full bg-terracotta px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
              <h3 className="font-heading text-xl font-bold text-forest">Wivoza Plus</h3>
              <p className="mt-1 text-sm text-ink-soft">For teachers who want it all</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="font-heading text-4xl font-extrabold text-forest">{PLUS_MONTHLY_PRICE}</span>
                <span className="text-sm text-ink-soft">/month</span>
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                or {PLUS_YEARLY_PRICE} a year — about {PLUS_YEARLY_PER_MONTH} a month
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Everything in Free
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Lesson Debrief for up to {PLUS_DEBRIEF_PER_MONTH} lessons a month
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Planning Coach: lessons, slides, and assignments
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Full Communication Coach suite
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Optional coaching memory you control
                </li>
              </ul>
              {/* Lesson Debrief is what Plus unlocks, so its report is the proof.
                  A staged recording — no real class or student. */}
              <a
                href="/samples/lesson-debrief.pdf"
                target="_blank"
                rel="noreferrer"
                className="group mt-6 flex items-center gap-3 rounded-xl border border-hairline bg-cream p-3 transition-colors hover:border-terracotta/40"
              >
                <img
                  src="/samples/lesson-debrief.png"
                  alt=""
                  className="h-14 w-12 shrink-0 rounded-md border border-hairline object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-forest">See a sample Lesson Debrief</p>
                  <p className="text-xs text-ink-soft">What you get after every recorded lesson</p>
                </div>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#get-started"
                className="mt-8 block rounded-full bg-terracotta px-5 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start free
              </a>
            </div>
          </div>

          {/* Teachers read this page too, so the leader pitch stays small and
              leads with what leaders can't see: a big dashboard here would read
              as "my principal will be watching my lessons". */}
          <div
            id="for-schools"
            className="mx-auto mt-8 grid max-w-4xl scroll-mt-24 gap-6 rounded-2xl bg-forest p-8 text-center sm:grid-cols-[1fr_auto] sm:items-center sm:text-left"
          >
            <div>
              <h3 className="font-heading text-lg font-bold text-cream">
                Bringing Wivoza to your school or district?
              </h3>
              <p className="mt-1.5 text-sm text-cream/80">
                School leaders see school-wide trends and whether their PD is working, never a
                teacher&rsquo;s recordings or coaching.
              </p>
              <p className="mt-1.5 text-sm text-cream/60">
                District licensing gives every teacher Plus-level access, with support built for
                your rollout.
              </p>
              <Link
                to="/for-schools"
                className="mt-5 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gold px-5 py-3 text-sm font-semibold text-forest transition-opacity hover:opacity-90"
              >
                See how it works for schools
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <Link to="/for-schools" className="hidden w-72 overflow-hidden rounded-xl bg-cream p-1.5 sm:block">
              <img
                src="/samples/admin-pd-progress.png"
                alt="A school-wide focus area for an invented school, shown in fewer lessons since tracking began."
                className="w-full rounded-lg"
                loading="lazy"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Closing CTA + sign-up */}
      <section id="get-started" className="bg-peach-tint py-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-6">
          <div className="max-w-xl text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gold text-forest">
              <ChartBarIcon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
              Your next great lesson starts here
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold leading-tight text-forest sm:text-4xl">
              Grow in your own way.
              <br />
              One moment at a time.
            </h2>
            <p className="mt-4 text-ink-soft">A private coaching space for the work only teachers understand.</p>
          </div>

          <AuthCard onSignedIn={onSignedIn} />
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
            <a
              href="https://www.youtube.com/@WivozaCoach"
              target="_blank"
              rel="noreferrer"
              aria-label="Wivoza on YouTube"
              title="Wivoza on YouTube"
              className="inline-flex items-center gap-1.5 hover:text-terracotta"
            >
              <YouTubeIcon className="h-5 w-5" />
              <span className="sm:hidden">YouTube</span>
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
