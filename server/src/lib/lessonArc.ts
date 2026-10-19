// How the lesson moved: two to four stages, each a few plain words on what
// the class was doing and when it started — "opened with the code-of-conduct
// reading review, built ethical dilemmas and stakeholders, applied them to
// Coca-Cola's code".
//
// The stored phases cannot say this: they are split at transition phrases,
// or by proportion when there are none, and named Opening / Instruction /
// Closing whatever happened in them. This reads the teacher's side of the
// transcript once. It describes; it never judges.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { transcriptForModel } from './lessonObjective.ts'

export const ARC_ROLES = ['opened', 'built', 'applied', 'practiced', 'closed'] as const
export type ArcStage = { role: (typeof ARC_ROLES)[number]; title: string; startSec: number; endSec: number }

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording, with timestamps. Describe how the lesson moved, in 2 to 4 stages, in order.

For each stage give:
- its role: opened (how it started), built (new ideas introduced or developed), applied (ideas used on a task, text, case or problem), practiced (students working on their own or in groups), or closed (wrapping up);
- a title of 3 to 8 plain words on WHAT the class was doing — the content, not the teaching move ("Code-of-conduct reading review", "Internal vs. external stakeholders", "Coca-Cola's code and a decision scenario");
- the timestamp where it started, taken from the transcript.

Describe; never judge. Use the lesson's own topic words. The first stage starts at the first line. Do not invent a stage the transcript does not show.

Write nothing outside this tag:
<arc>
opened | title | m:ss
built | title | m:ss
applied | title | m:ss
</arc>`

export function parseArc(text: string, durationSec: number): ArcStage[] {
  const body = extractTag(text, 'arc')
  if (!body) return []
  const raw: Omit<ArcStage, 'endSec'>[] = []
  for (const line of body.split('\n')) {
    const parts = line.split('|').map((p) => p.trim())
    if (parts.length < 3) continue
    const role = ARC_ROLES.find((r) => parts[0].toLowerCase().startsWith(r))
    const m = parts[2].match(/^(\d+):(\d{1,2})$/)
    const title = parts[1].replace(/^["“]|["”]$/g, '').trim()
    if (!role || !m || !title || title.split(/\s+/).length > 10) continue
    const startSec = Number(m[1]) * 60 + Number(m[2])
    if (startSec > durationSec) continue
    // In order, never two stages starting at the same moment.
    if (raw.length > 0 && startSec <= raw[raw.length - 1].startSec) continue
    raw.push({ role, title, startSec })
  }
  if (raw.length < 2 || raw.length > 4) return []
  raw[0].startSec = 0
  return raw.map((s, i) => ({ ...s, endSec: i + 1 < raw.length ? raw[i + 1].startSec : durationSec }))
}

/// Null when the transcript is too short to have stages, or the read failed.
export async function readLessonArc(segments: Segment[], durationSec: number): Promise<ArcStage[] | null> {
  const transcript = transcriptForModel(segments)
  if (transcript.length < 400 || durationSec <= 0) return null
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const arc = parseArc(text, durationSec)
    return arc.length > 0 ? arc : null
  } catch (error) {
    console.error('[lessonArc] read failed:', error)
    return null
  }
}
