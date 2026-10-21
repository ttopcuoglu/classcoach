// The one focus for next lesson, said simply: one thing that went well and one
// thing to do, rewritten from the suggestion the teacher's report already has.
//
// The Summary opens on this card, and the stored suggestions it draws from run
// to a paragraph — a Clarity & Content note can be sixty words with a list in
// brackets. That is the full reasoning, and it stays one tap away; the card
// itself should be readable at a glance and sound like a coach who noticed
// something good, not like a correction.
//
// It rewrites only the text it is given. The "went well" line exists only when
// that text says something went well: an encouraging line invented to soften
// the advice would be a claim about the lesson nobody made.
//
// Stored per suggestion text (lessonFocus.lines, keyed by focusLineKey), so it
// is written once for each item a teacher makes their focus and never again.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { CORE_COACHING_RULES } from './coachPersona.ts'
import { extractTag } from './extractTag.ts'

export type FocusLine = { well: string | null; try: string }

/// Bumped to write every stored line again: v2 after the quote fix above.
export const FOCUS_LINE_VERSION = 'v2'

/// FNV-1a over the version and the text, as 8 hex digits. The web and iOS
/// apps compute the same key to find a stored line, so all three change
/// together or not at all.
export function focusLineKey(text: string): string {
  let h = 0x811c9dc5
  for (const ch of `${FOCUS_LINE_VERSION}:${text.trim()}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/// How many lines one lesson keeps: one per item a teacher has made their
/// focus, and a lesson has at most six items.
export const MAX_STORED_LINES = 8

const SYSTEM_PROMPT = `You are an instructional coach. Below is one suggestion from a teacher's own lesson report. Rewrite it for a card the teacher reads at a glance, warm and plain, speaking to them as "you".

Write two lines:
- WELL: one thing that went well, ONLY if the suggestion itself says something went well or worked. Name what the teacher did, not its effect on students: "Your number-line model was a clear anchor", not "gave students a clear anchor". 15 words at most. If it says nothing went well, write NONE — never invent praise.
- TRY: the one thing to do next lesson, starting with a verb. 20 words at most; fewer is better. Keep the lesson's own material and the concrete move; drop the explanation of why.

Use only what the suggestion says. Do not add facts, numbers, or claims about what students felt, understood, or learned. No "consider", no "you could", no exclamation marks.

Write nothing outside these tags:
<well>one line, or NONE</well>
<try>one line</try>
${CORE_COACHING_RULES}`

function clean(raw: string | null, maxLength: number): string | null {
  let line = raw?.replace(/\s+/g, ' ').trim()
  // Quotes are taken off only when they wrap the whole line. Stripping a
  // closing quote on its own cut the end off a line that finishes on a
  // quoted word — ask one "why." came out as ask one "why.
  if (line && /^["“].*["”]$/.test(line) && !/["“”]/.test(line.slice(1, -1))) line = line.slice(1, -1).trim()
  if (!line || /^NONE\.?$/i.test(line) || line.length > maxLength) return null
  return line
}

export function parseFocusLine(text: string): FocusLine | null {
  const tryLine = clean(extractTag(text, 'try'), 180)
  if (!tryLine) return null
  return { well: clean(extractTag(text, 'well'), 140), try: tryLine }
}

/// Null when the call failed or came back unusable; nothing is stored then,
/// and the card keeps showing the suggestion as written.
export async function writeFocusLine(suggestion: string, from: string | null): Promise<FocusLine | null> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${from ? `From the report's ${from} section.\n\n` : ''}Suggestion:\n${suggestion.trim()}` }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    return parseFocusLine(text)
  } catch (error) {
    console.error('[focusLine] failed:', error)
    return null
  }
}
