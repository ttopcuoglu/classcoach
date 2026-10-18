import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import { analyzeTranscript, type Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'

// Fills in how many student answers were heard, how many were followed up,
// and every follow-up's words, for lessons analyzed before those were kept.
//
// Recomputed from the stored transcript with the same phrase scan the
// analysis runs — no model call. The follow-up count is rewritten with
// them, so "followed up on X of Y" and the count on Summary come from one
// pass over the same speaker tags. Nothing else in the report changes.
//
// Demo and test accounts are skipped. Prints what it would change and writes
// nothing unless --write is passed.
//
//   tsx src/scripts/backfillFollowUps.ts
//   tsx src/scripts/backfillFollowUps.ts --write

const write = process.argv.includes('--write')

function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
}

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, metricsDetail: true, user: { select: { email: true } } },
})

let changed = 0
for (const session of sessions) {
  if (isDemoAccount(session.user.email)) continue
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  if (segments.length === 0) continue
  const m = analyzeTranscript(segments).metricsDetail
  changed++
  const was = detail.followUpQuestionCount
  console.log(
    `${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}  ` +
      `answers heard ${m.answersHeardCount}, followed up ${m.answersFollowedUpCount}, ` +
      `follow-up questions ${m.followUpQuestionCount}${was !== m.followUpQuestionCount ? ` (was ${was})` : ''}`,
  )
  for (const f of m.followUpLog ?? []) console.log(`      ${Math.floor(f.timestampSec / 60)}:${String(Math.floor(f.timestampSec % 60)).padStart(2, '0')} "${f.text}"`)
  if (write) {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: {
        metricsDetail: {
          ...detail,
          followUpQuestionCount: m.followUpQuestionCount,
          answersHeardCount: m.answersHeardCount,
          answersFollowedUpCount: m.answersFollowedUpCount,
          followUpLog: m.followUpLog,
        } as Prisma.InputJsonValue,
      },
    })
  }
}
console.log(`\n${changed} lessons${write ? ' written' : ' (dry run — nothing written)'}.`)
await prisma.$disconnect()
