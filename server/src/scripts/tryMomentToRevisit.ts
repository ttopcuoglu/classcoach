import 'dotenv/config'
import type { Segment } from '../lib/audioAnalysis.ts'
import { readMomentToRevisit } from '../lib/momentToRevisit.ts'
import { prisma } from '../lib/prisma.ts'

// Runs the moment-to-revisit read against real stored lessons and prints what
// came back, without writing anything.
//
// The card's claim is that it names the weakest point of THIS lesson and can
// say so when it cannot. Neither is checkable from the prompt, only from
// lessons — so this prints every run, side by side with what the old ranking
// showed, and --runs N shows whether the same lesson gets the same answer.
//
//   tsx src/scripts/tryMomentToRevisit.ts --user you@example.com [--min 14] [--runs 2]
//   tsx src/scripts/tryMomentToRevisit.ts <sessionId> [--runs 3]

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const runs = Number(flag('--runs') ?? 1)
const email = flag('--user')
const minMinutes = Number(flag('--min') ?? 0)
const sessionId = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))

const t = (sec: number | null) => (sec == null ? '—' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`)

const where = sessionId
  ? { id: sessionId }
  : { user: { email: email ?? '' }, status: 'analyzed', durationSec: { gte: minMinutes * 60 } }
const sessions = await prisma.audioSession.findMany({
  where,
  orderBy: { sessionDate: 'desc' },
  // Named columns, so this runs against a database that has not had the
  // momentToRevisit migration yet — which is when it is most useful.
  select: {
    sessionDate: true,
    durationSec: true,
    lessonContent: true,
    highlights: true,
    segments: { orderBy: { startSec: 'asc' } },
  },
})

for (const session of sessions) {
  const segments: Segment[] = session.segments.map((s) => ({
    speakerLabel: s.speakerLabel,
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text,
  }))
  const summary = (session.lessonContent as { summary?: string } | null)?.summary ?? '(no summary)'
  const old = ((session.highlights ?? []) as { label: string; timestampSec: number; durationSec?: number }[]).find((h) =>
    h.label.includes('monologue'),
  )
  console.log(`\n=== ${session.sessionDate.toISOString().slice(0, 10)} · ${Math.round((session.durationSec ?? 0) / 60)} min · ${summary.slice(0, 90)}`)
  console.log(`    old card: longest monologue ${old?.durationSec ?? '—'}s at ${t(old?.timestampSec ?? null)}`)
  for (let run = 1; run <= runs; run++) {
    const moment = await readMomentToRevisit(segments)
    if (!moment) {
      console.log(`  [${run}] no usable reply`)
      continue
    }
    console.log(`  [${run}] ${moment.status.toUpperCase()}${moment.headline ? ` — ${moment.headline}` : ''}`)
    if (moment.status === 'found') {
      console.log(`      ${t(moment.timestampSec)} "${moment.quote}"`)
      console.log(`      why: ${moment.whyItMatters}`)
      console.log(`      try: ${moment.tryNext}`)
    }
  }
}
await prisma.$disconnect()
