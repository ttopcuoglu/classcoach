export function extractTag(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? match[1].trim() : null
}

// For a route that treats Claude's whole raw response as the visible
// reply (no per-tag extraction) — removes one tagged block so it never
// reaches the teacher (or, for Talk It Through, gets spoken aloud).
export function stripTag(text: string, tag: string): string {
  const closed = text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`), '')
  // Defensive: if the response got cut off (e.g. by max_tokens) before the
  // closing tag was written, the tag above never matches — treat everything
  // from the dangling opening tag onward as hidden rather than let it leak.
  const openIndex = closed.indexOf(`<${tag}>`)
  return (openIndex === -1 ? closed : closed.slice(0, openIndex)).trim()
}
