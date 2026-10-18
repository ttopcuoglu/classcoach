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

// Feedback is a teacher responding to a student, so it can only be read from
// a recording that caught students. Below this many captured student turns,
// the split says so rather than drawing a verdict — one lesson reported "2 of
// 2 specific" from a recording with nine student utterances in it.
export const MIN_STUDENT_SEGMENTS_FOR_FEEDBACK = 5

// Wait time is the gap between a question and an audible student answer. On a
// room mic that gap is usually missing because the answer was never captured,
// not because the teacher never paused — "not enough data" reads like a glitch
// and blames the wrong thing.
export function waitTimeMetric(avgWaitTimeSec: number | null | undefined, questionCount: number | null | undefined): ConfidentMetric {
  if (avgWaitTimeSec == null && (questionCount ?? 0) > 0) {
    return {
      state: 'not_measurable',
      display: '—',
      reason: 'None of your questions was followed by an audible student answer, so there was no pause to time.',
    }
  }
  return getPresenceMetric(avgWaitTimeSec)
}

export function feedbackMeasurable(studentVoiceSegments: number | null | undefined): boolean {
  return (studentVoiceSegments ?? 0) >= MIN_STUDENT_SEGMENTS_FOR_FEEDBACK
}

// Wait time only counts a question followed by an audible student response
// (see audioAnalysis.ts), so a session with many questions can still have
// just one or two usable intervals. Below this many, the average is still
// shown, but never framed as a Strength, Priority, or judgment. Sessions
// analyzed before waitTimeSampleCount existed used the older, looser wait
// rule, so a missing count deliberately fails the floor too.
export const MIN_WAIT_TIME_SAMPLES = 3

/// Conversational English runs around 150 words a minute. Stated as an anchor
/// a teacher can place themselves against, never as a target: there is no
/// correct rate, and a fast stretch of storytelling is not a fault. The report
/// gives the number and the anchor and stops there.
export const CONVERSATIONAL_WPM = 150

export function speechRateMetric(wpm: number | null | undefined): ConfidentMetric {
  if (wpm == null) {
    return {
      state: 'not_measurable',
      display: '—',
      reason:
        'Too little of your own speech was captured to divide into a rate — under a minute of it, where one mis-transcribed stretch would move the number a long way.',
    }
  }
  return { state: 'measured', display: String(wpm) }
}

/// The pause after a student finishes, before the teacher speaks. The pair of
/// `waitTimeMetric` above, which times the pause after the question.
///
/// Measurable far more often than wait time 1, which needs a *detected
/// question* followed by an audible answer; this only needs a student turn
/// followed by a teacher turn. On real lessons it has samples where wait
/// time 1 has none.
export function waitTime2Metric(
  waitTime2Sec: number | null | undefined,
  sampleCount: number | null | undefined,
): ConfidentMetric {
  if (waitTime2Sec == null) {
    return {
      state: 'not_measurable',
      display: '—',
      reason: 'No audible student answer was followed by you speaking, so there was no pause to time.',
    }
  }
  if ((sampleCount ?? 0) < MIN_WAIT_TIME_SAMPLES) {
    return {
      state: 'limited_evidence',
      display: `${waitTime2Sec}s`,
      reason: `Averaged over only ${sampleCount ?? 0} exchange${(sampleCount ?? 0) === 1 ? '' : 's'}, which is too few to read as a habit.`,
    }
  }
  return { state: 'measured', display: `${waitTime2Sec}s` }
}

/// Long enough to be worth saying. Below this the recording started with the
/// lesson and there is nothing to explain.
const MATERIAL_LEADING_SILENCE_SEC = 30

