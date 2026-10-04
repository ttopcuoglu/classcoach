import { expect, test } from 'vitest'
import { detectionHint } from './reviewLenses'

// The line under "Looks like a quiz — right?". It reads as a sentence someone
// said, so it is capitalised and joined with "and" rather than listing two
// fragments with a comma.

test('two reasons read as one sentence', () => {
  expect(detectionHint(['numbered items', 'lettered options'])).toBe(
    'Numbered items and lettered options. Tap any to correct me.',
  )
})

test('one reason reads the same way', () => {
  expect(detectionHint(['a greeting'])).toBe('A greeting. Tap any to correct me.')
})

// A document that matched nothing is exactly the one whose guess was weak.
// Saying how to correct it beats inventing a reason it was right.
test('with nothing to show it just says how to correct it', () => {
  expect(detectionHint([])).toBe('Tap any of these to correct me.')
})

// However many the server sends, the strip stays one line.
test('never more than the first two', () => {
  const hint = detectionHint(['numbered items', 'lettered options', 'point values'])
  expect(hint).not.toContain('point values')
})
