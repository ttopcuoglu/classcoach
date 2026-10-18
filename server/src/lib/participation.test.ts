import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { parseParticipation, withoutNames } from './participation.ts'

const t = (startSec: number, text: string): Segment => ({ speakerLabel: 'Teacher', startSec, endSec: startSec + 4, text })
const SEGMENTS: Segment[] = [
  t(10, 'Turn to your neighbor and tell them one cause of the fall.'),
  t(60, 'Jayden, what makes you think that was the main reason?'),
  t(90, 'Who can add to what she just said?'),
  t(120, "Let's hear from someone who hasn't shared yet."),
]

test('three kinds, quotes checked, formats and kinds read, names replaced', () => {
  const p = parseParticipation(
    `<invitations>
Turn to your neighbor and tell them one cause of the fall. @ 0:10 | turn_and_talk
Write three paragraphs about your summer vacation please. @ 0:20 | write_first
</invitations>
<extending>
Jayden, what makes you think that was the main reason? @ 1:00 | reasoning
Who can add to what she just said? @ 1:30 | build on peer
</extending>
<widening>
Let's hear from someone who hasn't shared yet. @ 2:00
</widening>`,
    SEGMENTS,
  )
  assert.equal(p.invitations.length, 1, 'a sentence the teacher never said is dropped')
  assert.equal(p.invitations[0].format, 'turn_and_talk')
  assert.deepEqual(p.extending.map((e) => e.kind), ['reasoning', 'build_on_peer'])
  assert.equal(p.extending[0].quote, '[name], what makes you think that was the main reason?')
  assert.equal(p.widening.length, 1)
})

test('NONE is empty, and a name inside a word is left alone', () => {
  const p = parseParticipation('<invitations>\nNONE\n</invitations>\n<extending>\nNONE\n</extending>\n<widening>\nNONE\n</widening>', SEGMENTS)
  assert.deepEqual(p, { invitations: [], extending: [], widening: [] })
  assert.equal(withoutNames('Ian, look at the Indian empire.', ['Ian']), '[name], look at the Indian empire.')
})

test('names set off by commas are replaced even when the lesson-wide list missed them', () => {
  assert.equal(withoutNames('So, Caleb, what do you think?', []), 'So, [name], what do you think?')
  assert.equal(withoutNames("If you're writing an imagery hook, Arabella, what should I see?", []), "If you're writing an imagery hook, [name], what should I see?")
  assert.equal(withoutNames('Okay, so what changed?', []), 'Okay, so what changed?', 'a common opener is not a name')
  assert.equal(withoutNames('Go ahead, Maya.', []), 'Go ahead, [name].')
})
