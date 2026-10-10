import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HARD_LOOK_SECTIONS,
  parseHardLook,
  sectionEligibility,
  unaccountedSections,
} from './hardLook.ts'
import type { RubricEvidenceItem } from './rubricLens.ts'

// The Hard Look is the one part of this report that tells a teacher they fell
// short, so the rules that keep it honest are worth more than its wording:
// a criticism with nothing behind it must never reach a teacher, and a section
// nobody could judge fairly must never be reported as fine.

const items: RubricEvidenceItem[] = [
  { kind: 'Recall question', timestampSec: 60, text: 'What year was it?' },
  { kind: 'General praise', timestampSec: 120, text: 'Good.' },
  { kind: 'Redirection', timestampSec: 180, text: 'Eyes up here.' },
]

function critiqueBlock(section: string, evidence: string, body = 'The case, at length.') {
  return `<critique><section>${section}</section><evidence>${evidence}</evidence>` +
    `<headline>A blunt line.</headline><case>${body}</case>` +
    `<likely_cost>Probably cost something.</likely_cost></critique>`
}

test('a criticism quoting a moment keeps the quote, by number', () => {
  const parsed = parseHardLook(critiqueBlock('questions', '1, 3'), items)
  assert.equal(parsed.critiques.length, 1)
  assert.deepEqual(
    parsed.critiques[0].evidence.map((e) => e.timestampSec),
    [60, 180],
  )
})

test('a criticism resting on a count is kept, with no quote', () => {
  // The strongest thing to say about talk — two thirds of the airtime, six
  // unbroken minutes — has no single sentence to quote. Requiring one made the
  // model drop the section rather than source a claim it could not.
  const parsed = parseHardLook(
    critiqueBlock('talk', '', 'You took 66% of the airtime and ran 6 minutes unbroken.'),
    items,
  )
  assert.equal(parsed.critiques.length, 1)
  assert.deepEqual(parsed.critiques[0].evidence, [])
})

test('a criticism with neither a quote nor a number is thrown away', () => {
  const parsed = parseHardLook(critiqueBlock('talk', '', 'You talked rather a lot of the time.'), items)
  assert.deepEqual(parsed.critiques, [])
  // And the section then reads as unaccounted, so the route retries rather
  // than showing the teacher an unsourced accusation or a false all-clear.
  assert.deepEqual(unaccountedSections(parsed, HARD_LOOK_SECTIONS), [
    'talk',
    'questions',
    'content',
    'routines',
  ])
})

test('a moment number that does not exist is dropped, not invented', () => {
  const parsed = parseHardLook(critiqueBlock('questions', '9, 2'), items)
  assert.deepEqual(parsed.critiques[0].evidence.map((e) => e.timestampSec), [120])
})

test('a section cannot be both criticised and cleared', () => {
  const text =
    critiqueBlock('routines', '3') +
    '<clear><section>routines</section><reason>Nothing to say.</reason></clear>'
  const parsed = parseHardLook(text, items)
  assert.equal(parsed.critiques.length, 1)
  assert.deepEqual(parsed.cleared, [])
})

test('an all-clear parses as four clears, and accounts for every section', () => {
  const text = HARD_LOOK_SECTIONS.map(
    (s) => `<clear><section>${s.key}</section><reason>Looks fine on the audio.</reason></clear>`,
  ).join('')
  const parsed = parseHardLook(text, items)
  assert.equal(parsed.cleared.length, 4)
  assert.deepEqual(unaccountedSections(parsed, HARD_LOOK_SECTIONS), [])
})

test('critiques come back in the sections’ own order, not the model’s', () => {
  const text = critiqueBlock('routines', '3') + critiqueBlock('talk', '', 'Ran 6 minutes unbroken.')
  const parsed = parseHardLook(text, items)
  assert.deepEqual(parsed.critiques.map((c) => c.section), ['talk', 'routines'])
})

// --- what the model never gets asked about

const fullMetrics = {
  totalDurationSec: 1200,
  teacherTalkSec: 600,
  studentTalkSec: 180,
  studentVoiceSegments: 12,
  directiveCount: 4,
  transitionCount: 3,
  redirectionCount: 2,
}
const fullContent = { statedObjective: { found: true }, vocabulary: [{}], connections: [{}] }

test('a lesson with evidence everywhere is judged on all four sections', () => {
  const { eligible, withheld } = sectionEligibility({
    durationSec: 1200,
    metricsDetail: fullMetrics,
    questionLog: [{}, {}, {}, {}],
    lessonContent: fullContent,
  })
  assert.deepEqual(eligible.map((s) => s.key), ['talk', 'questions', 'content', 'routines'])
  assert.deepEqual(withheld, [])
})

test('talk is withheld when the microphone caught little of the room', () => {
  // The real case this was built for: 11% teacher and 2% students over 33
  // minutes. Asked anyway, the model faulted a teacher because students
  // "barely spoke" — a sentence about a microphone, not about a lesson.
  const { eligible, withheld } = sectionEligibility({
    durationSec: 2000,
    metricsDetail: { ...fullMetrics, totalDurationSec: 2000, teacherTalkSec: 220, studentTalkSec: 40 },
    questionLog: [{}, {}, {}],
    lessonContent: fullContent,
  })
  assert.ok(!eligible.some((s) => s.key === 'talk'))
  const talk = withheld.find((w) => w.section === 'talk')
  assert.match(talk!.reason, /limit of the recording/)
})

test('a section with too little of its own evidence is withheld, never cleared as fine', () => {
  const { eligible, withheld } = sectionEligibility({
    durationSec: 1200,
    metricsDetail: { ...fullMetrics, directiveCount: 0, transitionCount: 0, redirectionCount: 0 },
    questionLog: [{}],
    lessonContent: {},
  })
  assert.deepEqual(eligible.map((s) => s.key), ['talk'])
  assert.deepEqual(withheld.map((w) => w.section), ['questions', 'content', 'routines'])
  // Each one says why, and none of them says the lesson was good there.
  for (const w of withheld) assert.ok(w.reason.length > 20)
  assert.match(withheld.find((w) => w.section === 'routines')!.reason, /No directions, transitions/)
})

test('withholding a section also removes it from what the model must account for', () => {
  const { eligible } = sectionEligibility({
    durationSec: 1200,
    metricsDetail: fullMetrics,
    questionLog: [],
    lessonContent: fullContent,
  })
  const parsed = parseHardLook(
    critiqueBlock('talk', '', 'Ran 6 minutes unbroken.') +
      critiqueBlock('content', '1') +
      `<clear><section>routines</section><reason>Orderly on the audio.</reason></clear>`,
    items,
  )
  // `questions` was never asked about, so its silence is not a failure.
  assert.deepEqual(unaccountedSections(parsed, eligible), [])
})
