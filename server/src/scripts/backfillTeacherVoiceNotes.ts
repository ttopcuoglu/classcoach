import 'dotenv/config'
import type { Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'
import { writeClassSummary } from '../routes/audioSessions.ts'

// Rewrites the coach notes on lessons summarized before the report was built
// from the teacher's voice only (09a269f).
//
// Those notes were written from student talk share, wait time before an
// answer, the pause after an answer and what student talk was about — numbers
// the page no longer shows. A note saying "teacher talk ran well ahead of
// student talk" above a page with no student share is the contradiction the
// change exists to remove.
//
// Only lessons whose stored notes mention one of those measures are touched;
// the rest are left exactly as the teacher read them. The demo accounts are
// skipped: their notes are seeded, and other notes say to keep them out of
// bulk operations. Rewrites do not count against a teacher's monthly usage.
//
// Prints what it would rewrite and changes nothing unless --write is passed.
//
//   tsx src/scripts/backfillTeacherVoiceNotes.ts
//   tsx src/scripts/backfillTeacherVoiceNotes.ts --user you@example.com
//   tsx src/scripts/backfillTeacherVoiceNotes.ts --write

const args = process.argv.slice(2)
const write = args.includes('--write')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]

/// Measures the page no longer shows, as a note would phrase them.
const STUDENT_MEASURES =
  /student talk|students? (?:spoke|talked|talking|were heard|was heard|voices?)|student share|share of (?:the )?talk|wait time|think time|follow[- ]?ups?\b|after (?:a|the|their) (?:student'?s? )?answer|back-and-forth|audible student/i

const NOTE_FIELDS = ['classSummary', 'talkNarrative', 'questionsNarrative', 'checksNarrative', 'climateNarrative', 'contentNarrative'] as const

function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example')
}

const sessions = await prisma.audioSession.findMany({
  where: {
    status: { in: ['analyzed', 'locked'] },
    classSummary: { not: null },
    ...(userEmail ? { user: { email: userEmail } } : {}),
  },
  orderBy: { createdAt: 'desc' },
})
const owners = new Map(
  (await prisma.user.findMany({ where: { id: { in: [...new Set(sessions.map((s) => s.userId))] } }, select: { id: true, email: true } })).map(
    (u) => [u.id, u.email],
  ),
)

const targets = sessions.filter((s) => {
  const email = owners.get(s.userId) ?? ''
  if (isDemoAccount(email)) return false
  return NOTE_FIELDS.some((f) => STUDENT_MEASURES.test(s[f] ?? ''))
})

console.log(
  `${sessions.length} summarized lesson(s); ${targets.length} with notes citing student measures` +
    `${write ? '' : ' (dry run — nothing will be written)'}\n`,
)

const tally = { rewritten: 0, stillMentions: 0, failed: 0 }
for (const session of targets) {
  const hits = NOTE_FIELDS.filter((f) => STUDENT_MEASURES.test(session[f] ?? '')).map(
    (f) => `${f}: "${(session[f] ?? '').match(STUDENT_MEASURES)?.[0]}"`,
  )
  console.log(`${session.id}  ${owners.get(session.userId)}  ${session.createdAt.toISOString().slice(0, 10)}  ${hits.join(' · ')}`)
  if (!write) continue

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  try {
    const updated = await writeClassSummary(session.userId, session, segments, { countUsage: false })
    if (!updated) {
      tally.failed++
      console.log('    no summary came back; left as it was')
      continue
    }
    tally.rewritten++
    // A note that failed its quote check keeps the old version, which may
    // still cite a student measure — said here rather than discovered later.
    const left = NOTE_FIELDS.filter((f) => STUDENT_MEASURES.test((updated as Record<string, unknown>)[f] as string ?? ''))
    if (left.length) {
      tally.stillMentions++
      console.log(`    rewritten; still mentions a student measure in ${left.join(', ')}`)
    } else {
      console.log('    rewritten')
    }
  } catch (error) {
    tally.failed++
    console.log(`    failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (write) console.log(`\n${tally.rewritten} rewritten, ${tally.stillMentions} still mention one, ${tally.failed} failed`)
await prisma.$disconnect()
