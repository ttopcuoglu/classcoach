import { RUBRIC_LEVEL_NAMES, type ObservationComponent, type ObservationReport, type ObservationSummary } from '../lib/api'
import { RubricComponentAbout, RubricLevelBadge } from './RubricLevel'

// A classroom observation as the teacher receives it, and as the supervisor
// edits it before sending (the same view, so the draft can't show something
// the teacher won't get). Each component shows its evidence by source:
// Observed (the supervisor's answer), Observer notes, From the recording.

type Level = 1 | 2 | 3 | 4 | null

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function SourceLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{children}</p>
}

function LevelPicker({ value, suggested, onChange }: { value: Level; suggested: Level; onChange: (l: Level) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-forest">
        <span className="whitespace-nowrap">Your level</span>
        <select
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value ? (Number(e.target.value) as Level) : null)}
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
      <span className="text-xs text-ink-soft">
        Wivoza suggested {suggested == null ? 'not enough evidence' : `Level ${suggested} · ${RUBRIC_LEVEL_NAMES[suggested]}`}
        {value !== suggested ? ' · changed by you' : ''}
      </span>
    </div>
  )
}

function ComponentCard({ c, onLevel }: { c: ObservationComponent; onLevel?: (level: Level) => void }) {
  return (
    <div id={`component-${c.code}`} className="scroll-mt-6 rounded-2xl border border-hairline bg-cream-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
        <p className="font-heading text-base font-bold text-forest">{c.name}</p>
      </div>
      <RubricComponentAbout code={c.code} />
      {onLevel ? <LevelPicker value={c.level} suggested={c.suggestedLevel} onChange={onLevel} /> : null}
      <RubricLevelBadge level={c.level} code={c.code} />
      <p className="mt-3 text-sm text-ink">{c.reason}</p>

      {c.observed && (
        <div className="mt-4 rounded-xl border border-hairline bg-white p-3">
          <SourceLabel>Observed</SourceLabel>
          <p className="mt-1 text-xs text-ink-soft">{c.observed.question}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{c.observed.answer}</p>
        </div>
      )}
      {c.notes.length > 0 && (
        <div className="mt-3 rounded-xl border border-hairline bg-white p-3">
          <SourceLabel>Observer notes</SourceLabel>
          <ul className="mt-1 flex flex-col gap-1">
            {c.notes.map((n, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="text-xs text-ink-soft">{clock(n.atSec)} · </span>
                {n.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.recording.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <SourceLabel>From the recording</SourceLabel>
          {c.recording.map((e, i) => (
            <div key={i} className="border-l-2 border-gold/60 pl-3">
              <p className="text-sm text-ink">&ldquo;{e.text}&rdquo;</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {clock(e.timestampSec)} · {e.kind}
              </p>
            </div>
          ))}
        </div>
      )}
      {c.disagreement && (
        <div className="mt-3 rounded-xl border border-gold/50 bg-gold-tint/40 p-3">
          <SourceLabel>Where the sources differ</SourceLabel>
          <p className="mt-1 text-sm text-ink">{c.disagreement}</p>
        </div>
      )}
      {c.nextStep && (
        <div className="mt-4 rounded-xl bg-gold-tint/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Next step</p>
          <p className="mt-1 text-sm text-ink">{c.nextStep}</p>
        </div>
      )}
    </div>
  )
}

export function observationHeading(o: Pick<ObservationSummary, 'teacherName' | 'lessonTitle' | 'subject' | 'gradeLevel' | 'observedAt' | 'durationSec'>): string {
  // Subject and lesson are one field on the start screen; the subject from the
  // teacher's profile is shown only when the lesson doesn't already name it.
  const subject = o.subject && !(o.lessonTitle ?? '').toLowerCase().includes(o.subject.toLowerCase()) ? o.subject : null
  return [
    o.teacherName,
    o.lessonTitle,
    [o.gradeLevel ? `Grade ${o.gradeLevel.replace(/(st|nd|rd|th)$/i, '')}` : null, subject].filter(Boolean).join(' ') || null,
    new Date(o.observedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    o.durationSec ? `${Math.max(1, Math.round(o.durationSec / 60))} min` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function ObservationReportView({
  observation,
  report,
  onLevel,
  showComments = true,
}: {
  observation: Pick<ObservationSummary, 'teacherName' | 'lessonTitle' | 'subject' | 'gradeLevel' | 'observedAt' | 'durationSec'>
  report: ObservationReport
  /** The supervisor's draft: a level picker on every component. */
  onLevel?: (code: string, level: Level) => void
  showComments?: boolean
}) {
  const domains = [...new Set(report.components.map((c) => c.domain))]
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-forest/20 bg-mint-tint/30 p-5">
        <h2 className="font-heading text-lg font-bold text-forest">About This Lesson</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{observationHeading(observation)}</p>
        {report.about && <p className="mt-2 text-sm leading-relaxed text-ink">{report.about}</p>}
        {report.planVsLesson && (
          <p className="mt-2 text-sm leading-relaxed text-ink">
            <span className="font-semibold">Plan and lesson: </span>
            {report.planVsLesson}
          </p>
        )}
        {report.recordingMissing && (
          <p className="mt-2 text-xs text-ink-soft">There was no usable recording, so this report rests on what the observer saw{report.planning ? ' and the lesson plan' : ''}.</p>
        )}
      </section>

      {showComments && report.comments && (
        <section className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="font-heading text-lg font-bold text-forest">Observer&rsquo;s comments</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{report.comments}</p>
        </section>
      )}

      {report.planning && report.planning.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-forest">Domain 1: Planning and Preparation</h2>
            <p className="text-xs text-ink-soft">From the lesson plan, as written.</p>
          </div>
          {report.planning.map((c) => (
            <div key={c.code} id={`component-${c.code}`} className="scroll-mt-6 rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                <p className="font-heading text-base font-bold text-forest">{c.name}</p>
              </div>
              <RubricComponentAbout code={c.code} />
              {onLevel && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-forest">
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
                </div>
              )}
              <RubricLevelBadge level={c.level} source="plan" code={c.code} />
              {c.excerpts.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  <SourceLabel>From the plan</SourceLabel>
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

      {domains.map((domain) => (
        <section key={domain} className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold text-forest">{domain}</h2>
          {report.components
            .filter((c) => c.domain === domain)
            .map((c) => (
              <ComponentCard key={c.code} c={c} onLevel={onLevel ? (l) => onLevel(c.code, l) : undefined} />
            ))}
        </section>
      ))}
    </div>
  )
}
