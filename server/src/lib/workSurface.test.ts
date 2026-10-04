import assert from 'node:assert/strict'
import { test } from 'node:test'
import { surfaceFor, topicFor, WORK_SURFACES, type WorkRecord } from './workSurface.ts'

// Getting this mapping wrong doesn't throw and doesn't show up in a type
// error — it shows up as a teacher opening My Work and finding that some of
// their history is gone, because it was derived onto a surface whose filter
// they never press, or onto no surface at all. Since nothing is stored there
// is also nothing to repair after the fact: the next read makes the same
// mistake. So every row shape the database can actually hold is pinned here,
// including the legacy values that only exist in old rows.

test('every surface is one of the four, for every model', () => {
  const records: WorkRecord[] = [
    { model: 'debrief' },
    { model: 'parentMessage' },
    { model: 'conversationPlan' },
    { model: 'scenarioAttempt' },
    { model: 'conversationPrep', source: 'practice' },
    { model: 'conversationPrep', source: 'review' },
    { model: 'lessonPlan', mode: 'generated' },
    { model: 'lessonPlan', mode: 'feedback' },
    { model: 'assignmentCoachSession' },
    { model: 'audioSession' },
    { model: 'review' },
  ]
  for (const record of records) {
    assert.ok(
      WORK_SURFACES.includes(surfaceFor(record)),
      `${record.model} derived a surface outside the four: ${surfaceFor(record)}`,
    )
  }
})

// Ask was merged into Talk It Through rather than kept as a second door, so
// its rows have to land there too. `source` is still written, and a mapping
// that read it would quietly strand every Ask conversation — the single
// largest group of rows most teachers have.
test('an Ask conversation lands on Talk It Through, same as a spoken one', () => {
  assert.equal(surfaceFor({ model: 'debrief' }), 'talk_it_through')
})

// Write a Message and Prepare for a Meeting stopped being tools and became
// things a conversation produces at its end.
test('messages and meeting plans are Talk It Through items', () => {
  assert.equal(surfaceFor({ model: 'parentMessage' }), 'talk_it_through')
  assert.equal(surfaceFor({ model: 'conversationPlan' }), 'talk_it_through')
})

test('practice attempts and role-plays are Practice items', () => {
  assert.equal(surfaceFor({ model: 'scenarioAttempt' }), 'practice')
  assert.equal(surfaceFor({ model: 'conversationPrep', source: 'practice' }), 'practice')
})

// ConversationPrep is the one model that genuinely splits across two
// surfaces, on a column whose vocabulary has already been renamed once.
test('a communication review is a Look It Over item, including under its old source value', () => {
  assert.equal(surfaceFor({ model: 'conversationPrep', source: 'review' }), 'look_it_over')
  // "review" was called "real" before the communications redesign.
  assert.equal(surfaceFor({ model: 'conversationPrep', source: 'real' }), 'look_it_over')
  assert.equal(surfaceFor({ model: 'conversationPrep', source: null }), 'look_it_over')
})

// Generate Ideas became "ask the coach for a sample plan" — a conversation —
// while the other two lesson-plan modes became document reviews.
test('lesson plans split by mode: a generated sample is a conversation, a reviewed plan is not', () => {
  assert.equal(surfaceFor({ model: 'lessonPlan', mode: 'generated' }), 'talk_it_through')
  assert.equal(surfaceFor({ model: 'lessonPlan', mode: 'feedback' }), 'look_it_over')
  assert.equal(surfaceFor({ model: 'lessonPlan', mode: 'presentation' }), 'look_it_over')
})

// An unrecognized mode must stay reachable rather than falling through to a
// surface nothing filters on.
test('an unknown or missing lesson-plan mode still lands somewhere a teacher can find it', () => {
  assert.equal(surfaceFor({ model: 'lessonPlan', mode: null }), 'look_it_over')
  assert.equal(surfaceFor({ model: 'lessonPlan', mode: 'some_future_mode' }), 'look_it_over')
})

// Redesign for AI use became an action inside an assignment's review result,
// not a surface of its own — so mode must not move the item.
test('both assignment-coach modes are Look It Over items', () => {
  assert.equal(surfaceFor({ model: 'assignmentCoachSession' }), 'look_it_over')
  assert.equal(surfaceFor({ model: 'review' }), 'look_it_over')
})

test('a recorded class period is a Lesson Debrief item', () => {
  assert.equal(surfaceFor({ model: 'audioSession' }), 'lesson_debrief')
})

// --- topic tagging ---

// The four surviving topics keep the exact strings the focus-area axis used,
// which is the reason no stored row needs rewriting. A test rather than a
// comment, because changing one of these four values is a one-character edit
// that silently untags every row a teacher has.
test('a stored focus area is used as the topic verbatim', () => {
  for (const value of [
    'teaching_and_learning',
    'classroom_management',
    'parent_communication',
    'professionalism',
  ]) {
    assert.equal(topicFor({ focusArea: value }), value)
  }
})

// Everything written before the focus-area axis existed has focusArea = null
// and one of the six original behavior categories. Without the fall-back every
// one of those rows shows up untagged.
test('a legacy row with only a behavior category still resolves to a topic', () => {
  for (const category of [
    'defiance',
    'disengagement',
    'peer_conflict',
    'disruption',
    'transitions',
    'technology_misuse',
  ]) {
    assert.equal(
      topicFor({ focusArea: null, category }),
      'classroom_management',
      `legacy category ${category} lost its topic`,
    )
  }
})

// A sub-category from any area resolves, not just the six behavior ones —
// sub-category values are unique platform-wide for exactly this reason.
test('a sub-category from another area resolves to that area', () => {
  assert.equal(topicFor({ category: 'difficult_parent_email' }), 'parent_communication')
  assert.equal(topicFor({ category: 'co_teaching' }), 'professionalism')
  assert.equal(topicFor({ category: 'checking_understanding' }), 'teaching_and_learning')
})

// focusArea wins when both are present: the teacher's own pick, or Claude's
// inference for the row, is more specific than what the category implies.
test('a stored focus area wins over the category it would have been inferred from', () => {
  assert.equal(
    topicFor({ focusArea: 'teaching_and_learning', category: 'defiance' }),
    'teaching_and_learning',
  )
})

// Untagged is a real answer — four of the nine models carry no taxonomy column
// at all — and must not become a wrong tag or a crash.
test('a row with nothing to tag it with comes back untagged rather than guessed', () => {
  assert.equal(topicFor({}), null)
  assert.equal(topicFor({ focusArea: null, category: null }), null)
  assert.equal(topicFor({ category: 'not_a_real_category' }), null)
})
