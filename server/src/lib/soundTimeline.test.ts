import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSoundTimeline, soundRuns } from './soundTimeline.ts'

test('a stretch survives a stray transcribed word inside it', () => {
  const s = 's'.repeat(100) + 'w'.repeat(3) + 's'.repeat(100) + 'q'.repeat(50)
  assert.deepEqual(soundRuns(s), [{ startSec: 0, endSec: 203 }])
})

test('stretches under a minute are not listed', () => {
  assert.deepEqual(soundRuns('s'.repeat(59) + 'q'.repeat(30)), [])
})

test('the three longest are kept, then put back in lesson order', () => {
  const block = (n: number) => 's'.repeat(n) + 'q'.repeat(10)
  const s = block(61) + block(200) + block(90) + block(150)
  assert.deepEqual(
    soundRuns(s).map((r) => r.endSec - r.startSec),
    [200, 90, 150],
  )
})

test('totals count words, sound and quiet separately', () => {
  const trace = new Array(120).fill(0.8)
  for (let i = 60; i < 90; i++) trace[i] = 0.02
  const segments = [
    { speakerLabel: 'Teacher', startSec: 0, endSec: 40 },
    { speakerLabel: 'Student', startSec: 40, endSec: 60 },
  ]
  const t = buildSoundTimeline(trace, segments, 120)
  assert.equal(t?.wordsSec, 60)
  assert.equal(t?.quietSec, 30)
  assert.equal(t?.soundSec, 30)
})

test('no envelope, no timeline', () => {
  assert.equal(buildSoundTimeline(null, [], 600), null)
})
