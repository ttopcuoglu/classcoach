import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOCUS_AREAS } from './focusAreas.ts'
import {
  ALL_KINDS,
  RETIRED_KIND_LABELS,
  RETIRED_KIND_TOPICS,
  SOMETHING_ELSE,
  TEACHING_AND_LEARNING,
  TOPICS,
  TOPIC_FOLLOWS_THE_WORDS,
  TOPIC_VALUES,
  asksContentFields,
  findTopic,
  kindLabel,
  kindValues,
  pickTopic,
  topicForKind,
  topicLabel,
} from './topics.ts'

// The topic list is the spine of the consolidation: Talk It Through, Practice
// and the unified history all read it, and it is the auto-tag on every saved
// item. Two things about it are load-bearing and invisible:
//
//   1. Four of the seven values are the pre-existing focus-area values, byte
//      for byte. That is the entire reason no stored row needs rewriting. A
//      typo in one of them is a one-character edit that silently untags every
//      conversation a teacher has.
//   2. Kind values are unique across all seven topics AND across the retired
//      set, because `Scenario.category` / `Debrief.category` is a single
//      column with no topic alongside it. One duplicate makes a stored row
//      resolve to the wrong topic forever.
//
// `focusAreas.ts` and this file both exist until Practice is migrated, so the
// drift test below is what stops them disagreeing while that is true.

test('the seven topics are exactly these, in this order', () => {
  assert.deepEqual(TOPIC_VALUES, [
    'teaching_and_learning',
    'classroom_management',
    'student_concern',
    'parent_communication',
    'professionalism',
    'self_and_job',
    'something_else',
  ])
})

// The order is the teacher-facing order, and `student_concern` sits third on
// purpose — between the two classroom topics and the outward-facing ones.
test('a student I am worried about sits third, not appended at the end', () => {
  assert.equal(TOPICS[2].value, 'student_concern')
})

test('the four pre-existing focus-area values survive unchanged, so nothing needs a backfill', () => {
  for (const value of [
    'teaching_and_learning',
    'classroom_management',
    'parent_communication',
    'professionalism',
  ]) {
    assert.ok(TOPIC_VALUES.includes(value), `${value} is no longer a topic value`)
  }
})

// While both modules exist, a label or value changed in one and not the other
// shows up as a teacher seeing two different names for the same thing in two
// different places.
test('topics and focus areas agree about the four they share', () => {
  for (const area of FOCUS_AREAS) {
    const topic = findTopic(area.value)
    assert.ok(topic, `focus area ${area.value} has no matching topic`)
    assert.equal(topic.label, area.label, `${area.value} is labelled differently in the two modules`)
  }
})

test('every topic has the copy a chip row and an opener need', () => {
  for (const topic of TOPICS) {
    assert.ok(topic.label, `${topic.value} has no label`)
    assert.ok(topic.shortLabel, `${topic.value} has no shortLabel`)
    assert.ok(topic.blurb, `${topic.value} has no blurb`)
    assert.ok(topic.opener, `${topic.value} has no opener`)
  }
})

// Every topic has to be able to coach, including the ghost one — a chip that
// leads to a coach with no stance is worse than no chip.
test('every topic carries a full coaching stance, not just a label', () => {
  for (const topic of TOPICS) {
    assert.ok(topic.coachRole, `${topic.value} has no coachRole`)
    assert.ok(topic.incidentShape, `${topic.value} has no incidentShape`)
    assert.ok(topic.bestPractice, `${topic.value} has no bestPractice`)
    assert.ok(topic.practiceArtifact, `${topic.value} has no practiceArtifact`)
    assert.ok(topic.difficultyTiers, `${topic.value} has no difficultyTiers`)
    assert.ok(topic.safety, `${topic.value} has no safety`)
  }
})

// --- uniqueness, the invariant a single `category` column depends on ---

test('no kind value is offered by two topics', () => {
  const seen = new Map<string, string>()
  for (const topic of TOPICS) {
    for (const kind of topic.kinds) {
      const owner = seen.get(kind.value)
      assert.equal(owner, undefined, `${kind.value} is offered by both ${owner} and ${topic.value}`)
      seen.set(kind.value, topic.value)
    }
  }
})

