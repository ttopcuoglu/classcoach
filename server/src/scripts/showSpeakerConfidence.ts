import 'dotenv/config'
import { VOICE_DOUBT_BELOW, type SpeakerConfidenceRuns } from '../lib/deepgram.ts'
import { prisma } from '../lib/prisma.ts'

// The readout for Deepgram's per-word speaker confidence: does it pick out
// the lines where a student was folded into the teacher?
//
// For each lesson, the confidence of the teacher's words as a spread, and
// every teacher line holding a run below the threshold, with the low words
// marked — so the lines can be read against the transcript and the
// recording's own story ("that was a student") before anything relies on
// it. Read-only.
//
//   tsx src/scripts/showSpeakerConfidence.ts <sessionId> [--below 0.35]
//   tsx src/scripts/showSpeakerConfidence.ts --user you@example.com --latest

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const below = Number(flag('--below') ?? VOICE_DOUBT_BELOW)
const userEmail = flag('--user')
const sessionId = args.find((a) => !a.startsWith('--') && a !== userEmail && a !== flag('--below'))

const session = sessionId
  ? await prisma.audioSession.findUnique({ where: { id: sessionId }, select: { id: true, title: true, createdAt: true } })
  : userEmail
    ? await prisma.audioSession.findFirst({
        where: { user: { email: userEmail }, status: { in: ['tagging', 'analyzing', 'analyzed', 'locked'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true },
      })
    : null
if (!session) throw new Error('Pass a session id, or --user <email> --latest.')

const segments = await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
const withRuns = segments.filter((s) => Array.isArray(s.speakerConfidence))
console.log(`${session.id}  ${session.createdAt.toISOString().slice(0, 10)}  ${session.title ?? ''}`)
if (withRuns.length === 0) {
  console.log('No speaker confidence on this lesson — it was transcribed before it was kept.')
  process.exit(0)
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const teacherWords: number[] = []
let flagged = 0
for (const s of withRuns) {
  if (s.speakerLabel !== 'Teacher') continue
  const runs = s.speakerConfidence as unknown as SpeakerConfidenceRuns
  for (const [n, c] of runs) for (let k = 0; k < n; k++) teacherWords.push(c)
  if (!runs.some(([, c]) => c < below)) continue
  flagged++
  const words = s.text.trim().split(/\s+/)
  let i = 0
  const marked = runs
    .map(([n, c]) => {
      const part = words.slice(i, i + n).join(' ')
      i += n
      return c < below ? `[[${part}]](${c})` : part
    })
    .join(' ')
  console.log(`  ${mmss(s.startSec)}  ${marked}`)
}

const sorted = teacherWords.sort((a, b) => a - b)
const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
console.log(
  `\n${withRuns.length} lines with confidence. Teacher words: ${sorted.length}; ` +
    `10th/50th/90th percentile ${q(0.1)} / ${q(0.5)} / ${q(0.9)}; ` +
    `${sorted.filter((c) => c < below).length} below ${below}, in ${flagged} lines (marked [[ ]] above).`,
)
await prisma.$disconnect()
