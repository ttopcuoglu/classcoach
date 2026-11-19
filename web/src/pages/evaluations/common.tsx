import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RUBRIC_LEVEL_NAMES, type SelfEvalReport, type SharedSelfEvalSummary } from '../../lib/api'

// Pieces the supervisor's workspace (Overview, My Teachers, Reports) and a
// single shared evaluation both use.

// ---- the period every view shares, kept in the address ----
// ?term= is a month (m-2026-11), the school year, a semester, all time or
// custom dates (?from=&to=). A school year runs August to July; Semester 1 is
// August–January and Semester 2 February–July. The default is this month.

export type DateRange = { from: Date | null; to: Date | null }

function schoolYearStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

const monthKey = (d: Date) => `m-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function defaultTerm(now = new Date()): string {
  return monthKey(now)
}

export function termOptions(now = new Date()): { key: string; label: string }[] {
  const y = schoolYearStart(now)
  const span = `${y}–${String(y + 1).slice(2)}`
  // This school year's months so far, newest first.
  const months: { key: string; label: string }[] = []
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= new Date(y, 7, 1); d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) {
    months.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })
  }
  return [
    ...months,
    { key: 'year', label: `This school year (${span})` },
    { key: 's1', label: `Semester 1, ${span} (Aug–Jan)` },
    { key: 's2', label: `Semester 2, ${span} (Feb–Jul)` },
    { key: 'all', label: 'All time' },
    { key: 'custom', label: 'Custom dates' },
  ]
}

function dayStart(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayEnd(ymd: string | null): Date | null {
  const d = dayStart(ymd)
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) : null
}

export function rangeFor(term: string, from: string | null, to: string | null, now = new Date()): DateRange {
  const y = schoolYearStart(now)
  const end = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999)
  const month = /^m-(\d{4})-(\d{2})$/.exec(term)
  if (month) return { from: new Date(Number(month[1]), Number(month[2]) - 1, 1), to: end(Number(month[1]), Number(month[2]) - 1) }
  switch (term) {
    case 'year':
      return { from: new Date(y, 7, 1), to: end(y + 1, 6) }
    case 's1':
      return { from: new Date(y, 7, 1), to: end(y + 1, 0) }
    case 's2':
      return { from: new Date(y + 1, 1, 1), to: end(y + 1, 6) }
    case 'custom':
      return { from: dayStart(from), to: dayEnd(to) }
    default:
      return { from: null, to: null }
  }
}

export function inRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime()
  return (!range.from || t >= range.from.getTime()) && (!range.to || t <= range.to.getTime())
}

// ---- formatting ----

export function formatDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
}

export function gradeLabel(grade: string | null | undefined): string | null {
  return grade ? `Grade ${grade.replace(/(st|nd|rd|th)$/i, '')}` : null
}

export function lessonMeta(s: Pick<SharedSelfEvalSummary, 'teacherName' | 'classSubject' | 'gradeLevel'>, withTeacher = true): string {
  return [withTeacher ? s.teacherName : null, s.classSubject, gradeLabel(s.gradeLevel)].filter(Boolean).join(' · ')
}

export function teacherMeta(t: { subjects: string[]; gradeLevels: string[] }): string {
  return [t.subjects.join(', '), t.gradeLevels.length ? `Grade ${t.gradeLevels.map((g) => g.replace(/(st|nd|rd|th)$/i, '')).join(', ')}` : '']
    .filter(Boolean)
    .join(' · ')
}

/// "08:42", the way the reports show a moment of the lesson.
export function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function StatusChip({ status }: { status: SharedSelfEvalSummary['status'] }) {
  return status === 'awaiting' ? (
    <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-terracotta-600">Awaiting feedback</span>
  ) : (
    <span className="rounded-full bg-mint-tint/70 px-3 py-1 text-xs font-semibold text-forest">Replied</span>
  )
}

export const LEVEL_CELL: Record<number, string> = {
  1: 'bg-terracotta/15 text-terracotta-600',
  2: 'bg-gold-tint text-terracotta-600',
  3: 'bg-mint-tint/70 text-forest',
  4: 'bg-forest text-cream',
}

// ---- page frame ----

export function PageHeader({ crumb, title, blurb, aside }: { crumb: string; title: string; blurb: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        School Workspace <span className="mx-1.5 text-hairline">/</span> <span className="text-ink">{crumb}</span>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta-600">Your supervisor workspace</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold text-forest md:text-4xl">
            {title}
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-base text-ink-soft">{blurb}</p>
        </div>
        {aside}
      </div>
    </div>
  )
}

export function PrivacyFooter() {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      Based on teacher-selected, shared evaluations.
    </p>
  )
}

// ---- one teacher's levels in lesson order ----
// A dot per lesson and a plain-words comparison of the earlier lessons with
// the later ones. It compares typical (median) levels, never an average, and
// says nothing until at least four lessons gave the component a level.

const GROWTH_MIN = 4

function typicalLevel(levels: number[]): number {
  const sorted = [...levels].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function growthFor(levels: (number | null)[]): { early: number; late: number; half: number } | null {
  const leveled = levels.filter((l): l is number => l != null)
  if (leveled.length < GROWTH_MIN) return null
  const half = Math.floor(leveled.length / 2)
  return { early: typicalLevel(leveled.slice(0, half)), late: typicalLevel(leveled.slice(leveled.length - half)), half }
}

export function GrowthView({ report }: { report: SelfEvalReport }) {
  const domains = [...new Set(report.components.map((c) => c.domain))]
  return (
    <section className="rounded-2xl border border-hairline bg-white px-5 py-5">
      <h2 className="font-heading text-lg font-bold text-forest">Growth across lessons</h2>
      <p className="mt-1 text-xs text-ink-soft">
        One dot per shared lesson, oldest on the left; an empty dot is not enough evidence. The line compares the typical level in the
        earlier lessons with the later ones, once at least {GROWTH_MIN} lessons gave that component a level. It is a starting point
        for a conversation, not a rating.
      </p>
      {domains.map((domain) => (
        <div key={domain} className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{domain}</p>
          <div className="mt-2 flex flex-col">
            {report.components
              .filter((c) => c.domain === domain)
              .map((c) => {
                const levels = report.lessons.map((l) => l.levels[c.code] ?? null)
                const growth = growthFor(levels)
                const counted = levels.filter((l) => l != null).length
                return (
                  <div key={c.code} className="flex flex-col gap-2 border-b border-hairline/50 py-3 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{c.code}</span> · {c.name}
                      </p>
                      <p className="text-xs text-ink-soft sm:text-right">
                        {growth ? (
                          <>
                            <span
                              className={`mr-1.5 rounded-full px-2 py-0.5 font-semibold ${
                                growth.late > growth.early ? 'bg-mint-tint/70 text-forest' : growth.late < growth.early ? 'bg-gold-tint text-terracotta-600' : 'bg-cream text-ink'
                              }`}
                            >
                              {growth.late > growth.early ? 'Higher lately' : growth.late < growth.early ? 'Lower lately' : 'Steady'}
                            </span>
                            Level {growth.early} in the first {growth.half}, Level {growth.late} in the last {growth.half}
                          </>
                        ) : (
                          `Too few lessons with a level to compare (${counted} of ${GROWTH_MIN})`
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 overflow-x-auto pb-0.5">
                      {report.lessons.map((l, i) => {
                        const level = levels[i]
                        const label = `${formatDate(l.sessionDate, true)} · ${l.lessonTitle} · ${level == null ? 'not enough evidence' : `Level ${level} · ${RUBRIC_LEVEL_NAMES[level as 1 | 2 | 3 | 4]}`}`
                        return (
                          <Link
                            key={l.sessionId}
                            to={`/admin/evaluations/${l.sessionId}`}
                            title={label}
                            aria-label={label}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              level == null ? 'border border-dashed border-hairline text-ink-soft' : LEVEL_CELL[level]
                            }`}
                          >
                            {level ?? ''}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </section>
  )
}
