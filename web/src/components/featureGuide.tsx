import { Link } from 'react-router-dom'
import SupportChat from './SupportChat'
import { ArrowRightIcon, ChartBarIcon } from './icons'

// The shared chrome for every teacher-facing feature guide (/guide/<feature>).
// /guide is the complete reference — every field, tab, and button. These are
// the opposite: a coach walking one teacher through one feature, always in
// the same five sections, so the pathway strip means the same thing everywhere:
//
//   Why It Helps -> How It Works -> Teacher Story -> Try It -> Debrief
//
// A new guide supplies only content: hero copy, the section bodies, and where
// its buttons point. Nothing here should need to change to add one.

export type PathwayStep = { id: string; label: string }

export const GUIDE_PATHWAY: PathwayStep[] = [
  { id: 'why-it-helps', label: 'Why It Helps' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'teacher-story', label: 'Teacher Story' },
  { id: 'try-it', label: 'Try It' },
  { id: 'debrief', label: 'Debrief' },
]

export function GuidePrimaryButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
    >
      {children}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  )
}

export function GuideSection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  lede?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-hairline py-14">
      <span className="rounded-full bg-mint-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-forest">
        {eyebrow}
      </span>
      <h2 className="mt-4 font-heading text-2xl font-extrabold text-forest sm:text-3xl">{title}</h2>
      {lede && <p className="mt-3 max-w-2xl text-lg text-ink-soft">{lede}</p>}
      {children}
    </section>
  )
}

export function GuideHero({
  icon: Icon,
  title,
  paragraphs,
}: {
  icon: (props: { className?: string }) => React.ReactElement
  title: string
  paragraphs: string[]
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-12 pt-14 text-center">
      <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-mint-tint px-4 py-2 text-sm font-semibold text-forest">
        <Icon className="h-4 w-4" />
        Teacher's guide
      </span>
      <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.1] tracking-tight text-forest sm:text-5xl">
        {title}
      </h1>
      {paragraphs.map((text) => (
        <p key={text.slice(0, 24)} className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
          {text}
        </p>
      ))}
    </section>
  )
}

export function GuidePathway({ steps = GUIDE_PATHWAY }: { steps?: PathwayStep[] }) {
  return (
    // Scrolls inside itself on a phone rather than widening the page — the
    // five steps are ~830px and every guide is read on a phone at some point.
    <nav aria-label="Guide sections" className="border-y border-hairline bg-cream-card">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 overflow-x-auto px-6 py-4">
        {steps.map((step, i) => (
          <div key={step.id} className="flex shrink-0 items-center gap-2">
            <a
              href={`#${step.id}`}
              className="flex items-center gap-2 rounded-full border border-hairline bg-cream px-4 py-2 text-sm font-semibold text-forest transition-colors hover:border-terracotta/50 hover:text-terracotta-600"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-forest">
                {i + 1}
              </span>
              {step.label}
            </a>
            {i < steps.length - 1 && <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-ink-soft/60" />}
          </div>
        ))}
      </div>
    </nav>
  )
}

// A labelled frame for an illustrative screen sample. Deliberately NOT a
// screenshot: each guide draws its own body in its feature's real palette
// (several screens still use the older brand-*/canvas/surface tokens, others
// the 2026 forest/cream set), so it reads as a picture of the screen while
// staying responsive, theme-consistent, and immune to going stale. The badge
// and caption exist so nobody mistakes the numbers for their own.
export function GuideSample({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-hairline bg-canvas">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</p>
          <span className="shrink-0 rounded-full bg-gold-tint px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-terracotta-600">
            Sample
          </span>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
      </div>
      <figcaption className="mt-2.5 text-xs text-ink-soft">{caption}</figcaption>
    </figure>
  )
}

export function GuideClosing({
  icon: Icon,
  title,
  body,
  ctaTo,
  ctaLabel,
}: {
  icon: (props: { className?: string }) => React.ReactElement
  title: string
  body: string
  ctaTo: string
  ctaLabel: string
}) {
  return (
    <section className="mt-10 bg-forest py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-forest">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="font-heading text-3xl font-extrabold leading-tight text-cream">{title}</h2>
        <p className="max-w-md text-cream/70">{body}</p>
        <Link
          to={ctaTo}
          className="flex items-center gap-2 rounded-full bg-terracotta px-6 py-3.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
        >
          {ctaLabel}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

export function GuideShell({ appTo, children }: { appTo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-hairline bg-cream-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-4 w-4" />
            </span>
            <span className="font-heading text-base font-bold text-forest">Wivoza</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">
              All features
            </Link>
            <Link
              to={appTo}
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Open Wivoza
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="bg-cream py-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-6 text-sm text-ink-soft sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold text-forest">
              <ChartBarIcon className="h-3.5 w-3.5" />
            </span>
            <p className="font-heading font-bold text-forest">Wivoza</p>
            <span className="hidden sm:inline">Practice. Reflect. Grow.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/guide" className="hover:text-ink">
              All features
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
