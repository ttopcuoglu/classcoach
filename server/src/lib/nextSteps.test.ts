import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNextStepsUserMessage, nextStepLine, parseNextSteps } from './nextSteps.ts'

test('a line is kept, NONE and a runaway paragraph are not', () => {
  assert.equal(nextStepLine('  Ask pairs to  retell it.\n'), 'Ask pairs to retell it.')
  assert.equal(nextStepLine('NONE'), null)
  assert.equal(nextStepLine('none.'), null)
  assert.equal(nextStepLine(null), null)
  assert.equal(nextStepLine('x'.repeat(321)), null)
})

test('only the sections that earned a line come back', () => {
  assert.deepEqual(
    parseNextSteps('<talk_next>Have two students summarize first.</talk_next>\n<questions_next>NONE</questions_next>'),
    { talk: 'Have two students summarize first.' },
  )
  assert.deepEqual(parseNextSteps('<talk_next>NONE</talk_next>'), {})
})

test('questions and checks notes are read as one part, and a missing note says so', () => {
  const message = buildNextStepsUserMessage({
    lessonSummary: 'Moon phases.',
    talk: null,
    questions: 'Mostly recall.',
    checks: 'One spoken check.',
    climate: 'Brief redirections.',
  })
  assert.match(message, /TALK & PARTICIPATION:\n\(no note\)/)
  assert.match(message, /QUESTIONING & CHECKING:\nMostly recall\.\n\nOne spoken check\./)
  assert.match(message, /^What the lesson covered: Moon phases\./)
})
