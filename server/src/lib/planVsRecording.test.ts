import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_SECONDS_TO_COMPARE, comparePlanToRecording } from './planVsRecording.ts'

// The handoff the consolidation is really for: Look It Over read the plan,
// Lesson Debrief heard the lesson, and the useful sentence needs both.
//
// The risk it introduces is a report that reads as a gotcha. A plan is a
// prediction, and a lesson that diverges from it is frequently a teacher
// reading the room correctly — so the tests here are as much about what the
// comparison refuses to say as about the arithmetic.

const BASIS = { minutes: [10, 14], assumption: 'Four minutes of set-up, then paired discussion.' }

test('a lesson shorter than planned is reported, with both numbers', () => {
  const comparison = comparePlanToRecording({
    timingBasis: BASIS,
    durationSec: 4 * 60,
    planLabel: 'the discussion',
  })
  assert.ok(comparison)
  assert.equal(comparison.planned, '10–14 minutes')
  assert.equal(comparison.actual, 'about 4 minutes')
  assert.equal(
    comparison.line,
    'You planned 10–14 minutes for the discussion; the recording suggests about 4.',
  )
})

test('a lesson longer than planned is reported in its own words', () => {
  const comparison = comparePlanToRecording({
    timingBasis: BASIS,
    durationSec: 22 * 60,
    planLabel: 'the discussion',
  })
  assert.ok(comparison)
  assert.ok(comparison.line.includes('ran about 22'))
  assert.ok(!comparison.line.includes('suggests'), 'overrunning should not read as an estimate')
})

// The caveat is the difference between a comparison and an accusation.
test('every comparison says why the gap might be the right call', () => {
  for (const durationSec of [4 * 60, 22 * 60]) {
    const comparison = comparePlanToRecording({ timingBasis: BASIS, durationSec })
    assert.ok(comparison, `no comparison at ${durationSec}s`)
    assert.ok(comparison.caveat.length > 0, 'no caveat')
    assert.ok(
      comparison.caveat.includes('right call'),
      'the caveat does not allow that the teacher was right',
    )
  }
})

test('the caveat fits the direction of the gap', () => {
  const short = comparePlanToRecording({ timingBasis: BASIS, durationSec: 4 * 60 })!
  assert.ok(short.caveat.includes('does not need the full time'))
  const long = comparePlanToRecording({ timingBasis: BASIS, durationSec: 22 * 60 })!
  assert.ok(long.caveat.includes('landing'))
})

// --- when there is nothing honest to say ---

// Inside the predicted range the plan and the lesson agree, and saying so
// would be noise on a report that already has plenty to read.
test('a lesson that matched its plan produces no line at all', () => {
  for (const minutes of [10, 12, 14]) {
    assert.equal(
      comparePlanToRecording({ timingBasis: BASIS, durationSec: minutes * 60 }),
      null,
      `${minutes} minutes is inside the range`,
    )
  }
})

// A 90-second clip against a 40-minute plan produces a dramatic-looking gap
// that says only that the teacher stopped recording.
test('a recording too short to compare produces nothing', () => {
  assert.equal(comparePlanToRecording({ timingBasis: BASIS, durationSec: 60 }), null)
  assert.equal(comparePlanToRecording({ timingBasis: BASIS, durationSec: MIN_SECONDS_TO_COMPARE - 1 }), null)
  // Just above the floor, and outside the range, it is reported.
  assert.ok(comparePlanToRecording({ timingBasis: BASIS, durationSec: MIN_SECONDS_TO_COMPARE + 1 }))
})

// A teacher can review a plan with the timing lens off. That is not an error
// and does not deserve a panel explaining itself.
test('no timing estimate in the review produces nothing', () => {
  assert.equal(comparePlanToRecording({ timingBasis: null, durationSec: 40 * 60 }), null)
  assert.equal(comparePlanToRecording({ timingBasis: undefined, durationSec: 40 * 60 }), null)
  // A bare number is not a range and was never storable — see reviewEdits.
  assert.equal(comparePlanToRecording({ timingBasis: { minutes: 12 }, durationSec: 40 * 60 }), null)
  assert.equal(
    comparePlanToRecording({ timingBasis: { minutes: [10, 14] }, durationSec: 40 * 60 }),
    null,
    'a range with no assumption is not usable',
  )
})

test('a recording with no duration produces nothing', () => {
  assert.equal(comparePlanToRecording({ timingBasis: BASIS, durationSec: null }), null)
  assert.equal(comparePlanToRecording({ timingBasis: BASIS, durationSec: 0 }), null)
  assert.equal(comparePlanToRecording({ timingBasis: BASIS, durationSec: undefined }), null)
})

// The label comes from what the review named; without one the sentence still
// has to read properly.
test('a missing label falls back to the whole lesson', () => {
  const comparison = comparePlanToRecording({ timingBasis: BASIS, durationSec: 4 * 60 })!
  assert.ok(comparison.line.includes('for this lesson'))
  const blank = comparePlanToRecording({ timingBasis: BASIS, durationSec: 4 * 60, planLabel: '   ' })!
  assert.ok(blank.line.includes('for this lesson'))
})

// A collapsed range reads as approximate rather than exact, and the
// comparison has to keep that.
test('a collapsed range still reads as an estimate', () => {
  const comparison = comparePlanToRecording({
    timingBasis: { minutes: [12, 12], assumption: 'x' },
    durationSec: 4 * 60,
  })!
  assert.equal(comparison.planned, 'about 12 minutes')
})
