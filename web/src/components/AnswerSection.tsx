import { ACCENT_CYCLE } from './report'

// One part of a coaching answer — numbered and colour-banded like the
// sections of the printed reports and the Lesson Debrief Insights, so an
// answer reads the same way everywhere: what the part is, what it's for,
// then the words. Numbers are assigned by the caller in reading order, so a
// missing part never leaves a gap.
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
  const accent = ACCENT_CYCLE[(n - 1) % ACCENT_CYCLE.length]
  return (
    <section className={`rounded-2xl ${accent.tint} p-5`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent.band} font-heading text-sm font-bold text-cream`}
        >
          {n}
        </span>
        <div>
          <h3 className="font-heading text-base font-bold leading-tight text-forest">{title}</h3>
          <p className="text-xs text-ink-soft">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{children}</div>
    </section>
  )
}
