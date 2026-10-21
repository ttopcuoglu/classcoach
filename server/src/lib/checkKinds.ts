// What each check for understanding asked students for, from the teacher's
// words alone.
//
// A check tells the teacher something only if it asks for evidence. "Does
// everyone understand?" is a general check: it does not reveal understanding
// by itself. "Explain the first step to your partner" asks for an
// explanation; "which answer is wrong, and why?" asks for evidence; "show me
// on your whiteboard" starts a whole-class check whose results the recording
// cannot hear; "write one thing you're still unsure about" invites students
// to name their uncertainty.
//
// This identifies the check. It never says students did it or understood:
// a recording from the front of the room cannot show that.
//
// Classifies the lesson's existing checks (cfuLog) rather than finding new
// ones, so no count already shown moves except the ones it sets aside as
// not checks at all.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { CfuLogEntry, Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'

export const CHECK_KINDS = ['general', 'explain', 'evidence', 'whole_class', 'uncertainty', 'not_a_check'] as const
export type CheckKind = (typeof CHECK_KINDS)[number]

const SYSTEM_PROMPT = `You are reading moments where a teacher may have checked for understanding (C), each with the teacher's next line or two for context. Say what each one asked students for — from the teacher's words only.

- general — a general check that does not by itself reveal understanding: "does everyone understand?", "any questions?", "make sense?", "are we good?", "is it clear?".
- explain — asked students to explain something, to the teacher, a partner or the class: "explain the first step to your partner", "tell me how you got that".
- evidence — asked for evidence of understanding: solve, identify, choose or justify something that shows whether they have it: "which answer is incorrect? explain why", "what's the next step?", "who can tell me what abandoned means?".
- whole_class — started a check every student does at once, whose results the recording cannot hear: whiteboards, thumbs, fingers, "raise your hand if you chose A", a quick poll, an exit ticket.
- uncertainty — invited students to name what they are unsure about: "write one thing you're still unsure about", "what's confusing you?".
- not_a_check — not a check after all: rhetorical and talked through ("right?"), logistics, a direction, or asking one student for help.

When a moment could be two, choose what it most plainly asked for. Write nothing outside this tag, one line per check:
<kinds>
C1 | general
C2 | whole_class
</kinds>`

/// The check and what the teacher said next, so "turn and tell your partner"
/// reads differently from "turn to page five".
export function checksPrompt(cfuLog: CfuLogEntry[], segments: Segment[]): string {
  const teacher = segments.filter((s) => s.speakerLabel === 'Teacher' && s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  return cfuLog
    .map((c, i) => {
      const next = teacher.filter((s) => s.startSec > c.timestampSec + 0.5).slice(0, 2).map((s) => s.text.trim())
      return [`C${i + 1}: ${c.text.trim()}`, ...next.map((t) => `   then: ${t}`)].join('\n')
    })
    .join('\n\n')
}

export function parseCheckKinds(text: string, count: number): (CheckKind | null)[] {
  const out: (CheckKind | null)[] = Array.from({ length: count }, () => null)
  const body = extractTag(text, 'kinds')
  if (!body) return out
  for (const line of body.split('\n')) {
    const m = line.trim().match(/^C(\d+)\s*\|\s*([\w-]+)/i)
    if (!m) continue
    const i = Number(m[1]) - 1
    const kind = CHECK_KINDS.find((k) => k === m[2].toLowerCase().replace(/-/g, '_'))
    if (kind && i >= 0 && i < count && out[i] == null) out[i] = kind
  }
  return out
}

/// The checks log with `kind` on every check the read covered. Null when the
/// read failed, so a caller keeps what it had.
export async function readCheckKinds(
  cfuLog: CfuLogEntry[],
  segments: Segment[],
): Promise<(CfuLogEntry & { kind?: CheckKind })[] | null> {
  if (cfuLog.length === 0) return cfuLog
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: checksPrompt(cfuLog, segments) }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const kinds = parseCheckKinds(text, cfuLog.length)
    return cfuLog.map((c, i) => (kinds[i] ? { ...c, kind: kinds[i]! } : c))
  } catch (error) {
    console.error('[checkKinds] read failed:', error)
    return null
  }
}
