// The model sometimes misplaces a closing tag from a sibling field inside the
// field it is writing — a real Assignment Coach review printed
// "...rather than demonstrating deeper understanding. </meaningful_work_suggestion>"
// to a teacher. The match itself was correct; the stray fragment was simply
// inside it. So extracted content is cleaned of anything shaped like one of
// our structural tags.
//
// Deliberately narrow: only snake_case names (every multi-field prompt uses
// them, and sibling fields sharing a prefix are exactly the ones that get
// confused), plus the requested tag itself. A plain <p> or <div> is left
// alone, because a computer-science lesson can legitimately be about them.
const STRUCTURAL_TAG = /<\/?[a-z]+(?:_[a-z]+)+>/g

export function extractTag(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (!match) return null
  return match[1]
    .replace(STRUCTURAL_TAG, '')
    .replace(new RegExp(`</?${tag}>`, 'g'), '')
    .trim()
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
