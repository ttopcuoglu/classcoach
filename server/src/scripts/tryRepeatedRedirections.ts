import 'dotenv/config'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { extractTag } from '../lib/extractTag.ts'
import { normalizeForMatch } from '../lib/lessonObjective.ts'
import { prisma } from '../lib/prisma.ts'
import { quoteOrNull } from '../lib/quoteSafety.ts'
import { capturedShare, sharePct } from '../lib/transcriptCoverage.ts'

// Dry run, read-only: "Did the teacher repeatedly address the same behavior?"
// The model finds each behavior correction in context and files it under one
// expectation; the code verifies the words, de-duplicates, groups and
// decides. No phrase list anywhere — the model also decides which lines are
// the teacher's, since a circulating teacher is often labelled Student.
//
//   tsx src/scripts/tryRepeatedRedirections.ts <id>... [--runs 3]

const args = process.argv.slice(2)
const runsAt = args.indexOf('--runs')
const runs = runsAt === -1 ? 3 : Number(args[runsAt + 1])
const ids = args.filter((a, i) => !a.startsWith('--') && i !== runsAt + 1)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export const EXPECTATIONS = ['talking', 'work', 'devices', 'seats', 'materials', 'attention'] as const
type Expectation = (typeof EXPECTATIONS)[number]

const SYSTEM = `You are reading the transcript of a classroom recording. Each line has a time and a speaker label. The labels are unreliable: when the teacher walks around the room their voice is often labelled Student. Decide from the words and the context whether a line is the teacher speaking.

Find every BEHAVIOR CORRECTION the teacher makes: a moment where the teacher asks a student, a group or the class to stop or change a behavior. Calm and polite corrections count exactly as much as sharp ones; consequences or raised language are not required.

File each one under the expectation it is about:
- talking — stop talking, lower voices, side conversations, quiet, "shh" or "hush" when it appears in the transcript
- work — start the work, return to it, stay on it
- devices — phones, Chromebooks, screens used off-task
- seats — sitting down, staying in seats, standing, moving around, turning around
- materials — putting things away, not touching or playing with materials
- attention — eyes, facing the front, listening — ONLY when the context shows it is correcting behavior, not a routine cue to start or move on

NOT a correction:
- a single routine cue that opens a transition or an explanation ("eyes on me", "okay, listen up, here's what we're doing");
- explaining or re-explaining the assignment, directions, or how to do the work;
- academic corrections ("no, combine like terms first");
- "listen", "okay", "alright" with no clear behavior context;
- anything a student says.

Rules:
- Copy the teacher's words EXACTLY as they appear in the transcript, from one line, and give that line's time.
- A line that repeats the same correction ("shh, shh, shh", "quiet, quiet") is ONE correction.
- Be exhaustive and in order. NONE is a real answer for a lesson with no corrections.
- Do not judge whether a correction worked, and do not count or summarise. List only.

Write nothing outside these tags:
<corrections>
one per line as: exact words @ m:ss | expectation
</corrections>`

type Correction = { quote: string; sec: number; segIndex: number; expectation: Expectation; teacherLabelled: boolean }
type Finding = { expectation: Expectation; kind: 'stretch' | 'recurring'; start: number; end: number; corrections: Correction[] }

const STRETCH_GAP_SEC = 120
/// Asks about the same thing this close together are one moment: "Listen
/// up... listen up real fast... listen, please" inside five seconds is one
/// call for the room, not three.
const SAME_MOMENT_SEC = 15
const MIN_REPEATS = 3

function transcript(segments: Segment[]): string {
  const text = segments.map((s) => `[${mmss(s.startSec)}] ${s.speakerLabel}: ${s.text.trim()}`).join('\n')
  return text.slice(0, 90_000)
}

