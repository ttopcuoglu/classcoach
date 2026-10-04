import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildGreetingBlock,
  buildHandoffContextBlock,
  buildTopicBlock,
  buildTopicGreetingBlock,
  kindFromRequest,
  topicFromRequest,
} from './talkTopicPrompt.ts'
import { SOMETHING_ELSE, TOPICS, TOPIC_FOLLOWS_THE_WORDS, findTopic } from './topics.ts'

// The topic chip has one rule that matters more than the rest of the feature:
// it decides where the coach OPENS and nothing after that. A teacher who taps
// "Classroom Management" and then talks about a parent email has to be
// answered about the parent email.
//
// That rule lives only in prompt text, so it can only be checked as prompt
// text. These tests are deliberately about wording — a refactor that keeps
// the function signatures and drops the restraint would leave a feature that
// looks finished and quietly argues with teachers about what they came to
// talk about.

test('a chosen topic names the stance and the topic itself', () => {
  const block = buildTopicBlock(findTopic('parent_communication'))
  assert.ok(block.includes('Parent Communication'), 'the topic is not named')
  assert.ok(block.includes('coach who helps teachers communicate with parents'), 'the stance is missing')
})

// The whole point. Without this the chip becomes a filter.
test("every topic's block tells the coach to follow the teacher's words and never steer back", () => {
  for (const topic of TOPICS) {
    if (topic.value === SOMETHING_ELSE) continue
    const block = buildTopicBlock(topic)
    assert.ok(block.includes('where to BEGIN'), `${topic.value}: not framed as a starting point`)
    assert.ok(
      block.includes('does not limit what you may hear'),
      `${topic.value}: the chip is not stopped from filtering`,
    )
    assert.ok(block.includes('follow their words'), `${topic.value}: the coach is not told to follow`)
    assert.ok(block.includes('never steer back'), `${topic.value}: the coach may steer back`)
  }
})

// A topic's safety limits have to travel with it on every turn, not just the
// first — which means they have to be in this block, because this block is
// what later turns re-apply.
test("every topic's block carries its safety limits", () => {
  for (const topic of TOPICS) {
    if (topic.value === SOMETHING_ELSE) continue
    assert.ok(
      buildTopicBlock(topic).includes(topic.safety),
      `${topic.value}: safety limits are not in the block`,
    )
  }
})

test('the student-concern block carries the no-diagnosis and escalation limits', () => {
  const block = buildTopicBlock(findTopic('student_concern')).toLowerCase()
  assert.ok(block.includes('never speculate about a diagnosis'), 'diagnosis is not ruled out')
  assert.ok(block.includes("student's home"), "the student's home is not ruled out")
  assert.ok(block.includes('mandated-reporter'), 'the mandated-reporter route is not named')
})

test('the me-and-this-job block carries the stop-coaching threshold', () => {
  const block = buildTopicBlock(findTopic('self_and_job')).toLowerCase()
  assert.ok(block.includes('bigger than a hard week'), 'the threshold is not named')
  assert.ok(block.includes('stop coaching'), 'the coach is not told to stop')
  assert.ok(block.includes('do not offer a tactic instead'), 'a tactic may still be substituted')
})

// "Something else" is the chip a teacher taps to say "do not assume
// anything". A block of assumptions would inverts its meaning, so it gets
// none at all.
test('something else adds nothing to the prompt', () => {
  assert.equal(buildTopicBlock(findTopic(SOMETHING_ELSE)), '')
})

test('no topic adds nothing to the prompt', () => {
  assert.equal(buildTopicBlock(null), '')
})

// --- the opening line ---

test("a chosen topic opens with that topic's own question", () => {
  const block = buildTopicGreetingBlock(findTopic('student_concern'), 'Dana')
  assert.ok(block.includes('Tell me what you have noticed.'), "the topic's opener is missing")
  assert.ok(block.includes('Dana'), 'the teacher is not greeted by name')
})

test('every real topic has an opener that reaches the greeting', () => {
  for (const topic of TOPICS) {
    if (topic.value === SOMETHING_ELSE) continue
    assert.ok(
      buildTopicGreetingBlock(topic, null).includes(topic.opener),
      `${topic.value}: opener does not reach the greeting`,
    )
  }
})

// The coach knows the subject the teacher picked and nothing else. Inventing
// a situation from a chip is the failure this sentence prevents.
test('the opening is told it knows the subject but not what happened', () => {
  const block = buildTopicGreetingBlock(findTopic('classroom_management'), null)
  assert.ok(block.includes('no advice yet'), 'advice is not held back')
  assert.ok(
    block.includes('you know the subject they picked, not what happened'),
    'the coach is not stopped from inventing a situation',
  )
})

test('no topic falls back to the open greeting, unchanged', () => {
  assert.equal(buildTopicGreetingBlock(null, 'Dana'), buildGreetingBlock('Dana'))
  assert.equal(buildTopicGreetingBlock(findTopic(SOMETHING_ELSE), null), buildGreetingBlock(null))
})

