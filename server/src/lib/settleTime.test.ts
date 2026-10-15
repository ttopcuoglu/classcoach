import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifySeconds, MAX_TRACE_SECONDS, parseLevelTrace, roomBaseline, settleTime, splitNonSpeech, teacherIntervals, type LevelTrace } from './settleTime.ts'

// No real recording carries a level trace yet, so these traces are built by
// hand. That is a limit worth stating plainly: the thresholds below are
// reasoned, not tuned, and the first real lesson may move them. What these
// cases DO pin down is the behaviour the measure must have whatever the
// numbers are — above all, that it refuses to answer when the teacher talked
// through the window, because that is the failure that would quietly score a
// teacher who kept explaining as a room that never settled.

/// A trace of `sec` seconds at `quiet`, with `loud` applied over [from, to).
function trace(sec: number, quiet: number, loud?: { from: number; to: number; level: number }): LevelTrace {
  const out = new Array(sec).fill(quiet)
  if (loud) for (let i = loud.from; i < loud.to && i < sec; i++) out[i] = loud.level
  return out
}

test('a room that drops after the ask is a settle, timed from where the quiet began', () => {
  // Loud until 10s, quiet after. The ask is at 5s.
  const t = trace(200, 0.1, { from: 0, to: 10, level: 0.6 })
  const r = settleTime(t, [], 5)
  assert.equal(r.state, 'settled')
  assert.equal(r.settleSec, 5)
})

test('a room that never drops is not a settle', () => {
  const t = trace(200, 0.6)
  // Baseline is computed from the trace itself, so a uniformly loud room has
  // a high baseline and would look settled. Give it quiet stretches so the
  // baseline is genuinely low and the window after the ask is genuinely up.
  for (let i = 100; i < 200; i++) t[i] = 0.1
  const r = settleTime(t, [], 5)
  assert.equal(r.state, 'did_not_settle')
  assert.equal(r.settleSec, null)
})

test('one quiet second between two bursts is not a settle', () => {
  const t = trace(200, 0.1)
  for (let i = 0; i < 90; i++) t[i] = 0.6
  t[20] = 0.1 // a single lucky second
  const r = settleTime(t, [], 5)
  assert.equal(r.state, 'did_not_settle')
})

// --- the confound this exists to handle ------------------------------------

test('a teacher who talks through the whole window gets no verdict', () => {
  // The level is high for the whole minute, but it is the TEACHER who is
  // loud. Scoring this as "the room never settled" would fault a teacher for
  // continuing to explain.
  const t = trace(200, 0.1, { from: 0, to: 120, level: 0.7 })
  const speaking = [{ startSec: 0, endSec: 120 }]
  const r = settleTime(t, speaking, 5)
  assert.equal(r.state, 'not_measurable')
  assert.match(r.reason ?? '', /not speaking/)
})

test('teacher talk is skipped, not counted as noise, and does not break a quiet run', () => {
  const t = trace(200, 0.1)
  for (let i = 0; i < 6; i++) t[i] = 0.6 // room still up for the first seconds
  // The teacher speaks loudly at 8-12s, in the middle of what is otherwise
  // a settled room.
  for (let i = 8; i < 12; i++) t[i] = 0.8
  const r = settleTime(t, [{ startSec: 8, endSec: 12 }], 5)
  assert.equal(r.state, 'settled')
})

test('a few teacher-free seconds are too few to judge', () => {
  const t = trace(200, 0.1, { from: 0, to: 120, level: 0.7 })
  // Teacher talks for all but three seconds of the window.
  const r = settleTime(t, [{ startSec: 0, endSec: 20 }, { startSec: 23, endSec: 120 }], 5)
  assert.equal(r.state, 'not_measurable')
})

// --- the room sets its own floor -------------------------------------------

test('the baseline is the room’s own quiet, not a fixed number', () => {
  const quietRoom = trace(200, 0.05)
  const loudRoom = trace(200, 0.35)
  assert.ok((roomBaseline(quietRoom) ?? 1) < (roomBaseline(loudRoom) ?? 0))
})

test('a loud room that drops to its own floor still counts as settled', () => {
  // A hard-floored room with thirty students: its quiet is another room's
  // loud. A fixed threshold would call it unsettled all lesson.
  const t = trace(200, 0.35, { from: 0, to: 10, level: 0.8 })
  const r = settleTime(t, [], 5)
  assert.equal(r.state, 'settled')
})

test('too short a trace is no trace', () => {
  assert.equal(roomBaseline([0.1, 0.2, 0.3]), null)
  const r = settleTime([0.1, 0.2, 0.3], [], 1)
  assert.equal(r.state, 'not_measurable')
  assert.match(r.reason ?? '', /level trace/)
})

test('a bid near the end of the recording reads only what exists', () => {
  const t = trace(100, 0.1, { from: 0, to: 95, level: 0.6 })
  const r = settleTime(t, [], 97)
  assert.equal(r.state, 'not_measurable')
})

// --- the transcript half ----------------------------------------------------

