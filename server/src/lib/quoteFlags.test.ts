import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseQuoteFlag } from './quoteFlags.ts'

const GOOD = { findingKey: 'higher_order_questions', segmentId: 'cmv123', quote: '  Why would a name matter?  ', timestampSec: 40 }

test('a flag keeps the line and the words as shown', () => {
  assert.deepEqual(parseQuoteFlag(GOOD), {
    findingKey: 'higher_order_questions',
    segmentId: 'cmv123',
    quote: 'Why would a name matter?',
    timestampSec: 40,
    reason: null,
  })
})

test('a malformed flag is refused, not stored', () => {
  assert.ok('error' in parseQuoteFlag({ ...GOOD, findingKey: 'DROP TABLE' }))
  assert.ok('error' in parseQuoteFlag({ ...GOOD, segmentId: '' }))
  assert.ok('error' in parseQuoteFlag({ ...GOOD, quote: '   ' }))
  assert.ok('error' in parseQuoteFlag({ ...GOOD, quote: 'x'.repeat(1001) }))
  assert.ok('error' in parseQuoteFlag({ ...GOOD, timestampSec: -1 }))
  assert.ok('error' in parseQuoteFlag(null))
})

test('an empty reason is no reason', () => {
  const parsed = parseQuoteFlag({ ...GOOD, reason: '  ' })
  assert.ok(!('error' in parsed) && parsed.reason === null)
})
