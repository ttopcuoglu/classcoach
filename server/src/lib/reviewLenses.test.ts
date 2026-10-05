import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOC_TYPES, DOC_TYPE_LABELS, LENSES, LENSES_BY_TYPE, RETIRED_LENS_KEYS, REVIEW_LIMITS, allowedLensKeys, defaultLensesFor, detectDocType, evidenceFor, isDocType } from './reviewLenses.ts'

// Look It Over replaced four separate tools, and the only reason that is a
// simplification rather than a four-way menu with extra steps is that the
// teacher never picks a tool — they drop a document and the app says what it
// thinks it is. Two things have to hold for that to be true:
//
//   * detection has to be right often enough to feel like recognition, and
//   * being wrong has to cost one tap, never a dead end.
//
// The lens defaults carry a judgment that is easy to flip by accident and
// hard to notice: AI-completion risk is the right first question for homework
// a student takes away and the wrong one for a quiz sat under supervision.
// Turning it on for a quiz would answer a question nobody asked and imply a
// suspicion the teacher does not have.

test('the eight document types are exactly these', () => {
  assert.deepEqual(
    [...DOC_TYPES],
    ['quiz', 'homework', 'assignment', 'project', 'lesson_plan', 'presentation', 'rubric', 'message'],
  )
})

test('every type has a label and at least one lens', () => {
  for (const type of DOC_TYPES) {
    assert.ok(DOC_TYPE_LABELS[type], `${type} has no label`)
    assert.ok(LENSES_BY_TYPE[type]?.length > 0, `${type} has no lenses`)
  }
})

test('every lens referenced by a type actually exists', () => {
  for (const type of DOC_TYPES) {
    for (const { key } of LENSES_BY_TYPE[type]) {
      assert.ok(LENSES[key], `${type} references unknown lens ${key}`)
    }
  }
})

test('every lens has a label, a blurb and an instruction', () => {
  for (const [key, lens] of Object.entries(LENSES)) {
    assert.equal(lens.key, key, `${key} disagrees with its own key`)
    assert.ok(lens.label, `${key} has no label`)
    assert.ok(lens.blurb, `${key} has no blurb`)
    assert.ok(lens.instruction, `${key} has no instruction`)
  }
})

test('no lens is listed twice for one type', () => {
  for (const type of DOC_TYPES) {
    const keys = LENSES_BY_TYPE[type].map((l) => l.key)
    assert.equal(new Set(keys).size, keys.length, `${type} lists a lens twice`)
  }
})

test('every lens in the table is used by a type, or is deliberately retired', () => {
  const used = new Set(DOC_TYPES.flatMap((t) => LENSES_BY_TYPE[t].map((l) => l.key)))
  for (const key of Object.keys(LENSES)) {
    assert.ok(used.has(key) || RETIRED_LENS_KEYS.includes(key), `${key} is defined but no type uses it`)
  }
})

// A retired lens is only worth keeping if it still resolves: the point is that
// a review stored under it renders its own words rather than a bare key.
test('every retired lens still has its label and blurb', () => {
  for (const key of RETIRED_LENS_KEYS) {
    assert.ok(LENSES[key], `${key} is listed as retired but no longer defined`)
    assert.ok(LENSES[key].label.length > 0, key)
  }
})

// And nothing may quietly offer one again.
test('no type offers a retired lens', () => {
  const used = new Set(DOC_TYPES.flatMap((t) => LENSES_BY_TYPE[t].map((l) => l.key)))
  for (const key of RETIRED_LENS_KEYS) {
    assert.ok(!used.has(key), `${key} is retired but a type still offers it`)
  }
})

// --- the lens defaults the brief specifies ---

test('a quiz opens with the five reading lenses and AI risk off', () => {
  const lenses = defaultLensesFor('quiz')
  const on = lenses.filter((l) => l.on).map((l) => l.key)
  assert.deepEqual(on, [
    'item_purpose',
    'reading_load',
    'answer_choices',
    'standards_coverage',
    'fits_the_period',
  ])
  assert.equal(
    lenses.find((l) => l.key === 'ai_risk')?.on,
    false,
    'AI-completion risk must start off for a quiz — it is sat in the room',
  )
})

test('homework, assignments and projects all open with AI risk on', () => {
  for (const type of ['homework', 'assignment', 'project'] as const) {
    assert.equal(
      defaultLensesFor(type).find((l) => l.key === 'ai_risk')?.on,
      true,
      `${type} must start with AI-completion risk on`,
    )
  }
})

test('a lesson plan opens with the five planning lenses', () => {
  const on = defaultLensesFor('lesson_plan')
    .filter((l) => l.on)
    .map((l) => l.key)
  assert.deepEqual(on, [
    'timing_realism',
    'objective_fit',
    'where_thinking',
    'checks_for_understanding',
    'short_or_long',
  ])
})

