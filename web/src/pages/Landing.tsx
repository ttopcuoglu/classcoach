import { useState } from 'react'
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
  HeadsetIcon,
  LockIcon,
  MenuIcon,
  MicIcon,
  PlayIcon,
  QuoteIcon,
  SparkleIcon,
  TargetIcon,
} from '../components/icons'

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

const FEATURES = [
  {
    icon: HeadsetIcon,
    tint: 'bg-mint-tint text-forest',
    title: 'Talk It Through',
    description: 'A live voice coach for sorting through what happened and what to do next.',
    tag: '2 min',
  },
  {
    icon: ChartBarIcon,
    tint: 'bg-peach-tint text-terracotta',
    title: 'Lesson Debrief',
    description: 'See classroom talk, questions, pacing, and practical coaching priorities.',
    tag: 'After class',
  },
  {
    icon: ChatBubbleIcon,
    tint: 'bg-gold-tint text-terracotta-600',
    title: 'Ask & Practice',
    description: 'Ask a straight question or rehearse a hard conversation, judgment-free.',
    tag: 'Anytime',
  },
  {
    icon: BookIcon,
    tint: 'bg-lavender-tint text-[#6B5FA0]',
    title: 'Lesson Planning',
    description: 'Strengthen a lesson you wrote, or generate ideas from a clear objective.',
    tag: 'Before class',
  },
]

const VALUE_PROPS = ['Private by design', 'Judgment-free', 'Built for busy educators', 'Actionable, not overwhelming']

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
          <p className="text-sm font-bold text-ink">+18%</p>
          <p className="text-xs text-ink-soft">student voice</p>
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
    <div className="min-h-screen bg-cream text-ink">
      {/* Nav */}
      <header className="bg-cream">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-forest">
              <ChartBarIcon className="h-5 w-5" />
            </span>
            <p className="font-heading text-lg font-bold text-forest">Wivoza</p>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink-soft md:flex">
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
              Try Wivoza
              <ArrowRightIcon className="h-4 w-4 shrink-0" />
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-forest md:hidden"
            >
              {mobileNavOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="flex flex-col gap-1 border-t border-hairline bg-cream-card px-6 py-3 md:hidden">
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
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8 sm:pt-14">
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
                Start growing—free
                <ArrowRightIcon className="h-4 w-4" />
              </a>
              <a href="#how-it-works" className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                <PlayIcon className="h-8 w-8 text-ink" />
                See how it works
              </a>
            </div>

            <div className="mt-9 flex items-center gap-3">
              <div className="flex -space-x-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-cream bg-gold text-[10px] font-bold text-forest">
                  JM
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-cream bg-mint-tint text-[10px] font-bold text-forest">
                  AR
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-cream bg-peach-tint text-[10px] font-bold text-terracotta-600">
                  SK
                </span>
              </div>
              <div>
                <p className="text-sm text-gold">★★★★★</p>
                <p className="text-xs text-ink-soft">Built with educators, for educators</p>
              </div>
            </div>
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

      {/* Process */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mx-auto mb-14 max-w-2xl text-center">
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

      {/* Feature section */}
      <section id="what-you-can-do" className="bg-mint-tint/50 py-20">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-terracotta">
              One coach. The whole practice.
            </span>
            <h2 className="mt-3 font-heading text-3xl font-extrabold leading-tight text-forest sm:text-4xl">
              Support for the moments that shape your day.
            </h2>
            <p className="mt-4 max-w-md text-ink-soft">
              Whether you have thirty seconds before a meeting or a full class recording to
              reflect on, Wivoza meets you where you are.
            </p>
            <a
              href="#get-started"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-forest px-5 py-3 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Explore your coaching space
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>

          <div className="flex flex-col gap-3">
            {FEATURES.map(({ icon: Icon, tint, title, description, tag }) => (
              <div
                key={title}
                className="flex items-center gap-4 rounded-2xl border border-hairline bg-cream-card p-5 shadow-sm"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-base font-bold text-forest">{title}</h3>
                  <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink-soft">
                  {tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote / growth stat */}
      <section id="why-wivoza" className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
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
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Your growth</p>
                <p className="text-xs text-cream/60">Last 4 lessons</p>
              </div>
              <p className="mt-6 font-heading text-5xl font-extrabold">3.1s</p>
              <p className="mt-1 text-sm text-cream/70">
                average wait time <span className="text-gold">↑ 1.7s</span>
              </p>
              <div className="mt-7 flex items-end gap-3" aria-hidden="true">
                {[36, 52, 68, 84].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-lg bg-gold" style={{ height: `${h}px` }} />
                ))}
              </div>
              <div className="mt-7 rounded-xl bg-forest-soft p-4">
                <p className="text-sm font-semibold">You created more space for thinking.</p>
                <p className="mt-1 text-xs text-cream/70">
                  Student responses became longer as your wait time increased.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-mint-tint/50 py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
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
                  Full Messages suite
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                  Coach&rsquo;s memory across conversations
                </li>
              </ul>
              <a
                href="#get-started"
                className="mt-8 block rounded-full bg-terracotta px-5 py-3 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start free, upgrade anytime
              </a>
            </div>
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center justify-between gap-6 rounded-2xl bg-forest p-8 text-center sm:flex-row sm:text-left">
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
      <section id="get-started" className="bg-peach-tint py-24">
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
