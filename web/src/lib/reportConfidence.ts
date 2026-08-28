// Presentation-layer confidence rules for the Audio Coaching report. These
// operate only on data already computed and stored by the backend — no
// detection logic changes here, only how confidently we present it. Kept
// as pure functions so both the in-app report and the print/export view
// can share the exact same judgment calls.

import type { AudioPhase } from './api'

// A session shorter than this gets a can't-miss "treat as indicative"
// banner — short samples are real data, but not a full observation.
export const SHORT_SESSION_THRESHOLD_SEC = 10 * 60

// Below this many events in the denominator, a percentage reads as more
// precise than it is ("25%" implies a stable rate; "1 of 4" doesn't).
export const MIN_N_FOR_PERCENT = 10

// Checks-for-understanding phrases are optional, relatively sparse teacher
// behavior — a short clip that happens not to contain one doesn't mean the
// teacher never uses them. Below this floor, "0" becomes "unavailable"
// rather than a confident zero. (Plain question-counting doesn't need an
// equivalent floor: a literal "?" is a direct, low-ambiguity signal at any
// length, so Questions/Student voice segments/Follow-up questions are left
// as ordinary measured/zero counts.)
export const MIN_DURATION_FOR_CFU_DETECTION_SEC = 3 * 60

// A phase shorter than this wasn't really captured as a distinct part of
// the lesson — it's a sliver of a short recording, not real Opening/
// Closing time.
export const MIN_PHASE_DURATION_SEC = 30

export type MetricState = 'measured' | 'zero' | 'unavailable'

export type ConfidentMetric = {
  state: MetricState
  display: string
  reason?: string
}

export type CoverageInfo = {
  recordedSec: number
  totalSec: number
  isShort: boolean
  uncapturedPhases: string[]
}

export function getCoverage(durationSec: number | null, phases: AudioPhase[] | null): CoverageInfo {
  const recordedSec = durationSec ?? 0
  // We only ever have the audio we actually recorded — there's no separate
  // "intended class length" tracked today, so total and recorded are the
  // same number. Kept as a distinct field so a future "planned duration"
  // or paused-time tracker can slot in without changing every call site.
  const totalSec = recordedSec
  const uncapturedPhases = (phases ?? [])
    .filter((p) => p.endSec - p.startSec < MIN_PHASE_DURATION_SEC)
    .map((p) => p.label)

  return {
    recordedSec,
    totalSec,
    isShort: recordedSec > 0 && recordedSec < SHORT_SESSION_THRESHOLD_SEC,
    uncapturedPhases,
  }
}

// For any "N of M" style ratio — e.g. higher-order questions out of total
// questions. Falls back to a fraction when M is too small for a percentage
// to read as reliable.
export function formatRatio(numerator: number, denominator: number): ConfidentMetric {
  if (denominator <= 0) {
    return { state: 'unavailable', display: '—', reason: 'No questions were detected to classify.' }
  }
  if (denominator < MIN_N_FOR_PERCENT) {
    return { state: 'measured', display: `${numerator} of ${denominator}` }
  }
  return { state: 'measured', display: `${Math.round((numerator / denominator) * 100)}%` }
}

// For a plain count metric (CFUs, questions, student voice segments,
// follow-up questions). Pass minDurationSec for a metric whose detection
// needs a minimum sample to fairly conclude "zero" rather than "unclear."
export function getCountMetric(options: {
  count: number | null | undefined
  recordedSec: number
  minDurationSec?: number
  minDurationReason?: string
}): ConfidentMetric {
  const { count, recordedSec, minDurationSec, minDurationReason } = options

  if (minDurationSec != null && recordedSec < minDurationSec) {
    return {
      state: 'unavailable',
      display: '—',
      reason:
        minDurationReason ??
        `Recording too short (under ${Math.round(minDurationSec / 60)} min) to reliably detect this.`,
    }
  }
  if (count == null) {
    return { state: 'unavailable', display: '—', reason: 'Not enough data to determine.' }
  }
  if (count === 0) {
    return { state: 'zero', display: '0' }
  }
  return { state: 'measured', display: String(count) }
}

// For a plain numeric field that's either present or it isn't (talk %,
// wait time) — used only to fold these into a category's coverage tally
// alongside the count/ratio metrics above.
export function getPresenceMetric(value: number | null | undefined): ConfidentMetric {
  return value == null
    ? { state: 'unavailable', display: '—' }
    : { state: 'measured', display: String(value) }
}

// "N of M measured" for a category's header — counts anything that isn't
// 'unavailable' as measured (a confident zero still counts as data).
export function categoryCoverage(entries: { state: MetricState }[]): string {
  const total = entries.length
  const measured = entries.filter((e) => e.state !== 'unavailable').length
  return `${measured} of ${total} measured`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// One consolidated read on how much to trust this session's numbers,
// replacing the old scattered "recorded X of Y" line + separate
// short-session banner with a single line and a good/warn tone.
export function buildEvidenceQualityLine(
  coverage: CoverageInfo,
  metrics: ConfidentMetric[],
): { text: string; tone: 'good' | 'warn' } {
  const total = metrics.length
  const measured = metrics.filter((m) => m.state !== 'unavailable').length
  const warn = coverage.isShort || (total > 0 && measured / total < 0.6)
  const parts: string[] = [`Recorded ${formatDuration(coverage.recordedSec)}`]
  if (coverage.isShort) {
    parts.push(`under ${Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} min — treat metrics as indicative, not conclusive`)
  }
  parts.push(`${measured} of ${total} metrics measured confidently`)
  if (coverage.uncapturedPhases.length > 0) {
    parts.push(`not clearly captured: ${coverage.uncapturedPhases.join(', ')}`)
  }
  return { text: parts.join(' · '), tone: warn ? 'warn' : 'good' }
}

// Below this share of student talk, a caption must never call the split
// "balanced" even if the teacher's own percentage looks mid-range — this is
// the structural fix for the bug where "fairly balanced... students at 0%"
// could be emitted (the old logic branched only on teacherTalkPct).
export const BALANCED_STUDENT_FLOOR_PCT = 15

export type TalkBalanceJudgment =
  | { kind: 'teacher-heavy'; teacherPct: number; studentPct: number | null }
  | { kind: 'student-heavy'; teacherPct: number; studentPct: number }
  | { kind: 'balanced'; teacherPct: number; studentPct: number }
  | { kind: 'student-unmeasured'; teacherPct: number }
  | { kind: 'student-zero'; teacherPct: number }
  | { kind: 'student-thin'; teacherPct: number; studentPct: number }

export function judgeTalkBalance(
  teacherPct: number | null,
  studentPct: number | null,
): TalkBalanceJudgment | null {
  if (teacherPct == null) return null
  if (teacherPct >= 65) return { kind: 'teacher-heavy', teacherPct, studentPct }
  if (teacherPct <= 40 && studentPct != null && studentPct > teacherPct) {
    return { kind: 'student-heavy', teacherPct, studentPct }
  }
  if (studentPct == null) return { kind: 'student-unmeasured', teacherPct }
  if (studentPct === 0) return { kind: 'student-zero', teacherPct }
  if (studentPct < BALANCED_STUDENT_FLOOR_PCT) return { kind: 'student-thin', teacherPct, studentPct }
  return { kind: 'balanced', teacherPct, studentPct }
}
