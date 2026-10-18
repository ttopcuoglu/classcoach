import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { AudioSessionWithSegments, NextFocus, TranscriptSegment } from './api.ts'
import { checkFocus, focusFromTry, suggestFocus } from './focusLoop.ts'
import { buildInsightsModel } from './insightsModel.ts'

const said = (...lines: [number, string][]): TranscriptSegment[] =>
  lines.map(([at, text]) => ({ id: `T-${at}`, speakerLabel: 'Teacher', rawSpeakerTag: 'S0', startSec: at, endSec: at + 3, text }))

function lesson(over: Partial<AudioSessionWithSegments>): AudioSessionWithSegments {
  return {
    segments: [], metricsDetail: {}, questionLog: null, cfuLog: null, feedbackLog: null, teachingMoves: null,
    lessonContent: null, contentNotes: null, nextSteps: null, durationSec: 900, teacherTalkPct: 40, ...over,
  } as unknown as AudioSessionWithSegments
}

const FOCUS: NextFocus = {
  findingKey: 'directions',
  findingLabel: 'Directions',
  text: 'Name time and product in every set of directions.',
  value: '0 of 2 complete',
  line: null,
  rewrite: null,
  pickedAt: '2026-10-16T00:00:00Z',
}

test('a focus that showed up points at the line it showed up in', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([302, 'Two minutes, write one hook, put it in the doc.']),
      teachingMoves: { directions: [{ quote: 'Two minutes, write one hook, put it in the doc.', timestampSec: 302, parts: ['task', 'steps', 'time', 'product'] }] },
    }),
  )
  const c = checkFocus(model, FOCUS, 'prev')
  assert.equal(c.outcome, 'heard')
  assert.equal(c.thisValue, '1 of 1 complete')
  assert.equal(c.lastValue, '0 of 2 complete')
  assert.equal(c.line?.quote, 'Two minutes, write one hook, put it in the doc.')
})

test('a focus that did not show up is "not yet", with a place it could fit', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([750, 'Okay, keep working on it everyone.']),
      teachingMoves: { directions: [{ quote: 'Okay, keep working on it everyone.', timestampSec: 750, parts: ['task'] }] },
    }),
  )
  const c = checkFocus(model, FOCUS, 'prev')
  assert.equal(c.outcome, 'not_yet')
  assert.equal(c.line?.quote, 'Okay, keep working on it everyone.')
})

test('a lesson that could not be read for it says so, never zero', () => {
  const c = checkFocus(buildInsightsModel(lesson({ teachingMoves: null })), FOCUS, 'prev')
  assert.equal(c.outcome, 'unavailable')
  assert.equal(c.thisValue, null)
})

test('where fewer is the goal, none is the focus met', () => {
  const model = buildInsightsModel(lesson({ teachingMoves: { selfAnswered: [] } }))
  const c = checkFocus(model, { ...FOCUS, findingKey: 'self_answered', value: '3' }, 'prev')
  assert.equal(c.outcome, 'heard')
  assert.equal(c.line, null)
})

test('a Try becomes a focus tied to its finding, and a rewritten one is suggested first', () => {
  const model = buildInsightsModel(
    lesson({
      segments: said([750, 'Okay, keep working on it everyone.'], [20, 'Who else has a hook in mind?']),
      teachingMoves: {
        directions: [{ quote: 'Okay, keep working on it everyone.', timestampSec: 750, parts: ['task'] }],
        invitations: [{ quote: 'Who else has a hook in mind?', timestampSec: 20 }],
      },
    }),
  )
  const focus = focusFromTry(model.clarity, model.clarity.keepTry)
  assert.equal(focus?.findingKey, 'directions')
  assert.equal(focus?.value, '0 of 1 complete')
  const suggested = suggestFocus(model, (s) =>
    s.key === 'clarity' ? { ...s.keepTry, tryNext: { ...s.keepTry.tryNext!, rewrite: 'Finish this paragraph in 8 minutes, then highlight one detail.' } } : s.keepTry,
  )
  assert.equal(suggested?.findingKey, 'directions')
  assert.match(suggested!.rewrite!, /8 minutes/)
})
