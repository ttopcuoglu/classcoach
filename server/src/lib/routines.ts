// Two things Climate & Routines needs that the other reads do not give:
// what kind of routine each set of directions was for (starting work,
// changing activities, materials, asking for help, finishing), and the
// moments the teacher invited students to ask for help.
//
// Directions are classified, not found: they come from the teaching-moves
// read, so their count does not move. Invitations to seek help are found in
// the teacher's speech and each one checked word for word against it.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { flattenTeacherSpeech, transcriptForModel } from './lessonObjective.ts'
import { readLines, type Quoted } from './teachingMoves.ts'

export const ROUTINE_TYPES = ['start', 'transition', 'materials', 'help', 'finish', 'other'] as const
export type RoutineType = (typeof ROUTINE_TYPES)[number]
export type Routines = { directionTypes: { timestampSec: number; type: RoutineType }[]; helpInvites: Quoted[] }

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording. Two jobs.

1. ROUTINES. Below the transcript is a numbered list of the teacher's directions (D). For each, say what it was for:
- start — getting students started on work ("open to page ten and do one through five")
- transition — moving from one activity or place to another ("close your laptops and come to the carpet")
- materials — getting, handing out or putting away materials ("grab a Chromebook from the cart")
- help — how to get help or what to do when stuck ("if you're stuck, check with your partner first")
- finish — what to do when done, or how to wrap up and hand in ("when you finish, put it in the tray")
- other — anything else

2. HELP INVITATIONS. Find every moment the teacher OFFERED help or invited students to say they need it: "raise your hand if you need me", "if you're stuck, come find me", "you can work with your neighbor if you're stuck", "is anybody feeling stuck?", "no question is a silly question". Leave out:
- anything that limits or discourages asking for help ("don't call me over the second you get frustrated") — that is the opposite of an invitation;
- what to do when finished ("if you finish number three, raise your hand") — that is a direction;
- a general "any questions?" check;
- fragments that are not a whole sentence.
Copy the teacher's sentence EXACTLY, with its timestamp. NONE is a real answer, and the right one for many lessons.

Write nothing outside these tags:
<routines>
D1 | start
D2 | materials
</routines>
<help>
sentence @ m:ss
</help>`

export function routinesPrompt(segments: Segment[], directions: Quoted[]): string {
  return `${transcriptForModel(segments)}\n\nDIRECTIONS:\n${directions.map((d, i) => `D${i + 1}: ${d.quote}`).join('\n')}`
}

export function parseRoutines(text: string, segments: Segment[], directions: Quoted[]): Routines {
  const types: { timestampSec: number; type: RoutineType }[] = []
  for (const line of (extractTag(text, 'routines') ?? '').split('\n')) {
    const m = line.trim().match(/^D(\d+)\s*\|\s*(\w+)/i)
    if (!m) continue
    const d = directions[Number(m[1]) - 1]
    const type = ROUTINE_TYPES.find((t) => t === m[2].toLowerCase())
    if (d && type && !types.some((x) => x.timestampSec === d.timestampSec)) types.push({ timestampSec: d.timestampSec, type })
  }
  const helpInvites = readLines(extractTag(text, 'help'), flattenTeacherSpeech(segments)).map(({ quote, timestampSec }) => ({ quote, timestampSec }))
  return { directionTypes: types, helpInvites }
}

/// Null when there is too little teacher speech, or the read failed.
export async function readRoutines(segments: Segment[], directions: Quoted[]): Promise<Routines | null> {
  if (transcriptForModel(segments).length < 400) return null
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: routinesPrompt(segments, directions) }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return parseRoutines(text, segments, directions)
  } catch (error) {
    console.error('[routines] read failed:', error)
    return null
  }
}

/// The routines a direction is held to the four parts for — what to do, the
/// steps, how long, what to hand in. Those fit a direction that starts or
/// changes the work. "If you do not have a physical book, grab one" and "one
/// more minute" were scored against them too, and a lesson whose transitions
/// were brisk read "0 of 4 named all four".
export const SCORED_ROUTINES: readonly RoutineType[] = ['start', 'transition']

/// The directions held to the four parts. A lesson read before routines were
/// classified has no types, and keeps every direction as it always did.
export function scoredDirections<D extends { timestampSec?: number }>(directions: D[], types: { timestampSec: number; type: string }[] | undefined): D[] {
  if (!types || types.length === 0) return directions
  return directions.filter((d) => {
    const type = types.find((t) => t.timestampSec === d.timestampSec)?.type
    return type != null && (SCORED_ROUTINES as readonly string[]).includes(type)
  })
}

/// Starting directions this close together belong to one activity's setup
/// when the lesson's stages were not read: setups cluster.
export const ACTIVITY_GAP_SEC = 180

export type DirectionActivity<D> = {
  /// The lesson stage's title, when the stages were read; else null and the
  /// apps show the time range.
  title: string | null
  startSec: number
  endSec: number
  /// Every part named anywhere in the activity's setup, by any direction in
  /// its span — "how long" said once covers the whole activity.
  parts: string[]
  directions: D[]
}

/// The four parts belong to launching an activity, not to every sentence of
/// it: "add 50 trees" and "draw the factory next to the river" are steps of
/// one drawing task, and scoring each read "none of 15 named all four". So
/// the scored directions are grouped into activities — by the lesson's
/// stages where they were read, else by time — and each activity is judged
/// on everything its setup said. Mirrored in web AudioCoaching.tsx and the
/// iPhone's InsightsSections.swift.
export function directionActivities<D extends { timestampSec?: number; parts: string[] }>(
  directions: D[],
  types: { timestampSec: number; type: string }[] | undefined,
  arc: { title: string; startSec: number; endSec: number }[] | undefined,
): DirectionActivity<D>[] {
  const at = (d: D) => d.timestampSec ?? 0
  const scored = [...scoredDirections(directions, types)].sort((a, b) => at(a) - at(b))
  const groups: { title: string | null; startSec: number; endSec: number; directions: D[] }[] = []
  const stages = (arc ?? []).filter((s) => s.endSec > s.startSec)
  for (const d of scored) {
    const t = at(d)
    const stage = stages.find((s, i) => t >= s.startSec && (t < s.endSec || i === stages.length - 1))
    const last = groups[groups.length - 1]
    if (stage) {
      const same = groups.find((g) => g.title === stage.title && g.startSec === stage.startSec)
      if (same) same.directions.push(d)
      else groups.push({ title: stage.title, startSec: stage.startSec, endSec: stage.endSec, directions: [d] })
    } else if (last && last.title == null && t - last.endSec <= ACTIVITY_GAP_SEC) {
      last.directions.push(d)
      last.endSec = t
    } else {
      groups.push({ title: null, startSec: t, endSec: t, directions: [d] })
    }
  }
  return groups.map((g) => {
    // A time-grouped activity's span runs a little past its last direction,
    // so a "one more minute" just after the steps still counts.
    const end = g.title == null ? g.endSec + 60 : g.endSec
    const inSpan = directions.filter((d) => at(d) >= g.startSec && at(d) <= end)
    const parts = [...new Set([...g.directions, ...inSpan].flatMap((d) => d.parts))]
    return { title: g.title, startSec: g.startSec, endSec: g.endSec, parts, directions: g.directions }
  })
}
