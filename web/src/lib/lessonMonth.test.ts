import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lessonMonth } from './lessonMonth.ts'

test('counts this month and the weeks in a row with a lesson', () => {
  const now = new Date(2026, 9, 19) // Monday Oct 19
  const lm = lessonMonth([new Date(2026, 9, 16), new Date(2026, 9, 13), new Date(2026, 9, 5), new Date(2026, 8, 30)], now)
  assert.equal(lm.count, 3)
  assert.deepEqual([...lm.recordedDays].sort((a, b) => a - b), [5, 13, 16])
  // No lesson yet this week, so the streak runs back from last week: Oct 12, Oct 5, Sep 28.
  assert.equal(lm.weekStreak, 3)
  assert.equal(lm.firstWeekday, 3) // Oct 1 2026 is a Thursday
})

test('a week without a lesson ends the streak', () => {
  const lm = lessonMonth([new Date(2026, 9, 14), new Date(2026, 8, 30)], new Date(2026, 9, 15))
  assert.equal(lm.weekStreak, 1)
})
