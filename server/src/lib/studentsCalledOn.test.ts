import assert from 'node:assert/strict'
import { test } from 'node:test'
import { studentsCalledOn } from './audioAnalysis.ts'

const seg = (speakerLabel: string, startSec: number, text: string) => ({ speakerLabel, startSec, endSec: startSec + 3, text })
const asked = (...secs: number[]) => secs.map((timestampSec) => ({ timestampSec, text: 'q', type: 'recall' }))

test('different students called on about the lesson, and each line that calls on one', () => {
  const out = studentsCalledOn(
    [
      seg('Teacher', 10, 'Aya, which one did you pick?'),
      seg('Teacher', 20, 'Zane, what was the difference?'),
      seg('Teacher', 30, 'Aya, can you say more about that?'),
      seg('Teacher', 40, 'Open your books to page four.'),
    ],
    { questionLog: asked(10, 20), teachingMoves: { revisionPrompts: [{ timestampSec: 30, quote: 'x' }] } },
  )
  assert.equal(out.count, 2)
  assert.deepEqual(out.moments, [{ timestampSec: 10 }, { timestampSec: 20 }, { timestampSec: 30 }])
})

test('calls about classroom business do not count, even as questions', () => {
  const out = studentsCalledOn(
    [
      seg('Teacher', 10, 'Marcus, do you need the hall pass?'),
      seg('Teacher', 20, 'Jada, can you pass out the papers?'),
      seg('Teacher', 30, 'Leo, go sharpen your pencil.'),
      seg('Teacher', 40, 'Mia, do you have your Chromebook?'),
      seg('Teacher', 50, 'Sam, what did you get for the slope?'),
    ],
    { questionLog: asked(10, 20, 40, 50), teachingMoves: { housekeeping: [{ timestampSec: 40, quote: 'x' }] } },
  )
  assert.equal(out.count, 1)
  assert.deepEqual(out.moments, [{ timestampSec: 50 }])
})

test('a name with no content move in its line is not a call', () => {
  const out = studentsCalledOn([seg('Teacher', 10, 'Thank you, Sarah. Okay everyone.')], { questionLog: [] })
  assert.equal(out.count, 0)
})

test('it needs no student voice told apart', () => {
  const out = studentsCalledOn([seg('Teacher', 5, 'Sarah, which one did you select? Oh. Okay.')], { questionLog: asked(5) })
  assert.equal(out.count, 1)
})
