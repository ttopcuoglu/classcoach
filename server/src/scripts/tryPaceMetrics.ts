import 'dotenv/config'
import { analyzeTranscript } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const rows = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' }, take: 10,
  select: { id: true, durationSec: true, avgWaitTimeSec: true, metricsDetail: true },
})
console.log(['lesson', 'min', 'wpm', 'wait1', 'wait2', 'w2 n', 'firstWord', 'silence%'].join('\t'))
for (const r of rows) {
  const segs = (await prisma.transcriptSegment.findMany({
    where: { sessionId: r.id }, orderBy: { startSec: 'asc' },
    select: { speakerLabel: true, startSec: true, endSec: true, text: true },
  })).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  if (!segs.length) continue
  const a = analyzeTranscript(segs)
  const d = a.metricsDetail
  const silence = Math.max(0, 100 - (a.teacherTalkPct ?? 0) - (a.studentTalkPct ?? 0))
  console.log([
    r.id.slice(0, 8), Math.round((r.durationSec ?? 0) / 60),
    d.teacherWordsPerMinute ?? '—',
    a.avgWaitTimeSec ?? '—',
    d.waitTime2Sec ?? '—',
    d.waitTime2SampleCount ?? 0,
    d.firstWordSec != null ? mmss(d.firstWordSec) : '—',
    Math.round(silence) + '%',
  ].join('\t'))
}
await prisma.$disconnect()
