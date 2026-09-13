import { useState } from 'react'
import SupportChat from '../components/SupportChat'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import {
  ArrowRightIcon,
  BookIcon,
  BrainIcon,
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
  MicIcon,
  PlayIcon,
  QuoteIcon,
  SparkleIcon,
  TargetIcon,
} from '../components/icons'
import { INTRO_VIDEO, VideoFacade } from '../components/TrainingVideos'

const PROCESS = [
  {
    icon: HeadsetIcon,
    tint: 'bg-mint-tint text-forest',
    title: 'Bring the moment',
    description: 'Talk it through, record a lesson, or describe a challenge while it is still fresh.',
  },
  {
    icon: BrainIcon,
    tint: 'bg-peach-tint text-terracotta',
    title: 'See what matters',
    description: 'Get clear patterns and coaching — not a wall of scores or generic advice.',
  },
  {
    icon: TargetIcon,
    tint: 'bg-gold-tint text-terracotta-600',
    title: 'Try one next step',
    description: 'Practice a strategy, use it in class, and see your progress build over time.',
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
        title: 'Lesson Planning',
        slug: 'lesson-planning',
        description: 'Strengthen a lesson you wrote, or generate ideas from a clear objective.',
      },
      {
        icon: BookIcon,
        tint: 'bg-gold-tint text-terracotta-600',
        title: 'Assignment Coach',
        slug: 'assignment-coach',
        description: 'See what an assignment really asks, and redesign it for meaningful AI use.',
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
        description: 'See classroom talk, questions, pacing, and practical coaching priorities.',
      },
      {
        icon: HeadsetIcon,
        tint: 'bg-mint-tint text-forest',
        title: 'Talk It Through',
        slug: 'talk-it-through',
        description: 'A live voice coach for sorting through what happened and what to do next.',
      },
    ],
  },
  {
    // Not "Communicate": Ask & Practice is mostly about classroom moments —
    // resistance, disruption, disengagement — not messages to adults.
    moment: 'Handle the hard moments',
    when: 'When it gets difficult — find the words, then practice them.',
    features: [
      {
        icon: ChatBubbleIcon,
        tint: 'bg-mint-tint text-forest',
        title: 'Ask & Practice',
        slug: 'ask-practice',
        description: 'Ask a straight question or rehearse a hard moment, judgment-free.',
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

const VALUE_PROPS = ['Private by design', 'Judgment-free', 'Built for busy educators', 'Actionable, not overwhelming']

// Sample reports. A shrunken screenshot of a page shows the shape of a report
// but not one readable sentence, so it proves nothing at card size. Each card
// instead shows the single moment that makes the point — the problem, then what
// Wivoza did about it — as real text, with the full printed report a click away.
// Excerpts are quoted from the reports themselves; every scenario is invented.
const SAMPLES = [
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
    feature: 'Assignment Coach',
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
    feature: 'Lesson Planning',
    eyebrow: 'Get feedback',
    title: 'Feedback that catches what you missed',
    before: {
      label: 'Your plan',
      text: '“Every food chain begins with a consumer. Consumers use sunlight to make their own food.”',
    },
    after: {
      label: 'Coach caught it',
      text: 'The definitions are swapped. Producers make their own food from sunlight; consumers eat other organisms.',
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
      <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">{feature}</span>
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

function DeviceMockup() {
  return (
    <div className="relative w-full max-w-md">
      <div
        aria-hidden="true"
        className="absolute -inset-16 -z-10 rounded-full bg-gold-tint/60 blur-3xl"
      />
      <div className="rounded-2xl border border-hairline bg-cream-card p-2 shadow-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-terracotta/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-forest/30" />
          </div>
          <p className="text-xs text-ink-soft">Private coaching session</p>
          <LockIcon className="h-4 w-4 text-ink-soft" />
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl bg-cream px-8 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-tint">
            <MicIcon className="h-7 w-7 text-forest" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Wivoza Coach</p>
          <h3 className="font-heading text-xl font-bold text-forest">What&rsquo;s on your mind?</h3>
          <p className="text-sm text-ink-soft">
            Talk through a classroom moment, lesson idea, or conversation you want to prepare for.
          </p>
          <div className="flex items-end gap-1 py-2" aria-hidden="true">
            {[10, 18, 26, 16, 22, 12].map((h, i) => (
              <span key={i} className="w-1.5 rounded-full bg-forest" style={{ height: `${h}px` }} />
            ))}
          </div>
          <button
            type="button"
            className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-cream"
            tabIndex={-1}
          >
            Start a private check-in
          </button>
        </div>
      </div>

      <div className="absolute -left-8 top-16 flex items-center gap-2 rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 shadow-lg sm:-left-14">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-tint">
          <ArrowRightIcon className="h-4 w-4 -rotate-45 text-forest" />
        </span>
        <div className="text-left">
          <p className="text-sm font-bold text-ink">More student voice</p>
          <p className="text-xs text-ink-soft">spotted in your debrief</p>
        </div>
      </div>

      <div className="absolute -right-6 bottom-10 flex items-center gap-2 rounded-xl border border-hairline bg-cream-card px-3.5 py-2.5 shadow-lg sm:-right-12">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-tint">
          <CheckIcon className="h-4 w-4 text-terracotta-600" />
        </span>
        <p className="text-sm font-medium text-ink">Next step saved</p>
      </div>
    </div>
  )
}

export default function Landing({ onSignedIn }: { onSignedIn: () => void }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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
          <nav className="hidden items-center gap-5 text-sm font-medium text-ink-soft lg:flex xl:gap-7">
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#what-you-can-do" className="hover:text-ink">
              What you can do
            </a>
            <a href="#why-wivoza" className="hover:text-ink">
              Why Wivoza
            </a>
            <a href="#pricing" className="hover:text-ink">
              Pricing
            </a>
            <a href="#for-schools" className="hover:text-ink">
              For Schools
            </a>
            <Link to="/guide" className="hover:text-ink">
              Guide
            </Link>
            <Link to="/faq" className="hover:text-ink">
              FAQ
            </Link>
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
              What you can do
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
            <a
              href="#for-schools"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              For Schools
            </a>
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
              AI coaching made for real teaching
            </span>
            <h1 className="mt-6 font-heading text-5xl font-extrabold leading-[1.05] tracking-tight text-forest sm:text-6xl">
              Every teacher deserves a place to{' '}
              <span className="relative inline-block text-terracotta">
                practice.
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
              Prepare for hard moments, reflect on real lessons, and grow with a private AI coach
              that understands classrooms.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a
                href="#get-started"
                className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
            <p className="mt-9 flex items-center gap-2.5 text-sm text-ink-soft">
              <GraduationCapIcon className="h-5 w-5 text-forest" />
              Built with educators, for educators
            </p>
          </div>

          <div className="flex justify-center py-6 lg:justify-end lg:py-0">
            <DeviceMockup />
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
          <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">See it in action</span>
          <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            Meet your coach.
          </h2>
          <p className="mt-4 text-ink-soft">
            A quick look at how Wivoza helps you prepare, reflect, and try one next step.
          </p>
        </div>
        <VideoFacade {...INTRO_VIDEO} />
      </section>

      {/* Process */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto mb-11 max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            Turn everyday teaching into meaningful growth.
          </h2>
          <p className="mt-4 text-ink-soft">
            Wivoza helps you move from a real moment to one practical next step — without
            evaluation, paperwork, or pressure.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {PROCESS.map(({ icon: Icon, tint, title, description }, index) => (
            <div key={title} className="relative flex items-start gap-6 sm:block">
              <div className="flex-1 rounded-2xl border border-hairline bg-cream-card p-7 shadow-sm">
                <div className="flex items-start justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${tint}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="font-heading text-3xl font-extrabold text-hairline">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-lg font-bold text-forest">{title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{description}</p>
              </div>
              {index < PROCESS.length - 1 && (
                <ArrowRightIcon className="hidden h-5 w-5 shrink-0 self-center text-ink-soft/50 sm:absolute sm:-right-8 sm:top-1/2 sm:block sm:-translate-y-1/2" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Features, as three teacher moments */}
      <section id="what-you-can-do" className="bg-mint-tint/50 py-16">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto mb-11 max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">
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
            {MOMENTS.map(({ moment, when, features }) => (
              <div key={moment} className="flex flex-col">
                <h3 className="font-heading text-xl font-extrabold text-forest">{moment}</h3>
                <p className="mt-1 text-sm text-ink-soft">{when}</p>
                <div className="mt-4 flex flex-1 flex-col gap-3">
                  {features.map(({ icon: Icon, tint, title, slug, description }) => (
                    <div
                      key={title}
                      className="flex flex-1 items-start gap-4 rounded-2xl border border-hairline bg-cream-card p-5 shadow-sm"
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
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

      {/* Sample reports */}
      <section id="samples" className="mx-auto w-full max-w-6xl px-6 pt-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">Example results</span>
          <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            See what you walk away with.
          </h2>
          <p className="mt-4 text-ink-soft">
            Not a wall of scores — the specific catch, and what to do about it. Every sample is an
            invented scenario.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
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
              {/* "3.1s average wait time" on a voice product reads as how long the
                  app takes to answer. This says what is being measured, and that
                  the numbers are an illustration rather than someone's results. */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Example growth</p>
                <p className="text-xs text-cream/60">Across four lessons</p>
              </div>
              <p className="mt-6 font-heading text-5xl font-extrabold">3.1 seconds</p>
              <p className="mt-1 text-sm text-cream/70">average student thinking time</p>
              <p className="mt-1 text-sm text-gold">Up 1.7 seconds across four lessons</p>
              <div className="mt-7 flex items-end gap-3" aria-hidden="true">
                {[36, 52, 68, 84].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-lg bg-gold" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="mt-7 rounded-xl bg-forest-soft p-4">
                <p className="text-sm font-semibold">You created more space for thinking.</p>
                <p className="mt-1 text-xs text-cream/70">
                  Student responses got longer as the thinking time grew.
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
            <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">
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
                  Unlimited Talk It Through
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                  Unlimited Ask &amp; Practice
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
                <span className="font-heading text-4xl font-extrabold text-forest">$9</span>
                <span className="text-sm text-ink-soft">/month</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Everything in Free
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Unlimited Lesson Debrief
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Lesson Planning
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Assignment Coach
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

          <div
            id="for-schools"
            className="mx-auto mt-8 flex max-w-3xl scroll-mt-24 flex-col items-center justify-between gap-6 rounded-2xl bg-forest p-8 text-center sm:flex-row sm:text-left"
          >
            <div>
              <h3 className="font-heading text-lg font-bold text-cream">
                Bringing Wivoza to your school or district?
              </h3>
              <p className="mt-1.5 text-sm text-cream/70">
                District licensing gives every teacher Plus-level access, with support built for
                your rollout.
              </p>
            </div>
            <a
              href="mailto:hello@wivoza.com?subject=Wivoza%20for%20our%20district"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gold px-5 py-3 text-sm font-semibold text-forest transition-opacity hover:opacity-90"
            >
              Request a quote
              <ArrowRightIcon className="h-4 w-4" />
            </a>
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
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta">
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
      <SupportChat />
    </div>
  )
}