// "Setting a boundary" is offered under both Parent Communication and Me and
// this job, which is exactly the collision this invariant exists to catch —
// they must be distinct stored values.
test('the two "setting a boundary" kinds are distinct stored values', () => {
  assert.equal(topicForKind('parent_boundary')?.value, 'parent_communication')
  assert.equal(topicForKind('self_boundary')?.value, 'self_and_job')
})

test('no retired value collides with an offered one', () => {
  for (const retired of Object.keys(RETIRED_KIND_LABELS)) {
    assert.ok(
      !ALL_KINDS.includes(retired),
      `${retired} is listed as retired but is still offered — it cannot be both`,
    )
  }
})

test('every retired value knows both its label and the topic it belonged to', () => {
  assert.deepEqual(
    Object.keys(RETIRED_KIND_LABELS).sort(),
    Object.keys(RETIRED_KIND_TOPICS).sort(),
    'the retired label and topic maps have drifted apart',
  )
  for (const [kind, topicValue] of Object.entries(RETIRED_KIND_TOPICS)) {
    assert.ok(findTopic(topicValue), `retired ${kind} points at ${topicValue}, which is not a topic`)
  }
})

// --- resolving stored rows ---

// Everything written before the focus-area axis existed carries one of the six
// original behavior categories. Two of those six are now retired, and both
// must still resolve — otherwise retiring a label would untag real rows.
test('all six original behavior categories still resolve to Classroom Management', () => {
  for (const category of [
    'defiance',
    'disengagement',
    'peer_conflict',
    'disruption',
    'transitions',
    'technology_misuse',
  ]) {
    assert.equal(
      topicForKind(category)?.value,
      'classroom_management',
      `legacy category ${category} lost its topic`,
    )
  }
})

test('a retired kind still resolves to its topic and still has a name', () => {
  assert.equal(topicForKind('conferences')?.value, 'parent_communication')
  assert.equal(kindLabel('conferences'), 'Conferences')
  assert.equal(topicForKind('mentoring')?.value, 'professionalism')
  assert.equal(kindLabel('records_and_deadlines'), 'Records & deadlines')
})

test('an offered kind resolves to its topic and its current label', () => {
  assert.equal(topicForKind('questioning_discussion')?.value, 'teaching_and_learning')
  assert.equal(kindLabel('questioning_discussion'), 'Questioning and discussion')
  assert.equal(kindLabel('defiance'), 'Behavior in the moment')
  assert.equal(topicForKind('call_home')?.value, 'student_concern')
  assert.equal(topicForKind('saying_no')?.value, 'self_and_job')
})

// An unrecognized value must stay visible. Rendering it blank would make a
// teacher's own saved item look corrupted.
test('an unknown kind falls back to its raw value rather than vanishing', () => {
  assert.equal(kindLabel('some_future_kind'), 'some_future_kind')
  assert.equal(kindLabel(null), null)
  assert.equal(kindLabel(''), null)
  assert.equal(topicForKind('some_future_kind'), null)
})

// --- what Practice may pick ---

// `kindValues` feeds the weighted picker, so a retired value leaking in would
// have Practice generating scenarios in a kind no teacher can select.
test('Practice never picks a retired kind', () => {
  for (const topic of TOPICS) {
    for (const kind of kindValues(topic.value)) {
      assert.ok(
        !(kind in RETIRED_KIND_LABELS),
        `${topic.value} would let Practice pick the retired kind ${kind}`,
      )
    }
  }
  for (const kind of kindValues()) {
    assert.ok(!(kind in RETIRED_KIND_LABELS), `the all-topics pick includes retired ${kind}`)
  }
})

// Every topic except the ghost one has to be able to hand a teacher a
// scenario; an empty Kind row would be a dead end.
test('every real topic offers kinds, and the ghost topic deliberately offers none', () => {
  for (const topic of TOPICS) {
    if (topic.value === SOMETHING_ELSE) {
      assert.deepEqual(topic.kinds, [], 'something_else must not offer kinds')
    } else {
      assert.ok(topic.kinds.length > 0, `${topic.value} offers no kinds`)
    }
  }
})

