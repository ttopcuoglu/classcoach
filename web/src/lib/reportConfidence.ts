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

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
