import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeTranscript, type Segment } from './audioAnalysis.ts'

// The question counter is the number a teacher is most likely to read as a
// verdict, and every error in it so far has been found by a human reading a
// real report rather than by anything here. These are the cases that cost a
// teacher's trust: a rising inflection on an ingredient, a name said twice, an
// instruction scored as a higher-order question, and one question split by the
// transcriber into two.

let clock = 0
function say(speakerLabel: 'Teacher' | 'Student', text: string, sec = 4): Segment {
  const startSec = clock
  clock += sec
  return { speakerLabel, startSec, endSec: startSec - 0.2 + sec, text }
}
function transcript(build: () => Segment[]) {
  clock = 0
  return analyzeTranscript(build())
}

test('a rising inflection on a list is not a question per item', () => {
  const a = transcript(() => [
    say('Teacher', 'So we need a few things for this recipe.'),
    say('Teacher', 'Tomato paste?'),
    say('Teacher', 'Bell peppers?'),
    say('Teacher', 'Onions?'),
  ])
  assert.equal(a.questionCount, 0)
})

test("a student's name said with a rising inflection is not a question", () => {
  const a = transcript(() => [say('Teacher', 'Yeshua?'), say('Teacher', 'Yeshua?')])
  assert.equal(a.questionCount, 0)
})

test('okay and right are not questions', () => {
  const a = transcript(() => [say('Teacher', 'Okay?'), say('Teacher', 'Right?'), say('Teacher', 'Alright?')])
  assert.equal(a.questionCount, 0)
})

test('a short question that opens like one still counts', () => {
  const a = transcript(() => [say('Teacher', 'Any others?')])
  assert.equal(a.questionCount, 1)
})

test('an instruction is not a higher-order question', () => {
  const a = transcript(() => [
    say('Teacher', 'Compare with your neighbours.'),
    say('Teacher', 'Explain your reasoning to your partner.'),
  ])
  assert.equal(a.questionCount, 0)
  assert.equal(a.higherOrderPct, null)
})

test('but the same words as a real question do count', () => {
  const a = transcript(() => [say('Teacher', 'Why do you think the leaves are green?')])
  assert.equal(a.questionCount, 1)
  assert.equal(a.higherOrderPct, 100)
})

test('one question split across two utterances counts once, in full', () => {
  const a = transcript(() => [
    say('Teacher', 'So how'),
    say('Teacher', 'much of each ingredient does Mia need?'),
  ])
  assert.equal(a.questionCount, 1)
  assert.equal(a.questionLog[0].text, 'So how much of each ingredient does Mia need')
})

test('a fragment is not joined across a speaker change', () => {
  const a = transcript(() => [
    say('Teacher', 'So how'),
    say('Student', 'I think it is four.'),
    say('Teacher', 'much of each ingredient does Mia need?'),
  ])
  assert.equal(a.questionCount, 1)
})

test('two real questions in one turn are still two', () => {
  const a = transcript(() => [
    say('Teacher', 'What makes them equivalent? And how did you work that out?'),
  ])
  assert.equal(a.questionCount, 2)
})
