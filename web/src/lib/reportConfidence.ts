// Presentation-layer confidence rules for the Audio Coaching report. These
// operate only on data already computed and stored by the backend — no
// detection logic changes here, only how confidently we present it. Kept
// as pure functions so both the in-app report and the print/export view
// can share the exact same judgment calls.

import type { AudioPhase } from './api'

// A session shorter than this gets a can't-miss "treat as indicative"
// banner — short samples are real data, but not a full observation.
export const SHORT_SESSION_THRESHOLD_SEC = 10 * 60

// A recording this short is barely a snapshot — Summary renders a
// materially simpler layout rather than the same five elements with more
// caveats bolted on (see SummaryTab's isTinyRecording branch).
export const TINY_RECORDING_THRESHOLD_SEC = 2 * 60

// Talk-balance and wait-time candidates read from raw presence metrics
// with no sample-size gate of their own (unlike CFU/higher-order/feedback,
// which are gated via minDurationSec/MIN_N_FOR_PERCENT) — below this floor,
// a single long utterance or pause can produce a fully-confident-looking
// Strength/Priority claim from a single data point.
export const MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC = SHORT_SESSION_THRESHOLD_SEC

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

export type MetricState =
  | 'measured'
  | 'confirmed_none'
  | 'possible_detection'
  | 'limited_evidence'
  | 'not_measurable'
  | 'not_analyzed'
  | 'analysis_failed'

export type ConfidentMetric = {
  state: MetricState
  display: string
  reason?: string
}

// States backed by real, usable evidence — count toward a category's
// "measured" tally and are never shown as a dash.
export function isConfidentState(state: MetricState): boolean {
  return state === 'measured' || state === 'confirmed_none' || state === 'possible_detection'
}

// States with nothing trustworthy to show — render as "—" with a reason.
// A plain "0" is reserved for confirmed_none and never appears here.
export function isMissingState(state: MetricState): boolean {
  return (
    state === 'limited_evidence' ||
    state === 'not_measurable' ||
    state === 'not_analyzed' ||
    state === 'analysis_failed'
  )
}

export type CoverageInfo = {
  recordedSec: number
  totalSec: number
  isShort: boolean
  isTinyRecording: boolean
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
    isTinyRecording: recordedSec > 0 && recordedSec < TINY_RECORDING_THRESHOLD_SEC,
    uncapturedPhases,
  }
}

// For any "N of M" style ratio — e.g. higher-order questions out of total
// questions. Falls back to a fraction when M is too small for a percentage
// to read as reliable.
export function formatRatio(numerator: number, denominator: number): ConfidentMetric {
  if (denominator <= 0) {
    return { state: 'not_measurable', display: '—', reason: 'No questions were detected to classify.' }
  }
  if (denominator < MIN_N_FOR_PERCENT) {
    return {
      state: 'possible_detection',
      display: `${numerator} of ${denominator}`,
      reason: `Only ${denominator} to go on — too few to characterize as a pattern.`,
    }
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
      state: 'limited_evidence',
      display: '—',
      reason:
        minDurationReason ??
        `Recording too short (under ${Math.round(minDurationSec / 60)} min) to reliably detect this.`,
    }
  }
  if (count == null) {
    return {
      state: 'not_analyzed',
      display: '—',
      reason: 'This session was analyzed before this metric was tracked.',
    }
  }
  if (count === 0) {
    return { state: 'confirmed_none', display: '0' }
  }
  return { state: 'measured', display: String(count) }
}

// For a plain numeric field that's either present or it isn't (talk %,
// wait time) — used only to fold these into a category's coverage tally
// alongside the count/ratio metrics above.
export function getPresenceMetric(value: number | null | undefined): ConfidentMetric {
  return value == null
    ? { state: 'not_measurable', display: '—', reason: 'Not enough data in this session to compute this.' }
    : { state: 'measured', display: String(value) }
}

// A coarser, teacher-facing 3-tier read on a metric's confidence, for
// surfaces (like Summary's "My Focus" card) that want a plain status pill
// rather than the full 7-state model above.
export type EvidenceTier = 'pattern' | 'moment' | 'insufficient'

export function evidenceTier(state: MetricState): EvidenceTier {
  if (state === 'measured' || state === 'confirmed_none') return 'pattern'
  if (state === 'possible_detection') return 'moment'
  return 'insufficient'
}

export const EVIDENCE_TIER_LABELS: Record<EvidenceTier, string> = {
  pattern: 'Pattern detected',
  moment: 'Moment captured',
  insufficient: 'Not enough evidence',
}

// "N of M measured" for a category's header — counts any confident state
// (a confident zero, or a small-sample detection, still counts as data).
export function categoryCoverage(entries: { state: MetricState }[]): string {
  const total = entries.length
  const measured = entries.filter((e) => isConfidentState(e.state)).length
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
  const measured = metrics.filter((m) => isConfidentState(m.state)).length
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
