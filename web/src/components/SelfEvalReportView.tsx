import type { ReactNode } from 'react'
import { RUBRIC_LEVEL_NAMES, type AudioContentNote, type SharedSelfEvalReport } from '../lib/api'
import { RubricComponentAbout, RubricLevelBadge } from './RubricLevel'

// The Self Evaluation report a teacher sends their supervisor, drawn the same way in
// the teacher's preview and on the supervisor's Evaluations page, so the
// preview cannot show something the supervisor won't get. Order: About This
// Lesson, Domain 1 from the plan (when attached), Domains 2 and 3 from the
// recording, then any extra Content Specialist feedback the teacher added.

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SpecialistNote({ note }: { note: AudioContentNote }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-white p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-forest">{note.label}</p>
        <p className="mt-0.5 text-sm text-ink">{note.text}</p>
        <p className="mt-1 text-xs text-ink-soft">
          &ldquo;{note.excerpt}&rdquo; · {formatTime(note.timestampSec)}
        </p>
      </div>
    </div>
  )
}

export type Strength = { code: string; name: string; level: 3 | 4; quote: string | null; from: 'recording' | 'plan' }

/// The components placed at Level 3 or 4, highest first, each with the
/// moment (or plan line) behind it. Shown before anything else is rated, so
/// a Self Evaluation opens on what went well rather than on Danielson's order.
export function strengthsOf(
  recording: { code: string; name: string; level?: number | null; evidence: { text: string }[] }[],
  plan: { code: string; name: string; level: number | null; excerpts: { text: string }[] }[] = [],
): Strength[] {
  const out: Strength[] = []
  for (const c of plan) if (c.level != null && c.level >= 3) out.push({ code: c.code, name: c.name, level: c.level as 3 | 4, quote: c.excerpts[0]?.text ?? null, from: 'plan' })
  for (const c of recording) if (c.level != null && c.level >= 3) out.push({ code: c.code, name: c.name, level: c.level as 3 | 4, quote: c.evidence[0]?.text ?? null, from: 'recording' })
  return out.sort((a, b) => b.level - a.level)
}

