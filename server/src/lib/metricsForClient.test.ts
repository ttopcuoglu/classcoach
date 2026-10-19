import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitMetricLogs } from './metricsForClient.ts'

test('lists leave metricsDetail for metricsLogs; numbers and nulls stay', () => {
  const out = splitMetricLogs({
    id: 'a',
    metricsDetail: { answersHeardCount: 7, ratio: null, answerLog: [{ timestampSec: 1, followed: true }], followUpLog: [] },
  }) as Record<string, any>
  assert.deepEqual(out.metricsDetail, { answersHeardCount: 7, ratio: null })
  assert.deepEqual(Object.keys(out.metricsLogs), ['answerLog', 'followUpLog'])
})

test('a list of sessions is split row by row; other bodies pass through', () => {
  const out = splitMetricLogs([{ metricsDetail: { a: 1, b: [1] } }, { metricsDetail: null }]) as Record<string, any>[]
  assert.deepEqual(out[0].metricsDetail, { a: 1 })
  assert.equal(out[1].metricsDetail, null)
  assert.deepEqual(splitMetricLogs({ error: 'x' }), { error: 'x' })
})
