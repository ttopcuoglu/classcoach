import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'
import AuthCard from '../components/AuthCard'
import {
  ArrowUpIcon,
  ChatBubbleIcon,
  ChecklistIcon,
  HomeIcon,
  MailIcon,
  ScenarioIcon,
  UserIcon,
} from '../components/icons'
import { signInWithGoogle } from '../lib/api'

const CATEGORIES = [
  'Defiance',
  'Disengagement',
  'Peer conflict',
  'Disruption',
  'Transitions',
  'Tech misuse',
]

const LOOP = [
  {
    icon: ScenarioIcon,
    title: 'Practice',
    description: 'Run a realistic classroom scenario, matched to your grade band, subject, and difficulty.',
  },
  {
    icon: ChatBubbleIcon,
    title: 'Get coached',
    description: 'Specific, private feedback on your response — plus a model reply to compare against.',
  },
  {
    icon: ArrowUpIcon,
    title: 'Track growth',
    description: "Wivoza quietly learns which categories you've got, and which still need reps.",
  },
]

const FEATURES = [
  {
    icon: ScenarioIcon,
    title: 'Try It Out',
    description:
      'Realistic scenarios by category, grade band, subject, and difficulty — with coaching on your written response.',
    tag: 'Practice',
  },
  {
    icon: ChatBubbleIcon,
    title: 'Ask an Expert',
    description: 'Ask a straight classroom-management question, get a straight answer, star the ones you’ll want again.',
    tag: 'Q&A',
  },
  {
    icon: UserIcon,
    title: 'Debrief a Real Incident',
    description: 'Something already happened — talk through it and get a next-time plan, not a grade.',
    tag: 'Reflection',
  },
  {
    icon: MailIcon,
    title: 'Parent Messages',
    description: 'Draft a message home in the right tone — warm, firm, informational, or requesting a meeting.',
    tag: 'Communication',
  },
  {
    icon: ChecklistIcon,
    title: 'Cheat Sheet',
    description: 'Your saved responses and starred answers, built automatically into one page you can keep open.',
    tag: 'Reference',
  },
  {
    icon: HomeIcon,
    title: 'First 30 Days',
    description: "New to teaching? A short, ordered track for a first month — routines first, then the scenarios that show up early.",
    tag: 'Onboarding',
  },
]

const STEPS = [
  {
    title: 'Pick a scenario',
    description: 'Choose a category, or let Wivoza weight toward what you’ve practiced least.',
  },
  {
    title: 'Respond in your own words',
    description: 'Write what you’d actually say — no multiple choice, no "correct" answer to guess.',
  },
  {
    title: 'Get specific coaching',
    description: 'See what landed, what to adjust, and one model response for comparison.',
  },
]

const BLOB_PATH =
  'M203 18C260 8 330 40 355 96C380 152 368 224 330 272C292 320 224 344 166 330C108 316 56 264 34 204C12 144 22 72 68 38C104 12 160 26 203 18Z'

function HeroIllustration() {
  return (
    <svg viewBox="0 0 420 340" fill="none" className="w-full max-w-md">
      <ellipse cx="210" cy="312" rx="140" ry="14" className="fill-black/20" />
      <rect x="80" y="228" width="260" height="13" rx="6.5" className="fill-warm-400" />
      <rect x="104" y="241" width="13" height="52" className="fill-warm-400" />
      <rect x="303" y="241" width="13" height="52" className="fill-warm-400" />
      <circle cx="150" cy="122" r="32" className="fill-canvas" />
      <path d="M107 228C107 184 124 156 150 156C176 156 193 184 193 228" className="fill-brand-500" />
      <circle cx="272" cy="138" r="26" className="fill-canvas" />
      <path d="M237 228C237 189 252 165 272 165C292 165 307 189 307 228" className="fill-warm-500" />
      <rect x="190" y="46" width="118" height="62" rx="17" className="fill-canvas" />
      <path d="M222 108L210 129L241 108Z" className="fill-canvas" />
      <path d="M210 70H288" className="stroke-night" strokeWidth={5} strokeLinecap="round" opacity={0.45} />
      <path d="M210 87H262" className="stroke-night" strokeWidth={5} strokeLinecap="round" opacity={0.28} />
    </svg>
  )
}

