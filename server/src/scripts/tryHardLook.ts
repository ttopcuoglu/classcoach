import 'dotenv/config'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { CORE_COACHING_RULES, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import {
  buildHardLookEvidence,
  buildHardLookSystemPrompt,
  longestTeacherStretch,
  parseHardLook,
  sectionEligibility,
  unaccountedSections,
} from '../lib/hardLook.ts'
import { prisma } from '../lib/prisma.ts'

// Runs The Hard Look against a real stored lesson and prints what came back,
// without writing anything.
//
// This exists because the feature's whole value rests on a claim that is easy
// to assert and easy to get wrong: that it criticises only what the evidence
// carries, and comes back clear when it doesn't. A single run cannot show
// that. So this takes --runs N and prints every run, so the question "does it
// say the same thing twice, and does `clear` ever actually fire" has an answer
// from data rather than from the prompt's good intentions.
//
//   tsx src/scripts/tryHardLook.ts --user you@example.com --list
//   tsx src/scripts/tryHardLook.ts <sessionId> [--runs 3]
//   tsx src/scripts/tryHardLook.ts --user you@example.com --latest [--runs 3]
//
// --raw also prints each reply verbatim, with its stop reason and block types
// — which is how the missing-text-blocks failure above was found.

const args = process.argv.slice(2)
const latest = args.includes('--latest')
const list = args.includes('--list')
const runsFlag = args.indexOf('--runs')
const runs = runsFlag === -1 ? 1 : Math.max(1, Number(args[runsFlag + 1]) || 1)
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]
const sessionId =
  args.find((a) => !a.startsWith('--') && a !== userEmail && a !== args[runsFlag + 1]) ?? null

/// Exactly the columns `buildHardLookEvidence` reads, and no more — so this
/// runs against a database that has not had the `hardLook` migration applied
/// yet, which is the whole point of trying the prompt before deploying it.
const EVIDENCE_SELECT = {
  id: true,
  durationSec: true,
  teacherTalkPct: true,
  studentTalkPct: true,
  metricsDetail: true,
  questionLog: true,
  cfuLog: true,
  feedbackLog: true,
  directiveLog: true,
  toneLog: true,
  redirectionLog: true,
  lessonContent: true,
} as const

async function resolveSession() {
  if (sessionId) {
    return prisma.audioSession.findUnique({ where: { id: sessionId }, select: EVIDENCE_SELECT })
  }
  if (!userEmail || !latest) throw new Error('Pass a session id, or --user <email> --latest.')
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
  if (!user) throw new Error(`No user with email ${userEmail}`)
  return prisma.audioSession.findFirst({
    where: { userId: user.id, status: { in: ['analyzed', 'locked'] } },
    orderBy: { createdAt: 'desc' },
    select: EVIDENCE_SELECT,
  })
}

async function listSessions() {
  if (!userEmail) throw new Error('--list needs --user <email>.')
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
  if (!user) throw new Error(`No user with email ${userEmail}`)
  const rows = await prisma.audioSession.findMany({
    where: { userId: user.id, status: { in: ['analyzed', 'locked'] } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, createdAt: true, durationSec: true, questionCount: true, status: true },
  })
  for (const r of rows) {
    const mins = r.durationSec == null ? '  -' : String(Math.round(r.durationSec / 60)).padStart(3)
    console.log(
      `${r.createdAt.toISOString().slice(0, 16)}  ${mins}min  q=${String(r.questionCount ?? '-').padStart(3)}  ${r.status.padEnd(9)} ${r.id}`,
    )
  }
}

async function main() {
  if (list) {
    await listSessions()
    return
  }
  const session = await resolveSession()
  if (!session) throw new Error('No matching session.')

  const segments = (
    await prisma.transcriptSegment.findMany({
      where: { sessionId: session.id },
      orderBy: { startSec: 'asc' },
    })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))

  const evidence = buildHardLookEvidence({ ...session, segments })
  // The route's own two refusals, reported rather than applied, so a run here
  // is never mistaken for one a teacher could actually get.
  const refusals: string[] = []
  if ((session.durationSec ?? 0) < 10 * 60) refusals.push('under 10 minutes')
  if (evidence.items.length < 8) refusals.push(`only ${evidence.items.length} citable moments (needs 8)`)
  console.log(
    `\n=== ${session.id} · ${Math.round((session.durationSec ?? 0) / 60)}min · ${evidence.items.length} citable moments ===` +
      (refusals.length > 0 ? `\n  ROUTE WOULD REFUSE: ${refusals.join('; ')}` : ''),
  )
  for (const fact of evidence.facts) console.log(`  ${fact}`)

  const { eligible, withheld } = sectionEligibility(session)
  console.log(`  asked about: ${eligible.map((s) => s.key).join(', ') || '(none — route would refuse)'}`)
  for (const w of withheld) console.log(`  withheld [${w.section}] ${w.reason}`)
  if (eligible.length === 0) return

  const stretch = longestTeacherStretch(segments)
  if (stretch) {
    console.log(`  longest teacher stretch: ${Math.round(stretch.durationSec)}s from ${Math.floor(stretch.startSec / 60)}:${String(Math.round(stretch.startSec % 60)).padStart(2, '0')}`)
  }

  const system = buildHardLookSystemPrompt(evidence, eligible, withheld, stretch, `${CORE_COACHING_RULES}\n${TRANSCRIPT_RELIABILITY_NOTICE}`)

  for (let run = 1; run <= runs; run++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      // Same reason as classroomMoves' and lessonObjective's: adaptive
      // thinking draws from this budget, and left on it spent all 2500 tokens
      // here and returned a reply with no text blocks in it at all.
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: 'Write the hard look now.' }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    if (args.includes('--raw')) console.log(`\n~~~ raw run ${run} · stop=${response.stop_reason} · blocks=${response.content.map((b) => b.type).join(',')} · out=${response.usage.output_tokens} ~~~\n${text}\n~~~`)
    const parsed = parseHardLook(text, evidence.items)
    const missing = unaccountedSections(parsed, eligible)

    console.log(`\n--- run ${run}: ${parsed.critiques.length} critique(s), ${parsed.cleared.length} clear(s)${missing.length ? ` — UNACCOUNTED: ${missing.join(', ')} (route would retry)` : ''}`)
    for (const c of parsed.critiques) {
      console.log(`\n  [${c.section}] ${c.headline}`)
      console.log(`    ${c.critique}`)
      console.log(`    cost: ${c.likelyCost || '(none)'}`)
      console.log(`    next: ${c.nextStep || '(NONE — missing)'}`)
      for (const e of c.evidence) console.log(`    · ${Math.floor(e.timestampSec / 60)}:${String(Math.round(e.timestampSec % 60)).padStart(2, '0')} "${e.text.slice(0, 90)}"`)
    }
    for (const c of parsed.cleared) console.log(`\n  [${c.section}] CLEAR — ${c.reason}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
