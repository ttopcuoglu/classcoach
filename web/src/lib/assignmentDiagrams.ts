// Coach places a real, deterministic diagram directly in assignment text
// using this inline syntax, instead of writing a prose instruction like
// "draw a fraction bar" — e.g.:
//   [[diagram:fraction_bar|segments=4|shaded=2]]
//   [[diagram:number_line|start=0|end=1|points=0,0.25,0.5|labels=0,1/4,1/2]]
// Parsed here into segments; AssignmentDiagram.tsx renders each segment.

export type DiagramSegment =
  | { type: 'text'; content: string }
  | { type: 'diagram'; diagramType: string; params: Record<string, string> }

const DIRECTIVE_PATTERN = /\[\[diagram:(\w+)((?:\|[a-zA-Z]+=[^|\]]*)*)\]\]/g

export function parseAssignmentContent(text: string): DiagramSegment[] {
  const segments: DiagramSegment[] = []
  let lastIndex = 0
  DIRECTIVE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = DIRECTIVE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const [, diagramType, rawParams] = match
    const params: Record<string, string> = {}
    if (rawParams) {
      for (const pair of rawParams.split('|').filter(Boolean)) {
        const eq = pair.indexOf('=')
        if (eq === -1) continue
        params[pair.slice(0, eq)] = pair.slice(eq + 1)
      }
    }
    segments.push({ type: 'diagram', diagramType, params })
    lastIndex = DIRECTIVE_PATTERN.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return segments
}

// "1/4" -> 0.25, "0.5" -> 0.5, "3" -> 3. Returns null (never throws) for
// anything unparsable — callers skip the point rather than crash.
export function parseFractionOrNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('/')) {
    const [numStr, denStr] = trimmed.split('/')
    const num = Number(numStr)
    const den = Number(denStr)
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
    return num / den
  }
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}
