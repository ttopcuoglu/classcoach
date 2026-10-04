import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combineFiles, describeFileSet, MAX_FILES_PER_REVIEW, primaryType } from './reviewFileSet.ts'

// Criterion 4: "An assignment and its rubric uploaded together produce a
// single review that checks them against each other." What a teacher wants
// from two files is the comparison, which is exactly what they cannot get by
// reviewing each separately.

test('one file is its own text, unheaded', () => {
  assert.equal(combineFiles([{ text: '1. What is osmosis?' }]), '1. What is osmosis?')
})

// Without the names, an edit anchored in the rubric and one anchored in the
// assignment are indistinguishable, and nothing can be checked against
// anything.
test('several files are headed by name', () => {
  const combined = combineFiles([
    { text: 'Write an essay.', fileName: 'Essay task.docx' },
    { text: 'Criteria: thesis, evidence.', fileName: 'Rubric.docx' },
  ])
  assert.match(combined, /--- Essay task\.docx ---/)
  assert.match(combined, /--- Rubric\.docx ---/)
  assert.ok(combined.indexOf('Essay task.docx') < combined.indexOf('Rubric.docx'))
})

test('a file with no name still gets one', () => {
  const combined = combineFiles([{ text: 'a' }, { text: 'b' }])
  assert.match(combined, /Document 1/)
  assert.match(combined, /Document 2/)
})

// --- what it says it found ---

test('an assignment and a rubric are named, with what will happen', () => {
  const said = describeFileSet([
    { text: 'x', docType: 'assignment' },
    { text: 'y', docType: 'rubric' },
  ])
  assert.equal(said, "An assignment and a rubric — I'll check them against each other.")
})

test('one file says nothing', () => {
  assert.equal(describeFileSet([{ text: 'x', docType: 'quiz' }]), null)
})

// Naming the same type twice tells a teacher nothing they did not already
// know from dropping two files in.
test('several of the same type are read as one', () => {
  const said = describeFileSet([
    { text: 'x', docType: 'quiz' },
    { text: 'y', docType: 'quiz' },
  ])
  assert.match(said ?? '', /2 documents/)
})

test('three distinct types are all named', () => {
  const said = describeFileSet([
    { text: 'x', docType: 'assignment' },
    { text: 'y', docType: 'rubric' },
    { text: 'z', docType: 'lesson_plan' },
  ])
  assert.match(said ?? '', /assignment/)
  assert.match(said ?? '', /rubric/)
  assert.match(said ?? '', /lesson plan/)
})

// --- which lens set the review gets ---

// A rubric beside an assignment is there to be checked against it, so the
// review is of the assignment.
test('a rubric beside an assignment reviews the assignment', () => {
  assert.equal(
    primaryType([{ text: 'x', docType: 'assignment' }, { text: 'y', docType: 'rubric' }], 'assignment'),
    'assignment',
  )
})

test('a rubric on its own is still a rubric', () => {
  assert.equal(primaryType([{ text: 'x', docType: 'rubric' }], 'assignment'), 'rubric')
})

// Assignment is the catch-all, so anything more specific wins.
test('the more specific type wins', () => {
  assert.equal(
    primaryType([{ text: 'x', docType: 'assignment' }, { text: 'y', docType: 'quiz' }], 'assignment'),
    'quiz',
  )
})

test('no recognisable types falls back', () => {
  assert.equal(primaryType([{ text: 'x' }], 'homework'), 'homework')
})

test('the cap is five', () => {
  assert.equal(MAX_FILES_PER_REVIEW, 5)
})
