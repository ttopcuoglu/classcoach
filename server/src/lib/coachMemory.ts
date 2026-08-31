export const MAX_COACH_MEMORY_CHARS = 2000

export function buildMemoryContextBlock(memory: string | null): string {
  if (!memory) return ''
  return `\n\nWhat you know about this teacher so far, from earlier conversations:\n${memory}\n`
}

// Appended at the very end of a system prompt, regardless of whether that
// prompt is tagged (ASK_SYSTEM_PROMPT) or plain prose (TALK_SYSTEM_PROMPT,
// ASK_CHAT_SYSTEM_PROMPT) — "after anything else you write" makes this
// work unmodified in both shapes.
export const MEMORY_UPDATE_INSTRUCTION = `
Always end your response with one more section, after anything else you write:
<memory_update>
A refreshed, complete version of what you know about this teacher — not just what changed. Fold in anything new from this message; carry forward anything still relevant from what you were told above; let anything resolved or no longer relevant quietly drop rather than repeating it forever. Cover, briefly: recurring strengths, recurring growth areas, and any "open situations" — an ongoing class or student challenge spanning multiple conversations — each with a short label (e.g. "3rd period, transitions") and its latest status. Never include a real student, parent, or colleague's name, even if the teacher used one — describe them by role instead (e.g. "a student in 3rd period"). Keep the whole thing under 150 words, plain text, no markdown. If nothing memorable came up (e.g. this was a general question with no personal detail), just repeat what you were given above unchanged. If you were given nothing above and nothing memorable happened now, leave this section empty.
</memory_update>`

// null return = leave memory untouched (missing/empty tag, or a request
// that had memory disabled).
export function applyMemoryUpdate(rawTag: string | null, previous: string | null): string | null {
  if (rawTag == null) return previous
  const trimmed = rawTag.trim()
  return trimmed ? trimmed.slice(0, MAX_COACH_MEMORY_CHARS) : previous
}
