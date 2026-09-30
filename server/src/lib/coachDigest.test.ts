import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildDigestBlock, metricsAreRelevant, selectDigestSessions, type DigestSession } from './coachDigest.ts'

// The digest hands Coach numbers about a teacher's own classroom. The ways that
// goes wrong are all quiet: numbers shown for a question they say nothing about,
// a null rendered as a zero, or the "only audio was measured" caveat dropped so
// Coach can tell a teacher they never checked for understanding.

function session(over: Partial<DigestSession> = {}): DigestSession {
  return {
    period: '3rd period',
    classSubject: 'Chemistry',
    gradeLevel: '10',
    sessionDate: new Date('2026-09-24T14:00:00Z'),
    durationSec: 2520,
    teacherTalkPct: 72,
    studentTalkPct: 28,
    questionCount: 14,
    higherOrderPct: 21,
    avgWaitTimeSec: 1.24,
    cfuCount: 3,
    classSummary: 'Density and the mass-over-volume relationship.',
    strengths: 'You followed up on a student idea instead of moving on.',
    growthAreas: 'A long explanation stretch mid-lesson.',
    nextStep: 'Try one checkpoint inside the explanation.',
    ...over,
  }
}

const RELEVANT = { includeMetrics: true, focusMetric: null }
const IRRELEVANT = { includeMetrics: false, focusMetric: null }

test('no recordings means no digest at all', () => {
  assert.equal(buildDigestBlock([], RELEVANT), '')
})

test('numbers are withheld for an area they say nothing about', () => {
  assert.equal(metricsAreRelevant('classroom_management'), false)
  assert.equal(metricsAreRelevant(null), false)
  assert.equal(metricsAreRelevant('teaching_and_learning'), true)
})

test('an irrelevant area still gets the qualitative half, and no numbers', () => {
  const out = buildDigestBlock([session()], IRRELEVANT)
  assert.ok(out.includes('Density and the mass-over-volume'), 'keeps the lesson summary')
  assert.ok(!out.includes('72%'), 'no talk share')
  assert.ok(!out.includes('1.2s'), 'no wait time')
  assert.ok(!out.includes('14 questions'), 'no question count')
})

test('a relevant area names the room and the day alongside the numbers', () => {
  const out = buildDigestBlock([session()], RELEVANT)
  assert.ok(out.includes('3rd period Chemistry'), 'says which class')
  assert.ok(out.includes('Sep 24'), 'says which day')
  assert.ok(out.includes('42 min recorded'), 'says how much was recorded')
  assert.ok(out.includes('72%'))
  assert.ok(out.includes('1.2s'))
})

test('metrics that were never measured are left out, not shown as zero', () => {
  const out = buildDigestBlock(
    [session({ avgWaitTimeSec: null, cfuCount: null, questionCount: null })],
    RELEVANT,
  )
  assert.ok(!out.includes('wait time'), 'silent about wait time')
  assert.ok(!out.includes('checks for understanding\n'), 'silent about checks')
  assert.ok(!out.includes('0 questions'))
  assert.ok(out.includes('72%'), 'still reports what WAS measured')
})

test('a recording with nothing in it is not worth a block', () => {
  const empty = session({
    teacherTalkPct: null, studentTalkPct: null, questionCount: null, higherOrderPct: null,
    avgWaitTimeSec: null, cfuCount: null,
    classSummary: null, strengths: null, growthAreas: null, nextStep: null,
  })
  assert.equal(buildDigestBlock([empty], RELEVANT), '')
})

test('every block carries the caveat that only audio was measured', () => {
  for (const opts of [RELEVANT, IRRELEVANT]) {
    const out = buildDigestBlock([session()], opts)
    assert.ok(out.includes('Only spoken audio was measured'), 'caveat present')
    assert.ok(out.includes('not necessarily absent'), 'absence is not evidence')
  }
})

test('Coach is told not to raise it unprompted or invent a number', () => {
  const out = buildDigestBlock([session()], RELEVANT)
  assert.ok(out.includes('never open with it'))
  assert.ok(out.includes('never state a number that is not written here'))
})

test('a trend needs two measured sessions, and follows the teacher\'s own metric', () => {
  const two = [session({ avgWaitTimeSec: 1.24 }), session({ avgWaitTimeSec: 0.8 })]
  const withTrend = buildDigestBlock(two, { includeMetrics: true, focusMetric: 'avgWaitTime' })
  assert.ok(withTrend.includes('0.8s → 1.2s'), 'oldest first, newest last')

  const one = buildDigestBlock([session()], { includeMetrics: true, focusMetric: 'avgWaitTime' })
  assert.ok(!one.includes('→'), 'one session is not a trend')

  const otherMetric = buildDigestBlock(two, { includeMetrics: true, focusMetric: 'cfuCount' })
  assert.ok(!otherMetric.includes('0.8s'), 'only the metric they chose to follow')
})

test('no trend when the numbers are withheld anyway', () => {
  const two = [session({ avgWaitTimeSec: 1.24 }), session({ avgWaitTimeSec: 0.8 })]
  assert.ok(!buildDigestBlock(two, { includeMetrics: false, focusMetric: 'avgWaitTime' }).includes('→'))
})

// Ask sends no subject on its questions — every Ask row in production has
// subject null — so a strict subject match meant the digest never fired for
// anyone. These pin the fallback: unambiguous when the teacher has recorded one
// class, silent when they have recorded several.
test('a named subject still has to match', () => {
  const chem = session()
  const bio = session({ classSubject: 'Biology' })
  assert.equal(selectDigestSessions([chem, bio], 'Chemistry').length, 1)
  assert.equal(selectDigestSessions([chem, bio], 'Art').length, 0)
  assert.equal(selectDigestSessions([chem], 'chemistry ').length, 1, 'case and spacing are not the point')
})

test('no subject on the question is fine when only one class was recorded', () => {
  const only = [session(), session({ sessionDate: new Date('2026-09-17T14:00:00Z') })]
  assert.equal(selectDigestSessions(only, null).length, 2)
})

test('no subject on the question stays silent when several were recorded', () => {
  const several = [session(), session({ classSubject: 'Biology' })]
  assert.deepEqual(selectDigestSessions(several, null), [], 'this is the wrong-class case the guard exists for')
})

test('unlabelled recordings are never used — the digest must name the class', () => {
  assert.deepEqual(selectDigestSessions([session({ classSubject: null })], null), [])
  assert.deepEqual(selectDigestSessions([session({ classSubject: null })], 'Chemistry'), [])
})
