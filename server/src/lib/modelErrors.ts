// What to tell a teacher when a call to Claude fails, and what to log for us.
//
// Every AI route used to answer every failure the same way: a 502 and some
// variant of "Please try again." That is the right thing to say about a
// timeout and the wrong thing to say about most of the rest, and the day it
// mattered went like this — the workspace's spend limit was reached, so every
// model call in the app began failing, and the app told the teacher to try
// again. Retrying was the one action that could not possibly work. Nothing in
// the message, the status code or the logs distinguished "this will work in a
// moment" from "this cannot work until someone fixes the account", so the
// advice was confidently wrong for hours.
//
// Two things follow, and they are the whole point of this file.
//
// Never tell someone to retry when retrying cannot work. A teacher who can't
// act on a failure should be told it isn't theirs to fix, and left alone.
//
// And never show them the operator's problem. "Your credit balance is too low"
// is a sentence for whoever pays the bill, not for a teacher holding a phone
// after a lesson — so the real cause goes to the server log, with a label
// that's greppable, and the teacher gets the honest shape of it without the
// billing details.

/// `retryable` is the claim the message is allowed to make. It is not a hint:
/// if it is false, nothing in `message` may suggest trying again.
export type ModelFailure = {
  status: number
  message: string
  retryable: boolean
  /// Short, stable, greppable cause for the server log — `billing`,
  /// `rate_limited`, `overloaded`, and so on.
  cause: string
}

/// The operator's fault, not the teacher's, and not fixed by waiting a moment:
/// an exhausted balance or spend limit, a missing or revoked key, a key
/// without access to the model being asked for. All of these keep failing
/// identically until somebody changes something, so the teacher is told
/// plainly that it is not theirs to fix and not worth retrying.
const UNAVAILABLE =
  "Wivoza's AI features aren't available right now. This isn't anything you did, and trying again won't clear it — it needs fixing at our end."

/// Genuinely a moment: Anthropic's own rate limit or a loaded model.
const BUSY = "Wivoza's AI is busy right now. Give it a minute and try again."

type SdkError = {
  status?: number
  message?: string
  error?: { error?: { type?: string; message?: string } }
}

function errorType(error: SdkError): string {
  return error.error?.error?.type ?? ''
}

function errorText(error: SdkError): string {
  return `${error.error?.error?.message ?? ''} ${error.message ?? ''}`.toLowerCase()
}

/// `whatFailed` completes a sentence for the retryable case and nothing else —
/// "Could not finish the hard look", "Could not reach your coach". It is only
/// ever read when retrying is honest advice, so it stays in the caller's own
/// words.
export function classifyModelError(error: unknown, whatFailed: string): ModelFailure {
  const sdk = (error ?? {}) as SdkError
  const status = typeof sdk.status === 'number' ? sdk.status : 0
  const type = errorType(sdk)
  const text = errorText(sdk)

  // A spend limit and an empty balance both arrive as a plain 400, which is
  // the same status a malformed request gets — so this is matched on the
  // message rather than the status. Anthropic has worded it as "credit
  // balance is too low"; "spend limit" and "quota" are matched too so a
  // rewording doesn't silently fall through to "please try again".
  if (/credit balance|spend limit|billing|quota/.test(text)) {
    return { status: 503, message: UNAVAILABLE, retryable: false, cause: 'billing' }
  }
  // Transcription is Deepgram rather than Claude, but it fails the same way
  // for the same reasons and used to answer with the same useless "please try
  // again" — and it is the most consequential path in the app, because a
  // teacher who just finished a lesson cannot record it twice. Its client
  // throws a plain Error carrying the upstream status (see deepgram.ts), so
  // that is what this reads.
  if (/deepgram request failed \((?:401|402|403)\)/.test(text)) {
    return { status: 503, message: UNAVAILABLE, retryable: false, cause: 'transcription_account' }
  }
  if (status === 401 || status === 403 || type === 'authentication_error' || type === 'permission_error') {
    return { status: 503, message: UNAVAILABLE, retryable: false, cause: 'auth' }
  }
  // A model name this key cannot reach, or one that no longer exists — a
  // deploy-time mistake, which no amount of retrying improves.
  if (status === 404 || type === 'not_found_error') {
    return { status: 503, message: UNAVAILABLE, retryable: false, cause: 'model_not_found' }
  }
  if (status === 429 || type === 'rate_limit_error') {
    return { status: 429, message: BUSY, retryable: true, cause: 'rate_limited' }
  }
  if (status === 529 || type === 'overloaded_error') {
    return { status: 503, message: BUSY, retryable: true, cause: 'overloaded' }
  }

  // Everything left is the case the old message was actually right about: a
  // timeout, a dropped connection, a 500 from the API, or our own parse of a
  // reply that came back unusable.
  return {
    status: 502,
    message: `${whatFailed}. Please try again.`,
    retryable: true,
    cause: status >= 500 ? 'api_error' : status === 0 ? 'network' : `http_${status}`,
  }
}

/// Logs the failure with its cause attached. `prefix` is whatever the caller
/// would have logged anyway — "[debrief] transcription failed:" — so every
/// existing log line keeps the wording and the grep that already finds it,
/// and simply gains the one fact it was missing.
///
/// That fact is the point: `cause=billing` across eleven different surfaces
/// is one incident, and nothing in the old logs said so. Finding that out
/// took reading an SDK stack trace by hand.
export function logModelFailure(prefix: string, failure: ModelFailure, error: unknown): void {
  console.error(`${prefix} cause=${failure.cause} status=${failure.status}`, error)
}
