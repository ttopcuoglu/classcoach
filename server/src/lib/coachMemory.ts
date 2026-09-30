export const MAX_COACH_MEMORY_CHARS = 2000

// Headroom to add to a reply's own max_tokens whenever MEMORY_UPDATE_INSTRUCTION
// is appended to the prompt, so the up-to-150-word <memory_update> block always
// has room to finish and close — an unclosed tag can't be stripped and leaks
// straight into what the teacher sees (and, for Talk It Through, hears).
export const MEMORY_UPDATE_TOKEN_BUFFER = 300

// Memory is only ever needed ACROSS conversations, never within one: the turns
// of the conversation in progress are already in `messages`, so Coach can see
// everything said this session whether or not memory was rewritten on the last
// turn. Rewriting it every turn therefore paid output rates (~200 tokens, five
// times the input rate) to mostly retype the same 150 words — and on the
// non-streaming routes the teacher waited out those tokens before seeing any
// reply at all, since nothing is returned until the whole response lands.
//
// So memory is written on the teacher's first turn — a one-shot Ask, or a
// conversation abandoned after one reply, is the common case and must not lose
// its memory — and every MEMORY_WRITE_INTERVAL turns after that. At most the
// last four turns of a long conversation go uncaptured, and the next
// conversation's first turn picks the thread back up.
//
// Routes that only ever handle a first turn (Ask's creation, Talk It Through's
// opening turn) never call this — they always write. A policy change here that
// stops writing on turn 1 has to touch them too.
export const MEMORY_WRITE_INTERVAL = 5

// teacherTurnNumber is 1-based and counts the teacher's own turns including the
// one being answered right now. 0 means Coach is opening and the teacher hasn't
// said anything yet (Reflect's start turn), which has nothing to remember.
export function shouldWriteMemory(teacherTurnNumber: number): boolean {
  if (teacherTurnNumber < 1) return false
  return teacherTurnNumber === 1 || teacherTurnNumber % MEMORY_WRITE_INTERVAL === 0
}

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
