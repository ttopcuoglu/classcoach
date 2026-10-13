import 'dotenv/config'
import type { Segment } from '../lib/audioAnalysis.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { requestClassSummaryText } from '../routes/audioSessions.ts'

// Runs the class-summary call against real stored lessons and prints the
// per-section "next time" lines it returns, without writing anything.
//
// Those lines ride in the summary's own call, so the two things worth seeing
// are whether they are concrete enough to act on, and whether adding them
// disturbed the blocks that were already there.
//
//   tsx src/scripts/tryNextSteps.ts --user you@example.com [--min 14] [--take 3]

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}

const sessions = await prisma.audioSession.findMany({
  where: { user: { email: flag('--user') ?? '' }, status: 'analyzed', durationSec: { gte: Number(flag('--min') ?? 0) * 60 } },
  orderBy: { sessionDate: 'desc' },
  take: Number(flag('--take') ?? 3),
  // Named columns, so this runs before the nextSteps migration has.
  select: {
    id: true, sessionDate: true, durationSec: true, teacherTalkPct: true, studentTalkPct: true, questionCount: true,
    higherOrderPct: true, avgWaitTimeSec: true, cfuCount: true, cfuLog: true, feedbackLog: true, directiveLog: true,
    toneLog: true, redirectionLog: true, metricsDetail: true, lessonContent: true, studentTalkFocus: true,
    segments: { orderBy: { startSec: 'asc' } },
  },
})

for (const session of sessions) {
  const segments: Segment[] = session.segments.map((s) => ({
    speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text,
  }))
  const summary = (session.lessonContent as { summary?: string } | null)?.summary ?? '(no summary)'
  console.log(`\n=== ${session.sessionDate.toISOString().slice(0, 10)} · ${summary.slice(0, 90)}`)
  const text = await requestClassSummaryText(session, segments)
  const present = ['class_summary', 'checks_note', 'climate_note', 'talk_note', 'questions_note', 'content_note', 'connection_ideas']
    .map((tag) => `${tag}:${extractTag(text, tag) ? 'ok' : 'MISSING'}`)
  console.log(`    blocks  ${present.join(' ')}`)
  const words = ['talk_note', 'questions_note', 'checks_note', 'climate_note', 'content_note']
    .map((tag) => `${tag}:${(extractTag(text, tag) ?? '').split(/\s+/).filter(Boolean).length}`)
  console.log(`    words   ${words.join(' ')}`)
  console.log(`    questions note: ${extractTag(text, 'questions_note')}`)
  if (/%|coded as|logged as|marked as|recogni[sz]ed as|the system|figure comes from|detected by/i.test(text)) {
    const hits = text.match(/[^.\n]*(?:\d%|coded as|logged as|marked as|recogni[sz]ed as|the system|figure comes from|detected by)[^.\n]*\./gi) ?? []
    console.log(`    watch: ${hits.slice(0, 6).join(' | ')}`)
  }
  for (const key of ['talk', 'questions', 'climate']) {
    console.log(`    ${key.padEnd(9)} ${extractTag(text, `${key}_next`) ?? '(no tag)'}`)
  }
}
await prisma.$disconnect()
