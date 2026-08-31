export function extractTag(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? match[1].trim() : null
}

// For a route that treats Claude's whole raw response as the visible
// reply (no per-tag extraction) — removes one tagged block so it never
// reaches the teacher (or, for Talk It Through, gets spoken aloud).
export function stripTag(text: string, tag: string): string {
  return text.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`), '').trim()
}
