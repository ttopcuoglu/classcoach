import { createHmac, timingSafeEqual } from 'node:crypto'
import { isLeaderLevel, LEADER_AREAS, type LeaderLevel, type LeaderProfile } from './leaderLevels.ts'
import { LEADER_AUDIENCES, scenariosFor, type LeaderAudience, type LeaderScenario } from './leaderScenarios.ts'

// "Generate a scenario" in Leader's Corner. A generated scenario is not
// stored anywhere: its id carries the scenario itself, signed by the server,
// so Get a hint, Walk me through it and Get Feedback all take it exactly like
// a curated id — and a typed-up or edited one is not found. The signature
// also pins the level it was written for, so an assistant can't replay a
// superintendent's.

const PREFIX = 'gen.'

type Payload = { l: LeaderLevel; a: LeaderAudience; t: string; x: string }

function secret(): string {
  const value = process.env.JWT_SECRET
  if (!value) throw new Error('JWT_SECRET is not set')
  return value
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(`leader-generated:${body}`).digest('base64url')
}

export function signGenerated(level: LeaderLevel, audience: LeaderAudience, title: string, text: string): LeaderScenario {
  const body = Buffer.from(JSON.stringify({ l: level, a: audience, t: title, x: text } satisfies Payload)).toString('base64url')
  return { id: `${PREFIX}${body}.${sign(body)}`, level, audience, title, text }
}

export function isGeneratedId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(PREFIX)
}

/// The generated scenario, only when the server wrote it and it was written
/// for this person's level. Anything else is not found.
export function readGenerated(id: unknown, who: LeaderProfile): LeaderScenario | null {
  if (!isGeneratedId(id) || id.length > 8000) return null
  const [body, mac] = id.slice(PREFIX.length).split('.')
  if (!body || !mac) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload
    if (!isLeaderLevel(p.l) || p.l !== who.level.value) return null
    if (!LEADER_AUDIENCES.some((a) => a.value === p.a)) return null
    return { id, level: p.l, audience: p.a, title: String(p.t), text: String(p.x) }
  } catch {
    return null
  }
}

// Variety, so ten presses don't come back as ten versions of one meeting.
const SETTINGS = [
  'an elementary school',
  'a middle school',
  'a high school',
  'a K-8 charter school',
  'a small rural district',
  'a large urban district',
  'a suburban school',
]
const TIMES = ['the first week of school', 'October', 'just before winter break', 'report-card week', 'testing season', 'the last month of the year']

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

// Who the conversation is with: the one asked for, or one this person's own
// scenarios already use, so a teacher-leader isn't handed a board meeting.
export function chooseAudience(who: LeaderProfile, asked: unknown): LeaderAudience {
  const theirs = [...new Set(scenariosFor(who).map((s) => s.audience))]
  if (theirs.includes(asked as LeaderAudience)) return asked as LeaderAudience
  return pick(theirs.length ? theirs : LEADER_AUDIENCES.map((a) => a.value))
}

export function generateContext(who: LeaderProfile, audience: LeaderAudience, previousTitles: readonly string[]): string {
  const area = who.areas.length < LEADER_AREAS.length ? LEADER_AREAS.find((a) => a.value === pick(who.areas)) : null
  const avoid = [...scenariosFor(who).map((s) => s.title), ...previousTitles.slice(0, 20)]
  return [
    `The conversation is with: ${LEADER_AUDIENCES.find((a) => a.value === audience)!.label.toLowerCase()}.`,
    area ? `It falls under their responsibility for ${area.label.toLowerCase()}.` : null,
    `Setting: ${pick(SETTINGS)}, during ${pick(TIMES)}.`,
    `Do not repeat any of these situations they have already seen:\n${avoid.map((t) => `- ${t}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n')
}
