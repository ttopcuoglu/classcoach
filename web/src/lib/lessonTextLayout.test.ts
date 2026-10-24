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
  assert.deepEqual(readHeading('Hook: What is really there? (5 min)'), { title: 'Hook: What is really there?', minutes: '5' })
  assert.deepEqual(readHeading('Warm-up — 5 minutes'), { title: 'Warm-up', minutes: '5' })
  assert.deepEqual(readHeading('Group work (10-12 min):'), { title: 'Group work', minutes: '10-12' })
  assert.equal(readHeading('Teacher: Give them 5 min'), null)
  assert.equal(readHeading('Students write for a while.'), null)
})

test('prose with no structure stays prose, with short leads set apart', () => {
  const parts = layoutLessonText('During the observation step, circulate and ask pairs to describe.\n\nExit ticket (used as the HOT question): In 2-3 sentences, what did you observe?\n\nA plain paragraph, nothing special.')
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
