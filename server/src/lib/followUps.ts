// Coach's check-ins: a few days after a Talk It Through session ends with a
// "try next", Coach asks how it went (see the CoachFollowUp model).

const CHECK_IN_DELAY_DAYS = 3
const SNOOZE_DAYS = 2
const MAX_QUESTION_CHARS = 240

// A few days out, nudged off the weekend — teachers try things in class, so
// a Saturday check-in about "3rd period" would arrive before they could.
function skipWeekend(date: Date): Date {
  const day = date.getUTCDay()
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2)
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

export function nextCheckInDate(from = new Date()): Date {
  const date = new Date(from)
  date.setUTCDate(date.getUTCDate() + CHECK_IN_DELAY_DAYS)
  return skipWeekend(date)
}

export function snoozedCheckInDate(from = new Date()): Date {
  const date = new Date(from)
  date.setUTCDate(date.getUTCDate() + SNOOZE_DAYS)
  return skipWeekend(date)
}

// Used when the takeaway came back without a usable <check_in> question.
export function checkInQuestionFor(rawQuestion: string | null, plan: string): string {
  const question = rawQuestion?.trim()
  if (question && question.length <= MAX_QUESTION_CHARS) return question
  return `Last time, you planned to try this: ${plan} How did it go?`
}

// Appended to Talk It Through's system prompt when the teacher opens a
// conversation from a check-in, so Coach picks up the thread rather than
// starting cold.
export function buildFollowUpContextBlock(followUp: { plan: string; checkInQuestion: string; createdAt: Date }): string {
  const days = Math.max(1, Math.round((Date.now() - followUp.createdAt.getTime()) / (24 * 60 * 60 * 1000)))
  return `

This conversation is a check-in. ${days === 1 ? 'Yesterday' : `${days} days ago`}, the teacher finished a coaching conversation planning to try this: "${followUp.plan}"
You opened today by asking: "${followUp.checkInQuestion}"
The teacher's first message is their answer. Respond to what actually happened: if it went well, help them see why and what to keep; if it didn't, help them work out what got in the way and what small adjustment to try; if they haven't tried it yet, help them find a realistic moment to. Don't restate the original plan back to them at length.
`
}
