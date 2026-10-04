import { expect, test } from 'vitest'
import { DEFAULT_TEACHING_CONTEXT, type TeachingContext } from '../components/TeachingContextFields'
import { ASK_STARTERS, TALK_STARTER_COUNT, pickTopicStarters } from './starters'
import { SOMETHING_ELSE, TOPICS } from './topics'

// Starter prompts now carry the job First 30 Days used to do: they are the
// reason a brand-new account has somewhere obvious to begin. That makes an
// empty or short list a real failure — a teacher who opens this page on day
// one and sees a mic and nothing else has been given a blank page.
//
// They also change when a topic chip changes, which is half of what the chip
// is for. The other half (the coach's opening line) lives in the server's
// talkTopicPrompt tests.

function room(over: Partial<TeachingContext> = {}): TeachingContext {
  return { ...DEFAULT_TEACHING_CONTEXT, ...over }
}

test('four prompts are shown, as the hero has room for', () => {
  expect(TALK_STARTER_COUNT).toBe(4)
  expect(pickTopicStarters(null, room())).toHaveLength(4)
})

// The guarantee that matters most: every topic, in every band, fills the list.
test('every topic fills the list in every grade band', () => {
  for (const topic of TOPICS) {
    for (const gradeBand of ['K-2', '3-5', '6-8', '9-12']) {
      const picked = pickTopicStarters(topic.value, room({ gradeBand }))
      expect(picked.length, `${topic.value} in ${gradeBand} offered ${picked.length}`).toBe(
        TALK_STARTER_COUNT,
      )
      for (const text of picked) expect(text.trim(), `${topic.value} in ${gradeBand}`).toBeTruthy()
    }
  }
})

test('no topic still fills the list, for both new and experienced teachers', () => {
  expect(pickTopicStarters(null, room(), false)).toHaveLength(4)
  expect(pickTopicStarters(null, room(), true)).toHaveLength(4)
})

test('prompts are never duplicated within a list', () => {
  for (const topic of [...TOPICS.map((t) => t.value), null]) {
    const picked = pickTopicStarters(topic, room())
    expect(new Set(picked).size, `${topic} repeated a prompt`).toBe(picked.length)
  }
})

// Changing the chip has to visibly change the page, or the chip looks broken.
test('choosing a topic changes the prompts', () => {
  const none = pickTopicStarters(null, room())
  const parents = pickTopicStarters('parent_communication', room())
  const self = pickTopicStarters('self_and_job', room())
  expect(parents).not.toEqual(none)
  expect(self).not.toEqual(parents)
})

test("a topic's prompts come from that topic's own list", () => {
  const picked = pickTopicStarters('student_concern', room())
  const own = new Set(ASK_STARTERS.student_concern.map((s) => s.text))
  for (const text of picked) expect(own.has(text), `"${text}" is not a student_concern starter`).toBe(true)
})

// "Something else" means "I do not want to classify this", so the right
// prompts are the ones that span everything rather than a seventh list.
test('something else falls through to the cross-topic list', () => {
  expect(pickTopicStarters(SOMETHING_ELSE, room())).toEqual(pickTopicStarters(null, room()))
})

test('an unrecognized topic falls through rather than emptying the page', () => {
  expect(pickTopicStarters('not_a_topic', room())).toHaveLength(4)
})

// The room-aware picker is what stops a 2nd grade art teacher and an AP
// Calculus teacher being offered the same four lines.
test('the band changes which prompts come first', () => {
  const early = pickTopicStarters('classroom_management', room({ gradeBand: 'K-2' }))
  const high = pickTopicStarters('classroom_management', room({ gradeBand: '9-12' }))
  expect(early).not.toEqual(high)
})

test('subject-specific prompts only reach Teaching and Learning', () => {
  const teaching = pickTopicStarters('teaching_and_learning', room({ gradeBand: '9-12', subject: 'Math' }))
  expect(teaching.some((t) => /math|procedure|problem/i.test(t))).toBe(true)
  // The same room under a topic that does not ask about subject must not get
  // a prompt that assumes one.
  const parents = pickTopicStarters('parent_communication', room({ gradeBand: '9-12', subject: 'Math' }))
  for (const text of parents) expect(text).not.toContain('{course}')
})

test('no prompt ever leaks an unfilled placeholder', () => {
  for (const topic of [...TOPICS.map((t) => t.value), null]) {
    for (const gradeBand of ['K-2', '3-5', '6-8', '9-12']) {
      for (const text of pickTopicStarters(topic, room({ gradeBand }))) {
        expect(text, `${topic} in ${gradeBand}`).not.toContain('{')
      }
    }
  }
})

// This topic's coaching refuses to speculate about a cause, so its starters
// must not invite the teacher to either — every line is an observation.
test('the student-concern prompts describe what was seen, not what it means', () => {
  const texts = ASK_STARTERS.student_concern.map((s) => s.text.toLowerCase())
  expect(texts.length).toBeGreaterThan(0)
  for (const text of texts) {
    for (const word of ['adhd', 'autis', 'depress', 'abuse', 'neglect', 'diagnos', 'at home', 'parents are']) {
      expect(text, `"${text}" speculates (${word})`).not.toContain(word)
    }
  }
})
