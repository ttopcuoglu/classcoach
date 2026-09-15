import { prisma } from './prisma.ts'

// Enforces each teacher's "delete my recordings after N days" setting.
// Every Lesson Debrief session is stamped with deleteAfter when it's created
// (see audioSessions.ts); this deletes the ones past that date for everyone,
// whether or not the teacher ever opens Wivoza again. Transcript segments go
// with their session (onDelete: Cascade).
//
// Runs inside the API process — on startup and then every few hours — so it
// needs no separate worker. On by default only when hosted on Render (which
// sets RENDER=true on every service): a developer's local server can point at
// the real database, and a sweep there should be a deliberate choice
// (RETENTION_CLEANUP=on), not a side effect of `npm run dev`.

const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_SWEEP_DELAY_MS = 60 * 1000

export async function deleteExpiredAudioSessions(now = new Date()): Promise<number> {
  const { count } = await prisma.audioSession.deleteMany({ where: { deleteAfter: { lt: now } } })
  return count
}

async function sweep() {
  try {
    const count = await deleteExpiredAudioSessions()
    if (count > 0) console.log(`[retention] deleted ${count} expired Lesson Debrief session(s)`)
  } catch (error) {
    console.error('[retention] sweep failed:', error)
  }
}

export function startRetentionSweeps() {
  const setting = process.env.RETENTION_CLEANUP
  const enabled = setting === 'on' || (setting !== 'off' && process.env.RENDER === 'true')
  if (!enabled) return
  setTimeout(() => void sweep(), FIRST_SWEEP_DELAY_MS).unref()
  setInterval(() => void sweep(), SWEEP_EVERY_MS).unref()
}
