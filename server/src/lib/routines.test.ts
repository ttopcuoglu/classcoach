import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { parseRoutines, scoredDirections } from './routines.ts'

const SEGMENTS: Segment[] = [
  { speakerLabel: 'Teacher', startSec: 10, endSec: 14, text: 'Grab a Chromebook from the cart please.' },
  { speakerLabel: 'Teacher', startSec: 30, endSec: 34, text: 'If you are stuck, raise your hand and I will come over.' },
]
const DIRECTIONS = [{ quote: 'Grab a Chromebook from the cart please.', timestampSec: 10 }]

test('directions get their routine type; help invitations are checked against the teacher’s speech', () => {
  const r = parseRoutines(
    '<routines>\nD1 | materials\nD2 | start\n</routines>\n<help>\nIf you are stuck, raise your hand and I will come over. @ 0:30\nAsk me anything at all, any time. @ 0:40\n</help>',
    SEGMENTS,
    DIRECTIONS,
  )
  assert.deepEqual(r.directionTypes, [{ timestampSec: 10, type: 'materials' }])
  assert.deepEqual(r.helpInvites, [{ quote: 'If you are stuck, raise your hand and I will come over.', timestampSec: 30 }])
})

test('only directions that start or change work are held to the four parts', () => {
  // The creative writing warm-up: a materials instruction, a time warning and
  // one direction that started the work.
  const directions = [
    { timestampSec: 373, parts: ['time'] },
    { timestampSec: 690, parts: ['task'] },
    { timestampSec: 704, parts: ['task', 'steps', 'product'] },
    { timestampSec: 734, parts: ['task'] },
  ]
  const types = [
    { timestampSec: 373, type: 'finish' },
    { timestampSec: 690, type: 'materials' },
    { timestampSec: 704, type: 'start' },
    { timestampSec: 734, type: 'materials' },
  ]
  assert.deepEqual(scoredDirections(directions, types).map((d) => d.timestampSec), [704])
  assert.equal(scoredDirections(directions, undefined).length, 4, 'a lesson read before routines keeps them all')
})
