import 'dotenv/config'
import { addressedNamesIn, studentsCalledOn, type Segment } from '../lib/audioAnalysis.ts'
import { maskStudentNames, studentNameStandIns } from '../lib/studentNames.ts'
import { prisma } from '../lib/prisma.ts'

// What name masking (lib/studentNames.ts) would do to lessons already
// recorded. Reads only — never writes, whatever the flags.
//
//   tsx src/scripts/dryRunNameMasking.ts --all [--limit 40]
//       every teacher's recent analyzed lessons, numbers only, no words
//   tsx src/scripts/dryRunNameMasking.ts --user you@example.com [--limit 10]
//       one account's lessons, with the words masked and the capitalized
//       words kept, so misses and wrong masks can be read
//
// The checks per lesson: how many names would be masked; Students Called On
// and the addressed-name count before and after (they should not move); that
// every line keeps its word count (speaker-confidence alignment).

const args = process.argv.slice(2)
const all = args.includes('--all')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]
const limitFlag = args.indexOf('--limit')
const limit = limitFlag === -1 ? (all ? 40 : 10) : Number(args[limitFlag + 1])

if (!all && !userEmail) {
  console.error('Pass --all or --user <email>.')
  process.exit(1)
}

const user = userEmail ? await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } }) : null
if (userEmail && !user) {
  console.error(`No account for ${userEmail}.`)
  process.exit(1)
}

const sessions = await prisma.audioSession.findMany({
  where: { status: 'analyzed', ...(user ? { userId: user.id } : {}) },
  orderBy: { createdAt: 'desc' },
  take: limit,
  select: { id: true, createdAt: true, segments: { orderBy: { startSec: 'asc' }, select: { speakerLabel: true, startSec: true, endSec: true, text: true } } },
})

let lessons = 0
let lessonsWithNames = 0
let totalMasked = 0
let calledOnMoved = 0
let wordCountBroke = 0

for (const session of sessions) {
  const segments: Segment[] = session.segments
  if (segments.length === 0) continue
  lessons++
  const texts = segments.map((s) => s.text)
  const standIns = studentNameStandIns(texts)
  const { texts: masked } = maskStudentNames(texts)
  const after: Segment[] = segments.map((s, i) => ({ ...s, text: masked[i] }))

  const calledBefore = studentsCalledOn(segments).count
  const calledAfter = studentsCalledOn(after).count
  const addressedBefore = addressedNamesIn(segments).length
  const addressedAfter = addressedNamesIn(after).length
  const brokenLines = texts.filter((t, i) => t.split(/\s+/).length !== masked[i].split(/\s+/).length).length

  if (standIns.size > 0) lessonsWithNames++
  totalMasked += standIns.size
  if (calledBefore !== calledAfter) calledOnMoved++
  if (brokenLines > 0) wordCountBroke++

  const date = session.createdAt.toISOString().slice(0, 10)
  console.log(
    `${date} ${session.id}  lines ${segments.length}  names masked ${standIns.size}  ` +
      `called-on ${calledBefore}→${calledAfter}  addressed ${addressedBefore}→${addressedAfter}` +
      (brokenLines ? `  WORD COUNT CHANGED on ${brokenLines} lines` : ''),
  )

  if (!all) {
    console.log(`  masked: ${[...standIns.keys()].join(', ') || '—'}`)
    // Capitalized words left in the text, most frequent first — where a
    // missed student name would show up.
    const kept = new Map<string, number>()
    for (const t of masked) {
      for (const w of t.split(/\s+/).slice(1)) {
        const c = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/['’]s$/i, '')
        if (/^\p{Lu}\p{Ll}+$/u.test(c) && !/^Student/.test(c)) kept.set(c, (kept.get(c) ?? 0) + 1)
      }
    }
    const top = [...kept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    console.log(`  kept capitalized (top 25): ${top.map(([w, n]) => `${w}×${n}`).join(', ') || '—'}`)
  }
}

console.log(
  `\n${lessons} lessons · ${lessonsWithNames} would have names masked · ${totalMasked} names in all · ` +
    `Students Called On changed in ${calledOnMoved} · word count changed in ${wordCountBroke}`,
)
await prisma.$disconnect()
