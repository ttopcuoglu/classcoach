import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuestionLogEntry, Segment } from './audioAnalysis.ts'
import { heldOpenPrompt, parseHeldOpen, prepareQuestions } from './heldOpen.ts'

const SEGMENTS: Segment[] = [
  { speakerLabel: 'Teacher', startSec: 60, endSec: 64, text: 'Why do you think the moon changes shape?' },
  { speakerLabel: 'Student', startSec: 66, endSec: 70, text: 'Because of the shadow of the earth.' },
  { speakerLabel: 'Teacher', startSec: 71, endSec: 72, text: 'Mm-hm. Anyone else?' },
  { speakerLabel: 'Student', startSec: 75, endSec: 79, text: 'The sun lights a different part.' },
  { speakerLabel: 'Teacher', startSec: 80, endSec: 84, text: 'Okay so listen. Yes, exactly. The sun lights half of it.' },
  { speakerLabel: 'Teacher', startSec: 90, endSec: 96, text: 'Why is it red? Because of the iron in the soil.' },
  { speakerLabel: 'Teacher', startSec: 100, endSec: 102, text: 'What is a crater?' },
  { speakerLabel: 'Teacher', startSec: 400, endSec: 403, text: 'Okay, open your notebooks.' },
]
const q = (timestampSec: number, text: string): QuestionLogEntry => ({
  timestampSec,
  type: 'higher_order',
  waitTimeSec: null,
  pauseSec: null,
  studentAudibleInPause: false,
  text,
  followUps: [],
})
const LOG = [
  q(60, 'Why do you think the moon changes shape?'),
  q(90, 'Why is it red?'),
  q(100, 'What is a crater?'),
]
const prepared = () => prepareQuestions(LOG, SEGMENTS)

test('the first line marked close wins, whatever order the model wrote them in', () => {
  const held = parseHeldOpen(
    '<held>\nQ1 | explain\nL3 | close | moved_on | why is it red\nL1 | open\nL2 | close | confirmed | Yes, exactly.\n</held>',
    prepared(),
  )
  const h = held.get(1)!
  assert.equal(h.outcome, 'closed')
  assert.equal(h.how, 'confirmed')
  assert.equal(h.closedBy, 'Yes, exactly.')
  // "Yes, exactly." starts partway into the 80–84s line, not at 80s.
  assert.ok(h.sec! > 16 && h.sec! < 20, `sec ${h.sec}`)
})

test('answered in the same breath is self-answered, not held open', () => {
  const p = prepared()
  assert.equal(p[1].lines[0].n, 0, 'the rest of the line is L0')
  const held = parseHeldOpen('<held>\nQ2 | explain\nL0 | close | gave_answer | Because of the iron\n</held>', p)
  assert.equal(held.get(2)!.outcome, 'self_answered')
})

test('a skipped question is not a thinking question', () => {
  const held = parseHeldOpen('<held>\nQ3 | SKIP\n</held>', prepared())
  assert.equal(held.get(3)!.outcome, 'not_thinking')
})

test('all lines open, or nothing marked, is still open; a task is its own outcome', () => {
  const p = prepared()
  assert.equal(parseHeldOpen('<held>\nQ1 | predict\nL1 | open\n</held>', p).get(1)!.outcome, 'open')
  const task = parseHeldOpen('<held>\nQ1 | evaluate\nL1 | task | Anyone else\n</held>', p).get(1)!
  assert.equal(task.outcome, 'task')
  assert.equal(task.how, null)
})

test('a phrase not in the line keeps the time but shows no words', () => {
  const held = parseHeldOpen('<held>\nQ1 | explain\nL2 | close | confirmed | Great job everyone\n</held>', prepared())
  const h = held.get(1)!
  assert.equal(h.closedBy, null)
  assert.equal(h.closedAtSec, 80)
})

test('a line number the question does not have is ignored', () => {
  const held = parseHeldOpen('<held>\nQ1 | explain\nL99 | close | confirmed | Yes\n</held>', prepared())
  assert.equal(held.get(1)!.outcome, 'open')
})

test('the prompt numbers the teacher’s lines and hides what others said', () => {
  const prompt = heldOpenPrompt(prepared().slice(0, 1))
  assert.match(prompt, /\(someone else speaks\)/)
  assert.doesNotMatch(prompt, /shadow of the earth/)
  assert.match(prompt, /L2 \[1:20\] Okay so listen\. Yes, exactly/)
  assert.doesNotMatch(prompt, /open your notebooks/, 'past the window')
})

test('words Deepgram doubts are the teacher’s never reach the read', () => {
  const segments: Segment[] = [
    // The synthetic clip's line: the teacher, then another voice folded in.
    {
      speakerLabel: 'Teacher',
      startSec: 10,
      endSec: 18,
      text: 'Why does the moon change shape? Because the earth casts a shadow.',
      speakerConfidence: [[6, 0.76], [6, 0.11]],
    },
    { speakerLabel: 'Teacher', startSec: 20, endSec: 22, text: 'I think it is the sun.', speakerConfidence: [[6, 0.05]] },
    { speakerLabel: 'Teacher', startSec: 24, endSec: 27, text: 'Not quite, look again.', speakerConfidence: [[4, 0.7]] },
  ]
  const p = prepareQuestions([q(10, 'Why does the moon change shape?')], segments)
  assert.equal(p[0].lines[0].n, 1, 'no L0: the words after the question were someone else’s')
  assert.equal(p[0].lines.length, 1)
  assert.equal(p[0].lines[0].text, 'Not quite, look again.')
  assert.ok(p[0].others.includes(20), 'a wholly doubtful line counts as someone else speaking')
  const prompt = heldOpenPrompt(p)
  assert.doesNotMatch(prompt, /shadow|I think it is the sun/)
})
