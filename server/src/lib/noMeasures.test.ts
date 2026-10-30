import assert from 'node:assert/strict'
import { test } from 'node:test'
import { statesMeasurement, withoutMeasures } from './noMeasures.ts'

test('measurements the cards already show are caught', () => {
  // From real notes this week.
  assert.equal(statesMeasurement('Of the fourteen questions, seven were higher-order.'), true)
  assert.equal(statesMeasurement('Teacher talk ran at a notably quick pace — about 164 words a minute.'), true)
  assert.equal(statesMeasurement('About a fifth of the lesson recorded as group sound.'), true)
  assert.equal(statesMeasurement('Your longest stretch ran for 12 minutes.'), true)
  assert.equal(statesMeasurement('Only one explicit check for understanding registering.'), false, 'no tally verb: left to the prompt')
  assert.equal(statesMeasurement('Two checks were heard, both near the end.'), true)
  assert.equal(statesMeasurement('Students talked 4% of the time.'), true)
})

test("the lesson's own numbers and moment times are left alone", () => {
  assert.equal(statesMeasurement('At 14:01 you brought in Lowell, one of the first industrial cities.'), false)
  assert.equal(statesMeasurement('Students drew 50 trees and a factory next to the river.'), false)
  assert.equal(statesMeasurement('By the 1820s, canals were moving goods faster than roads.'), false)
  assert.equal(statesMeasurement('Ask one follow-up why after a student answers.'), false)
  assert.equal(statesMeasurement('Like terms such as 12 p q combine.'), false)
})

test('a measurement sentence is dropped; a paragraph is never emptied', () => {
  const text = 'You tied the canal to trade. Of the fourteen questions, seven were higher-order. That link is worth keeping.\n\nAbout 164 words a minute.'
  assert.equal(withoutMeasures(text), 'You tied the canal to trade. That link is worth keeping.\n\nAbout 164 words a minute.')
})
