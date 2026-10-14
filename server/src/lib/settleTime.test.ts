import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomBaseline, settleTime, teacherIntervals, type LevelTrace } from './settleTime.ts'

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
