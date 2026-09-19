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

// What the pilot report (and the admin panel behind it) shows a school
// leader. Kept to what the report actually contains.
const LEADER_VIEW = [
  { title: 'Is it being used?', body: 'Who activated, who is active, who keeps coming back, and who could use a nudge, with what tends to help.' },
  { title: 'Where should PD go?', body: 'Shared strengths and growth areas from recorded lessons, each explained in plain words, by grade or subject once groups are large enough.' },
  { title: 'Did the PD work?', body: 'Track a focus area and see whether it shows up in fewer lessons since you started, for example 43% of lessons down to 22%.' },
  { title: 'What should we do next?', body: 'The most common need you are not working on yet, with a suggested PD session, ready for your next staff meeting.' },
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
  const [teacherCount, setTeacherCount] = useState<SchoolInquiryInput['teacherCount'] | null>(null)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

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
        teacherCount: teacherCount ?? undefined,
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

        <div className="flex flex-col gap-2">
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

        <Field label="Anything else we should know?" optional>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="What you're hoping for — a pilot, a license for all teachers, a walkthrough — plus your goals, timeline, or questions."
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

      {/* What school leaders see */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">What school leaders see</p>
            <h2 className="mt-2 font-heading text-3xl font-extrabold text-forest">
              The big picture, without watching anyone<span className="text-gold">.</span>
            </h2>
            <p className="mt-3 text-ink-soft">
              Your admin panel — and a short pilot report you can share with your district — shows how coaching is
              taking hold across your staff.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {LEADER_VIEW.map((item, i) => (
                <div key={item.title} className="rounded-2xl border border-hairline bg-cream-card p-5">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl font-heading text-sm font-bold ${
                      ['bg-terracotta text-cream', 'bg-gold text-forest', 'bg-mint-tint text-forest', 'bg-forest text-gold'][i]
                    }`}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-3 font-heading text-base font-bold text-forest">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-start gap-2.5 text-sm text-forest">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
              You see school-wide patterns — never one teacher’s recordings, conversations, or ratings. Groups with
              fewer than 5 teachers are combined so no one can be singled out.
            </p>
          </div>

          <a
            href="/samples/pilot-report.pdf"
            target="_blank"
            rel="noreferrer"
            className="group block rounded-3xl bg-forest p-5 text-cream shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Sample pilot report</p>
              <span className="rounded-full bg-cream/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream">
                Invented school
              </span>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl bg-white">
              <img
                src="/samples/pilot-report.png"
                alt="The first page of a sample Wivoza pilot report for an invented school: an At a glance summary and adoption numbers."
                className="w-full"
              />
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cream">
              See the full sample (PDF)
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      </section>

      {/* Inside the admin panel */}
      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-6 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Inside the admin panel</p>
          <h2 className="mt-2 font-heading text-3xl font-extrabold text-forest">
            Every number explains itself<span className="text-gold">.</span>
          </h2>
          <p className="mt-3 text-ink-soft">
            Your dashboard opens with the answer, points to what needs your attention, and shows whether the work you
            chose as a school is paying off. Shown here with an invented school.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <figure className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-3 shadow-sm">
            <img
              src="/samples/admin-dashboard.png"
              alt="The admin dashboard for an invented school: an At a glance summary, this period's adoption numbers, and three things that need attention."
              className="w-full rounded-2xl"
              loading="lazy"
            />
            <figcaption className="px-2 pb-1 pt-3 text-sm text-ink-soft">
              <span className="font-semibold text-forest">Dashboard.</span> The four things a principal needs to know,
              then what to look at this week.
            </figcaption>
          </figure>
          <div className="flex flex-col gap-6">
            <figure className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-3 shadow-sm">
              <img
                src="/samples/admin-pd-progress.png"
                alt="A tracked focus area for an invented school: talk time balance went from 43% of lessons to 22% since tracking began."
                className="w-full rounded-2xl"
                loading="lazy"
              />
              <figcaption className="px-2 pb-1 pt-3 text-sm text-ink-soft">
                <span className="font-semibold text-forest">Professional Learning.</span> Pick a focus as a school and see
                whether it shows up in fewer lessons.
              </figcaption>
            </figure>
            <p className="flex items-start gap-2.5 rounded-2xl bg-mint-tint/50 p-5 text-sm text-forest">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
              Teachers keep using Wivoza because you can&rsquo;t see their recordings or coaching. That trust is what
              fills these reports.
            </p>
          </div>
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
        <p className="mt-5 rounded-2xl border-l-8 border-gold bg-gold-tint/50 px-5 py-4 text-sm text-forest">
          <span className="font-semibold">Built for pilots.</span> At the end of a pilot you get a report you can share
          with your district: adoption, what your PD changed, school-wide trends, and a recommended next step, all
          anonymous.
        </p>
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
            <span>&copy; 2026 Edinexa Technologies LLC. All rights reserved.</span>
          </div>
        </div>
      </footer>
      <SupportChat />
    </div>
  )
}
