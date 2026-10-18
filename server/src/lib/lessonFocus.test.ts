import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCheckIn, parseNextFocus, teacherKey } from './lessonFocus.ts'

test('teacher names match regardless of case, spacing and punctuation', () => {
  assert.equal(teacherKey('  Ms. Rivera '), teacherKey('ms rivera'))
  assert.notEqual(teacherKey('Ms. Rivera'), teacherKey('Mr. Rivera'))
  assert.equal(teacherKey(''), null)
  assert.equal(teacherKey(null), null)
})

test('a focus keeps its finding, words, value, line and rewrite', () => {
  const parsed = parseNextFocus({
    findingKey: 'directions',
    findingLabel: 'Directions',
    text: 'Name time and product in every set of directions.',
    value: '1 of 5 complete',
    line: { quote: 'Okay, keep working on it.', timestampSec: 750, segmentId: 'seg1' },
    rewrite: 'Finish your middle paragraph in 8 minutes, then highlight one sensory detail.',
  })
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.equal(parsed.findingKey, 'directions')
  assert.equal(parsed.line?.segmentId, 'seg1')
})

test('a malformed focus or check-in is refused', () => {
  assert.ok('error' in parseNextFocus({ findingKey: 'Not A Key', findingLabel: 'x', text: 'y' }))
  assert.ok('error' in parseNextFocus({ findingKey: 'directions', findingLabel: 'Directions' }))
  assert.ok('error' in parseCheckIn({ fromSessionId: 's1', findingKey: 'directions', text: 'x', outcome: 'failed' }))
  const ok = parseCheckIn({ fromSessionId: 's1', findingKey: 'directions', text: 'x', outcome: 'not_yet', line: { quote: 'q', timestampSec: -1 } })
  assert.ok(!('error' in ok) && ok.line === null, 'a line with a bad time is dropped, not the check-in')
})
