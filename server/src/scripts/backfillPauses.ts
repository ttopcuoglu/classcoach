import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import { fillPauseAfterQuestion, type QuestionLogEntry, type Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'

// Fills in the pause after each question for lessons analyzed before pause
// timing existed (738c757, 2026-10-16).
//
// Without it, "Pause before you spoke again" on those lessons reads "This
// lesson was analyzed before pauses were timed" — most of the lessons a
// teacher already has. The pause comes only from the stored transcript's
// timings, with the same function the analysis uses, so this needs no model
// call and no re-recording, and nothing else in the question log changes.
// Questions that already have a pause are left exactly as they are.
//
// The demo and test accounts are skipped: their lessons are seeded or made
// while building, and other notes say to keep demo data out of bulk operations.
//
// Prints what it would change and writes nothing unless --write is passed.
//
//   tsx src/scripts/backfillPauses.ts
//   tsx src/scripts/backfillPauses.ts --user you@example.com
//   tsx src/scripts/backfillPauses.ts --write

const args = process.argv.slice(2)
const write = args.includes('--write')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]

/// Held long enough to count, as Insights counts it.
const LONG_PAUSE_SEC = 3

/// Seeded demo lessons, and test accounts (@example.com) made while building.
function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
}

const sessions = await prisma.audioSession.findMany({
  where: {
    status: { in: ['analyzed', 'locked'] },
    ...(userEmail ? { user: { email: userEmail } } : {}),
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, questionLog: true, user: { select: { email: true } } },
})

const tally = { lessons: 0, alreadyTimed: 0, noQuestions: 0, demo: 0, toFill: 0, questions: 0, timed: 0, long: 0 }

for (const session of sessions) {
  tally.lessons++
  if (isDemoAccount(session.user.email)) {
    tally.demo++
    continue
  }
  const log = (Array.isArray(session.questionLog) ? session.questionLog : []) as unknown as QuestionLogEntry[]
  if (log.length === 0) {
    tally.noQuestions++
    continue
  }
  // Only what is missing. A question already timed keeps its pause.
  if (log.every((q) => q.pauseSec !== undefined)) {
    tally.alreadyTimed++
    continue
  }

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))

  const filled: QuestionLogEntry[] = log.map((q) =>
    q.pauseSec !== undefined ? q : { ...q, pauseSec: null, studentAudibleInPause: false },
  )
  const missing = filled.filter((_, i) => log[i].pauseSec === undefined)
  fillPauseAfterQuestion(missing, segments)

  const timed = filled.filter((q) => typeof q.pauseSec === 'number')
  const long = timed.filter((q) => (q.pauseSec as number) >= LONG_PAUSE_SEC)
  tally.toFill++
  tally.questions += filled.length
  tally.timed += timed.length
  tally.long += long.length
  console.log(
    `${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}  ` +
      `${filled.length} questions, ${timed.length} timed, ${long.length} with ${LONG_PAUSE_SEC}s+`,
  )

  if (write) {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { questionLog: filled as unknown as Prisma.InputJsonValue },
    })
  }
}

console.log(
  `\n${tally.lessons} analyzed lessons: ${tally.toFill} to fill${write ? ' (written)' : ' (dry run — nothing written)'}, ` +
    `${tally.alreadyTimed} already timed, ${tally.noQuestions} with no questions, ${tally.demo} demo (skipped).` +
    `\nAcross the ones to fill: ${tally.questions} questions, ${tally.timed} could be timed, ${tally.long} had ${LONG_PAUSE_SEC}s or more.`,
)
await prisma.$disconnect()
