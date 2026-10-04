import { expect, test } from 'vitest'
import { messageForStatus } from './api'

// A teacher who dropped a quiz into Look It Over and got "Request failed with
// status 502" has been told nothing: not what happened, not whether it was
// their file, not whether trying again would help. It was none of those — the
// instance was restarting — and the message should say so.

test('a body-less gateway failure says the server was waking up, and to retry', () => {
  for (const status of [502, 503, 504]) {
    expect(messageForStatus(status), String(status)).toBe(
      'The server was restarting or waking up. Give it a moment and try again.',
    )
  }
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
