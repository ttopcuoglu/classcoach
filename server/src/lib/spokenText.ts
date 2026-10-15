/// Taking out what a voice cannot say.
///
/// Aura-2 is given plain text and reads exactly what it is given: there is no
/// markup, no SSML, no way to mark emphasis. The system prompt says so and
/// tells Coach never to use asterisks — but found in a real rehearsal, Coach
/// had written stage directions anyway:
///
///   Okay, I'll be her. *Sharp voice* Hi. My son says you've been picking
///
/// Read aloud, the teacher hears "Sharp voice" as a line of dialogue. During
/// a rehearsal that is the worst place for it, because the whole point is that
/// the other person sounds real.
///
/// Stripping it in code rather than only asking again in the prompt, for the
/// reason this surface keeps relearning: an instruction is a tendency, and
/// the thing the teacher hears should not depend on one.
///
/// Emphasis is NOT simply deleted along with it. "that's *not* what I meant"
/// with the span removed says the opposite of what Coach wrote, so a span
/// inside a sentence is unwrapped and kept, and only a span standing on its
/// own between sentences — which is what a stage direction looks like — is
/// removed outright.
const STAGE_DIRECTION = /(^|[.!?,;:—-]\s*)\*([^*\n]{1,60})\*(?=\s*(?:$|[A-Z"'(]))/g
const EMPHASIS = /\*{1,2}([^*\n]+)\*{1,2}/g

export function stripStageDirections(text: string): string {
  const withoutDirections = text.replace(STAGE_DIRECTION, '$1')
  // Whatever is left is emphasis in the middle of a sentence: lose the
  // asterisks, keep the words.
  // A lone, unpaired asterisk survives both patterns above, and it happens
  // for a real reason: this runs on one finished sentence at a time, so a
  // span that straddles a sentence boundary is split down the middle and each
  // half keeps one "*". Aura would read it out. Nothing spoken ever needs an
  // asterisk, so any that are left simply go.
  const unwrapped = withoutDirections.replace(EMPHASIS, '$1').replace(/\*/g, '')
  // A removed span can leave a double space or a space before punctuation.
  return unwrapped.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.!?,;:])/g, '$1').trim()
}