export default function Landing({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setError('Google did not return a credential. Please try again.')
      return
    }
    try {
      await signInWithGoogle(response.credential)
      onSignedIn()
    } catch {
      setError('Could not sign you in. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Nav */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <p className="font-display text-xl italic text-ink">
            Wivoza<span className="text-brand-500">.</span>
          </p>
          <nav className="hidden gap-7 text-sm text-ink-soft sm:flex">
            <a href="#loop" className="hover:text-brand-600">
              How it works
            </a>
            <a href="#features" className="hover:text-brand-600">
              What&rsquo;s inside
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-night">
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute -left-40 -top-32 w-[26rem] fill-brand-500 opacity-90">
          <path d={BLOB_PATH} />
        </svg>
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute bottom-[-14rem] left-1/3 w-[22rem] fill-warm-400 opacity-40">
          <path d={BLOB_PATH} />
        </svg>

        <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-6 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-warm-400">
              Grades 6&ndash;12 &middot; Classroom management
            </span>
            <h1 className="mt-4 font-display text-4xl italic leading-tight text-canvas sm:text-5xl">
              Practice the hard moment.
              <br />
              Then own it.
            </h1>
            <p className="mt-5 max-w-md text-base text-night-soft">
              Wivoza gives teachers a private place to rehearse defiance, disruption, and
              everything in between — then get specific, judgment-free coaching on what to say
              next time.
            </p>

            <div className="mt-8">
              <AuthCard onSignedIn={onSignedIn} />
            </div>
          </div>

          <div className="flex items-center justify-center">
            <HeroIllustration />
          </div>
        </div>
      </section>

      {/* Category strip */}
      <section className="border-b border-border bg-surface py-7">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Practice scenarios across
          </span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <span
                key={category}
                className="rounded-full border border-border bg-canvas px-3.5 py-1 text-sm text-ink"
              >
                {category}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* One tool, three habits */}
      <section id="loop" className="mx-auto w-full max-w-5xl px-6 py-20">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="font-display text-3xl italic text-ink">One tool, three habits</h2>
          <p className="mt-3 text-ink-soft">
            Wivoza isn&rsquo;t a script library — it&rsquo;s a loop you run often enough that
            the hard moments stop feeling new.
          </p>
        </div>
        <div className="grid gap-10 sm:grid-cols-3">
          {LOOP.map(({ icon: Icon, title, description }) => (
            <div key={title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <Icon className="h-7 w-7 text-brand-500" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* First 30 Days callout */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="grid gap-8 rounded-3xl bg-warm-400 p-10 sm:grid-cols-[1.1fr_0.9fr] sm:items-center sm:p-14">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-night/70">
              New to the classroom
            </span>
            <h3 className="mt-3 font-display text-2xl italic text-night">The First 30 Days track</h3>
            <p className="mt-3 max-w-md text-sm text-night/80">
              A short, ordered sequence built for a teacher&rsquo;s first month — the routines to
              set on day one, and the scenarios that tend to show up first.
            </p>
          </div>
          <div className="flex justify-center">
            <ChecklistIcon className="h-24 w-24 text-night/25" />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="font-display text-3xl italic text-ink">Everything in the loop</h2>
          <p className="mt-3 text-ink-soft">
            Six tools, one thread — practice feeds coaching, coaching feeds the sheet you actually
            keep open.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description, tag }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-border bg-surface p-7">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-50">
                <Icon className="h-5 w-5 text-brand-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{description}</p>
                <span className="mt-2.5 inline-block text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ethos */}
      <section className="relative overflow-hidden bg-brand-500 py-20">
        <svg viewBox="0 0 400 400" className="pointer-events-none absolute -right-28 -top-32 w-96 fill-canvas opacity-10">
          <path d={BLOB_PATH} />
        </svg>
        <div className="relative mx-auto w-full max-w-3xl px-6">
          <blockquote className="font-display text-2xl italic leading-snug text-canvas sm:text-3xl">
            &ldquo;The tough moment in third period doesn&rsquo;t have to end the day. It&rsquo;s
            just a moment worth a few minutes of practice — before it happens, or right
            after.&rdquo;
          </blockquote>
          <cite className="mt-6 block text-xs font-semibold not-italic uppercase tracking-wide text-canvas/70">
            The Wivoza approach
          </cite>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-5xl px-6 py-20">
        <h2 className="mb-12 text-center font-display text-3xl italic text-ink">
          How a session actually runs
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map(({ title, description }, index) => (
            <div key={title} className="border-t-2 border-brand-500 pt-5">
              <span className="font-display text-2xl italic text-brand-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2.5 text-base font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-night p-10 sm:flex-row sm:items-center sm:justify-between sm:p-14">
          <div>
            <h2 className="max-w-xs font-display text-2xl italic text-canvas sm:text-3xl">
              Ready when you are.
            </h2>
            <p className="mt-2 text-sm text-night-soft">Sign in and your first scenario is a click away.</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="rounded-xl bg-canvas p-2 shadow-sm">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError('Sign-in failed. Please try again.')}
              />
            </div>
            {error && <p className="text-sm text-warm-400">{error}</p>}
            <a href="#get-started" className="text-xs text-night-soft underline underline-offset-2">
              New here? Create a free account ↑
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-night py-8 text-center text-xs text-night-soft">
        Wivoza — a coaching tool for grades 6&ndash;12 teachers.
      </footer>
    </div>
  )
}
