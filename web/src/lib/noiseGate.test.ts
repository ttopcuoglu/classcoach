import { strict as assert } from 'node:assert'
import test from 'node:test'
import { createNoiseGate } from './noiseGate.ts'

// The barge-in settings: the old absolute threshold, plus a margin.
const gate = () => createNoiseGate(20, 14)

/// Feeds a run of levels and reports how many frames were judged to be a
/// voice. 60fps, so 21 frames is the 350ms barge-in sustain.
function run(levels: number[], g = gate()) {
  return levels.reduce((hits, l) => hits + (g.test(l) ? 1 : 0), 0)
}

test('a quiet room with a voice in it still triggers, exactly as before', () => {
  const g = gate()
  run(Array(60).fill(3), g) // settle on a quiet room
  assert.ok(run(Array(30).fill(40), g) > 21, 'speech in a quiet room must barge in')
})

test('steady background noise never triggers, however long it lasts', () => {
  for (const noise of [22, 30, 45, 60]) {
    const g = createNoiseGate(20, 14)
    // Ten seconds of it.
    assert.equal(run(Array(600).fill(noise), g), 0, `noise at ${noise} should never read as a voice`)
  }
})

test('a voice over a noisy room still triggers, because it is above the room', () => {
  const g = gate()
  run(Array(120).fill(30), g) // a loud classroom
  assert.ok(g.floor() > 25, 'the floor should have risen to meet the room')
  assert.ok(run(Array(30).fill(60), g) > 21, 'a raised voice over noise must still barge in')
})

test('a brief spike of leaked echo does not trigger', () => {
  const g = gate()
  run(Array(60).fill(8), g)
  // Three frames (~50ms) of Coach bleeding through.
  assert.ok(run([26, 28, 25], g) < 21)
})

test('the room getting quieter restores sensitivity quickly', () => {
  const g = gate()
  run(Array(300).fill(50), g) // noisy
  run(Array(60).fill(4), g) // a second of quiet
  assert.ok(g.floor() < 12, `floor should fall back fast, was ${g.floor()}`)
  assert.ok(run(Array(30).fill(30), g) > 21, 'after the noise stops, a normal voice is enough again')
})

test('nothing is ever judged on the first sample', () => {
  assert.equal(createNoiseGate(20, 14).test(100), false)
})

test('the absolute threshold still applies — a whisper above a silent room is not barge-in', () => {
  const g = gate()
  run(Array(60).fill(1), g)
  assert.equal(run(Array(30).fill(18), g), 0, 'below the absolute threshold, however far above the room')
})
