import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDebriefFocusPrompt, clock, debriefFocusUserMessage, parseDebriefFocus, teacherLines } from './debriefSchoolFocus.ts'

const FOCUS = {
  id: 'p1',
  name: 'Accountable Talk',
  purpose: 'Students build on each other.',
  looksLike: '"Who can add to that?"',
  whenItFits: 'Discussion.',
  ideas: 'Revoicing; press for reasoning.',
  whenNotToUse: 'A test or quiz\nSilent independent work',
}

const SEGMENTS = [
  { speakerLabel: 'Teacher', startSec: 62, text: 'Okay, so what do you notice about the graph?' },
  { speakerLabel: 'Student', startSec: 66, text: 'It goes up on both sides.' },
  { speakerLabel: 'Teacher', startSec: 70, text: 'Right, good. Next one.' },
  { speakerLabel: 'Teacher', startSec: 874, text: "Who can tell me why that's the end behavior?" },
]
const LINES = teacherLines(SEGMENTS)

test("only the teacher's own lines go to the model", () => {
  assert.deepEqual(LINES.map((l) => l.atSec), [62, 70, 874])
  const message = debriefFocusUserMessage(LINES)
  assert.ok(!message.includes('goes up on both sides'), 'a student line reached the model')
  assert.ok(message.includes("[14:34] Who can tell me why that's the end behavior?"))
  assert.equal(clock(5), '0:05')
})

test('a long lesson is thinned evenly, not cut off at the end', () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({ speakerLabel: 'Teacher', startSec: i * 2, text: `Line number ${i} with some words in it.` }))
  const kept = teacherLines(many)
  assert.ok(kept.length < 2000 && kept.length > 100)
  assert.ok(kept.at(-1)!.atSec > 3500, 'the end of the lesson is still there')
})

test("the prompt asks for the parser's tags and lists the school's not-fit lines", () => {
  const prompt = buildDebriefFocusPrompt(FOCUS)
  for (const tag of ['moment_time', 'teacher_quote', 'idea', 'none']) assert.ok(prompt.includes(`<${tag}>`), tag)
  assert.ok(prompt.includes('- A test or quiz'))
  assert.match(prompt, /Never claim or guess any of it/)
})

test('an idea keeps a quote that is really in the transcript, at its real time', () => {
  const idea = parseDebriefFocus(
    `<moment_time>1:10</moment_time><teacher_quote>Right, good.</teacher_quote><idea>One option next time: before "Next one", ask "Who can add to that?"</idea>`,
    LINES,
    FOCUS,
  )
  assert.equal(idea.quote?.atSec, 70)
  assert.equal(idea.text, 'One option next time: before "Next one", ask "Who can add to that?"')
  assert.equal(idea.none, null)
})

test('a quote with the wrong time is still found if the words are real', () => {
  const idea = parseDebriefFocus(`<moment_time>9:59</moment_time><teacher_quote>what do you notice about the graph</teacher_quote><idea>One option next time: x</idea>`, LINES, FOCUS)
  assert.equal(idea.quote?.atSec, 62)
})

test('an invented quote is never shown — the idea becomes none', () => {
  const idea = parseDebriefFocus(`<moment_time>1:02</moment_time><teacher_quote>Talk to your partner about it</teacher_quote><idea>One option next time: x</idea>`, LINES, FOCUS)
  assert.equal(idea.quote, null)
  assert.equal(idea.text, null)
  assert.ok(idea.none)
})

test('a none answer keeps its reason; an over-long idea is dropped', () => {
  assert.equal(parseDebriefFocus('<none>Most of this lesson was a quiz.</none>', LINES, FOCUS).none, 'Most of this lesson was a quiz.')
  const long = parseDebriefFocus(`<moment_time>1:10</moment_time><teacher_quote>Right, good.</teacher_quote><idea>${'x'.repeat(700)}</idea>`, LINES, FOCUS)
  assert.equal(long.text, null)
})
