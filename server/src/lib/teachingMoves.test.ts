import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { countMoves, parseTeachingMoves, questionBucket } from './teachingMoves.ts'

// The parser, not the model. What is pinned here is the handling a model's
// reply must survive: quotes it invented, attributes it left off, the same
// moment twice, and wording too rough to put in a teacher's mouth.

function seg(speakerLabel: string, text: string, startSec: number): Segment {
  return { speakerLabel, startSec, endSec: startSec + 5, text }
}

const SEGMENTS: Segment[] = [
  seg('Teacher', 'So why did wages rise? Because there were fewer workers left.', 10),
  seg('Teacher', 'Answer questions one to six, in order, and hand in the sheet by the bell.', 40),
  seg('Teacher', 'Waxing is like wax on, wax off — it grows the same way.', 70),
  seg('Teacher', 'Say more about that — what makes you think so?', 100),
  seg('Teacher', 'Who can build on what she just said?', 130),
  seg('Teacher', 'Eyes up front, pencils down.', 160),
  seg('Teacher', 'Remember last week when we did slopes?', 190),
  seg('Teacher', 'Does everyone have a Chromebook out?', 220),
  seg('Student', 'Because there were fewer people left to do the work', 25),
]

function reply(body: string) {
  return body
}

test('a quote the teacher never said is dropped', () => {
  const moves = parseTeachingMoves(
    reply('<invitations>\nI will be calling your mother tonight. @ 2:00\n</invitations>'),
    SEGMENTS,
  )
  assert.deepEqual(moves.invitations, [])
})

test('a student sentence is not a teacher move', () => {
  // It is in the transcript, but not in the teacher's speech — which is the
  // only thing verification looks at.
  const moves = parseTeachingMoves(
    reply('<invitations>\nBecause there were fewer people left to do the work @ 0:25\n</invitations>'),
    SEGMENTS,
  )
  assert.deepEqual(moves.invitations, [])
})

test('the timestamp comes from the transcript, not the model', () => {
  const moves = parseTeachingMoves(
    reply('<invitations>\nWho can build on what she just said? @ 9:99\n</invitations>'),
    SEGMENTS,
  )
  assert.equal(moves.invitations[0]?.timestampSec, 130)
})

test('NONE is a real answer in every category', () => {
  const moves = parseTeachingMoves(
    reply('<self_answered>\nNONE\n</self_answered>\n<invitations>\nNONE\n</invitations>'),
    SEGMENTS,
  )
  assert.equal(countMoves(moves), 0)
})

test('a housekeeping question is kept on its own list, with the transcript timestamp', () => {
  const moves = parseTeachingMoves(reply('<housekeeping>\nDoes everyone have a Chromebook out? @ 3:40\n</housekeeping>'), SEGMENTS)
  assert.deepEqual(moves.housekeeping, [{ quote: 'Does everyone have a Chromebook out?', timestampSec: 220 }])
  assert.equal(countMoves(moves), 1)
})

test('the same moment listed twice is one moment', () => {
  const moves = parseTeachingMoves(
    reply(
      '<invitations>\nWho can build on what she just said? @ 2:10\nWho can build on what she just said? @ 2:10\n</invitations>',
    ),
    SEGMENTS,
  )
  assert.equal(moves.invitations.length, 1)
})

// --- directions: the four parts ---------------------------------------------

test('a direction records only the parts it actually names', () => {
  const moves = parseTeachingMoves(
    reply(
      '<directions>\nAnswer questions one to six, in order, and hand in the sheet by the bell. @ 0:40 | task, steps, product\n</directions>',
    ),
    SEGMENTS,
  )
  assert.deepEqual(moves.directions[0]?.parts, ['task', 'steps', 'product'])
})

test('a direction that names none of them keeps an empty list, which is the finding', () => {
  const moves = parseTeachingMoves(
    reply('<directions>\nAnswer questions one to six, in order, and hand in the sheet by the bell. @ 0:40 | none\n</directions>'),
    SEGMENTS,
  )
  assert.deepEqual(moves.directions[0]?.parts, [])
})

// --- attributes the model may get wrong or omit -----------------------------

