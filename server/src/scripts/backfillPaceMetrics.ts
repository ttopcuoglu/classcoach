import 'dotenv/config'
import { analyzeTranscript } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'

// Adds speaking pace, the pause after an answer, and the first-word timestamp
// to reports analyzed before they existed.
//
// Deliberately NOT a re-analysis. All three are arithmetic on the stored
// segments, so they can be computed now and merged in — while every other
// number in metricsDetail is left exactly as the teacher already read it. A
// full recompute would rewrite question counts and the like, and the transcript
// reads behind those are not deterministic.
//
// Scoped by account on purpose. Most sessions in this database belong to the
// seeded demo school and the demo teacher, which other notes say to keep out
// of bulk operations — and a backfill across every row is exactly that.
//
//   tsx src/scripts/backfillPaceMetrics.ts --user you@example.com
//   tsx src/scripts/backfillPaceMetrics.ts --user you@example.com --write
//   tsx src/scripts/backfillPaceMetrics.ts --all [--write]
//   tsx src/scripts/backfillPaceMetrics.ts --all --pace-only [--write]
//
// --pace-only rewrites speaking pace alone on every report that has one, for
// when the pace measure changes (2026-10-20: short pauses now count). Nothing
// else in metricsDetail is touched.
const write = process.argv.includes('--write')
const paceOnly = process.argv.includes('--pace-only')
const all = process.argv.includes('--all')
const userFlag = process.argv.indexOf('--user')
const userEmail = userFlag === -1 ? null : process.argv[userFlag + 1]
if (!all && !userEmail) {
  console.error('Pass --user <email> to scope this, or --all to mean it.')
  process.exit(1)
}
const userIds = userEmail
  ? (await prisma.user.findMany({ where: { email: userEmail }, select: { id: true } })).map((u) => u.id)
  : null
if (userIds && userIds.length === 0) {
  console.error(`No user with email ${userEmail}`)
  process.exit(1)
}
const KEYS = paceOnly ? (['teacherWordsPerMinute'] as const) : (['teacherWordsPerMinute', 'waitTime2Sec', 'waitTime2SampleCount', 'firstWordSec'] as const)

const rows = await prisma.audioSession.findMany({
  where: {
    status: { in: ['analyzed', 'locked'] },
    ...(userIds ? { userId: { in: userIds } } : {}),
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true, status: true, metricsDetail: true },
})

let changed = 0
for (const r of rows) {
  const detail = (r.metricsDetail ?? null) as Record<string, number | null> | null
  if (!detail) continue
  if (!paceOnly && KEYS.every((k) => k in detail)) continue
  if (paceOnly && detail.teacherWordsPerMinute == null) continue

  const segments = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: r.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  if (segments.length === 0) continue

  const fresh = analyzeTranscript(segments).metricsDetail
  const merged: Record<string, number | null> = { ...detail }
  for (const k of KEYS) merged[k] = fresh[k] ?? null
  if (paceOnly && merged.teacherWordsPerMinute === detail.teacherWordsPerMinute) continue

  // A locked report is one the teacher has closed. Adding a number to it is
  // still a change to something they consider finished, so it is skipped.
  if (r.status === 'locked') {
    console.log(`${r.id.slice(0, 8)}: locked, skipped`)
    continue
  }
  changed++
  console.log(
    `${r.id.slice(0, 8)}: ${write ? 'WROTE' : 'would write'} wpm=${paceOnly ? `${detail.teacherWordsPerMinute} -> ` : ''}${merged.teacherWordsPerMinute ?? '—'} wait2=${merged.waitTime2Sec ?? '—'} (n=${merged.waitTime2SampleCount ?? 0}) firstWord=${merged.firstWordSec ?? '—'}s`,
  )
  if (write) await prisma.audioSession.update({ where: { id: r.id }, data: { metricsDetail: merged } })
}
console.log(`\n${changed} session${changed === 1 ? '' : 's'} ${write ? 'updated' : 'would be updated'}`)
await prisma.$disconnect()
