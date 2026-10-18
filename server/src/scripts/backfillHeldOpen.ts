import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { QuestionLogEntry, Segment } from '../lib/audioAnalysis.ts'
import { readHeldOpen } from '../lib/heldOpen.ts'
import { prisma } from '../lib/prisma.ts'

// Reads how long each thinking question stayed open, for lessons analyzed
// before that read existed.
//
// One model call per lesson, over the lesson's existing higher-order
// questions — nothing else in the question log changes, so no count a
// teacher has already seen moves. Lessons already read are skipped.
//
// The demo and test accounts are skipped, as in backfillPauses.ts.
//
// Prints each question's result and writes nothing unless --write is passed.
// A dry run still makes the model calls.
//
//   tsx src/scripts/backfillHeldOpen.ts
//   tsx src/scripts/backfillHeldOpen.ts --user you@example.com --limit 3
//   tsx src/scripts/backfillHeldOpen.ts --write

const args = process.argv.slice(2)
const write = args.includes('--write')
const redo = args.includes('--redo')
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const userEmail = flag('--user')
const limit = flag('--limit') ? Number(flag('--limit')) : Infinity

function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

const sessions = await prisma.audioSession.findMany({
  where: {
    status: { in: ['analyzed', 'locked'] },
    ...(userEmail ? { user: { email: userEmail } } : {}),
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, questionLog: true, user: { select: { email: true } } },
})

const tally = { lessons: 0, read: 0, failed: 0, questions: 0, closed: 0, open: 0, task: 0, self: 0, skipped: 0, unmatched: 0, nested: 0, followUps: 0 }
const allSecs: number[] = []

for (const session of sessions) {
  if (tally.read + tally.failed >= limit) break
  if (isDemoAccount(session.user.email)) continue
  const log = (Array.isArray(session.questionLog) ? session.questionLog : []) as unknown as QuestionLogEntry[]
  const thinking = log.filter((q) => q.type === 'higher_order')
  if (thinking.length === 0) continue
  if (!redo && thinking.every((q) => q.heldOpen !== undefined)) continue
  tally.lessons++

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({
    speakerLabel: s.speakerLabel,
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text,
    speakerConfidence: s.speakerConfidence,
  }))

  const updated = await readHeldOpen(redo ? log.map(({ heldOpen: _h, ...rest }) => rest) : log, segments)
  console.log(`\n${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (!updated) {
    tally.failed++
    console.log('  read failed — left as it was')
    continue
  }
  tally.read++
  for (const q of updated.filter((x) => x.type === 'higher_order')) {
    tally.questions++
    const h = q.heldOpen
    const head = `  [${mmss(q.timestampSec)}] ${q.text.slice(0, 70)}`
    if (!h) {
      tally.unmatched++
      console.log(`${head}\n      — not measured`)
    } else if (h.outcome === 'not_thinking') {
      tally.skipped++
      console.log(`${head}\n      — not a thinking question`)
    } else if (h.outcome === 'follow_up') {
      tally.nested++
      console.log(`${head}\n      — a follow-up inside the question at ${mmss(h.partOfSec ?? 0)}, timed with it`)
    } else if (h.outcome === 'self_answered') {
      tally.self++
      console.log(`${head}\n      — ${h.questionType}; you answered it in the same breath`)
    } else if (h.outcome === 'task') {
      tally.task++
      console.log(`${head}\n      — ${h.questionType}; set as a task after ${h.sec}s${h.closedBy ? `: "${h.closedBy}"` : ''}`)
    } else if (h.outcome === 'open') {
      tally.open++
      console.log(`${head}\n      — ${h.questionType}; still open after 2 min`)
    } else {
      tally.closed++
      allSecs.push(h.sec ?? 0)
      console.log(`${head}\n      — ${h.questionType}; ${h.sec}s, ${h.how}${h.closedBy ? `: "${h.closedBy}"` : ' (phrase not found in the line)'}`)
    }
    for (const f of h?.followUps ?? []) {
      tally.followUps++
      console.log(`        follow-up at ${mmss(f.atSec)}: "${f.text}"`)
    }
  }

  if (write) {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { questionLog: updated as unknown as Prisma.InputJsonValue },
    })
  }
}

// The typical time as Insights shows it: closed and still-open questions,
// still-open counted at the window.
const typical = [...allSecs, ...Array(tally.open).fill(120)].sort((a, b) => a - b)
const mid = Math.floor(typical.length / 2)
const median = typical.length ? (typical.length % 2 ? typical[mid] : (typical[mid - 1] + typical[mid]) / 2) : null
console.log(
  `\n${tally.lessons} lessons, ${tally.read} read, ${tally.failed} failed${write ? ' (written)' : ' (dry run — nothing written)'}.` +
    `\n${tally.questions} higher-order questions: ${tally.skipped} not thinking questions, ${tally.self} answered in the same breath, ` +
    `${tally.task} set as tasks, ${tally.nested} follow-ups folded into an earlier question, ` +
    `${tally.closed} closed, ${tally.open} still open, ${tally.unmatched} not measured; ${tally.followUps} follow-ups heard.` +
    (median != null
      ? `\nTypical time held open: ${Math.round((median as number) * 10) / 10}s over ${typical.length}; ${typical.filter((s) => s >= 3).length} of ${typical.length} held 3s+.`
      : ''),
)
await prisma.$disconnect()