test('a missing question kind falls back to the least flattering reading', () => {
  // Unlabelled must not become "evaluate". Remember is the floor of Bloom's.
  const moves = parseTeachingMoves(
    reply('<question_kinds>\nSo why did wages rise? Because there were fewer workers left. @ 0:10\n</question_kinds>'),
    SEGMENTS,
  )
  assert.equal(moves.questionKinds[0]?.kind, 'remember')
})

// --- the check tag ----------------------------------------------------------

test('a question carries its check tag', () => {
  const moves = parseTeachingMoves(
    reply('<question_kinds>\nWho can build on what she just said? @ 2:10 | analyze | check: demonstrate\n</question_kinds>'),
    SEGMENTS,
  )
  assert.equal(moves.questionKinds[0]?.kind, 'analyze')
  assert.equal(moves.questionKinds[0]?.check, 'demonstrate')
})

test('a question with no check tag has none \u2014 absent, not a default', () => {
  const moves = parseTeachingMoves(
    reply('<question_kinds>\nWho can build on what she just said? @ 2:10 | analyze\n</question_kinds>'),
    SEGMENTS,
  )
  assert.equal(moves.questionKinds[0]?.check, undefined)
})

test('the check vocabulary cannot answer for the kind, or the other way round', () => {
  // Both attributes live on one line now. Matching the whole string would let
  // "check: general" satisfy a search for a level, or a level satisfy a search
  // for a check kind.
  const moves = parseTeachingMoves(
    reply('<question_kinds>\nSay more about that \u2014 what makes you think so? @ 1:40 | evaluate | check: probe\n</question_kinds>'),
    SEGMENTS,
  )
  assert.equal(moves.questionKinds[0]?.kind, 'evaluate')
  assert.equal(moves.questionKinds[0]?.check, 'probe')
})

test('a legacy kind still reads into a bucket', () => {
  // Rows stored before Bloom's keep their old words; nothing rewrites them.
  assert.equal(questionBucket('recall'), 'recall')
  assert.equal(questionBucket('explain'), 'understand')
  assert.equal(questionBucket('compare'), 'higher_order')
  assert.equal(questionBucket('justify'), 'higher_order')
  assert.equal(questionBucket('apply'), 'apply')
  assert.equal(questionBucket('create'), 'higher_order')
})

test('a missing redirection clarity falls back to vague, not actionable', () => {
  const moves = parseTeachingMoves(
    reply('<redirections>\nEyes up front, pencils down. @ 2:40\n</redirections>'),
    SEGMENTS,
  )
  assert.equal(moves.redirections[0]?.clarity, 'vague')
})

test('an explanation kind is read from the attribute', () => {
  const moves = parseTeachingMoves(
    reply('<explanations>\nWaxing is like wax on, wax off — it grows the same way. @ 1:10 | analogy\n</explanations>'),
    SEGMENTS,
  )
  assert.equal(moves.explanations[0]?.kind, 'analogy')
})

// --- what we will not put in a teacher's mouth ------------------------------

test('a redirection too rough to attribute is withheld entirely', () => {
  // This category judges how a teacher spoke to a child. A mangled quote
  // there is an accusation built on a mis-transcription.
  const rough: Segment[] = [seg('Teacher', 'shut up and and sit down', 10)]
  const moves = parseTeachingMoves(
    reply('<redirections>\nshut up and and sit down @ 0:10 | vague\n</redirections>'),
    rough,
  )
  assert.deepEqual(moves.redirections, [])
})

test('other categories keep a rough quote — only redirections are accusations', () => {
  const rough: Segment[] = [seg('Teacher', 'the the slopes from last week, remember', 10)]
  const moves = parseTeachingMoves(
    reply('<connections>\nthe the slopes from last week, remember @ 0:10 | prior\n</connections>'),
    rough,
  )
  assert.equal(moves.connections.length, 1)
})

test('moments come back in the order they happened', () => {
  const moves = parseTeachingMoves(
    reply(
      '<invitations>\nWho can build on what she just said? @ 2:10\nSay more about that — what makes you think so? @ 1:40\n</invitations>',
    ),
    SEGMENTS,
  )
  assert.deepEqual(moves.invitations.map((i) => i.timestampSec), [100, 130])
})
