import { expect, test } from 'vitest'
import {
  MIN_N_FOR_PERCENT,
  MIN_WAIT_TIME_SAMPLES,
  SHORT_SESSION_THRESHOLD_SEC,
  TINY_RECORDING_THRESHOLD_SEC,
  buildEvidenceQualityLine,
  buildLowConfidenceLine,
  lowConfidenceLabels,
  categoryCoverage,
  formatRatio,
  getCountMetric,
  getCoverage,
  getPresenceMetric,
  hasEnoughWaitTimeSamples,
  isConfidentState,
  isMissingState,
  judgeTalkBalance,
  type MetricState,
} from './reportConfidence'

// The Lesson Debrief report is about to be restructured: six insight bins
// collapse to three, and the per-dimension low-confidence panels collapse to
// one line. The explicit instruction is to keep the epistemic honesty while
// spending less room on it — which means this module's judgments have to come
// out of the refactor unchanged, while everything that renders them moves.
//
// That is the dangerous shape of change: the rules live here, the callers all
// move, and a rule quietly loosened on the way reads as a nicer report rather
// than as a bug. A teacher would be told "0 checks for understanding" where
// the honest answer is "too little audio to judge" — a false accusation about
// their own teaching, from a 90-second clip.
//
// None of these thresholds are arbitrary and none should move as part of a
// layout change, so they are pinned by value, not just by behavior.

test('the confidence thresholds are these numbers', () => {
  expect(SHORT_SESSION_THRESHOLD_SEC).toBe(600)
  expect(TINY_RECORDING_THRESHOLD_SEC).toBe(120)
  expect(MIN_N_FOR_PERCENT).toBe(10)
  expect(MIN_WAIT_TIME_SAMPLES).toBe(3)
})

// A confident state is what lets a number be shown as a number. The split
// between these two sets is what the collapsed "too little audio to judge"
// line will be built from, so nothing may drift between the sets.
test('exactly three states count as real evidence', () => {
  const confident: MetricState[] = ['measured', 'confirmed_none', 'possible_detection']
  const missing: MetricState[] = ['limited_evidence', 'not_measurable', 'not_analyzed', 'analysis_failed']
  expect(confident.map(isConfidentState)).toEqual([true, true, true])
  expect(missing.map(isConfidentState)).toEqual([false, false, false, false])
})

test('every state is either confident or missing, never both and never neither', () => {
  const states = [
    'measured',
    'confirmed_none',
    'possible_detection',
    'limited_evidence',
    'not_measurable',
    'not_analyzed',
    'analysis_failed',
  ] as const
  for (const state of states) {
    expect(isConfidentState(state) !== isMissingState(state), `${state} is miscategorized`).toBe(true)
  }
})

// A percentage implies a stable rate. Below the floor the honest display is
// the raw fraction, and the state drops to possible_detection so a caller
// can't frame it as a pattern.
test('a thin denominator is shown as a fraction, not a percentage', () => {
  const thin = formatRatio(1, 4)
  expect(thin.display).toBe('1 of 4')
  expect(thin.state).toBe('possible_detection')

  const solid = formatRatio(5, 20)
  expect(solid.display).toBe('25%')
  expect(solid.state).toBe('measured')
})

test('the percentage floor is applied at the boundary, not near it', () => {
  expect(formatRatio(1, MIN_N_FOR_PERCENT - 1).display).toBe(`1 of ${MIN_N_FOR_PERCENT - 1}`)
  expect(formatRatio(1, MIN_N_FOR_PERCENT).display).toBe('10%')
})

// Nothing to classify is not zero percent.
test('an empty denominator is unmeasurable rather than 0%', () => {
  const none = formatRatio(0, 0)
  expect(none.state).toBe('not_measurable')
  expect(none.display).toBe('—')
  expect(none.reason).toBeTruthy()
})

// This is the single most consequential rule in the file. A short clip that
// happens to contain no check-for-understanding phrase does not mean the
// teacher never checks — so "0" has to become "—" below the detection floor.
test('a count below its detection floor is withheld, never shown as a confident zero', () => {
  const tooShort = getCountMetric({
    count: 0,
    recordedSec: 60,
    minDurationSec: 180,
    minDurationReason: 'Too short to conclude.',
  })
  expect(tooShort.display).toBe('—')
  expect(isMissingState(tooShort.state)).toBe(true)
})

// Above the floor, a real zero is a real finding and must still be sayable —
// withholding it everywhere would be its own kind of dishonesty.
test('a zero above the detection floor is a confirmed finding, not a gap', () => {
  const realZero = getCountMetric({ count: 0, recordedSec: 1800, minDurationSec: 180 })
  expect(realZero.state).toBe('confirmed_none')
  expect(isConfidentState(realZero.state)).toBe(true)
})

test('a count that was never analyzed is distinct from a count of zero', () => {
  const missing = getCountMetric({ count: null, recordedSec: 1800 })
  expect(isMissingState(missing.state)).toBe(true)
  expect(missing.display).toBe('—')
})

// Wait time only counts a question followed by an audible response, so a
// session with many questions can still have one or two usable intervals.
// A missing count fails the floor deliberately: those sessions were analyzed
// under the older, looser wait rule.
test('wait time needs enough usable intervals, and a missing count does not pass', () => {
  expect(hasEnoughWaitTimeSamples({ waitTimeSampleCount: MIN_WAIT_TIME_SAMPLES })).toBe(true)
  expect(hasEnoughWaitTimeSamples({ waitTimeSampleCount: MIN_WAIT_TIME_SAMPLES - 1 })).toBe(false)
  expect(hasEnoughWaitTimeSamples({})).toBe(false)
  expect(hasEnoughWaitTimeSamples(null)).toBe(false)
})

