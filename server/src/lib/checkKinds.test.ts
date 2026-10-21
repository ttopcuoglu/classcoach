import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { checksPrompt, parseCheckKinds } from './checkKinds.ts'

test('one kind per check, in order; unknown kinds and stray lines ignored', () => {
  assert.deepEqual(
    parseCheckKinds('<kinds>\nC1 | general\nC2 | whole-class\nC3 | sometimes\nC9 | explain\nC1 | evidence\n</kinds>', 3),
    ['general', 'whole_class', null],
  )
  assert.deepEqual(parseCheckKinds('no tag', 2), [null, null])
})

test('each check comes with the teacher’s next lines, never a student’s', () => {
  const segments: Segment[] = [
    { speakerLabel: 'Teacher', startSec: 10, endSec: 12, text: 'Turn and tell your partner.' },
    { speakerLabel: 'Student', startSec: 13, endSec: 14, text: 'Okay.' },
    { speakerLabel: 'Teacher', startSec: 15, endSec: 18, text: 'Explain the first step to them.' },
  ]
  const prompt = checksPrompt([{ timestampSec: 10, text: 'Turn and tell your partner.', whatItChecked: 'x' }], segments)
  assert.match(prompt, /C1: Turn and tell your partner\.\n {3}then: Explain the first step to them\./)
  assert.doesNotMatch(prompt, /Okay\./)
})
