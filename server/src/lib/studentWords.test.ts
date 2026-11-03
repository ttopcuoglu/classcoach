import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropTeacherQuotes, parseStudentWords, withoutQuestions, withStudentSpans } from './studentWords.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text: string) => ({ speakerLabel, startSec, endSec, text })

const lesson = [
  seg('Teacher', 60, 70, "What's the direction? It goes up and right. Good, up and right."),
  seg('Teacher', 75, 80, 'Maya, why does the line go up?'),
  seg('Teacher', 81, 84, 'Because the slope is positive.'),
  seg('Student', 90, 92, 'I got twelve for that one.'),
]

test('words the transcript holds become a span, timed by their place in the line', () => {
  const spans = parseStudentWords('It goes up and right. @ 1:00\nBecause the slope is positive @ 1:21', lesson)
  assert.equal(spans.length, 2)
  assert.deepEqual(
    spans.map((s) => s.text),
    ['It goes up and right.', 'Because the slope is positive.'],
  )
  // Words 3-7 of 12 in a 10 s line.
  assert.ok(Math.abs(spans[0].startSec - (60 + (3 / 12) * 10)) < 1e-9)
  assert.ok(Math.abs(spans[0].endSec - (60 + (8 / 12) * 10)) < 1e-9)
  // A whole line can be a student's.
  assert.equal(spans[1].startSec, 81)
  assert.equal(spans[1].endSec, 84)
})

test('words the transcript does not hold, short answers and far timestamps are dropped', () => {
  assert.deepEqual(parseStudentWords('It slopes upwards to the right @ 1:00', lesson), [])
  assert.deepEqual(parseStudentWords('up and @ 1:00', lesson), [])
  assert.deepEqual(parseStudentWords('It goes up and right @ 9:00', lesson), [])
  assert.deepEqual(parseStudentWords('NONE', lesson), [])
  // Lines already a student's are not teacher lines.
  assert.deepEqual(parseStudentWords('I got twelve for that one @ 1:30', lesson), [])
})

test('the same words listed twice are one span', () => {
  assert.equal(parseStudentWords('It goes up and right @ 1:00\nIt goes up and right @ 1:01', lesson).length, 1)
})

test('words another read quoted as the teacher’s stay the teacher’s', () => {
  const spans = parseStudentWords('Because the slope is positive @ 1:21\nIt goes up and right @ 1:00', lesson)
  const kept = dropTeacherQuotes(spans, [{ quote: 'Because the slope is positive.', timestampSec: 81 }])
  assert.deepEqual(
    kept.map((s) => s.text),
    ['It goes up and right.'],
  )
})

test('a span is cut out of its line for who-spoke-when; other lines are untouched', () => {
  const spans = parseStudentWords('It goes up and right @ 1:00', lesson)
  const split = withStudentSpans(lesson, spans)
  assert.deepEqual(
    split.slice(0, 3).map((s) => s.speakerLabel),
    ['Teacher', 'Student', 'Teacher'],
  )
  assert.equal(split[0].endSec, split[1].startSec)
  assert.equal(split[1].endSec, split[2].startSec)
  assert.equal(split[2].endSec, 70)
  assert.equal(split.length, lesson.length + 2)
  assert.deepEqual(split.slice(3), lesson.slice(1))
})

test('a short question inside an answer is the teacher’s: the answer is split around it', () => {
  const line = [seg('Teacher', 1650, 1660, 'Positive. Positive. Why? Because it comes up. It goes up. Not down.')]
  const spans = parseStudentWords('Positive. Positive. Why? Because it comes up. It goes up. Not down. @ 27:30', line)
  // "Positive. Positive." is two words, so it stays the teacher's too.
  assert.deepEqual(
    spans.map((s) => s.text),
    ['Because it comes up. It goes up. Not down.'],
  )
})

test('every question is cut out of a student piece, fill-in-the-blank ones included', () => {
  const words = 'I think it is five. Is that the right one? Yes it is.'.split(' ')
  assert.deepEqual(withoutQuestions(words, 0, words.length), [[0, 5], [10, 13]])
  const line = [seg('Teacher', 82, 86, 'You see a what? You')]
  assert.deepEqual(parseStudentWords('You see a what? You @ 1:22', line), [])
})

test('a question stays the teacher’s even when the model leaves its last word off', () => {
  const line = [seg('Teacher', 380, 390, 'I think they start at the zero and then go to what? It is two.')]
  assert.deepEqual(parseStudentWords('start at the zero and then go to @ 6:21', line), [])
})
