import { ACCENT_CYCLE } from './report'

// Numbered, colour-banded sections like those of the printed reports and the
// Lesson Debrief Insights, so every page reads the same way: what the part
// is, what it's for, then the content. Numbers are assigned by the caller in
// reading order, so a missing part never leaves a gap.

function accentFor(n: number) {
  return ACCENT_CYCLE[(n - 1) % ACCENT_CYCLE.length]
}

export function NumberedHeading({
  n,
  title,
  subtitle,
  aside,
}: {
  n: number
  title: string
  subtitle: string
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accentFor(n).band} font-heading text-sm font-bold text-cream`}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-base font-bold leading-tight text-forest">{title}</h3>
        <p className="text-xs text-ink-soft">{subtitle}</p>
      </div>
      {aside}
    </div>
  )
}

// A tinted card around any content — cards, charts, form fields.
export function NumberedCard({
  n,
  title,
  subtitle,
  aside,
  children,
}: {
  n: number
  title: string
  subtitle: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-2xl ${accentFor(n).tint} p-5`}>
      <NumberedHeading n={n} title={title} subtitle={subtitle} aside={aside} />
      <div className="mt-3">{children}</div>
    </section>
  )
}

// One part of a coaching answer: plain text, line breaks kept.
export default function AnswerSection({
  n,
  title,
  subtitle,
  children,
}: {
  n: number
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <NumberedCard n={n} title={title} subtitle={subtitle}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{children}</div>
    </NumberedCard>
  )
}