export function StrengthsCard({ strengths, title = 'Strengths in this lesson' }: { strengths: Strength[]; title?: string }) {
  if (strengths.length === 0) return null
  return (
    <section className="rounded-2xl border border-forest/20 bg-white p-5">
      <h2 className="font-heading text-lg font-bold text-forest">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {strengths.map((s) => (
          <li key={s.code} className="flex gap-3">
            <span className="mt-0.5 shrink-0 rounded-md bg-mint-tint px-2 py-0.5 text-xs font-bold text-forest">{s.code}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {s.name} <span className="font-normal text-ink-soft">· Level {s.level} · {RUBRIC_LEVEL_NAMES[s.level]}</span>
              </p>
              {s.quote && (
                <p className="mt-0.5 text-sm text-ink-soft">
                  &ldquo;{s.quote}&rdquo;{s.from === 'plan' ? ' (from the plan)' : ''}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TeacherNote({ note }: { note: string | null | undefined }) {
  if (!note) return null
  return (
    <div className="mt-4 rounded-xl border border-hairline bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Teacher&rsquo;s note</p>
      <p className="mt-1 whitespace-pre-line text-sm text-ink">{note}</p>
    </div>
  )
}

export function SelfEvalReportView({
  report,
  aboutBody,
  aboutActions,
  aboutMissing,
  teacherPreview = false,
}: {
  report: SharedSelfEvalReport
  /** Replaces the About paragraph (the teacher's editor, in the preview). */
  aboutBody?: ReactNode
  aboutActions?: ReactNode
  /** Shown in place of About when there is none (preview only). */
  aboutMissing?: ReactNode
  /** The teacher's preview: Strengths and the Content Specialist's notes are
   *  left off the screen (the user's call, 2026-11-19), though the
   *  supervisor's copy still has them. */
  teacherPreview?: boolean
}) {
  const domains = [...new Set(report.components.map((c) => c.domain))]
  const about = report.about
  return (
    <div className="flex flex-col gap-6">
      {(about || aboutMissing) && (
        <section className="rounded-2xl border border-forest/20 bg-mint-tint/30 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-bold text-forest">
              About This Lesson{about?.heading ? <span className="font-semibold text-ink-soft"> · {about.heading}</span> : null}
            </h2>
            {aboutActions}
          </div>
          {aboutBody ?? (about ? <p className="mt-2 text-sm leading-relaxed text-ink">{about.text}</p> : aboutMissing)}
        </section>
      )}

      {!teacherPreview && <StrengthsCard strengths={strengthsOf(report.components, report.planning?.components ?? [])} />}

      {report.planning && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-forest">Domain 1: Planning and Preparation</h2>
            <p className="text-xs text-ink-soft">From the lesson plan: {report.planning.label}. Each level is suggested from the plan as written.</p>
          </div>
          {report.planning.components.map((c) => (
            <div key={c.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                <p className="font-heading text-base font-bold text-forest">{c.name}</p>
              </div>
              <RubricComponentAbout code={c.code} />
              <RubricLevelBadge level={c.level} source="plan" />
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
              <TeacherNote note={c.teacherNote} />
            </div>
          ))}
          {report.planning.fullPlan && (
            <details className="rounded-2xl border border-hairline bg-white p-5">
              <summary className="cursor-pointer text-sm font-semibold text-forest">The full lesson plan</summary>
              <div className="mt-3 flex flex-col gap-3">
                {report.planning.fullPlan.map((s, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{s.ref}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink">{s.text}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {domains.map((domain) => (
        <section key={domain} className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-bold text-forest">{domain}</h2>
          {report.components
            .filter((c) => c.domain === domain)
            .map((c) => (
              <div key={c.code} className="rounded-2xl border border-hairline bg-cream-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                  <p className="font-heading text-base font-bold text-forest">{c.name}</p>
                </div>
                <RubricComponentAbout code={c.code} />
                <RubricLevelBadge level={c.level} />
                <p className="mt-3 text-sm text-ink">{c.summary}</p>
                {c.evidence.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {c.evidence.map((e, i) => (
                      <div key={i} className="border-l-2 border-gold/60 pl-3">
                        <p className="text-sm text-ink">&ldquo;{e.text}&rdquo;</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {formatTime(e.timestampSec)} · {e.kind}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {!teacherPreview && c.contentNotes.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">From the Content Specialist</p>
                    {c.contentNotes.map((n) => (
                      <SpecialistNote key={n.id} note={n} />
                    ))}
                  </div>
                )}
                {c.nextStep && (
                  <div className="mt-4 rounded-xl bg-gold-tint/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Next step</p>
                    <p className="mt-1 text-sm text-ink">{c.nextStep}</p>
                  </div>
                )}
                <TeacherNote note={c.teacherNote} />
              </div>
            ))}
          {report.notObservable
            .filter((c) => c.domain === domain)
            .map((c) => (
              <div key={c.code} className="rounded-2xl border border-dashed border-hairline p-4 text-sm text-ink-soft">
                <p>
                  <span className="font-semibold">
                    {c.code} {c.name}:
                  </span>{' '}
                  not in a recording. {c.reason}
                </p>
                <RubricComponentAbout code={c.code} />
              </div>
            ))}
        </section>
      ))}

      {!teacherPreview && report.additionalContent && (report.additionalContent.notes.length > 0 || report.additionalContent.waysIn.length > 0) && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-forest">More from the Content Specialist</h2>
            <p className="text-xs text-ink-soft">Other coaching suggestions on this lesson&rsquo;s content. They don&rsquo;t change any level above.</p>
          </div>
          {report.additionalContent.notes.map((n) => (
            <SpecialistNote key={n.id} note={n} />
          ))}
          {report.additionalContent.waysIn.length > 0 && (
            <div className="rounded-xl border border-hairline bg-white p-3">
              <p className="text-xs font-semibold text-forest">Ways in, next time</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
                {report.additionalContent.waysIn.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
