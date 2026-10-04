// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import {
  clearHandoff,
  handoffArrival,
  handoffContext,
  handoffOpeningMessage,
  peekHandoff,
  setHandoff,
  takeHandoff,
  type Handoff,
} from './handoff'

// The handoff carries a lesson report into Talk It Through, replacing the
// Reflect tab. Two rules matter more than the payload:
//
//   * it is consumed ONCE. A handoff left in storage re-seeds the
//     conversation on every later visit, which reads as the app being stuck
//     on a lesson the teacher finished talking about days ago.
//   * it never blocks. Storage can throw (private browsing, blocked site
//     data) and the destination has to open anyway, just without context.

function handoff(over: Partial<Handoff> = {}): Handoff {
  return {
    kind: 'debrief_report',
    sessionId: 'as1',
    label: 'Talk & Participation in this lesson',
    focus: 'what the report says about talk balance',
    detail: 'Teacher talk 78%. Student talk 9%. Four questions, average wait time 1.2 seconds.',
    timestampSec: null,
    ...over,
  } as Handoff
}

afterEach(() => {
  clearHandoff()
})

test('a handoff survives the trip', () => {
  setHandoff(handoff())
  const taken = takeHandoff()
  expect(taken?.kind).toBe('debrief_report')
  expect(taken && taken.kind === 'debrief_report' ? taken.focus : null).toBe(
    'what the report says about talk balance',
  )
})

// The rule that stops Talk It Through re-opening a finished lesson.
test('a handoff is consumed once and then gone', () => {
  setHandoff(handoff())
  expect(takeHandoff()).not.toBeNull()
  expect(takeHandoff()).toBeNull()
})

test('peeking does not consume it', () => {
  setHandoff(handoff())
  expect(peekHandoff()).not.toBeNull()
  expect(peekHandoff()).not.toBeNull()
  expect(takeHandoff()).not.toBeNull()
  expect(peekHandoff()).toBeNull()
})

// A teacher who pressed one Discuss and then another meant the second.
test('a second handoff replaces an unread first', () => {
  setHandoff(handoff({ focus: 'first' } as Partial<Handoff>))
  setHandoff(handoff({ focus: 'second' } as Partial<Handoff>))
  const taken = takeHandoff()
  expect(taken && taken.kind === 'debrief_report' ? taken.focus : null).toBe('second')
})

test('nothing waiting reads as nothing, not an error', () => {
  expect(takeHandoff()).toBeNull()
  expect(peekHandoff()).toBeNull()
})

// Junk in storage must not take the destination down with it.
test('corrupt or foreign storage content is ignored', () => {
  sessionStorage.setItem('wivoza.handoff', 'not json')
  expect(takeHandoff()).toBeNull()
  sessionStorage.setItem('wivoza.handoff', JSON.stringify({ kind: 'something_else' }))
  expect(takeHandoff()).toBeNull()
  sessionStorage.setItem('wivoza.handoff', JSON.stringify({ kind: 'debrief_report' }))
  expect(takeHandoff()).toBeNull()
})

// First person, because it is sent as the teacher's own opening turn — "Let's
// talk about..." in the app's voice would have the coach answering itself.
test('the opening message is in the teacher’s voice', () => {
  expect(handoffOpeningMessage(handoff())).toBe(
    'I want to talk about what the report says about talk balance.',
  )
})

test('the context frames the report as background, not as something said', () => {
  const context = handoffContext(handoff())!
  expect(context).toContain('arriving from a report')
  expect(context).toContain('Teacher talk 78%')
})

// A report with nothing measured carries no context rather than an empty
// frame the coach would try to use.
test('no detail means no context block at all', () => {
  expect(handoffContext(handoff({ detail: null }))).toBeNull()
})

// --- the other three directions ---

test('a rehearse handoff carries the teacher’s own words, not a summary', () => {
  setHandoff({
    kind: 'rehearse',
    debriefId: 'd1',
    situation: 'A parent is coming in tomorrow about a grade and I am dreading it.',
    topic: 'parent_communication',
  })
  const taken = takeHandoff()
  expect(taken?.kind).toBe('rehearse')
  expect(taken && taken.kind === 'rehearse' ? taken.situation : null).toBe(
    'A parent is coming in tomorrow about a grade and I am dreading it.',
  )
  expect(taken && taken.kind === 'rehearse' ? taken.topic : null).toBe('parent_communication')
})

// An empty situation would open Practice with a blank "describe my own" box,
// which is worse than not having offered.
test('a rehearse handoff with no situation is refused', () => {
  setHandoff({ kind: 'rehearse', debriefId: 'd1', situation: '   ', topic: null })
  expect(takeHandoff()).toBeNull()
})

test('a document handoff carries only the intent', () => {
  setHandoff({ kind: 'review_document', debriefId: 'd1', about: 'the quiz I wrote for Friday' })
  const taken = takeHandoff()
  expect(taken?.kind).toBe('review_document')
  expect(taken && taken.kind === 'review_document' ? taken.about : null).toBe('the quiz I wrote for Friday')
})

test('a review handoff carries the one-thing card as its context', () => {
  setHandoff({
    kind: 'review_context',
    reviewId: 'r1',
    docTypeLabel: 'Quiz or exam',
    oneThing: 'Split question 4 — it is measuring reading, not the content.',
  })
  const taken = takeHandoff()!
  expect(handoffOpeningMessage(taken)).toBe(
    'I had you look over my quiz or exam and I want to talk about what to do with it.',
  )
  expect(handoffContext(taken)).toContain('Split question 4')
})

test('a review with no one-thing carries no context', () => {
  setHandoff({ kind: 'review_context', reviewId: 'r1', docTypeLabel: 'Message', oneThing: null })
  expect(handoffContext(takeHandoff()!)).toBeNull()
})

// Only the two that land in Talk It Through get an arrival strip; the other
// two land somewhere that explains itself.
test('the arrival strip names where the teacher came from', () => {
  expect(
    handoffArrival({
      kind: 'debrief_report',
      sessionId: 'as1',
      label: 'Talk & Participation',
      focus: 'x',
      detail: null,
      timestampSec: null,
    }),
  ).toEqual({ from: 'From your lesson report', label: 'Talk & Participation' })

  expect(
    handoffArrival({ kind: 'review_context', reviewId: 'r1', docTypeLabel: 'Lesson plan', oneThing: 'Do X.' }),
  ).toEqual({ from: 'From your lesson plan review', label: 'Do X.' })

  expect(handoffArrival({ kind: 'rehearse', debriefId: 'd1', situation: 'x', topic: null })).toBeNull()
})

test('every handoff kind survives a round trip', () => {
  const all: Handoff[] = [
    { kind: 'debrief_report', sessionId: 'a', label: 'l', focus: 'f', detail: null, timestampSec: null },
    { kind: 'rehearse', debriefId: 'd', situation: 's', topic: null },
    { kind: 'review_document', debriefId: 'd', about: 'a' },
    { kind: 'review_context', reviewId: 'r', docTypeLabel: 'Quiz or exam', oneThing: null },
  ]
  for (const handoff of all) {
    setHandoff(handoff)
    expect(takeHandoff()?.kind, handoff.kind).toBe(handoff.kind)
  }
})
