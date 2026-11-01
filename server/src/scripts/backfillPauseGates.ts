import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { pauseGatesOf } from '../lib/pauseGates.ts'

// Stores, on lessons analysed before it existed, whether wait time and the
// pause after an answer may be shown (lib/pauseGates.ts). Every reader now
// follows that stored decision and shows neither number without it.
//
// Reads only what is already stored — the sample counts — and adds pauseGates;
// nothing else in metricsDetail is touched. A lesson that already has one is
// left alone unless --redo.
//
//   tsx src/scripts/backfillPauseGates.ts --all            (dry run)
//   tsx src/scripts/backfillPauseGates.ts --all --write
const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
if (!process.argv.includes('--all')) {
  console.error('Pass --all to mean it (a dry run unless --write).')
  process.exit(1)
}

const rows = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, avgWaitTimeSec: true, metricsDetail: true },
})

const tally: Record<string, number> = {}
let changed = 0
console.log(['lesson', 'date', 'wait', 'samples', 'wait shown', 'after answer', 'samples', 'after answer shown'].join('\t'))
for (const r of rows) {
  const detail = (r.metricsDetail ?? {}) as Record<string, unknown>
  if (detail.pauseGates && !redo) continue
  const gates = pauseGatesOf(detail)
  for (const [k, g] of Object.entries({ wait: gates.waitTime, after: gates.waitTime2 })) {
    const key = `${k}: ${g.shown ? 'shown' : g.reason}`
    tally[key] = (tally[key] ?? 0) + 1
  }
  console.log(
    [
      r.id.slice(0, 8),
      r.createdAt.toISOString().slice(0, 10),
      r.avgWaitTimeSec ?? '—',
      detail.waitTimeSampleCount ?? '—',
      gates.waitTime.shown ? 'yes' : gates.waitTime.reason,
      detail.waitTime2Sec ?? '—',
      detail.waitTime2SampleCount ?? '—',
      gates.waitTime2.shown ? 'yes' : gates.waitTime2.reason,
    ].join('\t'),
  )
  if (write) {
    await prisma.audioSession.update({ where: { id: r.id }, data: { metricsDetail: { ...detail, pauseGates: gates } as object } })
  }
  changed++
}
console.log(`\n${changed} lesson(s) ${write ? 'written' : 'would be written (dry run)'}:`, tally)
await prisma.$disconnect()
