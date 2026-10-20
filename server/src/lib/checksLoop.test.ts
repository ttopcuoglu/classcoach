import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CfuLogEntry, Segment } from './audioAnalysis.ts'
import { checksPrompt, parseChecks, prepareChecks } from './checksLoop.ts'

const SEGMENTS: Segment[] = [
  { speakerLabel: 'Teacher', startSec: 60, endSec: 64, text: 'Boards up, show me your answer.' },
  { speakerLabel: 'Student', startSec: 66, endSec: 67, text: 'B.' },
  { speakerLabel: 'Teacher', startSec: 70, endSec: 76, text: 'Okay. I am seeing a lot of B, let us look at this again.' },
  { speakerLabel: 'Teacher', startSec: 120, endSec: 122, text: 'Does that make sense?' },
  { speakerLabel: 'Teacher', startSec: 124, endSec: 127, text: 'Okay, open to page ten.' },
  { speakerLabel: 'Teacher', startSec: 200, endSec: 203, text: 'Right? So the next one.' },
]
const c = (timestampSec: number, text: string): CfuLogEntry => ({ timestampSec, text, whatItChecked: 'x' })
const LOG = [c(60, 'Boards up, show me your answer.'), c(120, 'Does that make sense?'), c(200, 'Right?')]

test('who each check asked, and the line where the teacher acted on it', () => {
  const p = prepareChecks(LOG, SEGMENTS)
  const loops = parseChecks(
    '<checks>\nC1 | everyone\nL1 | adjusted | I am seeing a lot of B\nC2 | asked_if_understood\nC3 | not_a_check\n</checks>',
    p,
  )
  assert.equal(loops.get(1)!.who, 'everyone')
  assert.equal(loops.get(1)!.acted?.how, 'adjusted')
  assert.equal(loops.get(1)!.acted?.text, 'I am seeing a lot of B')
  assert.ok(loops.get(1)!.acted!.atSec > 70)
  assert.deepEqual(loops.get(2), { who: 'asked_if_understood', acted: null })
  assert.deepEqual(loops.get(3), { who: 'not_a_check', acted: null })
})

test('an acted line the check does not have, or an unknown kind, is not taken', () => {
  const p = prepareChecks(LOG, SEGMENTS)
  const loops = parseChecks('<checks>\nC1 | everyone\nL9 | adjusted | anything\nC2 | sometimes\n</checks>', p)
  assert.equal(loops.get(1)!.acted, null)
  assert.equal(loops.has(2), false)
})

test('the prompt hides what others said', () => {
  const prompt = checksPrompt(prepareChecks(LOG, SEGMENTS).slice(0, 1))
  assert.match(prompt, /\(someone else speaks\)/)
  assert.doesNotMatch(prompt, /\bB\.\s*$/m)
  assert.match(prompt, /L1 \[1:10\] Okay\. I am seeing/)
})
