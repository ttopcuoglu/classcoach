/// FNV-1a over the version and the text, as 8 hex digits — the key the server
/// stores a focus's short line under (server lib/focusLine.ts). Must match it
/// exactly, version included.
export function focusLineKey(text: string): string {
  let h = 0x811c9dc5
  for (const ch of `v2:${text.trim()}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/// Three seconds or more after a thinking question gives most students time
/// to think, as the report says under Teacher Pause Time.
const PAUSE_GOAL_SEC = 3

/// A stored line that tells a teacher to pause after asking, on a lesson
/// whose Teacher Pause Time already met the goal. Shown as missing, so the
/// card asks the server again with the pause and gets a line without it.
/// Must match the server's lineIgnoresPause (server lib/focusLine.ts).
export function lineIgnoresPause(line: { try: string }, pauseSec: number | null): boolean {
  return pauseSec != null && pauseSec >= PAUSE_GOAL_SEC && asksForPauseAfterQuestion(line.try)
}

/// Must match the server's asksForPauseAfterQuestion (server lib/focusLine.ts).
export function asksForPauseAfterQuestion(line: string): boolean {
  const asking = '(asking|you ask|a question|each question|your question|the question)'
  // Either order: "pause after asking why" and "after asking why…, pause".
  return (
    new RegExp(`\\b(pause|wait)\\w*\\b[^.,;]*?\\bafter ${asking}`, 'i').test(line) ||
    new RegExp(`\\bafter ${asking}[^.;]*?\\b(pause|wait)\\b(?! for (a|the|their) (student'?s? )?answer)`, 'i').test(line)
  )
}

/// A stored Try next time line the server should rewrite without its pause:
/// the lesson's Teacher Pause Time already met the goal.
export function stepIgnoresPause(text: string | null | undefined, pauseSec: number | null): boolean {
  return !!text && pauseSec != null && pauseSec >= PAUSE_GOAL_SEC && asksForPauseAfterQuestion(text)
}
