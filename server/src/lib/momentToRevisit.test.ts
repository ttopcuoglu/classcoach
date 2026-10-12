import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMoment, quoteFromTranscript, transcriptForMoment } from './momentToRevisit.ts'
import type { Segment } from './audioAnalysis.ts'

const seg = (speakerLabel: 'Teacher' | 'Student', startSec: number, text: string): Segment =>
  ({ speakerLabel, startSec, endSec: startSec + 5, text }) as Segment

const LESSON = [
  seg('Teacher', 540, 'A lot of issues with new crops into a new area.'),
  seg('Teacher', 547, 'What is overgrazing?'),
  seg('Teacher', 569, 'So the problem with livestock, you have to feed them and grow them.'),
  seg('Student', 600, 'Is that why the land wore out?'),
]

const reply = (parts: Record<string, string>) =>
  Object.entries(parts).map(([tag, value]) => `<${tag}>${value}</${tag}>`).join('\n')

const FOUND = {
  status: 'FOUND',
  headline: 'You asked what overgrazing is, waited, and then answered it yourself.',
  quote_time: '9:07',
  quote: 'What is overgrazing?',
  why: 'Nobody in the room had to work out what the word meant.',
  try: 'Ask it, then have pairs write a one-line guess before you explain.',
}

test('the transcript shows both speakers in time order', () => {
  assert.equal(
    transcriptForMoment([LESSON[3], LESSON[1]]),
    '[9:07] T: What is overgrazing?\n[10:00] S: Is that why the land wore out?',
  )
})

test('a verbatim quote is kept and timed from the transcript, not the model', () => {
  const moment = parseMoment(reply({ ...FOUND, quote_time: '2:00' }), LESSON)
  assert.equal(moment?.status, 'found')
  assert.equal(moment?.quote, 'What is overgrazing?')
  assert.equal(moment?.timestampSec, 547)
  assert.equal(moment?.tryNext, FOUND.try)
})

test('a tidied quote is replaced by the line it came from', () => {
  const quoted = quoteFromTranscript(LESSON, 'The problem with livestock is you have to feed and grow them', 565)
  assert.deepEqual(quoted, { quote: LESSON[2].text, timestampSec: 569 })
})

test('a quote nobody said drops the whole moment', () => {
  assert.equal(parseMoment(reply({ ...FOUND, quote: 'Can anyone tell me why the soil was ruined here?' }), LESSON), null)
})

test('a quote is found even when the line was labelled as a student', () => {
  assert.equal(quoteFromTranscript(LESSON, 'Is that why the land wore out?', null)?.timestampSec, 600)
})

test('a found moment missing its next step is not stored', () => {
  assert.equal(parseMoment(reply({ ...FOUND, try: 'NONE' }), LESSON), null)
})

test('the three other answers are stored as themselves, with nothing attached', () => {
  for (const [said, status] of [['THIN', 'thin'], ['NOT_A_LESSON', 'not_a_lesson'], ['CLEAR', 'clear']] as const) {
    const moment = parseMoment(reply({ status: said, headline: 'NONE' }), LESSON)
    assert.equal(moment?.status, status)
    assert.equal(moment?.headline, null)
    assert.equal(moment?.quote, null)
  }
})

test('a reply with no status is not a result', () => {
  assert.equal(parseMoment('I could not decide.', LESSON), null)
})

test('a one-word check is a quote, timed at the use nearest the cited moment', () => {
  const lesson = [
    seg('Teacher', 10, 'We weave the quote in. Agreed?'),
    seg('Teacher', 300, 'So that is why school matters here.'),
    seg('Teacher', 485, 'Agreed?'),
  ]
  assert.deepEqual(quoteFromTranscript(lesson, 'Agreed?', 480), { quote: 'Agreed?', timestampSec: 485 })
  assert.equal(quoteFromTranscript(lesson, 'cool', 300), null)
})
