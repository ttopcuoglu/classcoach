import { useState } from 'react'
import { Link } from 'react-router-dom'
import SupportChat from '../components/SupportChat'
import {
  ArrowRightIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CheckIcon,
  GraduationCapIcon,
  LockIcon,
  ShieldIcon,
} from '../components/icons'
import { submitSchoolInquiry, type SchoolInquiryInput } from '../lib/api'

const OFFER = [
  {
    icon: GraduationCapIcon,
    badge: 'bg-terracotta text-cream',
    card: 'bg-peach-tint/50',
    title: 'Every teacher gets Plus',
    body: 'Unlimited Lesson Debrief, Lesson Planning, Communication Coach, and Coach’s memory — on top of Talk It Through and Ask & Practice. Each teacher’s account stays their own, even if they change schools.',
  },
  {
    icon: ChartBarIcon,
    badge: 'bg-gold text-forest',
    card: 'bg-gold-tint/50',
    title: 'Leaders see the big picture',
    body: 'An admin dashboard shows adoption, participation, and the strengths and growth areas emerging across your staff, with professional-learning focus areas you can track over time.',
  },
  {
    icon: CheckCircleIcon,
    badge: 'bg-forest text-gold',
    card: 'bg-mint-tint/50',
    title: 'Simple to roll out',
    body: 'Teachers enter one short join code — during setup or later from Profile & Settings — and everything unlocks. Nothing to install; Wivoza runs in the browser.',
  },
]

const PRIVACY_POINTS = [
  'Admins only ever see aggregate trends — never one teacher’s recordings, transcripts, answers, or ratings.',
  'Group comparisons stay hidden until enough teachers contribute that no one can be singled out.',
  'Audio is discarded right after transcription. Only text and metrics are kept.',
  'Coach refers to people by role — “a student,” “the class” — not by name.',
]

const STEPS = [
  { title: 'Tell us about your school', body: 'Fill in the short form below. It takes about a minute.' },
  { title: 'We get in touch', body: 'We reply by email to talk through your staff size, goals, and pricing.' },
  { title: 'Your teachers join', body: 'You get a join code for your teachers and admin access for your leaders.' },
]

const ORGANIZATION_TYPES: { value: SchoolInquiryInput['organizationType']; label: string }[] = [
  { value: 'school', label: 'A school' },
  { value: 'district', label: 'A district' },
  { value: 'network', label: 'A charter network' },
  { value: 'other', label: 'Something else' },
]

const TEACHER_COUNTS: NonNullable<SchoolInquiryInput['teacherCount']>[] = ['1-25', '26-100', '101-500', '500+']

const INTERESTS: { value: SchoolInquiryInput['interests'][number]; label: string }[] = [
  { value: 'pilot', label: 'Starting with a pilot' },
  { value: 'license', label: 'A license for all our teachers' },
  { value: 'demo', label: 'A walkthrough of Wivoza' },
  { value: 'pd', label: 'Using it for professional learning' },
]

const ROLES = ['Principal', 'Assistant Principal', 'Instructional Coach', 'District Leader', 'Teacher', 'Other']

const inputClass =
  'w-full rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60'

function chipClass(active: boolean) {
  return `rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
    active
      ? 'border-forest bg-forest text-cream'
      : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
  }`
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-ink-soft"> (optional)</span>}
      </span>
      {children}
    </label>
  )
}

function InquiryForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [organizationType, setOrganizationType] = useState<SchoolInquiryInput['organizationType'] | null>(null)
  const [state, setState] = useState('')
  const [teacherCount, setTeacherCount] = useState<SchoolInquiryInput['teacherCount'] | null>(null)
  const [interests, setInterests] = useState<SchoolInquiryInput['interests']>([])
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  function toggleInterest(value: SchoolInquiryInput['interests'][number]) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!organizationType) {
      setError('Please choose what kind of organization you represent.')
      return
    }
    setSubmitting(true)
    try {
      await submitSchoolInquiry({
        name,
        email,
        role,
        organizationName,
        organizationType,
        state: state || undefined,
        teacherCount: teacherCount ?? undefined,
        interests,
        message: message || undefined,
        website,
      })
      setSentTo(email)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again, or email hello@wivoza.com.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-forest px-6 py-14 text-center text-cream">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-forest">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h3 className="font-heading text-3xl font-extrabold">
          Thank you<span className="text-gold">.</span>
        </h3>
        <p className="max-w-md text-cream/75">
          We’ve got your request and will reply to <span className="font-semibold text-cream">{sentTo}</span>.
        </p>
        <Link
          to="/guide"
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-cream hover:bg-cream/10"
        >
          Explore every feature while you wait
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-hairline bg-cream-card shadow-sm">
      <div className="bg-forest px-6 py-6 text-cream sm:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Get in touch</p>
        <h3 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">
          Tell us about your school<span className="text-gold">.</span>
        </h3>
        <p className="mt-1.5 text-sm text-cream/70">We’ll use this only to reply to you.</p>
      </div>

      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} />
          </Field>
          <Field label="Work email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field label="Your role">
            <select required value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              <option value="">Choose...</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="School or district name">
            <input
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              autoComplete="organization"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">You’re asking for</span>
          <div className="flex flex-wrap gap-2">
            {ORGANIZATION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={organizationType === t.value}
                onClick={() => setOrganizationType(t.value)}
                className={chipClass(organizationType === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="State" optional>
            <input value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" className={inputClass} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              Number of teachers <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {TEACHER_COUNTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={teacherCount === c}
                  onClick={() => setTeacherCount(teacherCount === c ? null : c)}
                  className={chipClass(teacherCount === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">
            What are you interested in? <span className="font-normal text-ink-soft">(choose any)</span>
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTERESTS.map((i) => {
              const active = interests.includes(i.value)
              return (
                <button
                  key={i.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleInterest(i.value)}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    active ? 'border-gold bg-gold-tint/60 text-forest' : 'border-hairline bg-cream text-ink hover:border-terracotta/40'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                      active ? 'bg-forest text-gold' : 'border-2 border-hairline bg-cream-card'
                    }`}
                  >
                    {active && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  {i.label}
                </button>
              )
            })}
          </div>
        </div>

        <Field label="Anything else we should know?" optional>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="Your goals, timeline, or questions."
            className={inputClass}
          />
        </Field>

        {/* Honeypot: hidden from people and screen readers, tempting to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        {error && <p className="text-sm text-terracotta-600">{error}</p>}

        <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-soft">
            Rather email? Write to{' '}
            <a href="mailto:hello@wivoza.com" className="font-semibold text-terracotta-600 hover:underline">
              hello@wivoza.com
            </a>
            .
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft disabled:shadow-none"
          >
            {submitting ? 'Sending...' : 'Send request'}
            {!submitting && <ArrowRightIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function ForSchools() {
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
            <a
              href="#inquiry"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Get in touch
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10">
        <div className="rounded-3xl bg-forest px-6 py-12 text-center text-cream sm:px-12 sm:py-16">
          <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-2 text-sm font-semibold text-gold">
            <GraduationCapIcon className="h-4 w-4" />
            For schools & districts
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            Private coaching for every teacher in your building<span className="text-gold">.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-cream/75">
            Give your whole staff Wivoza Plus, see how coaching is taking hold across your school, and keep every
            teacher’s individual work private to them.
          </p>
          <a
            href="#inquiry"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90"
          >
            Tell us about your school
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">What a school license includes</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold text-forest">
            One license, three wins<span className="text-gold">.</span>
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {OFFER.map(({ icon: Icon, badge, card, title, body }, i) => (
            <div key={title} className={`flex flex-col rounded-3xl p-7 ${card}`}>
              <div className="flex items-start justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${badge}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span aria-hidden="true" className="font-heading text-3xl font-extrabold text-forest/15">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="mt-5 font-heading text-xl font-bold text-forest">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-8 rounded-3xl border-l-8 border-gold bg-gold-tint/50 p-7 sm:p-9 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest text-gold">
              <ShieldIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest">
              Coaching, not evaluation<span className="text-gold">.</span>
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Teachers only open up to a coach they trust. So the privacy line is built into the product, not left
              to a policy.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-forest">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-8 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">How it works</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold text-forest">
            From first note to first login<span className="text-gold">.</span>
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex items-start gap-4 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-heading text-base font-bold ${
                  ['bg-gold text-forest', 'bg-terracotta text-cream', 'bg-forest text-gold'][i]
                }`}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-heading text-lg font-bold text-forest">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section id="inquiry" className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 pb-20 pt-8">
        <InquiryForm />
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
            <span>&copy; 2026 Wivoza. All rights reserved.</span>
          </div>
        </div>
      </footer>
      <SupportChat />
    </div>
  )
}
