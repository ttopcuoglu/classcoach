import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArc } from './lessonArc.ts'

test('stages in order, the first from the start, each ending where the next begins', () => {
  const arc = parseArc(
    '<arc>\nopened | Code-of-conduct reading review | 0:12\nbuilt | Internal vs. external stakeholders | 4:10\napplied | "Coca-Cola\'s code and a decision scenario" | 9:30\n</arc>',
    960,
  )
  assert.deepEqual(arc, [
    { role: 'opened', title: 'Code-of-conduct reading review', startSec: 0, endSec: 250 },
    { role: 'built', title: 'Internal vs. external stakeholders', startSec: 250, endSec: 570 },
    { role: 'applied', title: "Coca-Cola's code and a decision scenario", startSec: 570, endSec: 960 },
  ])
})

test('out-of-order, past-the-end, unknown roles and a single stage give nothing usable', () => {
  assert.deepEqual(parseArc('<arc>\nopened | A b c | 0:00\nbuilt | D e f | 0:00\n</arc>', 600), [], 'two stages at one moment is one stage')
  assert.deepEqual(parseArc('<arc>\nopened | A b c | 0:00\nbuilt | D e f | 20:00\n</arc>', 600), [])
  assert.deepEqual(parseArc('<arc>\nwandered | A b c | 0:00\nbuilt | D e f | 2:00\n</arc>', 600), [])
})
