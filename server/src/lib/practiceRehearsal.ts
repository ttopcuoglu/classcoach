// Practice's "Discuss with Wivoza Coach": a Practice attempt rehearsed out
// loud in Talk It Through. The same move as Lesson Debrief's Discuss — hand
// Coach what the teacher is looking at, and open the conversation about it —
// except that here the context has to last the whole conversation. Talk It
// Through's other context (a check-in) is only read on the first turn; a
// rehearsal where Coach forgets the situation by turn three is not one. So
// the conversation stores the attempt (Debrief.practiceAttemptId) and every
// turn rebuilds this block from it.
import { prisma } from './prisma.ts'

export async function findPracticeAttempt(userId: string, attemptId: unknown) {
  if (typeof attemptId !== 'string' || !attemptId) return null
  return prisma.scenarioAttempt.findFirst({ where: { id: attemptId, userId }, include: { scenario: true } })
}

type PracticeAttempt = NonNullable<Awaited<ReturnType<typeof findPracticeAttempt>>>

// Long enough for any real situation; short enough that a pasted essay does
// not ride along on every spoken turn.
function clip(text: string, max = 1500): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export function buildPracticeRehearsalBlock(attempt: PracticeAttempt, opening: boolean): string {
  const own = attempt.scenario.source === 'teacher'
  const response = attempt.responseText.trim()
  const lines = [
    own
      ? `This conversation is a spoken rehearsal of a real situation the teacher is facing, which they described in Practice in their own words: "${clip(attempt.scenario.text)}"`
      : `This conversation is a spoken rehearsal of a practice scenario the teacher worked on in Practice: "${clip(attempt.scenario.text)}"`,
    response
      ? `In Practice they said they would handle it like this: "${clip(response)}"`
      : 'In Practice they did not know what to say yet, so they asked to be walked through it.',
    attempt.feedback ? `You already gave them written coaching there: "${clip(attempt.feedback)}"` : null,
    attempt.modelResponse ? `And suggested words they could use: "${clip(attempt.modelResponse, 600)}"` : null,
    'They have read all of that. Do not repeat it back at length. Your job now is to help them find words of their own, out loud. When they try a line, respond to that line: what works, one thing to sharpen, then invite another try. If they ask you to play the other person, do it briefly and in character, then step back out and coach. Work only from what they told you — never invent details about the people involved.',
    opening
      ? "This is the first thing you say, before the teacher has spoken. Open about this situation, not with a general hello: one or two short sentences that name the moment in a few words and invite them to say what they would say, the way they would say it to the person."
      : null,
  ]
  return `\n\n${lines.filter(Boolean).join('\n')}\n`
}
