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
