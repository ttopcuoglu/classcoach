// The longest stretch of teacher talk, read once: what it was about, and —
// only when the content plainly offers one — a natural place to break it.
//
// The stretch itself is lib/teacherStretch.ts, the same rule the page uses,
// so the page can match this to the stretch it shows. A break is suggested
// only where one idea is complete and the next begins: a continuous
// explanation or a set of directions often reads best whole, and a
// suggestion that cuts an idea in half is worse than none. The model is told
// NONE is the usual answer.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { longestTeacherStretch } from './teacherStretch.ts'

/// Below this the page does not show a stretch, so there is nothing to read.
export const MIN_STRETCH_SEC = 120

export type StretchRead = {
  startSec: number
  endSec: number
  /// A few words on what the stretch was doing ("explaining the rules of the
  /// simulation"). Null when the model gave none.
  about: string | null
  /// Where a quick check, pause or question would fit. Null — the usual
  /// answer — when the content offers no clean break.
  breakAfter: {
    /// The last sentence before the break, as the teacher said it.
    quote: string
    atSec: number
    /// The idea that is complete at that point, in a few words.
    closes: string
    move: 'check' | 'pause' | 'question'
  } | null
}

const SYSTEM_PROMPT = `You are reading one long, unbroken stretch of a teacher's talk from a classroom recording, as numbered lines.

1. ABOUT: say in 3 to 8 plain words what the stretch was doing — "explaining the rules of the simulation", "reading the passage aloud", "giving directions for the lab". Describe, never judge.

2. BREAK: is there ONE natural place to break this stretch — a point where a substantial idea has been fully explained and a clearly different idea begins, so a quick check, a pause, or a question to the room would fit without cutting an idea in half?

The answer is NONE for most stretches. Say NONE when:
- it is one continuous explanation, a read-aloud, a story, or one set of directions;
- it is mostly logistics, reminders, or announcements;
- it is not classroom teaching at all (a presentation, a defense, a meeting);
- the only candidates are filler ("right?", "okay", "yeah") or a sentence cut off mid-thought.
Only if a break is plainly there, give the line it comes AFTER — a line that itself finishes the idea in a complete sentence — the idea that is complete at that point in under 12 words, and which move fits: check (see whether they have it), pause (let it land), or question (put it to the room).

Write nothing outside this tag:
<stretch>
about: words
break: NONE
</stretch>
or
<stretch>
about: words
break: L7 | the idea that is complete | check or pause or question
</stretch>`

type Line = { n: number; text: string; startSec: number; endSec: number }

export function stretchLines(segments: Segment[]): { stretch: NonNullable<ReturnType<typeof longestTeacherStretch>>; lines: Line[] } | null {
  const stretch = longestTeacherStretch(segments)
  if (!stretch || stretch.durationSec < MIN_STRETCH_SEC) return null
  const lines = segments
    .filter((s) => s.speakerLabel === 'Teacher' && s.text.trim() && s.startSec >= stretch.startSec - 0.01 && s.endSec <= stretch.endSec + 0.01)
    .sort((a, b) => a.startSec - b.startSec)
    .map((s, i) => ({ n: i + 1, text: s.text.trim(), startSec: s.startSec, endSec: s.endSec }))
  return lines.length >= 2 ? { stretch, lines } : null
}

/// The last real sentence of a line — what the teacher said right before the
/// break. Filler at the end ("Right?", "Yeah.") is skipped back over; a line
/// with no complete sentence of five words or more gives no quote, and so
/// no break.
function lastSentence(text: string): string | null {
  const parts = text.match(/[^.!?]+[.!?]+["”]?/g)?.map((p) => p.trim()).filter(Boolean) ?? []
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].split(/\s+/).length >= 5) return parts[i]
  return null
}

export function parseStretchRead(text: string, stretch: { startSec: number; endSec: number }, lines: Line[]): StretchRead {
  const body = extractTag(text, 'stretch') ?? ''
  const about = body.match(/^\s*about:\s*(.+)$/im)?.[1].trim().replace(/[."]+$/, '') || null
  const brk = body.match(/^\s*break:\s*(.+)$/im)?.[1].trim() ?? 'NONE'
  let breakAfter: StretchRead['breakAfter'] = null
  const m = brk.match(/^L(\d+)\s*\|\s*([^|]+)\|\s*(\w+)/i)
  if (m) {
    const line = lines.find((l) => l.n === Number(m[1]))
    const move = (['check', 'pause', 'question'] as const).find((x) => m[3].toLowerCase().startsWith(x))
    // Not after the last line: that is where the stretch already ends.
    const quote = line ? lastSentence(line.text) : null
    if (line && move && quote && line.n < lines.length) {
      breakAfter = { quote, atSec: Math.round(line.endSec * 10) / 10, closes: m[2].trim(), move }
    }
  }
  return { startSec: stretch.startSec, endSec: stretch.endSec, about, breakAfter }
}

/// Null when there is no stretch long enough to show, or the read failed.
export async function readStretch(segments: Segment[]): Promise<StretchRead | null> {
  const found = stretchLines(segments)
  if (!found) return null
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: found.lines.map((l) => `L${l.n}: ${l.text}`).join('\n') }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return parseStretchRead(text, found.stretch, found.lines)
  } catch (error) {
    console.error('[stretchBreak] read failed:', error)
    return null
  }
}
