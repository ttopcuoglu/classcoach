// Moves the demo story up to today, so it can be shown again.
//
// The principal dashboard counts from "now" (a weekly chart, a 7-day default),
// so a seeded school goes quiet a week after it was built — the data is all
// still there, it has just slid out of every window. This shifts the seeded
// history of Maple Ridge Academy (its staff, demo.teacher and the principal)
// forward by whole days, so the newest of it lands today and every gap, trend
// and before/after stays exactly as it was.
//
// Prints what it would move and changes nothing unless --write is passed:
//
//   npx tsx --env-file=.env src/scripts/refreshDemoDates.ts [--write]
//
// Only rows at or before the newest staff activity move. Anything newer —
// something done live in a demo — stays where it is, and nothing is ever
// moved into the future. Lessons that land on a weekend go back to the Friday.

import { prisma } from '../lib/prisma.ts'

const SCHOOL_NAME = 'Maple Ridge Academy'
const STAFF_DOMAIN = 'mapleridge.example'
const DEMO_EMAILS = ['demo.teacher@wivoza.com', 'demo.principal@wivoza.com']
const DAY = 24 * 60 * 60 * 1000

const write = process.argv.includes('--write')

// Per table: the column that decides whether a row is part of the seeded
// history, and every date column that moves with it.
const TABLES: { table: string; pick: string; shift: string[] }[] = [
  { table: 'UsageLog', pick: 'createdAt', shift: ['createdAt'] },
  { table: 'ScenarioAttempt', pick: 'createdAt', shift: ['createdAt', 'triedAt'] },
  { table: 'Debrief', pick: 'createdAt', shift: ['createdAt', 'triedAt', 'telegramWrapUpOfferedAt'] },
  { table: 'CoachFollowUp', pick: 'createdAt', shift: ['createdAt', 'dueAt', 'telegramSentAt'] },
  { table: 'ParentMessage', pick: 'createdAt', shift: ['createdAt'] },
  { table: 'ConversationPrep', pick: 'createdAt', shift: ['createdAt'] },
  { table: 'ConversationPlan', pick: 'createdAt', shift: ['createdAt'] },
  { table: 'AssignmentCoachSession', pick: 'createdAt', shift: ['createdAt'] },
  { table: 'LessonPlan', pick: 'createdAt', shift: ['createdAt'] },
]

function shiftIso(value: unknown, days: number): unknown {
  if (typeof value !== 'string') return value
  const t = Date.parse(value)
  return Number.isNaN(t) ? value : new Date(t + days * DAY).toISOString()
}

// [{ ..., createdAt: iso }] — conversation turns carry their own timestamps.
function shiftTurns(turns: unknown, days: number): unknown {
  if (!Array.isArray(turns)) return turns
  return turns.map((t) => (t && typeof t === 'object' && 'createdAt' in t ? { ...t, createdAt: shiftIso((t as { createdAt: unknown }).createdAt, days) } : t))
}

// A lesson is a school day; evenings and weekends are fine for everything else.
function onSchoolDay(d: Date): Date {
  const weekdayEt = new Date(d.getTime() - 4 * 60 * 60 * 1000).getUTCDay()
  if (weekdayEt === 6) return new Date(d.getTime() - DAY)
  if (weekdayEt === 0) return new Date(d.getTime() - 2 * DAY)
  return d
}

const org = await prisma.organization.findFirst({ where: { name: SCHOOL_NAME } })
if (!org) throw new Error(`${SCHOOL_NAME} not found — run seedAdminDemo.ts first.`)
const users = await prisma.user.findMany({
  where: { OR: [{ email: { endsWith: `@${STAFF_DOMAIN}` } }, { email: { in: DEMO_EMAILS } }] },
  select: { id: true, email: true },
})
const staffIds = users.filter((u) => u.email.endsWith(`@${STAFF_DOMAIN}`)).map((u) => u.id)
const ids = users.map((u) => u.id)