test('an unknown topic offers every kind rather than none', () => {
  assert.deepEqual(kindValues('not_a_topic'), ALL_KINDS)
  assert.deepEqual(kindValues(undefined), ALL_KINDS)
})

// --- the two topics whose constraints are the point ---

// These constraints were required to live in the prompt, not only in UI copy,
// because the UI cannot stop a model from speculating.
test("the student-concern prompt forbids guessing at a diagnosis or what is happening at home", () => {
  const topic = findTopic('student_concern')!
  const safety = topic.safety.toLowerCase()
  assert.ok(safety.includes('diagnosis'), 'diagnosis is not ruled out')
  assert.ok(safety.includes('home'), "the student's home is not ruled out")
  assert.ok(safety.includes('mandated-reporter'), 'the mandated-reporter route is not named')
  assert.ok(!topic.coachRole.toLowerCase().includes('clinician'), 'the coach must not present as a clinician')
})

test('the student-concern coach is pointed at observing and documenting, not explaining', () => {
  const role = findTopic('student_concern')!.coachRole.toLowerCase()
  assert.ok(role.includes('observed') || role.includes('observ'), 'observation is not the stance')
  assert.ok(role.includes('who else needs to know'), 'escalation is not part of the stance')
})

test('the me-and-this-job prompt says plainly when something is bigger than a hard week', () => {
  const topic = findTopic('self_and_job')!
  const safety = topic.safety.toLowerCase()
  assert.ok(safety.includes('bigger than a hard week'), 'the threshold is not named')
  assert.ok(safety.includes('stop coaching'), 'the coach is not told to stop')
  assert.ok(
    safety.includes('mental-health professional') || safety.includes('doctor'),
    'no route to real support is named',
  )
  // The coach must not offer a tactic in place of pointing outward — that is
  // the specific failure "rather than coaching through it" rules out.
  assert.ok(safety.includes('do not offer a tactic instead'), 'the coach may still substitute a tactic')
})

test('the me-and-this-job coach is both supportive and practical, and is not a therapist', () => {
  const role = findTopic('self_and_job')!.coachRole.toLowerCase()
  assert.ok(role.includes('supportive') && role.includes('practical'), 'the stance is not both')
  assert.ok(role.includes('never a therapist'), 'the coach is not warned off counselling')
})

// --- the chip is a starting point, not a filter ---

test('the follows-the-words instruction tells the coach to drop the topic and follow the teacher', () => {
  const text = TOPIC_FOLLOWS_THE_WORDS.toLowerCase()
  assert.ok(text.includes('begin'), 'the chip is not framed as a starting point')
  assert.ok(text.includes('does not limit what you may hear'), 'the chip is not stopped from filtering')
  assert.ok(text.includes('follow their words'), 'the coach is not told to follow the teacher')
  assert.ok(text.includes('never steer back'), 'the coach is not stopped from steering back')
})

// --- content fields ---

test('only Teaching and Learning asks about subject, course and what is being taught now', () => {
  assert.equal(asksContentFields(TEACHING_AND_LEARNING), true)
  for (const topic of TOPICS) {
    if (topic.value === TEACHING_AND_LEARNING) continue
    assert.equal(asksContentFields(topic.value), false, `${topic.value} should not ask for content fields`)
  }
})

// --- defaults ---

// A random fallback would open a conversation on a subject the teacher never
// raised, which is the one thing the chip is explicitly not allowed to do.
test('no topic falls back to something else, never to a random one', () => {
  assert.equal(pickTopic(undefined).value, SOMETHING_ELSE)
  assert.equal(pickTopic(null).value, SOMETHING_ELSE)
  assert.equal(pickTopic('not_a_topic').value, SOMETHING_ELSE)
  assert.equal(pickTopic('professionalism').value, 'professionalism')
})

test('something else is the only ghost chip', () => {
  const ghosts = TOPICS.filter((t) => t.ghost).map((t) => t.value)
  assert.deepEqual(ghosts, [SOMETHING_ELSE])
})

test('a label is returned for a known topic and null for anything else', () => {
  assert.equal(topicLabel('self_and_job'), 'Me and this job')
  assert.equal(topicLabel('student_concern'), "A student I'm worried about")
  assert.equal(topicLabel('nope'), null)
  assert.equal(topicLabel(null), null)
})