test('teacher intervals come from the teacher only', () => {
  const segs = [
    { speakerLabel: 'Teacher', startSec: 0, endSec: 4 },
    { speakerLabel: 'Student', startSec: 4, endSec: 8 },
    { speakerLabel: 'Teacher', startSec: 8, endSec: 10 },
  ]
  assert.deepEqual(teacherIntervals(segs), [
    { startSec: 0, endSec: 4 },
    { startSec: 8, endSec: 10 },
  ])
})

// --- what arrives from a client ---------------------------------------------

test('a trace arrives as a JSON string from multipart form data', () => {
  assert.deepEqual(parseLevelTrace('[0.1,0.25,0.3]'), [0.1, 0.25, 0.3])
})

test('values are rounded, because the measurement is coarser than the digits', () => {
  assert.deepEqual(parseLevelTrace([0.123456, 0.987654]), [0.12, 0.99])
})

test('anything that is not a usable envelope becomes no envelope', () => {
  assert.equal(parseLevelTrace(undefined), null)
  assert.equal(parseLevelTrace('not json'), null)
  assert.equal(parseLevelTrace([]), null)
  assert.equal(parseLevelTrace({ 0: 0.5 }), null)
})

test('a sample outside 0..1 means the sender is not measuring what we think', () => {
  // Rejected wholesale rather than clamped: one impossible value means the
  // scale is wrong, and a clamped trace would be read as if it were sound.
  assert.equal(parseLevelTrace([0.2, 4, 0.3]), null)
  assert.equal(parseLevelTrace([0.2, -1]), null)
})

test('a non-finite sample is a gap, and a gap invalidates the trace', () => {
  // NaN must never become 0: zero reads as silence, and settle time would
  // credit a settle it never measured.
  assert.equal(parseLevelTrace([0.2, NaN, 0.3]), null)
  assert.equal(parseLevelTrace('[0.2,null,0.3]'), null)
})

test('a trace longer than the cap is truncated, not refused', () => {
  const long = new Array(MAX_TRACE_SECONDS + 500).fill(0.3)
  assert.equal(parseLevelTrace(long)?.length, MAX_TRACE_SECONDS)
})

// --- silence vs sound we could not make out ---------------------------------

test('quiet non-speech time and unresolved sound are told apart', () => {
  // 0-40s the teacher speaks at 0.6. 40-70s is genuinely quiet. 70-100s has
  // real sound in it that produced no transcript — the case the combined
  // "Silence or other" slice could never show.
  const t: number[] = []
  for (let i = 0; i < 40; i++) t.push(0.6)
  for (let i = 40; i < 70; i++) t.push(0.05)
  for (let i = 70; i < 100; i++) t.push(0.45)
  const split = splitNonSpeech(t, [{ startSec: 0, endSec: 40 }], 100)
  assert.equal(split?.quietSec, 30)
  assert.equal(split?.unresolvedSec, 30)
})

test('the threshold follows the teacher, not a fixed number', () => {
  // The same shape at half the volume throughout — a quieter phone, or a
  // teacher further from it. The split must come out the same.
  const loud: number[] = []
  const quiet: number[] = []
  for (let i = 0; i < 40; i++) { loud.push(0.8); quiet.push(0.4) }
  for (let i = 40; i < 70; i++) { loud.push(0.08); quiet.push(0.04) }
  for (let i = 70; i < 100; i++) { loud.push(0.6); quiet.push(0.3) }
  const a = splitNonSpeech(loud, [{ startSec: 0, endSec: 40 }], 100)
  const b = splitNonSpeech(quiet, [{ startSec: 0, endSec: 40 }], 100)
  assert.deepEqual(a, b)
})

test('without enough located teacher speech there is nothing to calibrate against', () => {
  const t = new Array(100).fill(0.3)
  assert.equal(splitNonSpeech(t, [{ startSec: 0, endSec: 10 }], 100), null)
})

test('a teacher the microphone never really heard yields no split', () => {
  const t = new Array(100).fill(0)
  assert.equal(splitNonSpeech(t, [{ startSec: 0, endSec: 40 }], 100), null)
})

test('no trace, no split', () => {
  assert.equal(splitNonSpeech([], [{ startSec: 0, endSec: 40 }], 100), null)
})

// The bug this pins: calibration uses the teacher's seconds, but a student's
// transcribed answer was then counted again as quiet or as sound with no
// words, so the talk bar could add up past 100%.
test('a transcribed student answer is words, not sound with no words', () => {
  const t = new Array(100).fill(0.5)
  for (let i = 0; i < 40; i++) t[i] = 0.8
  const teacher = [{ startSec: 0, endSec: 40 }]
  const student = { startSec: 40, endSec: 70 }
  const split = splitNonSpeech(t, teacher, 100, [...teacher, student])
  assert.deepEqual(split, { quietSec: 0, unresolvedSec: 30 })
})

test('classifySeconds marks every second, and seconds past the trace as unread', () => {
  const t = new Array(50).fill(0.8)
  for (let i = 40; i < 45; i++) t[i] = 0.05
  for (let i = 45; i < 50; i++) t[i] = 0.6
  const s = classifySeconds(t, [{ startSec: 0, endSec: 40 }], 52)
  assert.equal(s, 'w'.repeat(40) + 'q'.repeat(5) + 's'.repeat(5) + '--')
})