// The longest set in the app, deliberately: a deck is the document teachers
// get the least feedback on, and the one where "it looks fine" hides the most.
// The old presentation review covered how the ideas build, the opening and the
// close; those came back as lenses rather than being dropped.
test('a presentation opens with every delivery lens, in reading order', () => {
  const on = defaultLensesFor('presentation')
    .filter((l) => l.on)
    .map((l) => l.key)
  assert.deepEqual(on, [
    'slide_load',
    'ideas_build',
    'opening_hook',
    'where_thinking',
    'engagement_checks',
    'closing_landing',
    'grade_level_fit',
    'legible_from_the_back',
    'speaker_support',
    'how_to_run_it',
    'pacing_period',
  ])
})

test('every type opens with at least one lens on, so no result is empty', () => {
  for (const type of DOC_TYPES) {
    assert.ok(defaultLensesFor(type).some((l) => l.on), `${type} opens with every lens off`)
  }
})

// The defaults are handed out, not shared — a teacher toggling a lens must
// not change what the next review of that type starts with.
test('the defaults are a fresh copy each time', () => {
  const first = defaultLensesFor('quiz')
  first[0].on = false
  assert.equal(defaultLensesFor('quiz')[0].on, true)
})

test('a lens that does not belong to a type is not allowed for it', () => {
  assert.ok(allowedLensKeys('message').includes('clarity'))
  assert.ok(!allowedLensKeys('message').includes('slide_load'))
  assert.ok(!allowedLensKeys('quiz').includes('how_to_run_it'))
})

// --- timing honesty ---

// "Any timing estimate must show its assumption or a range." The two lenses
// that estimate time have to say so in their own instruction, because that is
// the only place the rule can be enforced.
test('the lenses that estimate time ask for a range and its assumption', () => {
  for (const key of ['fits_the_period', 'timing_realism', 'workload']) {
    const instruction = LENSES[key].instruction.toLowerCase()
    assert.ok(instruction.includes('range'), `${key} does not ask for a range`)
    assert.ok(instruction.includes('assum'), `${key} does not ask for its assumption`)
  }
})

// --- the limits ---

test('the stated limits name all three things a document review cannot see', () => {
  const limits = REVIEW_LIMITS.toLowerCase()
  assert.ok(limits.includes('document only'), 'does not say it read only the document')
  assert.ok(limits.includes('students'), 'does not say it has not met the students')
  assert.ok(limits.includes('last week'), 'does not say it does not know last week')
  assert.ok(limits.includes('out loud'), 'does not say it cannot hear the teacher')
})

// --- detection ---

test('a quiz is recognized from its own furniture', () => {
  const quiz = `Name: __________  Date: ______  Period: ___

Unit 4 Quiz — Cell Biology  (20 points)

1. Which organelle produces most of a cell's ATP?
   a) nucleus
   b) mitochondrion
   c) ribosome
   d) vacuole

2. Circle the best answer. Photosynthesis takes place in the
   a) mitochondrion
   b) chloroplast
   c) nucleus
   d) cell wall`
  const detected = detectDocType(quiz)
  assert.equal(detected.docType, 'quiz')
  assert.equal(detected.confident, true)
})

test('a lesson plan is recognized from its structure', () => {
  const plan = `Lesson Plan — Tuesday
Standard: HS-LS1-5
Objective: SWBAT explain how light energy is converted to chemical energy.

Do Now (5 minutes): students answer the warm-up on the board.
I Do (10 minutes): model the light-dependent reactions.
We Do (15 minutes): guided practice in pairs.
You Do (10 minutes): independent diagram.
Closure (5 minutes): exit ticket.`
  const detected = detectDocType(plan)
  assert.equal(detected.docType, 'lesson_plan')
  assert.equal(detected.confident, true)
})

test('a message is recognized from how it opens and closes', () => {
  const email = `Dear Mrs. Alvarez,

Thank you for reaching out about your son's progress this quarter. I wanted to
follow up on what we discussed and share what I have been seeing in class.

Kind regards,
Mr. Chen`
  const detected = detectDocType(email)
  assert.equal(detected.docType, 'message')
  assert.equal(detected.confident, true)
})

test('homework is distinguished from a quiz despite both being numbered', () => {
  const hw = `Homework — Problem Set 3
Due tomorrow.

1. Factor completely: x^2 - 9
2. Factor completely: 2x^2 + 7x + 3
3. Explain in a sentence why the first one is a difference of squares.`
  assert.equal(detectDocType(hw).docType, 'homework')
})

test('a project is recognized from its milestones', () => {
  const project = `Semester Project: Local Water Quality
Group project, 4 weeks.

Rubric attached. Milestones:
Week 1 — proposal and group roles
Week 2 — data collection
Week 3 — analysis
Week 4 — deliverables and presentation`
  assert.equal(detectDocType(project).docType, 'project')
})

// The file format is a fact, not a signal — a .pptx whose text happens to
// read like a lesson plan is still a deck.
test('a .pptx is a presentation whatever its words say', () => {
  const planLikeDeck = `Lesson Plan
Objective: SWBAT describe the water cycle.
Do Now (5 minutes)
I Do / We Do / You Do
Closure`
  assert.equal(detectDocType(planLikeDeck).docType, 'lesson_plan', 'baseline: reads as a plan')
  assert.equal(detectDocType(planLikeDeck, 'unit-3.pptx').docType, 'presentation')
})

