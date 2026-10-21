import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'

// Read-only: how often the "it isn't holding" phrases appear in stored
// transcripts at all, before any model is asked about them.
const PHRASES: [string, RegExp][] = [
  ['repeat', /\b(again,|i already (asked|told)|how many times|third time|not going to repeat|like i said|what did i (just )?say)\b/i],
  ['unheard', /\b(talking over me|speak over you|talk over you|you need to hear this|let me finish)\b/i],
  ['cant_continue', /\b(keep getting interrupted|can'?t continue|not getting through|stop and reset|wasting (my |our )?time|we can'?t (go on|move on|keep going))\b/i],
  ['frustration', /\b(that'?s enough|enough\.|this needs to stop)\b/i],
]
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const sessions = await prisma.audioSession.findMany({ where: { status: 'analyzed' }, select: { id: true, createdAt: true } })
const tally: Record<string, number> = {}
for (const s of sessions) {
  const segs = await prisma.transcriptSegment.findMany({ where: { sessionId: s.id }, orderBy: { startSec: 'asc' }, select: { startSec: true, speakerLabel: true, text: true } })
  for (const seg of segs) for (const [kind, re] of PHRASES) {
    const m = seg.text.match(re)
    if (!m) continue
    tally[kind] = (tally[kind] ?? 0) + 1
    console.log(`${s.createdAt.toISOString().slice(0, 10)} ${s.id} ${mmss(seg.startSec).padStart(6)} ${kind.padEnd(13)} ${seg.speakerLabel.padEnd(8)} ${JSON.stringify(seg.text.slice(0, 110))}`)
  }
}
console.log(`\n${sessions.length} lessons`, tally)
await prisma.$disconnect()
