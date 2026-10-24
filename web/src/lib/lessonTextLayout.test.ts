import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLessonText, readHeading, splitLead, splitQuotes, type LessonActivity } from './lessonTextLayout.ts'

const SAMPLE = `Explore: Comparing specimens (10 min)
Teacher: In pairs, give students 2 more unlabeled images. Ask: "What shapes or structures repeat across these images?" Circulate and listen.
Students: Pairs examine the new images and prepare one observation to share.

Share out and name the pattern (6 min)
Teacher: Collect noticings on the board.
Students: Students build on or respectfully disagree with what's shared.`

test('activity titles with minutes, and Teacher / Students lines, become structure', () => {
  const parts = layoutLessonText(SAMPLE)
  assert.equal(parts.length, 2)
  const [a, b] = parts as LessonActivity[]
  assert.equal(a.t, 'activity')
  assert.equal(a.title, 'Explore: Comparing specimens')
  assert.equal(a.minutes, '10')
  assert.deepEqual(a.rows.map((r) => [r.role, r.label]), [['teacher', 'Teacher'], ['students', 'Students']])
  assert.equal(b.title, 'Share out and name the pattern')
  assert.equal(b.minutes, '6')
})

test('heading forms teachers and models write', () => {
  assert.deepEqual(readHeading('Hook: What is really there? (5 min)'), { title: 'Hook: What is really there?', minutes: '5', rest: null })
  assert.deepEqual(readHeading('Warm-up — 5 minutes'), { title: 'Warm-up', minutes: '5', rest: null })
  assert.deepEqual(readHeading('Group work (10-12 min):'), { title: 'Group work', minutes: '10-12', rest: null })
  assert.equal(readHeading('Teacher: Give them 5 min'), null)
  assert.equal(readHeading('Students write for a while.'), null)
})

test('prose with no structure stays prose, with short leads set apart', () => {
  const parts = layoutLessonText('During the observation step, circulate and ask pairs to describe.\n\nExpected (from the lab): In 2-3 sentences, what did you observe?\n\nA plain paragraph, nothing special.')
  assert.equal(parts.length, 1)
  assert.equal(parts[0].t, 'prose')
  const blocks = parts[0].t === 'prose' ? parts[0].blocks : []
  assert.deepEqual(blocks[0], { t: 'lead', lead: 'During the observation step,', text: 'circulate and ask pairs to describe.' })
  assert.equal(blocks[1].t, 'lead')
  assert.deepEqual(blocks[2], { t: 'p', text: 'A plain paragraph, nothing special.' })
})

test('a lead never swallows a sentence or a quote', () => {
  assert.equal(splitLead('He said: "go now" and left.').t, 'p')
  assert.equal(splitLead('This is a long sentence that runs well past seventy characters before it has a colon: here').t, 'p')
})

test("a teacher's quoted words are set apart", () => {
  assert.deepEqual(splitQuotes('Ask: "Does anyone want to add on?" Then wait.'), [
    { text: 'Ask: ', quote: false },
    { text: '"Does anyone want to add on?"', quote: true },
    { text: ' Then wait.', quote: false },
  ])
  assert.deepEqual(splitQuotes('No quotes here.'), [{ text: 'No quotes here.', quote: false }])
})

test('nothing in, nothing out', () => {
  assert.deepEqual(layoutLessonText(''), [])
  assert.deepEqual(layoutLessonText(null), [])
})

test('a header form ("Teacher:", "Date:", "Period:") is not read as lesson lines', () => {
  const parts = layoutLessonText('Teacher:\nDate:\nPeriod: Science, 7th')
  assert.equal(parts.length, 1)
  assert.equal(parts[0].t, 'prose')
  const short = layoutLessonText('Teacher: Ms. Rivera')
  assert.equal(short[0].t, 'prose')
})

test('a single quoted term is not styled as something to say aloud', () => {
  assert.deepEqual(splitQuotes('without naming them "cells" yet'), [{ text: 'without naming them "cells" yet', quote: false }])
})

test('other labels are bold lead-ins, the same in and out of an activity', () => {
  const parts = layoutLessonText('Support: a sentence starter for the prediction.\nStretch: predict what a larger molecule would do.')
  assert.equal(parts[0].t, 'prose')
  const blocks = parts[0].t === 'prose' ? parts[0].blocks : []
  assert.deepEqual(blocks.map((b) => (b.t === 'lead' ? b.lead : b.t)), ['Support:', 'Stretch:'])
  const inside = layoutLessonText('Lab (10 min)\nTeacher: Circulate and ask each pair what they saw.\nLook for: pairs who predict first.')[0] as LessonActivity
  assert.deepEqual(inside.notes, [{ t: 'lead', lead: 'Look for:', text: 'pairs who predict first.' }])
})

test('I Do / We Do / You Do and other lesson parts start activities, with or without minutes', () => {
  const parts = layoutLessonText(`I Do: Modeling (8 min)
T: Solve the first problem aloud, naming each step as you go.
We Do
Teacher: Work problem two together, asking a student to name each step.
Students: Name the next step and say why it comes next.
You Do: Students solve three problems on their own and check with a partner.
Exit Ticket:
Students: Solve one problem and explain the first step.`) as LessonActivity[]
  assert.deepEqual(parts.map((p) => [p.title, p.minutes, p.phase]), [
    ['I Do: Modeling', '8', 'i'],
    ['We Do', null, 'we'],
    ['You Do', null, 'you'],
    ['Exit Ticket', null, null],
  ])
  assert.deepEqual(parts[0].rows.map((r) => r.role), ['teacher'])
  assert.deepEqual(parts[1].rows.map((r) => r.role), ['teacher', 'students'])
  assert.equal(parts[2].rows[0]?.role, 'students', 'the sentence after You Do: names who does it')
  assert.deepEqual(parts[3].rows.map((r) => r.role), ['students'])
})

test('a sentence that starts like a phase name is not a heading', () => {
  assert.equal(readHeading('Explain why a cell membrane lets some things through.'), null)
  assert.equal(readHeading('Hook students with a short video.'), null)
  assert.deepEqual(readHeading('Do Now'), { title: 'Do Now', minutes: null, rest: null })
  assert.deepEqual(readHeading('Warm-up: Number talk'), { title: 'Warm-Up: Number talk', minutes: null, rest: null })
})

test('shorthand and other ways of writing who does what', () => {
  const [a] = layoutLessonText('Teacher actions: Model the first problem aloud.\nStudent actions: Copy the steps into notes.\nSs: Turn and tell a partner.') as LessonActivity[]
  assert.deepEqual(a.rows.map((r) => [r.role, r.label]), [['teacher', 'Teacher'], ['students', 'Students'], ['students', 'Students']])
  assert.equal(layoutLessonText('s: lowercase is not a role, it is prose here')[0].t, 'prose')
})

test('an objective that starts with Students stays prose outside an activity', () => {
  assert.equal(layoutLessonText('Students will be able to explain why a membrane is selective.')[0].t, 'prose')
})

test('a two-word term in quotes is not a line to say', () => {
  assert.equal(splitQuotes('Introduce "selectively permeable". Connect it back.').some((p) => p.quote), false)
  assert.equal(splitQuotes('Ask: "Why?" and wait.').some((p) => p.quote), true)
})