test('a short recording is flagged short, and a very short one flagged tiny as well', () => {
  const short = getCoverage(SHORT_SESSION_THRESHOLD_SEC - 1, null)
  expect(short.isShort).toBe(true)
  expect(short.isTinyRecording).toBe(false)

  const tiny = getCoverage(TINY_RECORDING_THRESHOLD_SEC - 1, null)
  expect(tiny.isShort).toBe(true)
  expect(tiny.isTinyRecording).toBe(true)

  const full = getCoverage(SHORT_SESSION_THRESHOLD_SEC, null)
  expect(full.isShort).toBe(false)
})

// A zero-length recording is not a short recording — there is nothing to
// caveat, and flagging it would put a "treat as indicative" banner on a
// report that has no numbers at all.
test('a recording of nothing is not treated as a short recording', () => {
  const empty = getCoverage(0, null)
  expect(empty.isShort).toBe(false)
  expect(empty.isTinyRecording).toBe(false)
  expect(getCoverage(null, null).isShort).toBe(false)
})

test('a phase too brief to have really happened is reported as uncaptured', () => {
  const coverage = getCoverage(1800, [
    { label: 'Opening', startSec: 0, endSec: 10 },
    { label: 'Instruction', startSec: 10, endSec: 900 },
  ])
  expect(coverage.uncapturedPhases).toEqual(['Opening'])
})

// The collapsed low-confidence line will be built from this count, so the
// denominator has to stay the total rather than the measured subset.
test('coverage counts measured metrics against the full total', () => {
  expect(
    categoryCoverage([{ state: 'measured' }, { state: 'confirmed_none' }, { state: 'not_analyzed' }]),
  ).toBe('2 of 3 metrics available')
})

test('a report with nothing measured says so rather than dividing by zero', () => {
  expect(categoryCoverage([])).toBe('0 of 0 metrics available')
})

// The evidence-quality line is the closest thing the report already has to
// the single consolidated honesty line the restructure calls for, so its
// warn/good tone has to keep firing on both triggers.
test('the evidence line warns on a short recording even when every metric landed', () => {
  const line = buildEvidenceQualityLine(getCoverage(300, null), [{ state: 'measured', display: '1' }])
  expect(line.tone).toBe('warn')
  expect(line.text).toContain('treat metrics as indicative')
})

test('the evidence line warns on a long recording when most metrics are missing', () => {
  const line = buildEvidenceQualityLine(getCoverage(1800, null), [
    { state: 'measured', display: '1' },
    { state: 'not_analyzed', display: '—' },
    { state: 'not_analyzed', display: '—' },
  ])
  expect(line.tone).toBe('warn')
})

test('a long recording with solid metrics reads as good', () => {
  const line = buildEvidenceQualityLine(getCoverage(1800, null), [
    { state: 'measured', display: '1' },
    { state: 'measured', display: '2' },
    { state: 'confirmed_none', display: '0' },
  ])
  expect(line.tone).toBe('good')
  expect(line.text).toContain('3 of 3 metrics measured confidently')
})

// The structural fix for a real shipped bug: "fairly balanced" was once
// emitted for a lesson where students spoke 0% of the time, because the
// caption branched on the teacher's percentage alone.
test('a split with almost no student voice is never called balanced', () => {
  expect(judgeTalkBalance(50, 0)).not.toBe('balanced')
  expect(judgeTalkBalance(55, 5)).not.toBe('balanced')
})

test('a presence percentage of zero is still a real measurement', () => {
  const none = getPresenceMetric(0)
  expect(isConfidentState(none.state)).toBe(true)
})

test('a presence percentage that was never computed is withheld', () => {
  expect(isMissingState(getPresenceMetric(null).state)).toBe(true)
  expect(isMissingState(getPresenceMetric(undefined).state)).toBe(true)
})

// --- the collapsed low-confidence line ---

// The restructure's instruction was to keep the epistemic honesty and stop
// spending a panel on each absence. So the rule is: name everything that
// could not be judged, in one sentence, and say nothing at all when there is
// nothing to report.
test('everything unmeasurable is named in one line', () => {
  expect(
    buildLowConfidenceLine([
      { label: 'questions', state: 'not_analyzed' },
      { label: 'checks', state: 'limited_evidence' },
      { label: 'named students', state: 'not_measurable' },
    ]),
  ).toBe('Too little audio to judge: questions, checks, named students.')
})

test('a measured dimension is not named as missing', () => {
  expect(
    buildLowConfidenceLine([
      { label: 'talk balance', state: 'measured' },
      { label: 'checks', state: 'not_analyzed' },
    ]),
  ).toBe('Too little audio to judge: checks.')
})

// A confirmed zero is a real finding, not an absence — it must never appear
// in this line, or the report would claim it could not judge something it
// measured perfectly well.
test('a confirmed zero is a finding and never listed as unjudgeable', () => {
  expect(
    buildLowConfidenceLine([
      { label: 'checks', state: 'confirmed_none' },
      { label: 'questions', state: 'possible_detection' },
    ]),
  ).toBeNull()
})

test('nothing missing renders nothing, rather than an empty reassurance', () => {
  expect(buildLowConfidenceLine([])).toBeNull()
  expect(buildLowConfidenceLine([{ label: 'questions', state: 'measured' }])).toBeNull()
})

test('the labels are also available unjoined, for a caller that renders them itself', () => {
  expect(
    lowConfidenceLabels([
      { label: 'questions', state: 'not_analyzed' },
      { label: 'talk balance', state: 'measured' },
      { label: 'checks', state: 'analysis_failed' },
    ]),
  ).toEqual(['questions', 'checks'])
})
