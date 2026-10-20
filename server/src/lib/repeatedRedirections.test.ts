import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { countedMoments, decide, parseCorrections, type ParsedCorrection } from './repeatedRedirections.ts'

// The rules agreed for "Repeated redirections" (2026-10-20), one test each.

const seg = (startSec: number, text: string, speakerLabel = 'Teacher'): Segment => ({ startSec, endSec: startSec + 5, speakerLabel, text })
const c = (timestampSec: number, over: Partial<ParsedCorrection> = {}): ParsedCorrection => ({
  quote: 'Keep it down over there, everybody.', timestampSec, segIndex: 0, expectation: 'talking', teacherLabelled: true, ...over,
})
// A lesson with speech every minute, so nothing is a silent stretch.
const heard = (durationSec: number) => Array.from({ length: Math.ceil(durationSec / 60) }, (_, i) => seg(i * 60, 'So the next part of this is about rivers.'))

test('a reply with no tag is unread, not none', () => {
  assert.equal(parseCorrections('I could not read this transcript.', []), null)
  assert.deepEqual(parseCorrections('<corrections>\nNONE\n</corrections>', []), [])
  assert.equal(decide(null, heard(600), 600).state, 'unread')
})

test('a correction the teacher never said is dropped', () => {
  const segments = [seg(10, 'Phones away, please, everyone.')]
  const parsed = parseCorrections('<corrections>\nPut your phone in your bag. @ 0:10 | devices\n</corrections>', segments)
  assert.deepEqual(parsed, [])
})

test('a correction the transcriber split across lines is still found, timed from its first line', () => {
  const segments = [seg(798, "Don't"), seg(800, "don't feel comfortable."), seg(801, 'Can you get your Chromebook up on your desk and get working on')]
  const parsed = parseCorrections("<corrections>\nDon't don't feel comfortable. Can you get your Chromebook up on your desk and get working on @ 13:18 | devices\n</corrections>", segments)
  assert.equal(parsed?.length, 1)
  assert.equal(parsed?.[0].timestampSec, 798)
})

test('"shh, shh, shh" in one line is one correction', () => {
  const segments = [seg(30, 'Shh, shh, shh. Shh.')]
  const parsed = parseCorrections('<corrections>\nShh, shh, shh. @ 0:30 | talking\nShh. @ 0:30 | talking\n</corrections>', segments)
  assert.equal(parsed?.length, 1)
})

test('asks within seconds of each other are one moment', () => {
  const moments = countedMoments([c(1498), c(1500), c(1503)])
  assert.equal(moments.length, 1)
})

test('wording that cannot be trusted does not count', () => {
  assert.equal(countedMoments([c(100, { quote: 'Shut up.' })]).length, 0)
  assert.equal(countedMoments([c(100, { quote: 'the the quiet quiet' })]).length, 0)
  // One stutter is speech, not garble.
  assert.equal(countedMoments([c(100, { quote: "Don't don't feel comfortable. Can you get your Chromebook up" })]).length, 1)
  // Short is not untrustworthy: a bare "Shh." counts.
  assert.equal(countedMoments([c(100, { quote: 'Shh.' })]).length, 1)
})

test('only lines the transcript gives the teacher count', () => {
  assert.equal(countedMoments([c(100, { teacherLabelled: false })]).length, 0)
})

test('two moments is asking twice; three is a pattern', () => {
  assert.equal(decide(countedMoments([c(100), c(400)]), heard(1200), 1200).state, 'none')
  const read = decide(countedMoments([c(100), c(400), c(700)]), heard(1200), 1200)
  assert.equal(read.state, 'found')
  assert.equal(read.findings[0].title, 'Repeated reminders about talking')
})

test('calm corrections count as much as sharp ones', () => {
  const read = decide(countedMoments([c(100, { quote: 'Voices down a little, thank you.' }), c(200), c(300)]), heard(1200), 1200)
  assert.equal(read.state, 'found')
})

test('different expectations are not one pattern', () => {
  const read = decide(countedMoments([c(100), c(200, { expectation: 'devices' }), c(300, { expectation: 'seats' })]), heard(1200), 1200)
  assert.equal(read.state, 'none')
})

test('within a few minutes is a stretch; across the lesson is recurring', () => {
  const stretch = decide(countedMoments([c(100), c(160), c(220)]), heard(1200), 1200).findings[0]
  assert.equal(stretch.kind, 'stretch')
  assert.match(stretch.pattern, /^Within a few minutes, between 1:40 and 3:40/)
  const recurring = decide(countedMoments([c(100), c(600), c(1100)]), heard(1200), 1200).findings[0]
  assert.equal(recurring.kind, 'recurring')
  assert.match(recurring.pattern, /^Across the lesson, from 1:40 to 18:20/)
})

test('the copy never claims a correction failed and never carries a count', () => {
  const f = decide(countedMoments([c(100), c(600), c(1100)]), heard(1200), 1200).findings[0]
  assert.doesNotMatch(`${f.title} ${f.pattern}`, /didn.t hold|failed|losing|\b3\b|three/i)
})

test('an unquotable lead still leaves the finding standing', () => {
  const f = decide(countedMoments([c(100, { quote: 'Shh.' }), c(600, { quote: 'Shh!' }), c(1100, { quote: 'Hush.' })]), heard(1200), 1200).findings[0]
  assert.equal(f.lead.quote, null)
})

test('heard throughout, gaps named, and mostly silent', () => {
  const none = decide([], heard(1200), 1200)
  assert.equal(none.state, 'none')
  assert.equal(none.coverageNote, 'Your voice was heard throughout this recording.')

  const gappy = [seg(0, 'Morning, everyone.'), seg(269, 'Alright, let us start.'), ...heard(1200).filter((s) => s.startSec >= 300)]
  const withGap = decide([], gappy, 1200)
  assert.equal(withGap.state, 'none')
  assert.equal(withGap.coverageNote, 'No speech was captured from 0:05 to 4:29.')

  const silent = decide([], [seg(0, 'Morning.'), seg(1100, 'Okay, pack up.')], 1200)
  assert.equal(silent.state, 'not_measurable')
})

test('a pattern that is there is reported even on a patchy recording', () => {
  const read = decide(countedMoments([c(100), c(130), c(160)]), [seg(100, 'x'), seg(130, 'x'), seg(160, 'x')], 1200)
  assert.equal(read.state, 'found')
})
