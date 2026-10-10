import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyModelError } from './modelErrors.ts'

// The case this file was written for, copied from the real failure: the
// workspace spend limit was reached, every model call in the app started
// failing, and every surface told the teacher to try again.
const billingError = {
  status: 400,
  message: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
  error: {
    error: {
      type: 'invalid_request_error',
      message:
        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    },
  },
}

test('a billing refusal never tells the teacher to try again', () => {
  const failure = classifyModelError(billingError, 'Could not finish the hard look')
  assert.equal(failure.retryable, false)
  assert.equal(failure.cause, 'billing')
  assert.doesNotMatch(failure.message, /try again/i)
})

test('and never shows the teacher the billing details', () => {
  const failure = classifyModelError(billingError, 'Could not finish the hard look')
  assert.doesNotMatch(failure.message, /credit|balance|billing|plan|upgrade|purchase/i)
})

test('a billing refusal is a 503, not the 400 Anthropic sent', () => {
  // A plain 400 forwarded on would read to every client as "the request was
  // malformed", which is a sentence about the teacher's input.
  assert.equal(classifyModelError(billingError, 'x').status, 503)
})

test('a missing or revoked key is the same unfixable-by-retrying case', () => {
  for (const error of [
    { status: 401, error: { error: { type: 'authentication_error', message: 'invalid x-api-key' } } },
    { status: 403, error: { error: { type: 'permission_error', message: 'not allowed' } } },
  ]) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    assert.equal(failure.retryable, false)
    assert.doesNotMatch(failure.message, /try again/i)
  }
})

test('a rate limit does say try again, because waiting works', () => {
  const failure = classifyModelError(
    { status: 429, error: { error: { type: 'rate_limit_error', message: 'slow down' } } },
    'Could not reach your coach',
  )
  assert.equal(failure.retryable, true)
  assert.equal(failure.status, 429)
  assert.match(failure.message, /try again/i)
})

test('an overloaded model is busy, not broken', () => {
  const failure = classifyModelError(
    { status: 529, error: { error: { type: 'overloaded_error', message: 'overloaded' } } },
    'x',
  )
  assert.equal(failure.cause, 'overloaded')
  assert.equal(failure.retryable, true)
})

test('a timeout keeps the wording the routes already had', () => {
  const failure = classifyModelError(new Error('fetch failed'), 'Could not finish the hard look')
  assert.equal(failure.status, 502)
  assert.equal(failure.retryable, true)
  assert.equal(failure.message, 'Could not finish the hard look. Please try again.')
})

test('an API 500 is retryable and labelled as theirs, not ours', () => {
  const failure = classifyModelError({ status: 500, message: 'internal' }, 'x')
  assert.equal(failure.cause, 'api_error')
  assert.equal(failure.retryable, true)
})

test('a dead transcription account is unavailable, not a retry', () => {
  // The worst case in the app: a teacher cannot re-teach the lesson, so
  // "please try again" on a 402 is both wrong and expensive.
  const failure = classifyModelError(
    new Error('Deepgram request failed (402): insufficient funds'),
    'Transcription failed',
  )
  assert.equal(failure.cause, 'transcription_account')
  assert.equal(failure.retryable, false)
})

test('a Deepgram failure that is genuinely transient still says try again', () => {
  const failure = classifyModelError(
    new Error('Deepgram request failed (503): upstream unavailable'),
    'Transcription failed',
  )
  assert.equal(failure.retryable, true)
  assert.match(failure.message, /try again/i)
})

test('a reworded spend-limit message still does not become "try again"', () => {
  // The guard against this file quietly rotting: Anthropic owns this string.
  const failure = classifyModelError(
    { status: 400, error: { error: { type: 'invalid_request_error', message: 'Workspace spend limit reached.' } } },
    'x',
  )
  assert.equal(failure.cause, 'billing')
  assert.equal(failure.retryable, false)
})

test('every non-retryable message is silent about retrying, whatever the caller passed', () => {
  for (const error of [billingError, { status: 401 }, { status: 404 }]) {
    const failure = classifyModelError(error, 'Please try again to do the thing')
    if (failure.retryable) continue
    assert.doesNotMatch(failure.message, /try again/i)
  }
})
