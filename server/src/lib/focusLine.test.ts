import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asksForPauseAfterQuestion, focusLineKey, lineIgnoresPause, parseFocusLine } from './focusLine.ts'

test('the key is the same for the same text, ignoring outer spaces, and differs otherwise', () => {
  assert.equal(focusLineKey('Ask pairs first.'), focusLineKey('  Ask pairs first.\n'))
  assert.notEqual(focusLineKey('Ask pairs first.'), focusLineKey('Ask pairs second.'))
  assert.match(focusLineKey('é — “quoted”'), /^[0-9a-f]{8}$/)
  // Pinned: the web and iOS apps compute this same value to find a line.
  assert.equal(focusLineKey('hello'), '08b5134f')
})

test('a line ending on a quoted word keeps its closing quote; a wrapped line loses its wrapping', () => {
  assert.equal(parseFocusLine('<well>NONE</well><try>Then ask one "why."</try>')?.try, 'Then ask one "why."')
  assert.equal(parseFocusLine('<well>NONE</well><try>"Give pairs thirty seconds."</try>')?.try, 'Give pairs thirty seconds.')
  assert.equal(parseFocusLine('<well>NONE</well><try>"Ask "why" first."</try>')?.try, '"Ask "why" first."')
})

test('a line needs a try; NONE leaves out the well line', () => {
  assert.deepEqual(parseFocusLine('<well>NONE</well>\n<try>Give pairs thirty seconds before taking an answer.</try>'), {
    well: null,
    try: 'Give pairs thirty seconds before taking an answer.',
  })
  assert.deepEqual(parseFocusLine('<well>Your “why” questions got students explaining.</well><try>Ask one more.</try>'), {
    well: 'Your “why” questions got students explaining.',
    try: 'Ask one more.',
  })
  assert.equal(parseFocusLine('<well>Nice.</well><try>NONE</try>'), null)
  assert.equal(parseFocusLine('no tags'), null)
})

test('a line asking for a pause after the question is spotted, a pause after an answer is not', () => {
  // The creative writing warm-up's focus, over a Teacher Pause Time of 5.7 s.
  assert.equal(asksForPauseAfterQuestion('Pause several seconds after asking why, then ask one follow-up before moving on.'), true)
  assert.equal(asksForPauseAfterQuestion('Wait three seconds after each question before calling on anyone.'), true)
  assert.equal(asksForPauseAfterQuestion("Pause after a student's answer before you respond."), false)
  assert.equal(asksForPauseAfterQuestion('After a student answers why, ask one follow-up.'), false)
})

test('a stored line is out of date only when the pause already met the goal', () => {
  const line = { well: null, try: 'Pause several seconds after asking why, then ask one follow-up.' }
  assert.equal(lineIgnoresPause(line, 5.7), true)
  assert.equal(lineIgnoresPause(line, 1.2), false, 'a short pause is worth the advice')
  assert.equal(lineIgnoresPause(line, null), false, 'an older app sends no pause')
  assert.equal(lineIgnoresPause({ well: null, try: 'Ask one follow-up after a student answers.' }, 5.7), false)
})
