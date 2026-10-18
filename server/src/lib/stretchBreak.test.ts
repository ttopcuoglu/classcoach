import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { parseStretchRead, stretchLines } from './stretchBreak.ts'

const t = (startSec: number, text: string): Segment => ({ speakerLabel: 'Teacher', startSec, endSec: startSec + 25, text })
const SEGMENTS: Segment[] = [
  t(0, 'Okay, so today we are playing a simulation.'),
  t(30, 'Each group gets one empire to run. That is the first rule of the game. Right?'),
  t(60, 'Now the second part'),
  t(90, 'You trade with the group next to you.'),
  t(120, 'And that is how it all works.'),
]

test('a break after a complete idea, with the sentence before it', () => {
  const found = stretchLines(SEGMENTS)!
  assert.equal(found.lines.length, 5)
  const read = parseStretchRead('<stretch>\nabout: explaining the rules of the simulation.\nbreak: L2 | the first rule | check\n</stretch>', found.stretch, found.lines)
  assert.equal(read.about, 'explaining the rules of the simulation')
  assert.deepEqual(read.breakAfter, { quote: 'That is the first rule of the game.', atSec: 55, closes: 'the first rule', move: 'check' }, 'filler at the end is skipped')
})

test('NONE, a line out of range, or the last line gives no break; short stretches are not read', () => {
  const found = stretchLines(SEGMENTS)!
  for (const reply of ['break: NONE', 'break: L9 | x | check', 'break: L5 | the end | pause', 'break: L3 | a fragment | check']) {
    assert.equal(parseStretchRead(`<stretch>\nabout: x\n${reply}\n</stretch>`, found.stretch, found.lines).breakAfter, null, reply)
  }
  assert.equal(stretchLines(SEGMENTS.slice(0, 2)), null)
})
