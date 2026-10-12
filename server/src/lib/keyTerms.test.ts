import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countKeyTerms, parseKeyTermLines } from './keyTerms.ts'
import type { Segment } from './audioAnalysis.ts'

const seg = (speakerLabel: 'Teacher' | 'Student', startSec: number, text: string): Segment =>
  ({ speakerLabel, startSec, endSec: startSec + 5, text }) as Segment

test('parses one term per line and drops what is not a term', () => {
  assert.deepEqual(
    parseKeyTermLines('- Photosynthesis\n2. chlorophyll\n"light energy"\nthis is a whole sentence about plants\nNONE'),
    ['Photosynthesis', 'chlorophyll', 'light energy'],
  )
  assert.deepEqual(parseKeyTermLines('NONE'), [])
  assert.deepEqual(parseKeyTermLines(null), [])
})

test('counts teacher and student uses separately, plurals included', () => {
  const segments = [
    seg('Teacher', 0, 'An enzyme speeds up a reaction. Enzymes are proteins.'),
    seg('Student', 10, 'So the enzyme is like a helper?'),
    seg('Teacher', 20, 'Yes, and a coenzyme is something else.'),
  ]
  assert.deepEqual(countKeyTerms(['enzyme'], segments), [{ term: 'enzyme', teacherCount: 2, studentCount: 1 }])
})

test('a term the teacher never said is dropped', () => {
  const segments = [seg('Teacher', 0, 'Plants make their own food.'), seg('Student', 5, 'Is that photosynthesis?')]
  assert.deepEqual(countKeyTerms(['photosynthesis', 'mitochondria'], segments), [])
})

test('a two-word term split across a pause still counts once', () => {
  const segments = [seg('Teacher', 0, 'That is supply and'), seg('Teacher', 4, 'demand, which we met last week.')]
  assert.deepEqual(countKeyTerms(['supply and demand'], segments), [
    { term: 'supply and demand', teacherCount: 1, studentCount: 0 },
  ])
})

test('a plural repeat of a term is not listed twice, and the list is ordered by use', () => {
  const segments = [
    seg('Teacher', 0, 'A ratio compares two amounts. Ratios, ratios, ratios. A fraction is different.'),
    seg('Student', 9, 'ratio'),
  ]
  assert.deepEqual(countKeyTerms(['fraction', 'ratio', 'ratios'], segments), [
    { term: 'ratio', teacherCount: 4, studentCount: 1 },
    { term: 'fraction', teacherCount: 1, studentCount: 0 },
  ])
})
