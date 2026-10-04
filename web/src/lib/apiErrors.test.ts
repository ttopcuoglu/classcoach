import { expect, test } from 'vitest'
import { messageForStatus } from './api'

// A teacher who dropped a quiz into Look It Over and got "Request failed with
// status 502" has been told nothing: not what happened, not whether it was
// their file, not whether trying again would help. It was none of those — the
// instance was restarting — and the message should say so.

// Each of these means something different, and a teacher who sees the same
// sentence whatever happened learns that the app does not know either.
test('the three gateway failures say three different things', () => {
  const waking = messageForStatus(503)
  const timeout = messageForStatus(504)
  const dropped = messageForStatus(502)
  expect(new Set([waking, timeout, dropped]).size).toBe(3)
  expect(waking).toContain('waking up')
  expect(timeout).toContain('too long')
  // Both offer the way round it, since pasting skips file reading entirely.
  expect(timeout).toContain('paste the text')
  expect(dropped).toContain('pasting the text')
})

test('the failures a teacher can act on say what to do', () => {
  expect(messageForStatus(413)).toContain('25MB')
  expect(messageForStatus(429)).toContain('Give it a minute')
  expect(messageForStatus(408)).toContain('too long')
})

// Only reached when a route answered without JSON, which for a 500 means it
// crashed rather than refused — so this does not blame the request.
test('an unexplained server error does not blame the teacher', () => {
  expect(messageForStatus(500)).toBe('Something went wrong at our end. Please try again.')
})

// A 4xx the server did not explain is rare and genuinely opaque; the status is
// the most honest thing left to show.
test('an unexplained client error still names the status', () => {
  expect(messageForStatus(418)).toBe('Request failed with status 418')
})

// None of this replaces a message the server did send: those are specific
// ("Could not read that file. Please try pasting the text instead.") and are
// what a teacher should see whenever one exists.
test('these are fallbacks, not replacements', () => {
  expect(messageForStatus(502)).not.toContain('Could not read that file')
})
