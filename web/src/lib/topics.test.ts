import { expect, test } from 'vitest'
import {
  RETIRED_KIND_LABELS as SERVER_RETIRED_LABELS,
  RETIRED_KIND_TOPICS as SERVER_RETIRED_TOPICS,
  TOPICS as SERVER_TOPICS,
} from '../../../server/src/lib/topics.ts'
import {
  ALL_KINDS,
  RETIRED_KINDS,
  SOMETHING_ELSE,
  TEACHING_AND_LEARNING,
  TOPICS,
  TOPIC_VALUES,
  asksContentFields,
  findTopic,
  kindLabel,
  kindsFor,
  topicForKind,
  topicLabel,
} from './topics'

// This file and `server/src/lib/topics.ts` are hand-mirrored: the server
// carries the coaching prompts, the browser carries only labels and kinds.
// Hand-mirroring is the existing convention here (focusAreas.ts and
// teachingContext.ts work the same way) and its failure mode is a teacher
// seeing one name for a topic in the picker and a different one in their
// history, or picking a kind the server does not recognize.
//
// The server module imports nothing at all, so this test imports it directly
// and compares the two tables for real rather than restating the table as a
// literal in both places — a duplicated literal is just a third copy to drift.

test('both modules list the same seven topics, in the same order', () => {
  expect(TOPICS.map((t) => t.value)).toEqual(SERVER_TOPICS.map((t) => t.value))
})

test('every topic is labelled identically on both sides', () => {
  for (const topic of TOPICS) {
    const server = SERVER_TOPICS.find((t) => t.value === topic.value)
    expect(server, `${topic.value} is missing on the server`).toBeDefined()
    expect(topic.label, `${topic.value} label`).toBe(server!.label)
    expect(topic.shortLabel, `${topic.value} shortLabel`).toBe(server!.shortLabel)
    expect(topic.blurb, `${topic.value} blurb`).toBe(server!.blurb)
    expect(Boolean(topic.ghost), `${topic.value} ghost`).toBe(Boolean(server!.ghost))
  }
})

// A kind offered in the browser that the server does not know would be sent
// up and silently ignored, so the teacher's choice would vanish.
test('every topic offers the same kinds, in the same order, with the same labels', () => {
  for (const topic of TOPICS) {
    const server = SERVER_TOPICS.find((t) => t.value === topic.value)!
    expect(topic.kinds, `${topic.value} kinds`).toEqual(server.kinds)
  }
})

test('the retired set is the same on both sides, with the same labels and topics', () => {
  expect(Object.keys(RETIRED_KINDS).sort()).toEqual(Object.keys(SERVER_RETIRED_LABELS).sort())
  for (const [kind, { label, topic }] of Object.entries(RETIRED_KINDS)) {
    expect(label, `retired ${kind} label`).toBe(SERVER_RETIRED_LABELS[kind])
    expect(topic, `retired ${kind} topic`).toBe(SERVER_RETIRED_TOPICS[kind])
  }
})

// --- the browser-side behavior the pickers depend on ---

test('the seven topics are exactly these, in this order', () => {
  expect(TOPIC_VALUES).toEqual([
    'teaching_and_learning',
    'classroom_management',
    'student_concern',
    'parent_communication',
    'professionalism',
    'self_and_job',
    'something_else',
  ])
})

test('no kind value is offered by two topics', () => {
  const seen = new Map<string, string>()
  for (const topic of TOPICS) {
    for (const kind of topic.kinds) {
      const owner = seen.get(kind.value)
      expect(owner, `${kind.value} is offered by both ${owner} and ${topic.value}`).toBeUndefined()
      seen.set(kind.value, topic.value)
    }
  }
})

test('no retired value collides with an offered one', () => {
  for (const retired of Object.keys(RETIRED_KINDS)) {
    expect(ALL_KINDS, `${retired} is both retired and offered`).not.toContain(retired)
  }
})

// "Setting a boundary" appears under both Parent Communication and Me and
// this job — the collision the uniqueness rule exists to catch.
test('the two "setting a boundary" kinds are distinct stored values', () => {
  expect(topicForKind('parent_boundary')?.value).toBe('parent_communication')
  expect(topicForKind('self_boundary')?.value).toBe('self_and_job')
  expect(kindLabel('parent_boundary')).toBe('Setting a boundary')
  expect(kindLabel('self_boundary')).toBe('Setting a boundary')
})

// Two of the six original behavior categories are now retired from the
// picker. Both must still resolve, or retiring a label would untag real rows.
test('all six original behavior categories still resolve to Classroom Management', () => {
  for (const category of [
    'defiance',
    'disengagement',
    'peer_conflict',
    'disruption',
    'transitions',
    'technology_misuse',
  ]) {
    expect(topicForKind(category)?.value, `${category} lost its topic`).toBe('classroom_management')
  }
})

test('a retired kind still has a name and a topic', () => {
  expect(kindLabel('conferences')).toBe('Conferences')
  expect(topicForKind('conferences')?.value).toBe('parent_communication')
  expect(kindLabel('records_and_deadlines')).toBe('Records & deadlines')
  expect(topicForKind('mentoring')?.value).toBe('professionalism')
})

test('an unknown kind falls back to its raw value rather than rendering blank', () => {
  expect(kindLabel('some_future_kind')).toBe('some_future_kind')
  expect(kindLabel(null)).toBeNull()
  expect(kindLabel('')).toBeNull()
  expect(topicForKind('some_future_kind')).toBeUndefined()
})

// With no topic chosen there is nothing to scope the Kind row to, so Practice
// shows only "Describe my own" — an empty list, not every kind at once.
test('no topic offers no kinds', () => {
  expect(kindsFor(null)).toEqual([])
  expect(kindsFor(undefined)).toEqual([])
  expect(kindsFor('not_a_topic')).toEqual([])
})

test('every real topic offers kinds, and the ghost topic deliberately offers none', () => {
  for (const topic of TOPICS) {
    if (topic.value === SOMETHING_ELSE) expect(topic.kinds).toEqual([])
    else expect(topic.kinds.length, `${topic.value} offers no kinds`).toBeGreaterThan(0)
  }
})

test('something else is the only ghost chip', () => {
  expect(TOPICS.filter((t) => t.ghost).map((t) => t.value)).toEqual([SOMETHING_ELSE])
})

test('only Teaching and Learning asks about subject, course and what is being taught now', () => {
  expect(asksContentFields(TEACHING_AND_LEARNING)).toBe(true)
  for (const topic of TOPICS) {
    if (topic.value === TEACHING_AND_LEARNING) continue
    expect(asksContentFields(topic.value), `${topic.value}`).toBe(false)
  }
  expect(asksContentFields(null)).toBe(false)
})

test('a label is returned for a known topic and null for anything else', () => {
  expect(topicLabel('self_and_job')).toBe('Me and this job')
  expect(topicLabel('student_concern')).toBe("A student I'm worried about")
  expect(topicLabel('nope')).toBeNull()
  expect(topicLabel(null)).toBeNull()
})

test('findTopic returns undefined rather than throwing on junk', () => {
  expect(findTopic('')).toBeUndefined()
  expect(findTopic(null)).toBeUndefined()
})
