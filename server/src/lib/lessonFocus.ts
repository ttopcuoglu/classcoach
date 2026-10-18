// The focus loop (Insights Phase 6): one thing to try next lesson, picked on a
// report, and checked on the next report for the same teacher.
//
// Stored on the lesson it was picked from, in AudioSession.lessonFocus, next
// to the check-in that lesson received from the one before it. Per lesson
// rather than per account because one account records many teachers' classes:
// "your last lesson" is the previous lesson with the same teacher name, and a
// lesson with no teacher name is never compared with anything.

export type FocusLine = { quote: string; timestampSec: number; segmentId: string | null }

/// The focus picked on a report, for that teacher's next lesson.
export type NextFocus = {
  /// The Insights finding it is about, e.g. "directions", so the next report
  /// can measure the same thing.
  findingKey: string
  findingLabel: string
  /// What to try, in the report's words.
  text: string
  /// The finding's value on the lesson it was picked from, as shown: "1 of 5
  /// complete", "2".
  value: string | null
  /// The line it grew from, and the rewrite, when there was one.
  line: FocusLine | null
  rewrite: string | null
  pickedAt: string
}

/// What the next lesson's report found for that focus.
export type FocusCheckIn = {
  fromSessionId: string
  findingKey: string
  text: string
  lastValue: string | null
  thisValue: string | null
  /// heard — the move showed up; not_yet — it did not, and a line is offered
  /// where it could fit; unavailable — this lesson could not be checked.
  outcome: 'heard' | 'not_yet' | 'unavailable'
  line: FocusLine | null
  checkedAt: string
}

export type LessonFocus = { next?: NextFocus | null; checkIn?: FocusCheckIn | null }

const KEY = /^[a-z_]{1,40}$/

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
}

function parseLine(v: unknown): FocusLine | null {
  const l = (v ?? null) as Record<string, unknown> | null
  if (!l) return null
  const quote = str(l.quote, 1000)
  const t = l.timestampSec
  if (!quote || typeof t !== 'number' || !Number.isFinite(t) || t < 0) return null
  return { quote, timestampSec: t, segmentId: str(l.segmentId, 64) }
}

export function parseNextFocus(body: unknown): Omit<NextFocus, 'pickedAt'> | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const findingKey = str(b.findingKey, 40)
  const findingLabel = str(b.findingLabel, 80)
  const text = str(b.text, 300)
  if (!findingKey || !KEY.test(findingKey) || !findingLabel || !text) return { error: 'findingKey, findingLabel and text are required' }
  return {
    findingKey,
    findingLabel,
    text,
    value: str(b.value, 60),
    line: parseLine(b.line),
    rewrite: str(b.rewrite, 400),
  }
}

export function parseCheckIn(body: unknown): Omit<FocusCheckIn, 'checkedAt'> | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const fromSessionId = str(b.fromSessionId, 64)
  const findingKey = str(b.findingKey, 40)
  const text = str(b.text, 300)
  const outcome = b.outcome
  if (!fromSessionId || !findingKey || !KEY.test(findingKey) || !text) return { error: 'fromSessionId, findingKey and text are required' }
  if (outcome !== 'heard' && outcome !== 'not_yet' && outcome !== 'unavailable') return { error: 'outcome is not one of heard, not_yet, unavailable' }
  return {
    fromSessionId,
    findingKey,
    text,
    lastValue: str(b.lastValue, 60),
    thisValue: str(b.thisValue, 60),
    outcome,
    line: parseLine(b.line),
  }
}

/// A teacher's name as the lessons are matched on it: case, spacing and
/// surrounding punctuation ignored. Null when there is no name to match.
export function teacherKey(name: string | null | undefined): string | null {
  const key = (name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return key || null
}
