import 'dotenv/config'
import { analyzeTranscript, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'

// Re-runs the analysis over a session's stored transcript.
//
// The report's numbers are computed once, at the end of transcription, and
// written to the row — so a fix to `audioAnalysis.ts` only reaches sessions
// recorded after it ships. The `TranscriptSegment` rows survive, though, which
// means an existing report can be brought up to date without the teacher
// re-recording anything.
//
// Prints the before/after and changes nothing unless --write is passed, so the
// diff can be read first. Never touches `status`: a locked report stays locked,
// and a session that never finished transcribing is skipped rather than being
// declared analyzed by a script.
//
//   tsx src/scripts/recomputeAnalysis.ts <sessionId> [--write]
//   tsx src/scripts/recomputeAnalysis.ts --user you@example.com --latest [--write]
//   tsx src/scripts/recomputeAnalysis.ts --user you@example.com --list

const args = process.argv.slice(2)
const write = args.includes('--write')
const latest = args.includes('--latest')
const list = args.includes('--list')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]
const sessionId = args.find((a) => !a.startsWith('--') && a !== userEmail) ?? null

function pct(n: number | null): string {
  return n == null ? '—' : `${n}%`
}

async function resolveSession() {
  if (sessionId) return prisma.audioSession.findUnique({ where: { id: sessionId } })
  if (!userEmail || !latest) {
    throw new Error('Pass a session id, or --user <email> --latest.')
  }
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
  if (!user) throw new Error(`No user with email ${userEmail}`)
  return prisma.audioSession.findFirst({
    where: { userId: user.id, status: { in: ['analyzed', 'locked'] } },
    orderBy: { createdAt: 'desc' },
  })
}

/// Finding the right session: a teacher has many, and the newest is often not
/// the one they are looking at.
async function listSessions() {
  if (!userEmail) throw new Error('--list needs --user <email>.')
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
  if (!user) throw new Error(`No user with email ${userEmail}`)
  // Every status, not just the analyzable ones — the point is to find a
  // session, and "it isn't in the list" is a useful answer too.
  const rows = await prisma.audioSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, createdAt: true, durationSec: true, questionCount: true, higherOrderPct: true, status: true },
  })
  for (const r of rows) {
    const mins = r.durationSec == null ? '  -' : String(Math.round(r.durationSec / 60)).padStart(3)
    console.log(
      `${r.createdAt.toISOString().slice(0, 16)}  ${mins}min  q=${String(r.questionCount ?? '-').padStart(3)}` +
        `  higher=${String(r.higherOrderPct ?? '-').padStart(3)}  ${r.status.padEnd(9)} ${r.id}`,
    )
  }
  await prisma.$disconnect()
}

async function main() {
  if (list) return listSessions()
  const session = await resolveSession()
  if (!session) throw new Error('No matching session.')

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({
      where: { sessionId: session.id },
      orderBy: { startSec: 'asc' },
    })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))

  if (segments.length === 0) throw new Error(`Session ${session.id} has no transcript segments.`)

  const analysis = analyzeTranscript(segments)
  const lessonContent = detectLessonContent(segments, analysis.phases)

  const before = (session.questionLog ?? []) as { text: string; type: string }[]
  const after = analysis.questionLog
  const beforeTexts = before.map((q) => q.text)
  const afterTexts = after.map((q) => q.text)
  const dropped = beforeTexts.filter((t) => !afterTexts.includes(t))

  console.log(`session   ${session.id}  (${session.status}, ${segments.length} segments)`)
  console.log(`questions ${session.questionCount ?? '—'} -> ${analysis.questionCount}`)
  console.log(`higher    ${pct(session.higherOrderPct)} -> ${pct(analysis.higherOrderPct)}`)
  console.log(`sequences ${before.length} -> ${after.length}`)
  if (dropped.length) console.log(`dropped   ${dropped.map((t) => JSON.stringify(t)).join(', ')}`)

  if (!write) {
    console.log('\n(dry run — pass --write to save)')
    await prisma.$disconnect()
    return
  }

  await prisma.audioSession.update({
    where: { id: session.id },
    data: {
      teacherTalkPct: analysis.teacherTalkPct,
      studentTalkPct: analysis.studentTalkPct,
      questionCount: analysis.questionCount,
      higherOrderPct: analysis.higherOrderPct,
      avgWaitTimeSec: analysis.avgWaitTimeSec,
      cfuCount: analysis.cfuCount,
      metricsDetail: analysis.metricsDetail,
      highlights: analysis.highlights,
      phases: analysis.phases,
      questionLog: analysis.questionLog,
      cfuLog: analysis.cfuLog,
      feedbackLog: analysis.feedbackLog,
      directiveLog: analysis.directiveLog,
      toneLog: analysis.toneLog,
      redirectionLog: analysis.redirectionLog,
      lessonContent,
    },
  })
  console.log('\nsaved')
  await prisma.$disconnect()
}

main()
