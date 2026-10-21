import 'dotenv/config'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { inScopeSegments } from '../lib/escalation.ts'
import { prisma } from '../lib/prisma.ts'
import { capturedShare, sharePct } from '../lib/transcriptCoverage.ts'

// Dry run, read-only: "how the room was run" from the teacher's words.
// Every teacher sentence is labelled content / procedure / behavior / praise /
// other by the model; the code does all the arithmetic. The question this
// answers is whether the two derived reads — recognition vs correction, and
// the share of talk spent on behavior — come out the same on repeated
// readings of the same lesson. Writes nothing.
//
//   tsx src/scripts/tryRoomRun.ts <id>... [--runs 3]
//   tsx src/scripts/tryRoomRun.ts --recent 14 [--runs 3]

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const runs = Number(flag('--runs') ?? 3)
const recent = flag('--recent')
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const SYSTEM = `You are reading the teacher's side of a classroom recording, one numbered sentence per line. Label EVERY sentence with one letter:
c — content: teaching, explaining, asking or answering about the subject, giving academic feedback (including correcting a wrong answer: "no, you need to combine like terms first" is content).
p — procedure: directions for the task, logistics, materials, timing, transitions ("take out your notebooks", "you have five minutes", "let's come back together").
b — behavior: addressing behavior or attention — quieting, redirecting, reminders of expectations, warnings, consequences ("shh", "eyes up here", "put your phone away", "back to work", "that's a warning").
r — recognition: naming something a student or the class did well, academically or in behavior ("nice, you used the formula", "thank you for getting started right away", "good job").
o — other: greetings, chit-chat, fragments too garbled to tell.
Judge each sentence in context. A sentence that is mostly one thing gets that label. Ignore any student speech that slipped in; label it o.
Reply with nothing but lines of the form: number letter`

type Sentence = { n: number; sec: number; text: string; words: number }

function sentences(segments: Segment[]): Sentence[] {
  const out: Sentence[] = []
  for (const s of inScopeSegments(segments)) {
    for (const piece of s.text.split(/(?<=[.!?])\s+/)) {
      const text = piece.trim()
      if (!text) continue
      out.push({ n: out.length + 1, sec: s.startSec, text, words: text.split(/\s+/).length })
    }
  }
  return out
}

async function label(list: Sentence[]): Promise<Map<number, string>> {
  const labels = new Map<number, string>()
  // Chunks keep each reply well inside the output budget.
  for (let i = 0; i < list.length; i += 250) {
    const chunk = list.slice(i, i + 250)
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      system: SYSTEM,
      messages: [{ role: 'user', content: chunk.map((s) => `${s.n} [${mmss(s.sec)}] ${s.text}`).join('\n') }],
    })
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    for (const m of text.matchAll(/^\s*(\d+)\s*[:\-.]?\s*([cpbro])\b/gim)) labels.set(Number(m[1]), m[2].toLowerCase())
  }
  return labels
}

const ids = recent
  ? (await prisma.audioSession.findMany({
      where: { status: 'analyzed', durationSec: { gte: 600 } },
      orderBy: { createdAt: 'desc' },
      take: Number(recent),
      select: { id: true },
    })).map((r) => r.id)
  : args.filter((a) => !a.startsWith('--') && a !== flag('--runs'))

const summary: string[] = []
for (const id of ids) {
  const session = await prisma.audioSession.findUnique({
    where: { id },
    select: { createdAt: true, durationSec: true, metricsDetail: true, feedbackLog: true, teachingMoves: true, redirectionLog: true, classSubject: true },
  })
  if (!session) continue
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: id }, orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]
  const pct = sharePct(capturedShare(session.metricsDetail as never, session.durationSec))
  const list = sentences(segments)
  const fb = (session.feedbackLog ?? []) as { kind?: string }[]
  const redir = ((session.teachingMoves as { redirections?: unknown[] } | null)?.redirections ?? (session.redirectionLog as unknown[] | null) ?? [])
  console.log(`\n${'='.repeat(70)}\n${session.createdAt.toISOString().slice(0, 10)} ${mmss(session.durationSec ?? 0)} ${id} ${session.classSubject ?? ''}  captured=${pct}%  sentences=${list.length}`)
  console.log(`  stored detectors: feedback ${fb.length} (specific ${fb.filter((f) => f.kind === 'specific').length}), redirections ${redir.length}`)

  const reads: string[] = []
  for (let run = 1; run <= runs; run++) {
    const labels = await label(list)
    const words: Record<string, number> = { c: 0, p: 0, b: 0, r: 0, o: 0 }
    const count: Record<string, number> = { c: 0, p: 0, b: 0, r: 0, o: 0 }
    for (const s of list) { const l = labels.get(s.n) ?? 'o'; words[l] += s.words; count[l]++ }
    const total = Object.values(words).reduce((a, b) => a + b, 0) || 1
    const pctOf = (k: string) => Math.round((100 * words[k]) / total)
    const balance = count.r === 0 && count.b === 0 ? 'neither' : count.r >= 1.5 * count.b ? 'more recognition' : count.b >= 1.5 * count.r ? 'more correction' : 'about even'
    const behaviorBand = pctOf('b') < 3 ? 'little' : pctOf('b') < 10 ? 'some' : 'a lot'
    reads.push(`${balance} / ${behaviorBand}`)
    console.log(`  run ${run}: labelled ${labels.size}/${list.length}  words% content ${pctOf('c')} procedure ${pctOf('p')} behavior ${pctOf('b')} recognition ${pctOf('r')} other ${pctOf('o')}  |  sentences praise ${count.r} vs behavior ${count.b}  ->  ${balance}, ${behaviorBand} on behavior`)
    if (run === 1) {
      const sample = (k: string) => list.filter((s) => labels.get(s.n) === k).slice(0, 4).map((s) => `${mmss(s.sec)} ${JSON.stringify(s.text.slice(0, 70))}`)
      console.log(`    behavior e.g.: ${sample('b').join(' · ')}`)
      console.log(`    praise e.g.:   ${sample('r').join(' · ')}`)
    }
  }
  const stable = reads.every((r) => r === reads[0])
  summary.push(`${session.createdAt.toISOString().slice(0, 10)} ${id} captured ${pct}%  ${stable ? 'STABLE  ' : 'WOBBLES '} ${reads.join(' | ')}`)
}
console.log(`\n${'='.repeat(70)}\n${summary.join('\n')}`)
await prisma.$disconnect()
