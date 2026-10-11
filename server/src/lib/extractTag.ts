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
//
// Plus the five repeating container tags our prompts use. They have no
// underscore, so the rule above missed them, and a real printed lesson
// plan carried "<step>" between Materials and the first step: the model
// left off a </materials>, and nothing here recognised what came next as
// the end of that section. Listed explicitly rather than matching any
// single word, because <p>, <code> and <title> have to survive — a
// lesson about HTML is a lesson about those.
const CONTAINERS = 'step|cfu|idea|misconception|slide'
const STRUCTURAL_TAG = new RegExp(`<\\/?[a-z]+(?:_[a-z]+)+>|<\\/?(?:${CONTAINERS})>`, 'g')
// Same shape, unanchored and non-global, for finding where a section ends.
const STRUCTURAL_TAG_ONCE = new RegExp(`<\\/?[a-z]+(?:_[a-z]+)+>|<\\/?(?:${CONTAINERS})>`)

/// Anything shaped like one of our structural tags, for the callers that fall
/// back to showing a whole raw response. A teacher should never read
/// "<feedback>" — if parsing fails, the words are still worth showing, the
/// markup never is.
export function stripStructuralTags(text: string): string {
  return text.replace(STRUCTURAL_TAG, '').trim()
}

/// `siblings` is the other field names the same prompt writes, which only
/// the caller knows. They become boundaries for the fallback below: a
/// plan whose </agenda> went missing used to swallow the whole <opening>
/// section — tags and all — and print it inside the agenda AND again in
/// its own section. A single-word tag can't be recognised generically,
/// because <code> and <title> have to survive, but a parser always knows
/// its own schema.
export function extractTag(text: string, tag: string, siblings: readonly string[] = []): string | null {
  const boundary =
    siblings.length > 0
      ? new RegExp(`${STRUCTURAL_TAG_ONCE.source}|<\\/?(?:${siblings.filter((s) => s !== tag).join('|')})>`)
      : STRUCTURAL_TAG_ONCE
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (match) {
    return match[1]
      .replace(STRUCTURAL_TAG, '')
      .replace(new RegExp(`</?${tag}>`, 'g'), '')
      .trim()
  }

  // No closing tag. Two ways that happens, both seen in production: the
  // response was cut off by max_tokens mid-section, or the model closed the
  // section with a sibling's tag — one real Ask answer closed <feedback> with
  // </words_to_try>, which used to void the whole parse and dump the raw
  // response, tags and all, into what the teacher read. Take the content from
  // the opening tag up to whatever structural tag comes next instead.
  const open = text.indexOf(`<${tag}>`)
  if (open === -1) return null
  const rest = text.slice(open + tag.length + 2)
  const next = rest.search(boundary)
  const body = (next === -1 ? rest : rest.slice(0, next)).trim()
  return body ? stripStructuralTags(body) : null
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