test('the open greeting still invites the teacher to say what is on their mind', () => {
  const block = buildGreetingBlock(null)
  assert.ok(block.includes('what is on their mind'), 'the open invitation is gone')
  assert.ok(block.includes('no advice yet'), 'advice is not held back')
})

// --- what a client may send ---

// An unrecognized chip must not fail a conversation. Opening with no
// assumption is always a valid thing to do, so junk degrades to that.
test('an unrecognized or missing topic is treated as no topic, never an error', () => {
  assert.equal(topicFromRequest(undefined), null)
  assert.equal(topicFromRequest(null), null)
  assert.equal(topicFromRequest(''), null)
  assert.equal(topicFromRequest('not_a_topic'), null)
  assert.equal(topicFromRequest(42), null)
  assert.equal(topicFromRequest({ value: 'professionalism' }), null)
})

test('each of the seven topic values is accepted', () => {
  for (const topic of TOPICS) {
    assert.equal(topicFromRequest(topic.value)?.value, topic.value)
  }
})

// --- arriving from another surface ---

// The handoff context is what replaces Lesson Debrief's Reflect tab: the
// report travels into Talk It Through instead of a second conversation
// surface existing inside one recording.
//
// The risk it introduces is a coach that opens by reading measurements aloud.
// A teacher who presses "talk this through" wants a colleague, not a results
// readout, so the fencing around the facts is the part worth pinning.
test('arriving context is framed as background the coach may use, not recite', () => {
  const block = buildHandoffContextBlock('Teacher talk 78%. Student talk 9%.')
  assert.ok(block.includes('Teacher talk 78%'), 'the facts do not reach the prompt')
  assert.ok(block.includes('come here from somewhere else'), 'the arrival is not explained')
  assert.ok(block.includes('Do not read it back'), 'the coach may recite the report')
  assert.ok(block.includes('do not treat it as a judgment'), 'the report may be taken as a verdict')
  assert.ok(block.includes('only background'), 'the context may outrank what the teacher says')
})

// What one recording could measure is not what the lesson was worth, and the
// prompt has to say so — the numbers arrive with no hedging of their own.
test('arriving context says plainly what the report is and is not', () => {
  const block = buildHandoffContextBlock('Four questions, average wait time 1.2 seconds.').toLowerCase()
  assert.ok(block.includes('one recording could measure'), 'the limits of the report are not stated')
})

test('no context adds nothing to the prompt', () => {
  assert.equal(buildHandoffContextBlock(null), '')
  assert.equal(buildHandoffContextBlock(undefined), '')
  assert.equal(buildHandoffContextBlock(''), '')
  assert.equal(buildHandoffContextBlock('   '), '')
})

// A pasted report, a long transcript, a teacher who found the field — the
// block is capped so it cannot crowd out the actual conversation.
test('arriving context is capped rather than trusted to be short', () => {
  const huge = 'x'.repeat(10_000)
  assert.ok(buildHandoffContextBlock(huge).length < 3_000)
})

// --- the kind of moment, within the topic ---

test('a kind narrows the topic block without becoming a second subject', () => {
  const topic = findTopic('classroom_management')!
  const kind = kindFromRequest(topic, 'technology_misuse')!
  const block = buildTopicBlock(topic, kind)
  assert.match(block, /Phones and devices/)
  // The topic is still the subject and the chip still gives its authority
  // back — a teacher who narrows and then talks about something else is
  // answered about the something else.
  assert.match(block, /Classroom Management/)
  assert.ok(block.includes(TOPIC_FOLLOWS_THE_WORDS))
})

test('no kind leaves the topic block exactly as it was', () => {
  const topic = findTopic('classroom_management')!
  assert.equal(buildTopicBlock(topic), buildTopicBlock(topic, null))
})

test('the greeting asks the topic question about the narrower thing', () => {
  const topic = findTopic('parent_communication')!
  const kind = kindFromRequest(topic, 'grade_dispute')!
  const block = buildTopicGreetingBlock(topic, 'Dana', kind)
  assert.match(block, /grade dispute/i)
  // Still the topic's own opener, not a per-kind one.
  assert.ok(block.includes(topic.opener))
})

// A stale client, or a crafted request, must not pair a kind with a topic it
// does not belong to — that would describe a teacher's choice back to them
// wrongly.
test('a kind from another topic is dropped, not honoured', () => {
  const topic = findTopic('parent_communication')!
  assert.equal(kindFromRequest(topic, 'technology_misuse'), null)
  assert.equal(kindFromRequest(topic, 'nonsense'), null)
  assert.equal(kindFromRequest(null, 'grade_dispute'), null)
  assert.equal(kindFromRequest(topic, 42), null)
})

// "Something else" means "do not assume anything", so it has no kinds and
// cannot be narrowed.
test('something else cannot be narrowed', () => {
  const topic = findTopic('something_else')!
  assert.equal(topic.kinds.length, 0)
  assert.equal(kindFromRequest(topic, 'anything'), null)
  assert.equal(buildTopicBlock(topic, null), '')
})
