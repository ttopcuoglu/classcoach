import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { readStudentTalkFocus } from '../lib/studentTalkFocus.ts'

// Reads what the student talk was about on a stored lesson, without writing.
//   tsx src/scripts/tryStudentTalkFocus.ts <sessionId> [<sessionId> ...]
for (const id of process.argv.slice(2)) {
  const session = await prisma.audioSession.findUnique({
    where: { id },
    select: { durationSec: true, studentTalkPct: true, teacherTalkPct: true, lessonContent: true },
  })
  if (!session) {
    console.log(`${id}: not found`)
    continue
  }
  const segments = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const content = session.lessonContent as {
    statedObjective?: { quote?: string | null }
    summary?: string | null
    subject?: string | null
  } | null

  const focus = await readStudentTalkFocus(segments, {
    objective: content?.statedObjective?.quote ?? null,
    summary: content?.summary ?? null,
    subject: content?.subject ?? null,
  })
  console.log(
    `\n=== ${id} · ${Math.round((session.durationSec ?? 0) / 60)}min · teacher ${session.teacherTalkPct}% / students ${session.studentTalkPct}%`,
  )
  if (!focus) {
    console.log('  not measured (too few audible student turns, or the read failed)')
    continue
  }
  console.log(
    `  classified=${focus.classified}${focus.sampled ? ' (sampled)' : ''}  onTopic=${focus.onTopic} procedural=${focus.procedural} offTopic=${focus.offTopic} unclear=${focus.unclear}`,
  )
  for (const e of focus.examples) {
    console.log(`    ${e.kind.padEnd(10)} ${Math.floor(e.timestampSec / 60)}:${String(Math.round(e.timestampSec % 60)).padStart(2, '0')} "${e.text.slice(0, 70)}"`)
  }
}
await prisma.$disconnect()
