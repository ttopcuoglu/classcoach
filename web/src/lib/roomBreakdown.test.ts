import { strict as assert } from 'node:assert'
import test from 'node:test'
import { roomBreakdown } from './roomBreakdown.ts'

test('each second is one of the five, and the shares add to 100', () => {
  const room = roomBreakdown({ roomTrace: 'ttsgxxuoq-' })!
  assert.deepEqual(room.seconds, ['teacher', 'teacher', 'student', 'student', 'video', 'video', 'other', 'other', 'quiet', null])
  assert.equal(Math.round(room.pct.teacher * 9), 200)
  assert.equal(Math.round(room.pct.student * 9), 200)
  assert.equal(Math.round(room.pct.video * 9), 200)
  assert.equal(Math.round(room.pct.other * 9), 200)
  assert.equal(Math.round(room.pct.quiet * 9), 100)
  assert.equal(room.videoSec, 2)
  assert.equal(room.unclearSec, 1)
})

test('a lesson analysed before the breakdown existed has none', () => {
  assert.equal(roomBreakdown({ answerLog: [] }), null)
  assert.equal(roomBreakdown(null), null)
})
