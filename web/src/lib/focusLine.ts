/// FNV-1a over the text, as 8 hex digits — the key the server stores a focus's
/// short line under (server lib/focusLine.ts). Must match it exactly.
export function focusLineKey(text: string): string {
  let h = 0x811c9dc5
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
