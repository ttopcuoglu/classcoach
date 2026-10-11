import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { readStudentTalkFocus } from '../lib/studentTalkFocus.ts'

// Adds `studentTalkFocus` to a report that was analyzed before it existed.
//
// Deliberately NOT a re-analysis. Re-running the whole pass would rewrite
// every count on the report, and the transcript reads behind them are not
// deterministic — a teacher who had read "7 questions" could come back to 6
// without anything having changed about their lesson. This writes one field
// that was previously absent and touches nothing else.
//
//   tsx src/scripts/backfillStudentTalkFocus.ts <sessionId> [...]        # dry run
//   tsx src/scripts/backfillStudentTalkFocus.ts <sessionId> [...] --write
const write = process.argv.includes('--write')
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'))

for (const id of ids) {
  const session = await prisma.audioSession.findUnique({
    where: { id },
    select: { id: true, status: true, durationSec: true, lessonContent: true, studentTalkFocus: true },
  })
  if (!session) {
    console.log(`${id}: not found`)
    continue
  }
  // A locked report is one the teacher has closed; leave it alone.
  if (session.status === 'locked') {
    console.log(`${id}: locked, skipped`)
    continue
  }
  if (session.studentTalkFocus != null) {
    console.log(`${id}: already has one, skipped`)
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

  const describe = focus
    ? `classified=${focus.classified} onTopic=${focus.onTopic} procedural=${focus.procedural} offTopic=${focus.offTopic} unclear=${focus.unclear}`
    : 'not measurable (too few audible student turns, or the read failed) — left null'

  if (!write) {
    console.log(`${id}: would write → ${describe}`)
    continue
  }
  // Null stays null rather than being written as JSON null: "not measured" is
  // the absence of a value, and every reader is built around that.
  if (focus) {
    await prisma.audioSession.update({ where: { id }, data: { studentTalkFocus: focus } })
    console.log(`${id}: WROTE → ${describe}`)
  } else {
    console.log(`${id}: nothing to write → ${describe}`)
  }
}
await prisma.$disconnect()
