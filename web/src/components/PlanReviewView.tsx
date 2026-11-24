import { RUBRIC_LEVEL_NAMES, type PlanReviewReport, type PlanReviewSummary } from '../lib/api'
import { RubricComponentAbout, RubricLevelBadge } from './RubricLevel'

// A lesson plan review as the teacher receives it, and as the supervisor
// edits it before sending (the same view, with a level picker on each Domain 1
// component), so the draft can't show something the teacher won't get.

type Level = 1 | 2 | 3 | 4 | null

const FORMAT_STATUS: Record<'present' | 'thin' | 'missing', { label: string; tone: string }> = {
  present: { label: 'Present', tone: 'bg-mint-tint/70 text-forest' },
  thin: { label: 'Thin', tone: 'bg-gold-tint text-terracotta-600' },
  missing: { label: 'Missing', tone: 'bg-terracotta/15 text-terracotta-600' },
}

export function planReviewHeading(r: Pick<PlanReviewSummary, 'teacherName' | 'lessonTitle' | 'gradeLevel' | 'createdAt'>): string {
  return [
    r.teacherName,
    r.lessonTitle,
    r.gradeLevel ? `Grade ${r.gradeLevel.replace(/(st|nd|rd|th)$/i, '')}` : null,
    new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function PlanReviewView({ review, report, onLevel, showComments = true }: { review: Pick<PlanReviewSummary, 'teacherName' | 'lessonTitle' | 'gradeLevel' | 'createdAt' | 'planLabel'>; report: PlanReviewReport; onLevel?: (code: string, level: Level) => void; showComments?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-forest/20 bg-mint-tint/30 p-5">
        <h2 className="font-heading text-lg font-bold text-forest">About This Plan</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          {planReviewHeading(review)} · {review.planLabel}
        </p>
        {report.about && <p className="mt-2 text-sm leading-relaxed text-ink">{report.about}</p>}
      </section>

      {showComments && report.comments && (
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-heading text-lg font-bold text-forest">Reviewer&rsquo;s comments</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{report.comments}</p>
        </section>
      )}

      {(report.strengths.length > 0 || report.nextSteps.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {report.strengths.length > 0 && (
            <section className="rounded-2xl border border-hairline bg-white p-5">
              <h2 className="font-heading text-lg font-bold text-forest">Strengths</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink">
                {report.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {report.nextSteps.length > 0 && (
            <section className="rounded-2xl border border-hairline bg-gold-tint/30 p-5">
              <h2 className="font-heading text-lg font-bold text-forest">Next steps</h2>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink">
                {report.nextSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {report.format && (
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-heading text-lg font-bold text-forest">School lesson plan format</h2>
          <p className="mt-0.5 text-xs text-ink-soft">How the plan covers each section of {report.format.name}.</p>
          <ul className="mt-3 flex flex-col divide-y divide-hairline/70">
            {report.format.sections.map((s) => (
              <li key={s.title} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.title}</p>
                  {s.note && <p className="text-xs text-ink-soft">{s.note}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${FORMAT_STATUS[s.status].tone}`}>{FORMAT_STATUS[s.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.planning && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-forest">Domain 1: Planning and Preparation</h2>
            <p className="text-xs text-ink-soft">From the plan as written. Each level cites the plan&rsquo;s own words.</p>
          </div>
          {report.planning.map((c) => (
            <div key={c.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                <p className="font-heading text-base font-bold text-forest">{c.name}</p>
              </div>
              <RubricComponentAbout code={c.code} />
              {onLevel && (
                <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-forest">
                  <span className="whitespace-nowrap">Your level</span>
                  <select
                    value={c.level == null ? '' : String(c.level)}
                    onChange={(e) => onLevel(c.code, e.target.value ? (Number(e.target.value) as Level) : null)}
                    className="rounded-lg border border-hairline bg-white px-3 py-1.5 text-sm font-medium text-ink focus:border-forest focus:outline-none"
                  >
                    {([4, 3, 2, 1] as const).map((l) => (
                      <option key={l} value={l}>
                        Level {l} · {RUBRIC_LEVEL_NAMES[l]}
                      </option>
                    ))}
                    <option value="">Not enough evidence</option>
                  </select>
                </label>
              )}
              <RubricLevelBadge level={c.level} source="plan" code={c.code} />
              {c.excerpts.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {c.excerpts.map((e, i) => (
                    <div key={i} className="border-l-2 border-gold/60 pl-3">
                      <p className="text-sm text-ink">&ldquo;{e.text}&rdquo;</p>
                      <p className="mt-0.5 text-xs text-ink-soft">Plan · {e.ref}</p>
                    </div>
                  ))}
                </div>
              )}
              {c.explanation && <p className="mt-3 text-sm text-ink">{c.explanation}</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
