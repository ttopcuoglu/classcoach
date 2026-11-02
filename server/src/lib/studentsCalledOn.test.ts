import assert from 'node:assert/strict'
import { test } from 'node:test'
import { studentsCalledOn } from './audioAnalysis.ts'

const seg = (speakerLabel: string, startSec: number, text: string) => ({ speakerLabel, startSec, endSec: startSec + 3, text })

test('different students called on by name, and each line that calls on one', () => {
  const out = studentsCalledOn([
    seg('Teacher', 10, 'Aya, which one did you pick?'),
    seg('Teacher', 20, 'Zane, what was the difference?'),
    seg('Teacher', 30, 'Aya, can you say it again?'),
    seg('Teacher', 40, 'Open your books to page four.'),
  ])
  assert.equal(out.count, 2)
  assert.deepEqual(out.moments, [{ timestampSec: 10 }, { timestampSec: 20 }, { timestampSec: 30 }])
})

test('it needs no student voice told apart', () => {
  const out = studentsCalledOn([seg('Teacher', 5, 'Sarah, which one did you select? Oh. Okay.')])
  assert.equal(out.count, 1)
})
