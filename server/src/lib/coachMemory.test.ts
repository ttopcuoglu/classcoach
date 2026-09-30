import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyMemoryUpdate, MEMORY_WRITE_INTERVAL, shouldWriteMemory } from './coachMemory.ts'

// Every turn that writes memory costs a ~200-token output block at five times
// the input rate, and on the non-streaming routes the teacher waits for it
// before seeing any reply. Every turn that DOESN'T write risks losing what was
// said if the conversation ends there. These tests pin the two cases where
// getting it wrong is expensive: a one-shot conversation must still be
// remembered, and a coach-opened turn with nothing said yet must not burn a
// write.

test('a one-shot conversation still writes its memory', () => {
  assert.equal(shouldWriteMemory(1), true)
})

test('a start turn the teacher has not spoken in writes nothing', () => {
  assert.equal(shouldWriteMemory(0), false)
})

test('the turns between intervals stay quiet', () => {
  assert.deepEqual(
    [2, 3, 4].map(shouldWriteMemory),
    [false, false, false],
  )
})

test('every interval turn writes', () => {
  assert.equal(shouldWriteMemory(MEMORY_WRITE_INTERVAL), true)
  assert.equal(shouldWriteMemory(MEMORY_WRITE_INTERVAL * 2), true)
  assert.equal(shouldWriteMemory(MEMORY_WRITE_INTERVAL * 4), true)
})

test('a long conversation writes a small fraction of its turns', () => {
  const writes = Array.from({ length: 20 }, (_, i) => shouldWriteMemory(i + 1)).filter(Boolean)
  // Turns 1, 5, 10, 15, 20 — five writes where every turn used to write.
  assert.equal(writes.length, 5)
})

// A turn that doesn't write leaves the stored memory exactly as it was, so a
// missing tag can never be read as "the teacher has nothing worth remembering."
test('a turn with no memory tag leaves what was already stored alone', () => {
  assert.equal(applyMemoryUpdate(null, 'Recurring: wait time in 3rd period.'), 'Recurring: wait time in 3rd period.')
})
