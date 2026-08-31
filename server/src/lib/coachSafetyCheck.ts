const BANNED_RATING_PHRASES = [
  'highly effective',
  'needs improvement',
  'below standard',
  'proficient performance',
  'unsatisfactory',
  'you failed to',
]

// Not a gate — there's no human-review pipeline to act on a hard block
// today, so this is a visibility net (server logs), not enforcement. A
// stricter, scored version belongs in a future eval-harness pass.
export function flagIfUnsafe(text: string, routeLabel: string): void {
  const lower = text.toLowerCase()
  const hit = BANNED_RATING_PHRASES.find((phrase) => lower.includes(phrase))
  if (hit) console.warn(`[coachSafetyCheck] possible rating/framework language in ${routeLabel}: "${hit}"`)
}
