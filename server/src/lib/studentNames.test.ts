import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findStudentNames, stripStudentNames } from './studentNames.ts'

// "Never silently send a roster to the model." This runs before any model
// call, so what matters is that it catches the shapes a roster actually
// arrives in and leaves ordinary classroom documents alone — a prompt a
// teacher sees on a normal quiz is a prompt they learn to click through.

test('a column headed Name is caught', () => {
  const sheet = 'Name,Q1,Q2,Total\nAmara Okafor,4,5,9\nJonas Weber,3,5,8\n'
  const found = findStudentNames(sheet)
  assert.ok(found)
  assert.match(found.reason, /column/)
})

test('Student, First Name and Last Name are caught too', () => {
  for (const header of ['Student,Score', 'First Name,Last Name,Grade', 'Pupil;Mark']) {
    assert.ok(findStudentNames(`${header}\nA B,1\n`), header)
  }
})

test('a run of bare names is caught', () => {
  const roster = 'Group A\nAmara Okafor\nJonas Weber\nPriya Raman\nLiam O’Connor\n'
  const found = findStudentNames(roster)
  assert.ok(found)
  assert.match(found.reason, /list of names/)
})

// The cost of a false positive is a teacher clicking through a prompt that was
// wrong, which teaches them to click through the one that is right.
test('ordinary classroom documents are left alone', () => {
  const quiz = '1. What is osmosis?\n2. Define diffusion.\n3. Compare the two.\n'
  assert.equal(findStudentNames(quiz), null)

  const plan = 'Do Now: 5 min\nObjective: SWBAT explain cell transport\nExit ticket: 3 min\n'
  assert.equal(findStudentNames(plan), null)

  // Two names in a worksheet are a worksheet, not a roster.
  const history = 'Marie Curie\nRosalind Franklin\n\nCompare their contributions.\n'
  assert.equal(findStudentNames(history), null)
})

// The marks beside the names are usually why the file was uploaded, so the
// column is blanked rather than the row dropped.
test('stripping a name column keeps the rest of the row', () => {
  const sheet = 'Name,Q1,Q2,Total\nAmara Okafor,4,5,9\nJonas Weber,3,5,8'
  const stripped = stripStudentNames(sheet)
  assert.ok(!stripped.includes('Amara'))
  assert.ok(!stripped.includes('Jonas'))
  // The data survives.
  assert.ok(stripped.includes('4,5,9'))
  assert.ok(stripped.includes('3,5,8'))
  // And the header still says what the columns are.
  assert.ok(stripped.includes('Q1,Q2,Total'))
})

test('stripping a roster list removes those lines only', () => {
  const roster = 'Group A\nAmara Okafor\nJonas Weber\nPriya Raman\nLiam O’Connor\nBring your own materials.'
  const stripped = stripStudentNames(roster)
  assert.ok(!stripped.includes('Amara'))
  assert.ok(stripped.includes('Group A'))
  assert.ok(stripped.includes('Bring your own materials.'))
})

test('stripping a document with no names changes nothing', () => {
  const quiz = '1. What is osmosis?\n2. Define diffusion.'
  assert.equal(stripStudentNames(quiz), quiz)
})

// Names are not a culturally narrow shape. A rule built around one spelling
// convention fails on exactly the students it can least afford to fail on, so
// these are part of the contract rather than a nice-to-have.
test('names with internal capitals, particles and stops are caught', () => {
  const roster = [
    'Liam O’Connor',
    'Siobhan McDonald',
    'Mary St. John',
    'Jean-Luc Baptiste',
  ].join('\n')
  const found = findStudentNames(roster)
  assert.ok(found, 'a roster of these should still read as a roster')
  assert.match(found.reason, /list of names/)
})

test('three-part names are caught', () => {
  const roster = 'Ana Maria Silva\nJuan Carlos Ruiz\nMei Ling Chen\nOmar Al Rashid'
  assert.ok(findStudentNames(roster))
})
