import { test } from 'node:test'
import assert from 'node:assert/strict'
import { longestTeacherStretch } from './teacherStretch.ts'
import type { Segment } from './audioAnalysis.ts'

const seg = (speakerLabel: 'Teacher' | 'Student', startSec: number, endSec: number, text = 'words were said here'): Segment =>
  ({ speakerLabel, startSec, endSec, text }) as Segment

test('a long pause ends the stretch, so a video in the middle is not teacher talk', () => {
  const stretch = longestTeacherStretch([
    seg('Teacher', 0, 20),
    seg('Teacher', 22, 60),
    // eighteen minutes of nothing transcribed
    seg('Teacher', 1140, 1150),
  ])
  assert.equal(stretch?.startSec, 0)
  assert.equal(stretch?.durationSec, 60)
})

test('short pauses are part of the stretch, and its length is the time it took', () => {
  const stretch = longestTeacherStretch([seg('Teacher', 10, 30), seg('Teacher', 36, 70), seg('Teacher', 75, 100)])
  assert.deepEqual([stretch?.startSec, stretch?.endSec, stretch?.durationSec], [10, 100, 90])
})

test('an audible student turn ends it; a blank segment does not', () => {
  const stretch = longestTeacherStretch([
    seg('Teacher', 0, 30),
    seg('Student', 31, 32, ''),
    seg('Teacher', 33, 50),
    seg('Student', 51, 53, 'Is it the Inca?'),
    seg('Teacher', 54, 60),
  ])
  assert.deepEqual([stretch?.startSec, stretch?.durationSec], [0, 50])
})

test('the quote is how the stretch opened, not how it ended', () => {
  const stretch = longestTeacherStretch([
    seg('Teacher', 0, 5, 'Alright. So'),
    seg('Teacher', 6, 40, 'today we are looking at why wages rose after the plague.'),
    seg('Teacher', 41, 90, 'And that is the end of serfdom.'),
  ])
  assert.match(stretch?.opening ?? '', /^Alright\. So today we are looking/)
})

test('a lesson with no teacher speech has no stretch', () => {
  assert.equal(longestTeacherStretch([seg('Student', 0, 5)]), null)
})
