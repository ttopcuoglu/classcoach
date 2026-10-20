import assert from 'node:assert/strict'
import { test } from 'node:test'
import { averagePause, pausesAfter } from './thinkingPause.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text = 'words') => ({ speakerLabel, startSec, endSec, text })
const q = (timestampSec: number, quote: string) => ({ timestampSec, quote })

test('the pause runs until the teacher speaks again, with any answer inside it', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Student', 17.5, 20),
    seg('Teacher', 22, 25, 'Good.'),
    seg('Teacher', 30, 33, 'What would change if it were salt water?'),
    seg('Teacher', 35.5, 38),
  ]
  assert.deepEqual(pausesAfter(segments, [q(10, 'Why does the ice melt first?'), q(30, 'What would change if it were salt water?')]), [
    { sec: 8, answered: true },
    { sec: 2.5, answered: false },
  ])
})

test('a turn that keeps going is one turn; the pause starts when it ends', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 15, 18), seg('Student', 21, 23), seg('Teacher', 24, 26)]
  assert.deepEqual(pausesAfter(segments, [q(10, 'Why?')]), [{ sec: 6, answered: true }])
})

test('too long a gap is not a pause, and a question the teacher never comes back after is not measured', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 60, 62), seg('Teacher', 70, 72, 'How?'), seg('Student', 75, 76)]
  assert.deepEqual(pausesAfter(segments, [q(10, 'Why?'), q(70, 'How?')]), [null, null])
})

test('a question you talked straight past had no pause', () => {
  const segments = [
    seg('Teacher', 10, 20, 'Would that work the same way for addition? So the same thing happens when we add them up.'),
    seg('Student', 22, 24),
  ]
  assert.deepEqual(pausesAfter(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 0, answered: false, keptTalking: true }])
})

test('a tag after the question is not talking past it', () => {
  const segments = [seg('Teacher', 10, 14, 'Would that work the same way for addition? K?'), seg('Teacher', 16.5, 18)]
  assert.deepEqual(pausesAfter(segments, [q(10, 'Would that work the same way for addition?')]), [{ sec: 2.5, answered: false }])
})

test('the average leaves out what could not be measured', () => {
  assert.equal(averagePause([{ sec: 2, answered: false }, null, { sec: 3.5, answered: true }]), 2.8)
  assert.equal(averagePause([null]), null)
})