// The newest staff activity is where the seeded story ends.
const newest = await prisma.usageLog.findFirst({ where: { userId: { in: staffIds } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
if (!newest) throw new Error('No staff activity to move.')
const anchor = newest.createdAt
const now = new Date()
const days = Math.floor((now.getTime() - anchor.getTime()) / DAY)
console.log(`Seeded story ends ${anchor.toISOString()}; moving it forward ${days} day(s) to end ${new Date(anchor.getTime() + days * DAY).toISOString()}.`)
if (days < 1) {
  console.log('Already current.')
  await prisma.$disconnect()
  process.exit(0)
}

const sessions = await prisma.audioSession.findMany({
  where: { userId: { in: ids }, sessionDate: { lte: anchor } },
  select: { id: true, sessionDate: true, createdAt: true, followUpDate: true, transcribeStartedAt: true, reflectConversation: true },
})
const debriefs = await prisma.debrief.findMany({ where: { userId: { in: ids }, createdAt: { lte: anchor } }, select: { id: true, conversation: true } })
const focusAreas = await prisma.pdFocusArea.findMany({ where: { organizationId: org.id, createdAt: { lte: anchor } } })

for (const t of TABLES) {
  const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*) FROM "${t.table}" WHERE "userId" = ANY($1) AND "${t.pick}" <= $2`,
    ids,
    anchor,
  )
  console.log(`  ${t.table.padEnd(24)} ${count}`)
}
console.log(`  ${'AudioSession'.padEnd(24)} ${sessions.length}`)
console.log(`  ${'PdFocusArea'.padEnd(24)} ${focusAreas.length}`)
console.log(`  ${'User'.padEnd(24)} ${users.length}`)

if (!write) {
  console.log('\nDry run — pass --write to move them.')
  await prisma.$disconnect()
  process.exit(0)
}

await prisma.$transaction(
  async (tx) => {
    const iv = `make_interval(days => ${days})`
    for (const t of TABLES) {
      await tx.$executeRawUnsafe(
        `UPDATE "${t.table}" SET ${t.shift.map((c) => `"${c}" = "${c}" + ${iv}`).join(', ')} WHERE "userId" = ANY($1) AND "${t.pick}" <= $2`,
        ids,
        anchor,
      )
    }
    for (const d of debriefs) {
      if (Array.isArray(d.conversation)) await tx.debrief.update({ where: { id: d.id }, data: { conversation: shiftTurns(d.conversation, days) as object } })
    }
    for (const s of sessions) {
      const sessionDate = onSchoolDay(new Date(s.sessionDate.getTime() + days * DAY))
      const moved = sessionDate.getTime() - s.sessionDate.getTime()
      const by = (d: Date | null) => (d ? new Date(d.getTime() + moved) : d)
      await tx.audioSession.update({
        where: { id: s.id },
        data: {
          sessionDate,
          createdAt: by(s.createdAt)!,
          followUpDate: by(s.followUpDate),
          transcribeStartedAt: by(s.transcribeStartedAt),
          ...(Array.isArray(s.reflectConversation) ? { reflectConversation: shiftTurns(s.reflectConversation, moved / DAY) as object } : {}),
        },
      })
      await tx.$executeRawUnsafe(`UPDATE "TranscriptSegment" SET "createdAt" = "createdAt" + make_interval(secs => $1) WHERE "sessionId" = $2`, moved / 1000, s.id)
    }
    for (const f of focusAreas) {
      const snapshot = f.baselineSnapshot as Record<string, unknown> | null
      await tx.pdFocusArea.update({
        where: { id: f.id },
        data: {
          createdAt: new Date(f.createdAt.getTime() + days * DAY),
          ...(snapshot ? { baselineSnapshot: { ...snapshot, capturedAt: shiftIso(snapshot.capturedAt, days) } as object } : {}),
        },
      })
    }
    await tx.$executeRawUnsafe(
      `UPDATE "User" SET "createdAt" = "createdAt" + make_interval(days => ${days}), "onboardingCompletedAt" = "onboardingCompletedAt" + make_interval(days => ${days}) WHERE "id" = ANY($1) AND "createdAt" <= $2`,
      ids,
      anchor,
    )
    await tx.organization.update({
      where: { id: org.id },
      data: {
        createdAt: new Date(org.createdAt.getTime() + days * DAY),
        pilotEndsAt: org.pilotEndsAt ? new Date(org.pilotEndsAt.getTime() + days * DAY) : null,
      },
    })
  },
  { timeout: 120_000 },
)
console.log(`\nMoved ${SCHOOL_NAME}'s demo history forward ${days} day(s).`)
await prisma.$disconnect()
