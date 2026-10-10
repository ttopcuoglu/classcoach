import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { buildFocusUserMessage, parseFocus, studentTurnsForFocus } from './studentTalkFocus.ts'

// This is the only part of the report that says anything about what students
// were doing, so the rules that keep it honest matter more than its wording:
// a partial read must not silently change the proportions, and "not measured"
// must never arrive as a zero.

function turn(text: string, startSec = 0, speakerLabel: 'Teacher' | 'Student' = 'Student'): Segment {
  return { speakerLabel, startSec, endSec: startSec + 3, text }
}

const five = [
  turn('I think it was the labor shortage that did it', 10),
  turn('Do we need a pencil for this one', 20),
  turn('did you see the game last night', 30),
  turn('she she got it bed before keeping', 40),
  turn('Because the population dropped so wages went up', 50),
]

test('counts come back per kind, with the turns behind them', () => {
  const focus = parseFocus('<focus>\n1 ON_TOPIC\n2 PROCEDURAL\n3 OFF_TOPIC\n4 UNCLEAR\n5 ON_TOPIC\n</focus>', five)
  assert.ok(focus)
  assert.equal(focus.classified, 5)
  assert.deepEqual(
    [focus.onTopic, focus.procedural, focus.offTopic, focus.unclear],
    [2, 1, 1, 1],
  )
  assert.equal(focus.examples[0].text, 'I think it was the labor shortage that did it')
})

test('a partial read is refused rather than reported on a smaller denominator', () => {
  // Two of five classified would put off-topic at 50% instead of 20%. Every
  // proportion on the page would be wrong and nothing would say so.
  assert.equal(parseFocus('<focus>\n1 ON_TOPIC\n3 OFF_TOPIC\n</focus>', five), null)
})

test('an unparseable reply is null, which readers treat as not measured', () => {
  assert.equal(parseFocus('I had trouble with this one, sorry.', five), null)
})

test('a label we do not recognise is dropped, never guessed at', () => {
  assert.equal(parseFocus('<focus>\n1 DISRUPTIVE\n2 ON_TOPIC\n3 ON_TOPIC\n4 ON_TOPIC\n5 ON_TOPIC\n</focus>', five)?.classified, 4)
})

test('a turn number that does not exist is ignored', () => {
  const focus = parseFocus('<focus>\n1 ON_TOPIC\n2 ON_TOPIC\n3 ON_TOPIC\n4 ON_TOPIC\n5 ON_TOPIC\n9 OFF_TOPIC\n</focus>', five)
  assert.equal(focus?.classified, 5)
  assert.equal(focus?.offTopic, 0)
})

test('a repeated turn number counts once', () => {
  const focus = parseFocus('<focus>\n1 ON_TOPIC\n1 OFF_TOPIC\n2 ON_TOPIC\n3 ON_TOPIC\n4 ON_TOPIC\n5 ON_TOPIC\n</focus>', five)
  assert.equal(focus?.classified, 5)
  assert.equal(focus?.offTopic, 0)
})

test('only audible student turns with something in them are sent', () => {
  const segments = [
    turn('A full student sentence here', 10),
    turn('yeah', 20),
    turn('The teacher explaining at length', 30, 'Teacher'),
    turn('Another real student contribution', 40),
  ]
  const turns = studentTurnsForFocus(segments)
  assert.equal(turns.length, 2)
  assert.ok(turns.every((t) => t.speakerLabel === 'Student'))
})

test('a long lesson is sampled across its whole length, not just its opening', () => {
  const many = Array.from({ length: 200 }, (_, i) => turn(`Student contribution number ${i}`, i * 10))
  const turns = studentTurnsForFocus(many)
  assert.equal(turns.length, 60)
  // The last sample comes from late in the lesson rather than minute ten.
  assert.ok(turns[turns.length - 1].startSec > many[many.length - 1].startSec * 0.9)
})

test('the lesson topic is given to the model, and its absence is stated plainly', () => {
  const withTopic = buildFocusUserMessage(five, {
    objective: 'understand why wages rose after the plague',
    summary: 'The Black Death and its effects on Europe',
    subject: 'world history',
  })
  assert.match(withTopic, /wages rose after the plague/)
  assert.match(withTopic, /world history/)

  const without = buildFocusUserMessage(five, { objective: null, summary: null, subject: null })
  assert.match(without, /could not be determined/)
})
