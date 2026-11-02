import assert from 'node:assert/strict'
import { test } from 'node:test'
import { thinkTimeOf } from './thinkTime.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text = 'words') => ({ speakerLabel, startSec, endSec, text })
const q = (timestampSec: number, text: string, type = 'recall') => ({ timestampSec, text, type })
const secsOf = (segments: ReturnType<typeof seg>[], questions: ReturnType<typeof q>[]) =>
  thinkTimeOf(segments, questions, null).questions.map((x) => x.sec)

test('the quiet runs to the next word anyone says, a student or the teacher', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Why does the ice melt first?'),
    seg('Student', 16.5, 18, 'Because of the salt.'),
    seg('Teacher', 30, 33, 'What is seven times eight?'),
    seg('Teacher', 35, 37, 'Write that one down please.'),
  ]
  assert.deepEqual(secsOf(segments, [q(10, 'Why does the ice melt first?'), q(30, 'What is seven times eight?')]), [2.5, 2])
})

test('it does not need students told apart: an answer in the teacher’s line ends it all the same', () => {
  const segments = [seg('Teacher', 10, 14, 'What is the direction?'), seg('Teacher', 15.5, 16, 'Positive.'), seg('Teacher', 16.2, 19, 'Good, so it goes up.')]
  const out = thinkTimeOf(segments, [q(10, 'What is the direction?')], null)
  assert.deepEqual(out.questions.map((x) => x.sec), [1.5])
  assert.equal(out.average, 1.5)
  assert.equal(out.reason, null)
})

test('more words on the same line follow at once, timed by their place in it', () => {
  // 8 words over 4 s: the question is the first 4, the next word starts at 12 s.
  const segments = [seg('Teacher', 10, 14, 'What is the direction? So it goes up.')]
  assert.deepEqual(secsOf(segments, [q(10, 'What is the direction?')]), [0])
})

test('a long quiet is independent work, and a last question with nothing after is not timed', () => {
  const segments = [seg('Teacher', 10, 14, 'But why?'), seg('Teacher', 60, 62, 'Now take out your packets.'), seg('Teacher', 70, 72, 'How so?')]
  const out = thinkTimeOf(segments, [q(10, 'But why?'), q(70, 'How so?')], null)
  assert.deepEqual(out.questions.map((x) => x.sec), [null, null])
  assert.equal(out.average, null)
  assert.equal(out.reason, 'none_timed')
})

test('no questions, no figure', () => {
  const out = thinkTimeOf([seg('Teacher', 0, 5, 'Open your books.')], [], null)
  assert.equal(out.average, null)
  assert.equal(out.reason, 'no_questions')
})

test('the average is of the timed questions, to a tenth', () => {
  const segments = [
    seg('Teacher', 10, 12, 'Who knows?'),
    seg('Teacher', 13, 15, 'Okay let me show you.'),
    seg('Teacher', 20, 22, 'Any ideas?'),
    seg('Student', 24, 25, 'Maybe.'),
    seg('Teacher', 30, 32, 'What else?'),
    seg('Teacher', 32.4, 34, 'Right, the last one.'),
  ]
  const out = thinkTimeOf(segments, [q(10, 'Who knows?'), q(20, 'Any ideas?'), q(30, 'What else?')], null)
  assert.deepEqual(out.questions.map((x) => x.sec), [1, 2, 0.4])
  assert.equal(out.average, 1.1)
})

test('a one-word question is not counted, so it is not timed either', () => {
  const segments = [seg('Teacher', 10, 12, 'Right?'), seg('Teacher', 15, 17, 'Who knows?'), seg('Student', 19, 20, 'Me.')]
  const out = thinkTimeOf(segments, [q(10, 'Right?'), q(15, 'Who knows?')], null)
  assert.deepEqual(out.questions, [{ timestampSec: 15, sec: 2 }])
})