/// What the silence share does NOT mean.
///
/// `getCoverage` treats the whole recording as recorded time, so a lesson whose
/// first transcribed word is at 4:29 reports four and a half minutes of
/// classroom silence that was really the recorder running before the lesson
/// began — on one real lesson that was 20% of the recording, inside a 52%
/// silence figure.
export function leadingSilenceNote(firstWordSec: number | null | undefined): string | null {
  if (firstWordSec == null || firstWordSec < MATERIAL_LEADING_SILENCE_SEC) return null
  const mins = Math.floor(firstWordSec / 60)
  const secs = Math.round(firstWordSec % 60)
  const stamp = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`
  return `Nothing was transcribed until ${stamp}, so that much of the silence above is the recorder running before the lesson got going rather than quiet in the room.`
}

/// Below this, checking for understanding is an instance rather than a habit,
/// so it is not offered as "a strength to keep".
///
/// Every other strength on that card has a bar — 40% higher-order questions,
/// 3s wait time, 50% specific feedback. This one had none, so a single
/// detected check was headlined as a strength while Checks & Feedback, two
/// cards below, said "1 verbal check for understanding was detected". The
/// report contradicted itself on the same screen.
///
/// One or two checks now produce neither praise nor criticism, which is the
/// honest reading: the growth-side candidate still only fires at zero.
export const MIN_CFU_FOR_STRENGTH = 3

export function hasEnoughWaitTimeSamples(metricsDetail: Record<string, number | null> | null | undefined): boolean {
  const count = metricsDetail?.waitTimeSampleCount
  return count != null && count >= MIN_WAIT_TIME_SAMPLES
}

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
  /// The share of the recording that became transcribed speech, 0-100.
  ///
  /// This was the hole in every gate here. They were all about DURATION: a
  /// 23-minute lesson cleared the short-session threshold and was presented
  /// as a full observation, while only 15% of it had become words — the
  /// first 8:23 produced no transcript at all and a 7:40 stretch in the
  /// middle produced none either. The teacher remembered redirecting the
  /// class around ten times in a window the transcript is empty for, and the
  /// report called the room calm. Length tells you how long the microphone
  /// was on; this tells you whether it heard anything.
  capturedSharePct: number | null
}

/// Below this, the report is reading a minority of the lesson and has to say
/// so. Shared with the server's own gate in lib/transcriptCoverage.ts.
export const LOW_CAPTURE_PCT = 50

export function getCoverage(
  durationSec: number | null,
  phases: AudioPhase[] | null,
  /// Teacher + student speaking seconds, from metricsDetail. Optional so the
  /// older two-argument calls still type-check; absent means unknown, which
  /// is not the same as zero.
  captured?: { teacherTalkSec?: number | null; studentTalkSec?: number | null } | null,
): CoverageInfo {
  const recordedSec = durationSec ?? 0
  // We only ever have the audio we actually recorded — there's no separate
  // "intended class length" tracked today, so total and recorded are the
  // same number. Kept as a distinct field so a future "planned duration"
  // or paused-time tracker can slot in without changing every call site.
  const totalSec = recordedSec
  const uncapturedPhases = (phases ?? [])
    .filter((p) => p.endSec - p.startSec < MIN_PHASE_DURATION_SEC)
    .map((p) => p.label)

  const capturedSec = (captured?.teacherTalkSec ?? 0) + (captured?.studentTalkSec ?? 0)

  return {
    recordedSec,
    totalSec,
    isShort: recordedSec > 0 && recordedSec < SHORT_SESSION_THRESHOLD_SEC,
    isTinyRecording: recordedSec > 0 && recordedSec < TINY_RECORDING_THRESHOLD_SEC,
    uncapturedPhases,
    capturedSharePct: captured && recordedSec > 0 ? Math.round((capturedSec / recordedSec) * 100) : null,
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
  // Still a fraction at any size. "40%" of fifteen questions reads as a
  // stable rate and a score; "6 of 15" is what happened. Percentages are kept
  // for shares of time, where they mean what they say.
  return { state: 'measured', display: `${numerator} of ${denominator}` }
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

// Follow-ups are only detectable after a *transcribed* student answer. With
// no student voice captured at all, a 0 would claim the teacher never
// followed up when the audio simply couldn't show it.
export function getFollowUpMetric(options: {
  count: number | null | undefined
  studentVoiceSegments: number | null | undefined
  recordedSec: number
}): ConfidentMetric {
  if (options.studentVoiceSegments === 0) {
    return {
      state: 'not_measurable',
      display: '—',
      reason: "No student answers were picked up in this recording, so follow-ups to them couldn't be detected.",
    }
  }
  return getCountMetric({ count: options.count, recordedSec: options.recordedSec })
}

// Student voices far from the mic, quiet, or overlapping often don't get
// transcribed, so every student-talk figure is a floor, not an exact count.
export const STUDENT_TALK_CAVEAT =
  "Quiet or distant student voices often aren't picked up, so treat student talk here as a minimum."

/// Why "24 of 24 turns were about the lesson" is not the good news it reads
/// as, and must never be shown without this next to it.
///
/// The turns that survive transcription are the ones spoken loudly and
/// towards the teacher — answers to questions, which are on-topic by
/// construction. Quiet side conversations never become text, so they cannot
/// be counted as off-task. The sample is selected for the very thing the
/// number claims to measure.
///
/// The real lessons make it plain: the WORST-captured one (15%) returned 24
/// of 24 on-topic with zero unclear, while lessons captured at 44% and 48%
/// returned 23 and 17 unclear turns and 1 and 8 off-topic ones. The cleanest
/// result came from the recording that heard least — and it was the lesson
/// whose teacher remembered redirecting the class ten times for talking.
export const STUDENT_FOCUS_SELECTION_CAVEAT =
  'Turns spoken loudly and towards you are the ones that reach a room microphone; quiet side conversations are the least likely to be picked up. This describes the turns that carried, not the whole room.'

// For a plain numeric field that's either present or it isn't (talk %,
// wait time) — used only to fold these into a category's coverage tally
// alongside the count/ratio metrics above.
export function getPresenceMetric(value: number | null | undefined): ConfidentMetric {
  return value == null
    ? { state: 'not_measurable', display: '—', reason: 'Not enough data in this session to compute this.' }
    : { state: 'measured', display: String(value) }
}

/// Below this many instances, a count is instances, not a pattern.
export const MIN_FOR_PATTERN = 3

/// The plain status pill for a metric, as on Summary's "My Focus" card.
///
/// Says what the evidence is rather than grading it. It used to map every
/// measured state to "Clear pattern", so one check for understanding — or a
/// wait time from a single sample — was called a clear pattern. A count now
/// says how many it was until there are enough to be one; a measurement that
/// is not a count (a share of time, a pace) is just "Measured".
export function evidenceLabel(metric: ConfidentMetric): string {
  if (isMissingState(metric.state)) return 'Not enough evidence yet'
  if (metric.state === 'confirmed_none') return 'None heard'
  // "4" or "4 of 7": the leading number is how many there were.
  const count = metric.display.match(/^(\d+)(?: of \d+)?$/)
  if (count) {
    const n = Number(count[1])
    if (n < MIN_FOR_PATTERN || metric.state !== 'measured') return `${n} instance${n === 1 ? '' : 's'}`
    return 'Clear pattern'
  }
  return 'Measured'
}

// "N of M metrics available" for a category's header — counts any
// confident state (a confident zero, or a small-sample detection, still
// counts as data). "Available" rather than "measured" — a metric here
// can itself be built from a thin sample (e.g. average wait time from
// just a few usable question-response intervals out of many questions),
// so this header shouldn't read as a stronger confidence claim than any
// one metric's own caveat already makes.
export function categoryCoverage(entries: { state: MetricState }[]): string {
  const total = entries.length
  const measured = entries.filter((e) => isConfidentState(e.state)).length
  return `${measured} of ${total} metrics available`
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// One consolidated read on how much to trust this session's numbers,
// replacing the old scattered "recorded X of Y" line + separate
// short-session banner with a single line and a good/warn tone.
//
// It no longer tallies "N of M metrics measured confidently". The tally
// counted any metric that was not empty as confident — a "1 of 4" with a
// reason attached said "too few to characterise" counted — so it was a
// promise the line could not keep. What it can honestly say is how much was
// recorded and how much of that came through.
export function buildEvidenceQualityLine(coverage: CoverageInfo): { text: string; tone: 'good' | 'warn' } {
  // A recording the microphone largely lost is the strongest warning here,
  // and until now it was the one thing this line could not say.
  const lowCapture = coverage.capturedSharePct != null && coverage.capturedSharePct < LOW_CAPTURE_PCT
  const warn = coverage.isShort || lowCapture
  const parts: string[] = [`Recorded ${formatDuration(coverage.recordedSec)}`]
  if (coverage.isShort) {
    parts.push(`under ${Math.round(SHORT_SESSION_THRESHOLD_SEC / 60)} min — treat metrics as indicative, not conclusive`)
  }
  if (lowCapture) {
    // Named before the metric tally, because it explains the tally: metrics
    // go unmeasured on these lessons because the speech was never captured,
    // not because the lesson lacked the thing being measured.
    parts.push(
      `only ${coverage.capturedSharePct}% came through as audible speech, so every number here describes that part`,
    )
  }
  if (coverage.uncapturedPhases.length > 0) {
    // "Not clearly captured" read as if it contradicted the metrics — it's
    // actually a narrower claim about
    // phase *timing* (Opening/Instruction/Work Time/Closing boundaries),
    // not about the metrics or the lesson's content.
    const phaseWord = coverage.uncapturedPhases.length === 1 ? 'phase' : 'phases'
    parts.push(`${phaseWord} timing unclear: ${coverage.uncapturedPhases.join(', ')}`)
  }
  return { text: parts.join(' · '), tone: warn ? 'warn' : 'good' }
}

// Below this share of student talk, a caption must never call the split
// "balanced" even if the teacher's own percentage looks mid-range — this is
// the structural fix for the bug where "fairly balanced... students at 0%"
// could be emitted (the old logic branched only on teacherTalkPct).
export const BALANCED_STUDENT_FLOOR_PCT = 15

// "Balanced" also requires teacher and student talk to actually be close,
// not just both clear their individual floors — without this, 42.6%
// teacher / 15.9% student (a ~2.7:1 ratio) fell through to "balanced"
// purely because 15.9 cleared the floor above. A gap this wide gets its
// own middle bucket ("teacher-leaning") instead of being called balanced.
export const TEACHER_LEANING_GAP_PCT = 20

export type TalkBalanceJudgment =
  | { kind: 'teacher-heavy'; teacherPct: number; studentPct: number | null }
  | { kind: 'teacher-leaning'; teacherPct: number; studentPct: number }
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
  if (teacherPct - studentPct >= TEACHER_LEANING_GAP_PCT) {
    return { kind: 'teacher-leaning', teacherPct, studentPct }
  }
  return { kind: 'balanced', teacherPct, studentPct }
}
