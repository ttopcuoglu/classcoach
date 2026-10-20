import assert from 'node:assert/strict'
import { test } from 'node:test'
import { averagePause, pausesAfter } from './thinkingPause.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text = 'words') => ({ speakerLabel, startSec, endSec, text })

test('the pause runs to the next voice, a student or the teacher', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Student', 17.5, 20),
    seg('Teacher', 30, 33, 'What would change if it were salt water?'),
    seg('Teacher', 35.5, 38),
  ]
  assert.deepEqual(pausesAfter(segments, [10, 30]), [3.5, 2.5])
})

test('a turn that keeps going is one turn; the pause starts when it ends', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 15, 18), seg('Student', 21, 23)]
  assert.deepEqual(pausesAfter(segments, [10]), [3])
})

test('too long a gap is not a pause, and a question with nothing after it is not measured', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Student', 60, 62), seg('Teacher', 70, 72, 'How?')]
  assert.deepEqual(pausesAfter(segments, [10, 70]), [null, null])
})

test('the average leaves out what could not be measured', () => {
  assert.equal(averagePause([2, null, 3.5]), 2.8)
  assert.equal(averagePause([null]), null)
})
