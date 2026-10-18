import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { hashNotesInput, keepTeacherQuotes, parseNotesInput, writeInsightsNotes } from '../lib/insightsNotes.ts'
// The page's own model, so the notes are written from exactly what the page
// would send. Pure modules, no browser APIs.
import { buildInsightsModel, buildNotesInput } from '../../../web/src/lib/insightsModel.ts'
import { teacherVoiceView } from '../../../web/src/lib/teacherVoice.ts'
import type { AudioSessionWithSegments } from '../../../web/src/lib/api.ts'

// Writes the v3 coach notes for real lessons and prints them, with every
// section that failed its checks and fell back to the plain sentence.
// Changes nothing: the notes are not stored. Costs one or two model calls a
// lesson.
//
//   tsx src/scripts/tryInsightsNotes.ts <sessionId> [<sessionId> ...]
//   tsx src/scripts/tryInsightsNotes.ts --recent 3

const args = process.argv.slice(2)
const recentFlag = args.indexOf('--recent')
const ids =
  recentFlag === -1
    ? args
    : (
        await prisma.audioSession.findMany({
          where: { status: { in: ['analyzed', 'locked'] }, durationSec: { gte: 600 }, teachingMoves: { not: null as never } },
          orderBy: { createdAt: 'desc' },
          take: Number(args[recentFlag + 1]) || 3,
          select: { id: true },
        })
      ).map((s) => s.id)

const tally = { sections: 0, model: 0, template: 0, unavailable: 0 }
for (const id of ids) {
  const row = await prisma.audioSession.findUnique({
    where: { id },
    // Not read here, and absent until its migration is applied.
    omit: { insightsNotes: true },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })
  if (!row) continue
  // Dates and Decimals as the API would send them.
  const session = JSON.parse(JSON.stringify(row)) as AudioSessionWithSegments
  const parsed = parseNotesInput(buildNotesInput(buildInsightsModel(teacherVoiceView(session))))
  if ('error' in parsed) {
    console.log(`${id}  input refused: ${parsed.error}\n`)
    continue
  }
  const input = keepTeacherQuotes(parsed, row.segments)
  const notes = await writeInsightsNotes(input, hashNotesInput(input))
  console.log(`\n=== ${id}  ${row.classSubject ?? ''}`)
  for (const [key, note] of Object.entries(notes.sections)) {
    tally.sections++
    tally[note.source]++
    console.log(`\n[${key}] ${note.source}`)
    if (note.lead) console.log(`  lead: ${note.lead}`)
    for (const p of note.more) console.log(`  more: ${p}`)
    if (note.keep) console.log(`  keep: ${note.keep.text}  (${note.keep.evidenceId})`)
    if (note.try) console.log(`  try:  ${note.try.text}  (${note.try.evidenceId})\n        → ${note.try.rewrite}`)
    for (const l of note.guidanceLinks ?? []) {
      const stuck = input.sections.find((s) => s.key === key)?.stuck?.[l.stuckIndex]
      console.log(`  link: "${stuck}"  ↔  ${l.evidenceId}`)
    }
  }
}
console.log(`\n${tally.sections} sections: ${tally.model} written, ${tally.template} fell back, ${tally.unavailable} unavailable`)
await prisma.$disconnect()
