import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useState } from 'react'
import {
  ArrowUpIcon,
  ChatBubbleIcon,
  ChecklistIcon,
  MailIcon,
  ScenarioIcon,
  UserIcon,
} from '../components/icons'
import { signInWithGoogle } from '../lib/api'

const FEATURES = [
  {
    icon: ScenarioIcon,
    title: 'Try It Out',
    description:
      "Practice realistic classroom scenarios tuned to your grade level, subject, and difficulty — then get coaching on your response.",
  },
  {
    icon: UserIcon,
    title: 'Debrief a Real Moment',
    description:
      'Something actually happened today? Describe it and get the same reflective coaching, geared toward what to do next.',
  },
  {
    icon: ChatBubbleIcon,
    title: 'Ask an Expert',
    description:
      'Ask any classroom management question, anytime, and get a clear, practical answer grounded in real best practice.',
  },
  {
    icon: MailIcon,
    title: 'Parent Messages',
    description:
      'Describe an incident and the tone you want, and get a ready-to-send message to a parent or guardian.',
  },
  {
    icon: ArrowUpIcon,
    title: 'Grows With You',
    description:
      'Practice naturally leans toward the categories you find hardest over time — no manual tracking required.',
  },
  {
    icon: ChecklistIcon,
    title: 'First 30 Days',
    description:
      'New to teaching? A short guided track walks you through the moments that matter most, early.',
  },
]

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
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div>
          <p className="text-lg font-semibold text-ink">ClassCoach</p>
          <p className="text-xs text-ink-soft">Classroom management, sharpened</p>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-100 opacity-60 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 right-[-8rem] h-96 w-96 rounded-full bg-warm-100 opacity-70 blur-3xl"
        />

        <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-6 pb-16 pt-10 text-center sm:pt-16">
          <span className="rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1 text-xs font-semibold text-brand-600">
            Built for grades 6–12 teachers
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            A coach for your toughest classroom moments
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">
            Practice realistic scenarios, debrief what actually happened, draft the hard parent
            email, and ask a question whenever you need to — all judgment-free, all in one place.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="rounded-xl border border-border bg-surface p-2 shadow-sm">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError('Sign-in failed. Please try again.')}
              />
            </div>
            <p className="text-xs text-ink-soft">Free to use — just sign in with Google.</p>
            {error && <p className="text-sm text-warm-500">{error}</p>}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                <Icon className="h-5 w-5 text-brand-500" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why ClassCoach */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-20">
        <div className="rounded-2xl border border-warm-400/30 bg-warm-100/60 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">
            Why ClassCoach
          </p>
          <p className="mt-3 text-lg text-ink">
            No video to record, no district rollout, nothing to set up. Just a private, judgment-free
            space to sharpen the skill that's hardest to teach yourself — classroom management —
            on your own time.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-ink-soft">
        ClassCoach — a coaching tool for grades 6–12 teachers.
      </footer>
    </div>
  )
}