function parse(reply: string, segments: Segment[]): Correction[] {
  const body = extractTag(reply, 'corrections')
  if (!body || /^\s*NONE\s*$/i.test(body)) return []
  const norm = segments.map((s) => normalizeForMatch(s.text))
  const out: Correction[] = []
  const seen = new Set<string>()
  for (const line of body.split('\n')) {
    const [left, right] = line.split('|')
    const m = (left ?? '').match(/^(.*?)\s*@\s*(\d+):(\d{1,2})\s*$/)
    if (!m) continue
    const quote = m[1].trim().replace(/^["“']|["”']$/g, '')
    const q = normalizeForMatch(quote)
    if (q.length < 2) continue
    const claimed = Number(m[2]) * 60 + Number(m[3])
    // The words decide where it was said; the nearest matching line wins.
    let best = -1
    norm.forEach((t, i) => {
      if (t.includes(q) && (best === -1 || Math.abs(segments[i].startSec - claimed) < Math.abs(segments[best].startSec - claimed))) best = i
    })
    if (best === -1) continue
    const expectation = EXPECTATIONS.find((e) => (right ?? '').toLowerCase().includes(e))
    if (!expectation) continue
    // One correction per expectation per utterance: "shh, shh, shh" is one.
    const key = `${best}:${expectation}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ quote, sec: segments[best].startSec, segIndex: best, expectation, teacherLabelled: segments[best].speakerLabel === 'Teacher' })
  }
  return out.sort((a, b) => a.sec - b.sec)
}

function findings(corrections: Correction[]): Finding[] {
  const out: Finding[] = []
  for (const e of EXPECTATIONS) {
    // Only lines the transcript gives the teacher count toward a pattern;
    // the model's reassignments can still appear as evidence.
    const all = corrections.filter((c) => c.expectation === e && c.teacherLabelled)
    const list: Correction[] = []
    for (const c of all) if (!list.length || c.sec - list[list.length - 1].sec > SAME_MOMENT_SEC) list.push(c)
    if (list.length < MIN_REPEATS) continue
    // Stretches: runs of this expectation with no gap over STRETCH_GAP_SEC.
    const runs: Correction[][] = []
    let cur: Correction[] = []
    for (const c of list) {
      if (cur.length && c.sec - cur[cur.length - 1].sec > STRETCH_GAP_SEC) { runs.push(cur); cur = [] }
      cur.push(c)
    }
    runs.push(cur)
    const stretches = runs.filter((r) => r.length >= MIN_REPEATS)
    for (const r of stretches) out.push({ expectation: e, kind: 'stretch', start: r[0].sec, end: r[r.length - 1].sec, corrections: r })
    // Recurring: the same expectation came back across the lesson, beyond
    // what any single stretch already shows.
    const inStretch = new Set(stretches.flat())
    const outside = list.filter((c) => !inStretch.has(c))
    const spread = list[list.length - 1].sec - list[0].sec
    if (stretches.length === 0 || outside.length >= 2) {
      if (spread > STRETCH_GAP_SEC * 2 && runs.length >= 2) out.push({ expectation: e, kind: 'recurring', start: list[0].sec, end: list[list.length - 1].sec, corrections: list })
    }
  }
  return out
}

const summary: string[] = []
for (const id of ids) {
  const session = await prisma.audioSession.findUnique({ where: { id }, select: { createdAt: true, durationSec: true, metricsDetail: true } })
  if (!session) continue
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: id }, orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]
  const pct = sharePct(capturedShare(session.metricsDetail as never, session.durationSec))
  console.log(`\n${'='.repeat(72)}\n${session.createdAt.toISOString().slice(0, 10)} ${mmss(session.durationSec ?? 0)} ${id}  captured=${pct}%`)
  const keys: string[] = []
  for (let run = 1; run <= runs; run++) {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL, max_tokens: 3000, thinking: { type: 'disabled' }, system: SYSTEM,
      messages: [{ role: 'user', content: transcript(segments) }],
    })
    const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const corrections = parse(reply, segments)
    if (corrections.length === 0 || args.includes('--raw')) console.log(`  [raw reply, stop=${res.stop_reason}, ${reply.length} chars]\n${reply.slice(0, 1500)}`)
    const found = findings(corrections)
    const byExp = EXPECTATIONS.map((e) => `${e} ${corrections.filter((c) => c.expectation === e).length}`).filter((s) => !s.endsWith(' 0')).join(', ')
    console.log(`\n  run ${run}: ${corrections.length} corrections (${byExp || 'none'})`)
    for (const c of corrections) console.log(`    ${mmss(c.sec).padStart(6)} ${c.expectation.padEnd(10)} ${segments[c.segIndex].speakerLabel.padEnd(8)} ${JSON.stringify(c.quote.slice(0, 85))}`)
    for (const f of found) console.log(`  -> FINDING ${f.kind} ${f.expectation} ${mmss(f.start)}-${mmss(f.end)}  lead ${(() => { const l = f.corrections.find((c) => quoteOrNull(c.quote)); return l ? `${mmss(l.sec)} ${JSON.stringify(l.quote.slice(0, 60))}` : '(withheld)' })()}`)
    if (found.length === 0) console.log('  -> no repeated redirection pattern detected in the captured speech')
    keys.push(found.map((f) => `${f.kind}:${f.expectation}@${mmss(f.corrections.find((c) => quoteOrNull(c.quote))?.sec ?? f.start)}`).sort().join(' + ') || 'none')
  }
  const stable = keys.every((k) => k === keys[0])
  summary.push(`${session.createdAt.toISOString().slice(0, 10)} ${id} ${String(pct).padStart(3)}%  ${stable ? 'STABLE ' : 'WOBBLES'}  ${keys.join(' | ')}`)
}
console.log(`\n${'='.repeat(72)}\n${summary.join('\n')}`)
await prisma.$disconnect()
