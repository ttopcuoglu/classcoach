import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskStudentNames, studentNameStandIns } from './studentNames.ts'
import { addressedNamesIn, studentsCalledOn } from './audioAnalysis.ts'

test('a name the teacher addresses is masked everywhere in the lesson, possessive too', () => {
  const { texts, namesMasked } = maskStudentNames([
    'Sarah, what do you think the author meant?',
    'Good point. That builds on Sarah’s idea from yesterday.',
    'Thank you, Marcus.',
  ])
  assert.equal(namesMasked, 2)
  assert.deepEqual(texts, [
    'Student-A, what do you think the author meant?',
    'Good point. That builds on Student-A’s idea from yesterday.',
    'Thank you, Student-B.',
  ])
})

test('lesson content that is talked about, not to, is kept', () => {
  const { texts } = maskStudentNames([
    'Lincoln signed the proclamation in 1863. Why did Lincoln wait?',
    'Atticus tells Scout to walk in another person’s shoes.',
    'Jordan, can you read the next line?',
  ])
  assert.equal(texts[0], 'Lincoln signed the proclamation in 1863. Why did Lincoln wait?')
  assert.equal(texts[1], 'Atticus tells Scout to walk in another person’s shoes.')
  assert.equal(texts[2], 'Student-A, can you read the next line?')
})

test('case-sensitive: the student Will is masked, the verb is not', () => {
  const { texts } = maskStudentNames(['Will, can you share?', 'We will check it together, Will.'])
  assert.deepEqual(texts, ['Student-A, can you share?', 'We will check it together, Student-A.'])
})

test('word count is unchanged, so speaker-confidence runs stay aligned', () => {
  const before = ['Thank you, Mary-Kate. José, what do you think?']
  const { texts } = maskStudentNames(before)
  assert.equal(texts[0].split(/\s+/).length, before[0].split(/\s+/).length)
})

test('running it twice changes nothing', () => {
  const once = maskStudentNames(['Aya, which one did you pick?', 'Zane, what was the difference?']).texts
  const twice = maskStudentNames(once).texts
  assert.deepEqual(twice, once)
  assert.equal(studentNameStandIns(once).size, 0)
})

test('a lesson already masked keeps its letters when a new name turns up', () => {
  const { texts } = maskStudentNames(['Student-A, can you read?', 'Thanks, Priya.'])
  assert.deepEqual(texts, ['Student-A, can you read?', 'Thanks, Student-B.'])
})

test('Students Called On counts the same students after masking', () => {
  const lines = [
    'Aya, which one did you pick and why?',
    'Zane, what was the difference between the two?',
    'Aya, can you add to that?',
  ]
  const segments = (texts: string[]) =>
    texts.map((text, i) => ({ speakerLabel: 'Teacher', startSec: i * 10, endSec: i * 10 + 5, text }))
  const masked = maskStudentNames(lines).texts
  assert.equal(addressedNamesIn(segments(masked)).length, addressedNamesIn(segments(lines)).length)
  assert.equal(studentsCalledOn(segments(masked)).count, studentsCalledOn(segments(lines)).count)
})

test('a title is not a name, and a dash does not hide one', () => {
  const { texts } = maskStudentNames([
    'Sorry, Ms. Carter.',
    'Let\'s go back — Danny, you had your hand up earlier.',
    'Nice work, Danny, and thanks for waiting.',
  ])
  assert.deepEqual(texts, [
    'Sorry, Ms. Carter.',
    'Let\'s go back — Student-A, you had your hand up earlier.',
    'Nice work, Student-A, and thanks for waiting.',
  ])
})
