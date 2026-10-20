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
  assert.deepEqual(pausesAfter(segments, [{ timestampSec: 10, quote: 'Why does the ice melt first?' }, { timestampSec: 30, quote: 'What would change if it were salt water?' }]), [{ sec: 3.5, next: 'student' }, { sec: 2.5, next: 'you' }])
})

test('a turn that keeps going is one turn; the pause starts when it ends', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Teacher', 15, 18), seg('Student', 21, 23)]
  assert.deepEqual(pausesAfter(segments, [{ timestampSec: 10, quote: 'Why?' }]), [{ sec: 3, next: 'student' }])
})

test('too long a gap is not a pause, and a question with nothing after it is not measured', () => {
  const segments = [seg('Teacher', 10, 14, 'Why?'), seg('Student', 60, 62), seg('Teacher', 70, 72, 'How?')]
  assert.deepEqual(pausesAfter(segments, [{ timestampSec: 10, quote: 'Why?' }, { timestampSec: 70, quote: 'How?' }]), [null, null])
})

test('the average leaves out what could not be measured', () => {
  assert.equal(averagePause([{ sec: 2, next: 'you' }, null, { sec: 3.5, next: 'student' }]), 2.8)
  assert.equal(averagePause([null]), null)
})

test('a question you talked straight past had no pause', () => {
  const segments = [
    seg('Teacher', 10, 20, 'Would that work the same way for addition? So the same thing happens when we add them up.'),
    seg('Student', 22, 24),
  ]
  assert.deepEqual(pausesAfter(segments, [{ timestampSec: 10, quote: 'Would that work the same way for addition?' }]), [{ sec: 0, next: 'kept_talking' }])
})

test('a tag after the question is not talking past it', () => {
  const segments = [seg('Teacher', 10, 14, 'Would that work the same way for addition? K?'), seg('Student', 16, 18)]
  assert.deepEqual(pausesAfter(segments, [{ timestampSec: 10, quote: 'Would that work the same way for addition?' }]), [{ sec: 2, next: 'student' }])
})
