/// A per-turn nudge to reflect what the teacher is feeling.
///
/// The system prompt describes how to do this; this decides when it matters
/// most, and says so on the turn it matters. That split is deliberate, and it
/// is the same lesson the opening filler taught: an instruction that applies
/// "whenever it fits" gets applied unevenly, because every turn looks like it
/// might not be the one. A sentence that says THIS turn is a hard one lands
/// differently from a paragraph that says hard turns exist.
///
/// It costs no extra model call — moodOf is keyword matching over the
/// transcript the request already carries, and it is the same classifier that
/// chooses the one-line clip the teacher hears while they wait.
import { moodOf } from './turnMood.ts'

/// Empty for 'asked' and 'neutral' on purpose. A steer on a turn with no
/// feeling in it would manufacture one, and a teacher being told how they
/// feel when they were only asking a question is the exact thing that reads
/// as a script.
export function buildFeelingBlock(transcript: string): string {
  const mood = moodOf(transcript)

  if (mood === 'hard') {
    return `
This turn reads as a hard one. Open by saying back what it is doing to them — one short sentence, tentative, in words that could only be about what they just told you, and not as a diagnosis. They have already heard one short sympathetic line in your voice while they waited ("Oh, that's a lot." or similar), so this is not that sentence again: that one was generic and yours has read what they said. If what they need is to be heard rather than helped, naming it and stopping there is the whole reply.`
  }

  if (mood === 'glad') {
    return `
This turn reads as good news. Be genuinely pleased about it in a sentence, specifically — the thing that went well, and what it took them to get there — rather than nodding at it on the way to the next suggestion. Underplaying a win is its own kind of not listening, and if they worked at this one, say so.`
  }

  return ''
}
