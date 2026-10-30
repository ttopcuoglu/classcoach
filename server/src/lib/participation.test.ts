import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { followsAStudent, isMaterialsInstruction, parseParticipation, withoutNames } from './participation.ts'

const t = (startSec: number, text: string): Segment => ({ speakerLabel: 'Teacher', startSec, endSec: startSec + 4, text })
const s = (startSec: number, text: string): Segment => ({ speakerLabel: 'Student 1', startSec, endSec: startSec + 4, text })
const SEGMENTS: Segment[] = [
  t(10, 'Turn to your neighbor and tell them one cause of the fall.'),
  s(52, 'I think the rivers changed course.'),
  t(60, 'Jayden, what makes you think that was the main reason?'),
  s(80, 'They ran out of water.'),
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

test('getting out materials is not opening the floor', () => {
  // From the creative writing warm-up, where it was the card's only
  // first-half invitation.
  assert.equal(isMaterialsInstruction('if you do not have a physical book, I would like you to grab one.'), true)
  assert.equal(isMaterialsInstruction('Take out your notebooks.'), true)
  assert.equal(isMaterialsInstruction('Turn to page 40.'), true)
  assert.equal(isMaterialsInstruction('Open to page 40 and read it with your partner.'), false, 'it asks students to read')
  assert.equal(isMaterialsInstruction('Turn to your neighbor and tell them one cause of the fall.'), false)
  assert.equal(isMaterialsInstruction('Get with your partner and come up with one reason.'), false)
  assert.equal(isMaterialsInstruction('Who would like to read?'), false)

  const lines = [t(734, 'if you do not have a physical book, I would like you to grab one.'), ...SEGMENTS]
  const p = parseParticipation(
    `<invitations>
if you do not have a physical book, I would like you to grab one. @ 12:14 | open
Turn to your neighbor and tell them one cause of the fall. @ 0:10 | turn_and_talk
</invitations>`,
    lines,
  )
  assert.deepEqual(p.invitations.map((i) => i.format), ['turn_and_talk'])
})

test('a follow-up needs a student heard just before it', () => {
  const lines = [s(1050, 'He already said that part.'), t(1064, 'What is the purpose in this memoir of him backtracking?'), t(1338, 'Why do you think he picked Abel?')]
  assert.equal(followsAStudent(1064, lines), true, 'a student finished 10 s before')
  assert.equal(followsAStudent(1338, lines), false, 'a fresh question to the room')
  assert.equal(followsAStudent(1050, lines), false, 'a student line that starts after it does not count')

  const p = parseParticipation(
    `<extending>
What is the purpose in this memoir of him backtracking? @ 17:44 | reasoning
Why do you think he picked Abel? @ 22:18 | reasoning
</extending>`,
    lines,
  )
  assert.deepEqual(p.extending.map((e) => e.quote), ['What is the purpose in this memoir of him backtracking?'])
})
