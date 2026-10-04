import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectSections, estimateMinutes, isLongDocument, sliceSection } from './documentSections.ts'

function pages(n: number): string {
  return Array.from({ length: n * 30 }, (_, i) => `Line ${i} of ordinary prose about the topic at hand.`).join('\n')
}

// "Long documents are accepted. What changes is how much gets reviewed at
// once." The threshold decides when a teacher is ASKED, so being wrong in
// either direction costs something: too low and every packet triggers a
// question, too high and a 50-page review quietly becomes mush.

test('an ordinary document is not long', () => {
  assert.equal(isLongDocument('1. What is osmosis?\n2. Define diffusion.', 2, 'quiz'), false)
  assert.equal(isLongDocument(pages(10), 10, 'assignment'), false)
})

test('past thirty pages it is', () => {
  assert.equal(isLongDocument(pages(40), 40, 'assignment'), true)
})

// The extractor does not always know the page count, so the text stands in.
test('a document with no page count is measured by its text', () => {
  assert.equal(isLongDocument(pages(40), null, 'assignment'), true)
  assert.equal(isLongDocument(pages(3), null, 'assignment'), false)
})

test('slides are counted as slides, not pages', () => {
  const deck = Array.from({ length: 70 }, (_, i) => `Slide ${i + 1}\nA line of content.`).join('\n')
  assert.equal(isLongDocument(deck, null, 'presentation'), true)
  const shortDeck = Array.from({ length: 20 }, (_, i) => `Slide ${i + 1}\nA line.`).join('\n')
  assert.equal(isLongDocument(shortDeck, null, 'presentation'), false)
})

test('a big spreadsheet is long by its rows', () => {
  const sheet = Array.from({ length: 2500 }, (_, i) => `${i},alpha,beta,gamma`).join('\n')
  assert.equal(isLongDocument(sheet, null, 'assignment'), true)
})

// --- the parts on offer ---

test('headings become the sections a teacher is offered', () => {
  const doc = ['Unit 1 Cells', pages(2), 'Unit 2 Transport', pages(2), 'Unit 3 Energy', pages(2)].join('\n')
  const sections = detectSections(doc, 'assignment')
  assert.equal(sections.length, 3)
  assert.match(sections[0].label, /Unit 1 Cells/)
  // Page ranges, because that is the form a teacher thinks in.
  assert.match(sections[0].label, /p\. \d/)
})

test('the slice of a section is that section', () => {
  const doc = ['Unit 1 Cells', 'alpha content', 'Unit 2 Transport', 'beta content'].join('\n')
  const sections = detectSections(doc, 'assignment')
  assert.equal(sections.length, 2)
  assert.match(sliceSection(doc, sections[0]), /alpha content/)
  assert.ok(!sliceSection(doc, sections[0]).includes('beta content'))
})

// Nobody wants to choose between sixty parts, and one slide is not a unit of
// review.
test('slides are grouped rather than offered one at a time', () => {
  const deck = Array.from({ length: 60 }, (_, i) => `Slide ${i + 1}\nContent.`).join('\n')
  const sections = detectSections(deck, 'presentation')
  assert.ok(sections.length <= 6, `expected a handful of groups, got ${sections.length}`)
  assert.ok(sections.length >= 2)
})

// A wall of prose genuinely has no parts. Inventing some would offer a teacher
// a choice between arbitrary slices of their own document.
test('a document with no headings offers nothing to choose', () => {
  assert.deepEqual(detectSections(pages(40), 'assignment'), [])
})

test('one heading is not a choice', () => {
  assert.deepEqual(detectSections(['Unit 1 Cells', pages(2)].join('\n'), 'assignment'), [])
})

test('sheet tabs are sections', () => {
  const book = ['Sheet: Period 1', 'a,b,c', 'Sheet: Period 2', 'd,e,f'].join('\n')
  const sections = detectSections(book, 'assignment')
  assert.equal(sections.length, 2)
  assert.match(sections[0].label, /Period 1/)
})

// Said before it starts, not after.
test('the estimate is a range', () => {
  const [low, high] = estimateMinutes(60_000)
  assert.ok(low >= 1)
  assert.ok(high > low)
})
