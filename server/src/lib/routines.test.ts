import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { directionActivities, parseRoutines, scoredDirections } from './routines.ts'

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

test('directions are judged per activity: stages first, else time', () => {
  // The transportation lesson: one drawing activity's steps, then a factory
  // step with a time cue; no stage read.
  const directions = [
    { timestampSec: 580, parts: ['steps'] },
    { timestampSec: 596, parts: ['task', 'steps'] },
    { timestampSec: 703, parts: ['task'] },
    { timestampSec: 1095, parts: ['time'] },
    { timestampSec: 1112, parts: ['task'] },
  ]
  const types = [
    { timestampSec: 580, type: 'start' },
    { timestampSec: 596, type: 'start' },
    { timestampSec: 703, type: 'start' },
    { timestampSec: 1095, type: 'transition' },
    { timestampSec: 1112, type: 'start' },
  ]
  const byTime = directionActivities(directions, types, undefined)
  assert.equal(byTime.length, 2)
  assert.deepEqual(byTime[0].parts.sort(), ['steps', 'task'])
  assert.deepEqual(byTime[1].parts.sort(), ['task', 'time'], 'the time cue covers the factory activity')

  const arc = [
    { title: 'Drawing a farming community map', startSec: 580, endSec: 1095 },
    { title: 'Adding factory and industrial growth', startSec: 1095, endSec: 1340 },
  ]
  const byStage = directionActivities(directions, types, arc)
  assert.deepEqual(byStage.map((a) => a.title), ['Drawing a farming community map', 'Adding factory and industrial growth'])
})
