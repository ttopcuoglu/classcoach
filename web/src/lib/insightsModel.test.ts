import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { AudioSessionWithSegments, TranscriptSegment } from './api.ts'
import { buildInsightsModel, contextLines, fastStretches, MAX_QUOTE_WORDS, splitCoachNote, trimQuote } from './insightsModel.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text: string): TranscriptSegment => ({
  id: `${speakerLabel}-${startSec}`,
  speakerLabel,
  rawSpeakerTag: speakerLabel === 'Teacher' ? 'Speaker 0' : 'Speaker 1',
  startSec,
  endSec,
  text,
})

test('a long line is cut to a boundary, and stays the teacher’s exact words', () => {
  const long =
    'So when you write the hook, you want the reader to see something right away. ' +
    'Think about the gym, the lights, the sound of the ball on the floor, and the crowd that is waiting for the shot to drop.'
  const { quote, cut } = trimQuote(long)
  assert.ok(long.startsWith(quote), 'an exact prefix, never stitched')
  assert.ok(quote.split(/\s+/).length <= MAX_QUOTE_WORDS)
  assert.equal(quote, 'So when you write the hook, you want the reader to see something right away.')
  assert.equal(cut, false)
  assert.deepEqual(trimQuote('Short and whole.'), { quote: 'Short and whole.', cut: false })
})

test('context is the teacher’s own line before and after, never a student’s', () => {
  const segments = [
    seg('Teacher', 10, 14, 'Who has a character they just call my dad?'),
    seg('Student', 15, 17, 'Me, I do.'),
    seg('Teacher', 18, 22, 'Anybody else have a character who is unnamed?'),
    seg('Teacher', 23, 26, 'Okay, so you might use a pseudonym.'),
  ]
  const ctx = contextLines(segments, 18)
  assert.equal(ctx.before?.text, 'Who has a character they just call my dad?')
  assert.equal(ctx.after?.text, 'Okay, so you might use a pseudonym.')
})

test('a fast stretch is sustained, not one quick line', () => {
  // 100 words over 30 seconds of teacher talk = 200 words a minute.
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
  const fast = [seg('Teacher', 0, 15, words(50)), seg('Teacher', 15.5, 30.5, words(50))]
  assert.equal(fastStretches(fast).length, 1)
  assert.equal(fastStretches([seg('Teacher', 0, 5, words(30))]).length, 0, 'too short to be a stretch')
})

test('the coach note leads with its first sentence', () => {
  assert.deepEqual(splitCoachNote('You moved quickly. The middle was writing time.'), {
    lead: 'You moved quickly.',
    more: 'The middle was writing time.',
  })
  assert.equal(splitCoachNote('  '), null)
})

function lesson(over: Partial<AudioSessionWithSegments>): AudioSessionWithSegments {
  return {
    segments: [],
    metricsDetail: {},
    questionLog: null,
    cfuLog: null,
    feedbackLog: null,
    teachingMoves: null,
    lessonContent: null,
    contentNotes: null,
    nextSteps: null,
    durationSec: 900,
    teacherTalkPct: 40,
    ...over,
  } as unknown as AudioSessionWithSegments
}

test('every count is the evidence it shows', () => {
  const model = buildInsightsModel(
    lesson({
      questionLog: [
        { timestampSec: 10, type: 'recall', waitTimeSec: null, text: 'What did we read yesterday?', followUps: [] },
        { timestampSec: 40, type: 'higher_order', waitTimeSec: null, text: 'Why would a name matter in a story?', followUps: [] },
      ],
      teachingMoves: {
        invitations: [{ quote: 'Anybody else have a character who is unnamed?', timestampSec: 88 }],
        selfAnswered: [],
        directions: [
          { quote: 'Two minutes, write one hook, put it in the doc.', timestampSec: 302, parts: ['task', 'steps', 'time', 'product'] },
          { quote: 'Okay, keep working on it everyone.', timestampSec: 750, parts: ['task'] },
        ],
      },
    }),
  )
  const higher = model.questioning.findings.find((f) => f.key === 'higher_order_questions')!
  assert.equal(higher.value, '1 of 2')
  assert.equal(higher.evidence.length, 2)
  assert.equal(higher.featured?.full, 'Why would a name matter in a story?', 'a strength is featured')
  const dirs = model.clarity.findings.find((f) => f.key === 'directions')!
  assert.equal(dirs.value, '1 of 2 complete')
  assert.equal(dirs.evidence[0].polarity, 'strength', 'strengths come first')
  assert.match(model.clarity.keepTry.tryNext!.text, /steps, time, and product/)
  const inv = model.talk.findings.find((f) => f.key === 'invitations')!
  assert.equal(inv.value, '1')
  assert.equal(inv.showAllLabel, undefined, 'no "Show all" for one item')
})

test('a read that never ran is unavailable; one that found nothing is none', () => {
  const never = buildInsightsModel(lesson({ teachingMoves: null }))
  assert.equal(never.talk.findings[0].state, 'unavailable')
  assert.equal(never.talk.findings[0].value, null, 'never rendered as zero')
  const none = buildInsightsModel(lesson({ teachingMoves: { invitations: [] } }))
  assert.equal(none.talk.findings[0].state, 'confirmed_none')
  assert.equal(none.talk.findings[0].value, '0')
})

test('an unsafe line is withheld, never featured over a safe one', () => {
  const model = buildInsightsModel(
    lesson({
      teachingMoves: {
        invitations: [
          { quote: 'Shut up and listen, who has an idea?', timestampSec: 5 },
          { quote: 'Who else has a hook in mind?', timestampSec: 9 },
        ],
      },
    }),
  )
  const inv = model.talk.findings[0]
  assert.equal(inv.featured?.full, 'Who else has a hook in mind?')
  assert.equal(inv.evidence.find((e) => e.timestampSec === 5)?.withheld, true)
})

test('a line featured under one finding is not featured again in the same section', () => {
  const line = 'So who here knows what a transitional phrase is?'
  const model = buildInsightsModel(
    lesson({
      questionLog: [{ timestampSec: 22, type: 'higher_order', waitTimeSec: null, text: line, followUps: [] }],
      cfuLog: [
        { timestampSec: 22, text: line, whatItChecked: 'a term' },
        { timestampSec: 60, text: 'Does that make sense to everyone so far?', whatItChecked: 'understanding' },
      ],
    }),
  )
  const [higher, , checks] = model.questioning.findings
  assert.equal(higher.featured?.full, line)
  assert.equal(checks.featured?.full, 'Does that make sense to everyone so far?')
})
