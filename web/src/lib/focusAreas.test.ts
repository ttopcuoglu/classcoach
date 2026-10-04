import { expect, test } from 'vitest'
import { FOCUS_AREAS, focusAreaForCategory, focusAreaLabel, subCategoriesFor } from './focusAreas'

// The topic taxonomy is about to grow from four focus areas to seven topics,
// and the whole reason that costs no data migration is that four of the seven
// are these values, unchanged. These tests exist to make that load-bearing
// fact visible: a rename here is a one-character edit with no type error and
// no failing build, and it would untag every row a teacher has.
//
// The server holds the same four values in its own copy of this file
// (server/src/lib/focusAreas.ts) along with the coaching prompt text. The two
// are hand-mirrored, so both sides pin their values independently — a drift
// test that imported across the package boundary would need the server's
// tsconfig, and these are the values that have to agree, not the file.

test('the four stored topic values are exactly these, in this order', () => {
  expect(FOCUS_AREAS.map((a) => a.value)).toEqual([
    'teaching_and_learning',
    'classroom_management',
    'parent_communication',
    'professionalism',
  ])
})

// Teaching and Learning is the one topic that asks about subject, course and
// level, both today and in the consolidated Practice. Several callers branch
// on this exact string.
test('teaching_and_learning is the first topic, which is what the subject fields key off', () => {
  expect(FOCUS_AREAS[0].value).toBe('teaching_and_learning')
})

test('every topic has a teacher-facing label and a short one for chip rows', () => {
  for (const area of FOCUS_AREAS) {
    expect(area.label, `${area.value} has no label`).toBeTruthy()
    expect(area.shortLabel, `${area.value} has no shortLabel`).toBeTruthy()
    expect(area.blurb, `${area.value} has no blurb`).toBeTruthy()
  }
})

// Sub-category values are unique across every area, and that uniqueness is
// what lets a single `category` column identify its own area with no join and
// no backfill. Practice's Kind row is built on these values, so a duplicate
// introduced while reworking those lists would make one Kind resolve to the
// wrong topic.
test('no sub-category value is used by two topics', () => {
  const seen = new Map<string, string>()
  for (const area of FOCUS_AREAS) {
    for (const sub of area.subCategories) {
      const owner = seen.get(sub.value)
      expect(owner, `${sub.value} belongs to both ${owner} and ${area.value}`).toBeUndefined()
      seen.set(sub.value, area.value)
    }
  }
})

// The six original behavior categories predate the focus-area axis entirely.
// Every row written before it exists with focusArea = null and one of these
// six, and this resolution is the only thing that gives those rows a topic.
test('the six original behavior categories still resolve to Classroom Management', () => {
  for (const category of [
    'defiance',
    'disengagement',
    'peer_conflict',
    'disruption',
    'transitions',
    'technology_misuse',
  ]) {
    expect(focusAreaForCategory(category)?.value, `${category} lost its area`).toBe('classroom_management')
  }
})

test('an unknown or missing category resolves to nothing rather than a default', () => {
  expect(focusAreaForCategory('not_a_real_category')).toBeUndefined()
  expect(focusAreaForCategory(null)).toBeUndefined()
  expect(focusAreaForCategory(undefined)).toBeUndefined()
  expect(focusAreaForCategory('')).toBeUndefined()
})

test('a label is returned for a known topic and null for anything else', () => {
  expect(focusAreaLabel('classroom_management')).toBe('Classroom Management')
  expect(focusAreaLabel('something_that_does_not_exist')).toBeNull()
  expect(focusAreaLabel(null)).toBeNull()
})

// No topic selected means Practice may draw from anywhere, so there is
// nothing to scope the Kind row to — an empty list, not every sub-category.
test('no topic yields no sub-categories to choose from', () => {
  expect(subCategoriesFor(null)).toEqual([])
  expect(subCategoriesFor(undefined)).toEqual([])
  expect(subCategoriesFor('not_a_real_topic')).toEqual([])
})

test('a topic yields its own sub-categories', () => {
  const subs = subCategoriesFor('parent_communication')
  expect(subs.length).toBeGreaterThan(0)
  expect(subs.map((s) => s.value)).toContain('difficult_parent_email')
})
