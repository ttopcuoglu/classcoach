import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { readChecks } from './classroomMoves.ts'
import { parseBids } from './escalation.ts'
import { flattenTeacherSpeech, isNoneAnswer, parseQuotedLines } from './lessonObjective.ts'

// NONE is the model's answer when a category is empty. Every parser here used
// to test for it with `.includes('NONE')`, so one real sentence containing the
// word "none" emptied the whole category — the sentence, and every other
// moment listed beside it.

const SEGMENTS: Segment[] = [
  { speakerLabel: 'Teacher', startSec: 10, endSec: 15, text: 'None of you should be on your phones right now.' },
  { speakerLabel: 'Teacher', startSec: 20, endSec: 25, text: 'Eyes up front, pencils down for a minute.' },
  { speakerLabel: 'Teacher', startSec: 30, endSec: 35, text: 'Does that make sense to everyone so far?' },
]
const { flat, offsets } = flattenTeacherSpeech(SEGMENTS)

test('only an answer that is NONE and nothing else counts as none', () => {
  assert.equal(isNoneAnswer('NONE'), true)
  assert.equal(isNoneAnswer('  none.  '), true)
  assert.equal(isNoneAnswer('None of you should be on your phones right now.'), false)
})

test('a quoted sentence containing "none" no longer empties the category', () => {
  const raw = 'None of you should be on your phones right now. @ 0:10\nEyes up front, pencils down for a minute. @ 0:20'
  assert.deepEqual(
    parseQuotedLines(raw, flat, offsets, 10).map((q) => q.timestampSec),
    [10, 20],
  )
  assert.deepEqual(parseQuotedLines('NONE', flat, offsets, 10), [])
})

test('the same holds for checks, which have their own parser', () => {
  const raw = 'Does that make sense to everyone so far? @ 0:30 | whether none of it was lost'
  assert.equal(readChecks(raw, flat, offsets).length, 1)
  assert.deepEqual(readChecks('NONE', flat, offsets), [])
})

test('and for attention bids', () => {
  const reply = '<bids>\nNone of you should be on your phones right now. @ 0:10 | behaviour | no\n</bids>'
  assert.equal(parseBids(reply, SEGMENTS).length, 1)
  assert.deepEqual(parseBids('<bids>\nNONE\n</bids>', SEGMENTS), [])
})