test('slide markers are recognized even without the extension', () => {
  const deck = `Slide 1
The Water Cycle

Slide 2
Evaporation

Slide 3
Condensation`
  assert.equal(detectDocType(deck).docType, 'presentation')
})

// Never a dead end: an unreadable document still gets a type, because the
// confirmation strip asks either way and "Looks like an assignment — right?"
// is a better opening than "What is this?".
test('text with no signals still gets a type, flagged as unconfident', () => {
  const detected = detectDocType('The quick brown fox jumped over the lazy dog.')
  assert.ok((DOC_TYPES as readonly string[]).includes(detected.docType))
  assert.equal(detected.confident, false)
})

test('empty text does not throw and is never confident', () => {
  for (const text of ['', '   ', '\n\n']) {
    const detected = detectDocType(text)
    assert.ok((DOC_TYPES as readonly string[]).includes(detected.docType))
    assert.equal(detected.confident, false)
  }
})

// A near-tie is exactly when the teacher should be asked properly, so it must
// not be reported as a confident guess.
test('a document that reads as two things at once is not confident', () => {
  const ambiguous = `Assignment / Quiz
Instructions: answer the questions below.
1. What is a cell?
2. What is a nucleus?`
  assert.equal(detectDocType(ambiguous).confident, false)
})

test('detection only reads the head of a long document', () => {
  // A quiz with a very long tail must still be detected from its opening,
  // and must not get slower in proportion to length.
  const quiz = `Unit Quiz\nName: _______\n1. a) b) c) d)\n` + 'filler text. '.repeat(20000)
  const started = Date.now()
  assert.equal(detectDocType(quiz).docType, 'quiz')
  assert.ok(Date.now() - started < 200, 'detection scanned more than the head')
})

test('isDocType accepts the seven and rejects everything else', () => {
  for (const type of DOC_TYPES) assert.equal(isDocType(type), true, type)
  for (const value of ['', 'essay', 'Quiz', null, undefined, 3]) {
    assert.equal(isDocType(value), false, String(value))
  }
})

// --- why it guessed that ---

// "Looks like a quiz — right?" is easier to answer when it says what it saw.
// Reasons are also what make a wrong guess obviously wrong rather than
// mysteriously wrong, which is the difference between a teacher correcting it
// and a teacher wondering what the app thinks it is reading.
test('detection says what in the document pointed at the type', () => {
  const quiz = detectDocType('1. What is osmosis?\n2. Define diffusion.\na) water b) salt', 'quiz.docx')
  assert.equal(quiz.docType, 'quiz')
  assert.ok(quiz.evidence.length > 0, 'a confident guess should say why')
  // Real signals, not invented ones.
  for (const reason of quiz.evidence) {
    assert.equal(typeof reason, 'string')
    assert.ok(reason.length > 0)
  }
})

// Two at most: the strip is one line under a heading, not a report.
test('at most two reasons are given, strongest first', () => {
  const text = 'Dear Mrs. Alvarez,\n\nSubject: your son\n\nBest regards,\nMr. Patel'
  const detected = detectDocType(text)
  assert.equal(detected.docType, 'message')
  assert.ok(detected.evidence.length <= 2)
  // The greeting is the strongest message signal in the table, so it leads.
  assert.equal(detected.evidence[0], 'a greeting')
})

// The reasons explain the type asked about, not whichever one scored highest —
// a teacher who corrects the guess should see why THEIR answer fits.
test('evidence can be asked for a type that did not win', () => {
  const text = '1. What is osmosis?\n2. Define diffusion.'
  assert.ok(evidenceFor(text, 'quiz').includes('numbered items'))
  assert.deepEqual(evidenceFor(text, 'presentation'), [])
})

// A document that matched nothing is exactly the one whose guess was weak, so
// there is nothing honest to say about it.
test('a document with no signals offers no reasons', () => {
  const detected = detectDocType('aaaa bbbb cccc')
  assert.deepEqual(detected.evidence, [])
})

// --- the presentation set ---

// A deck is the document teachers get the least feedback on, and the one
// where "it looks fine" hides the most. The old presentation review covered
// how the ideas build, the opening and the close; those are lenses now rather
// than things the consolidation quietly dropped.
test('presentation covers the parts the old review covered', () => {
  const keys = defaultLensesFor('presentation').map((l) => l.key)
  for (const key of ['ideas_build', 'opening_hook', 'closing_landing', 'engagement_checks', 'speaker_support']) {
    assert.ok(keys.includes(key), `presentation is missing ${key}`)
  }
  // All of them on: nothing is asked, so nothing is held back.
  assert.ok(defaultLensesFor('presentation').every((l) => l.on))
})

// Every lens has to tell the model what to look for, or the section it
// produces is the lens's name restated.
test('every lens instruction asks for something specific', () => {
  for (const [key, lens] of Object.entries(LENSES)) {
    assert.ok(lens.instruction.length > 120, `${key}'s instruction is too thin to produce a finding`)
    assert.ok(lens.blurb.length > 0, `${key} has no blurb, which is the report's subtitle`)
  }
})
