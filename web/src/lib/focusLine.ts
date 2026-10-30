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
  return (
    pauseSec != null &&
    pauseSec >= PAUSE_GOAL_SEC &&
    /\b(pause|wait)\w*\b[^.,;]*?\bafter (asking|you ask|a question|each question|your question|the question)/i.test(line.try)
  )
}
