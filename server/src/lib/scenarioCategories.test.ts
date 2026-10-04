import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DIFFICULTY_LEVELS,
  SCENARIO_CATEGORIES,
  categoryInArea,
  harderDifficulty,
  hasHarderDifficulty,
  isKnownCategory,
  pickCategory,
  pickDifficulty,
} from './scenarioCategories.ts'
import { ALL_KINDS, RETIRED_KIND_LABELS, TOPICS } from './topics.ts'

// This module guards the `category` column, which Practice calls a KIND. Two
// sets have to stay different here and the difference is the whole point:
//
//   * what may be PICKED — only kinds Practice currently offers, or
//     generation writes scenarios in a kind no teacher can ever select, and
//     the adaptive weighting keeps handing them out.
//   * what is RECOGNIZED — those plus the nine retired kinds, or a teacher's
//     saved history, their exports and the admin breakdowns stop resolving
//     rows that were perfectly valid when they were written.
//
// Collapsing the two in either direction is a silent failure: one strands new
// scenarios, the other strands old ones.

test('the pickable set is exactly the offered kinds', () => {
  assert.deepEqual([...SCENARIO_CATEGORIES], [...ALL_KINDS])
})

test('a retired kind is recognized but never picked', () => {
  for (const retired of Object.keys(RETIRED_KIND_LABELS)) {
    assert.equal(isKnownCategory(retired), true, `${retired} is no longer recognized`)
    assert.ok(!SCENARIO_CATEGORIES.includes(retired), `${retired} is still pickable`)
  }
})

test('every offered kind is recognized', () => {
  for (const kind of ALL_KINDS) assert.equal(isKnownCategory(kind), true, kind)
})

test('junk is not recognized', () => {
  for (const value of ['', 'not_a_kind', null, undefined, 7, {}]) {
    assert.equal(isKnownCategory(value), false, String(value))
  }
})

// A teacher who asks for one kind must get that kind.
test('an explicit offered kind is honoured', () => {
  assert.equal(pickCategory('questioning_discussion', 'teaching_and_learning'), 'questioning_discussion')
  assert.equal(pickCategory('call_home', 'student_concern'), 'call_home')
})

// A kind from another topic must never be honoured — a grading request coming
// back as a defiance scenario is the bug this prevents.
test('a kind from a different topic is replaced with one from the right topic', () => {
  const picked = pickCategory('defiance', 'teaching_and_learning')
  assert.ok(
    TOPICS.find((t) => t.value === 'teaching_and_learning')!.kinds.some((k) => k.value === picked),
    `picked ${picked}, which is not a Teaching and Learning kind`,
  )
})

// A stale tab or an old deep link can still carry a retired kind.
test('a retired kind is replaced with one that can still be offered', () => {
  for (const retired of ['peer_conflict', 'disruption', 'conferences']) {
    const picked = pickCategory(retired, undefined)
    assert.ok(
      !(picked in RETIRED_KIND_LABELS),
      `a request for retired ${retired} came back as retired ${picked}`,
    )
    assert.ok(ALL_KINDS.includes(picked), `${picked} is not an offered kind`)
  }
})

test('no kind given picks one from the topic, never from another', () => {
  for (const topic of TOPICS) {
    if (topic.kinds.length === 0) continue
    const own = topic.kinds.map((k) => k.value)
    for (let i = 0; i < 25; i++) {
      assert.ok(own.includes(pickCategory(undefined, topic.value)), `${topic.value} picked outside its kinds`)
    }
  }
})

test('a kind is correctly attributed to its topic, retired ones included', () => {
  assert.equal(categoryInArea('questioning_discussion', 'teaching_and_learning'), true)
  assert.equal(categoryInArea('questioning_discussion', 'classroom_management'), false)
  // Retired, and still attributed.
  assert.equal(categoryInArea('peer_conflict', 'classroom_management'), true)
  assert.equal(categoryInArea('conferences', 'parent_communication'), true)
  assert.equal(categoryInArea('conferences', 'professionalism'), false)
})

test('no topic given accepts any recognized kind and rejects junk', () => {
  assert.equal(categoryInArea('call_home', null), true)
  assert.equal(categoryInArea('peer_conflict', null), true)
  assert.equal(categoryInArea('not_a_kind', null), false)
})

// --- difficulty ---

test('the three difficulty levels are unchanged', () => {
  assert.deepEqual([...DIFFICULTY_LEVELS], ['beginner', 'intermediate', 'advanced'])
})

test('an explicit difficulty is honoured and junk is replaced', () => {
  assert.equal(pickDifficulty('beginner'), 'beginner')
  assert.equal(pickDifficulty('advanced'), 'advanced')
  assert.ok(DIFFICULTY_LEVELS.includes(pickDifficulty('impossible')))
  assert.ok(DIFFICULTY_LEVELS.includes(pickDifficulty(undefined)))
})

// "Run it again, one notch harder" is the offer made after feedback.
test('one notch harder moves up exactly one step', () => {
  assert.equal(harderDifficulty('beginner'), 'intermediate')
  assert.equal(harderDifficulty('intermediate'), 'advanced')
})

// Wrapping around to beginner would read as the app losing track of where the
// teacher is, so advanced is a ceiling.
test('advanced is the ceiling rather than wrapping around', () => {
  assert.equal(harderDifficulty('advanced'), 'advanced')
  assert.equal(hasHarderDifficulty('advanced'), false)
  assert.equal(hasHarderDifficulty('beginner'), true)
  assert.equal(hasHarderDifficulty('intermediate'), true)
})

// A scenario stored before difficulties were validated, or from a client that
// sent something odd, must not crash the offer.
test('an unrecognized difficulty offers no harder notch rather than guessing wildly', () => {
  assert.equal(hasHarderDifficulty('impossible'), false)
  assert.equal(hasHarderDifficulty(null), false)
  assert.equal(harderDifficulty('impossible'), 'intermediate')
})
