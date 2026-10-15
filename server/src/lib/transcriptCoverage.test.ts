import assert from 'node:assert/strict'
import { test } from 'node:test'
import { knownCapturedShare, splitByCoverage } from './transcriptCoverage.ts'

const lesson = (teacherTalkSec: number, studentTalkSec: number, totalDurationSec = 1000) => ({
  durationSec: totalDurationSec,
  metricsDetail: { teacherTalkSec, studentTalkSec, totalDurationSec },
})

test('a lesson under half captured is left out and counted as left out', () => {
  const { counted, lowAudio } = splitByCoverage([lesson(500, 200), lesson(100, 50), lesson(450, 50)])
  assert.equal(counted.length, 2)
  assert.equal(lowAudio, 1)
})

test('exactly half captured still counts', () => {
  assert.equal(splitByCoverage([lesson(400, 100)]).lowAudio, 0)
})

// capturedShare reads missing talk seconds as zero, which would drop every
// lesson analyzed before the field existed — for its age, not its audio.
test('a lesson with no recorded talk seconds is counted, not dropped', () => {
  const old = { durationSec: 1800, metricsDetail: { redirectionCount: 2 } as unknown }
  assert.equal(knownCapturedShare({}, old.durationSec), null)
  assert.deepEqual(splitByCoverage([old]), { counted: [old], lowAudio: 0 })
})

test('a lesson with nothing to divide by is counted', () => {
  const empty = { durationSec: null, metricsDetail: { teacherTalkSec: 0, studentTalkSec: 0 } }
  assert.equal(splitByCoverage([empty]).lowAudio, 0)
})
