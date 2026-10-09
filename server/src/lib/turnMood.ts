// Which kind of noise fits what the teacher just said.
//
// The clip is chosen before Claude has read a word of the turn, so this is
// all the app has to go on: the transcript, and nothing else. It used to be
// a single question mark test — a question got a thinking sound, anything
// else got "Got it." That was already better than one pool for everything,
// and it is still too blunt. "I cried in my car at lunch" and "we finished
// the unit early" are both statements, and "Got it." is wrong for both.
//
// So four kinds, mirroring the reactions the system prompt already describes
// as available to Coach: taking it in, feeling it with them, genuinely
// pleased, and thinking about it.
//
// The bias is deliberately towards the neutral one. A wrong sympathy on good
// news ("Oh, that's a lot" when a lesson went well) is the worst outcome
// here and the easiest to produce with keywords, so the two mood pools need
// an explicit, first-person signal and everything else falls through to an
// acknowledgement, which fits almost anything.
export type TurnMood = 'hard' | 'glad' | 'asked' | 'neutral'

// Said about themselves, about now.
//
// Anchored to the first person wherever the bare word would also describe
// the students: "I'm tired" is this and "they're tired" is not, "I'm
// struggling" is and "they're struggling" is not. That distinction is the
// whole reason this is a list rather than a sentiment score.
//
// Written the second time from how teachers actually talk, after the first
// attempt missed fifteen of twenty-seven plausible utterances — "I'm so
// tired", "that actually worked", "they did great" all fell through to
// neutral. The first list came from my idea of the phrasing rather than the
// phrasing.
const HARD = [
  "i'm tired",
  "im tired",
  "i am tired",
  "so tired",
  "really tired",
  "exhausted",
  "exhausting",
  "wiped out",
  "running on empty",
  "no energy left",
  "i'm done",
  "im done",
  "i am done",
  "i'm over it",
  "had enough",
  "at my limit",
  "can't keep",
  "cant keep",
  "can't do this",
  "cant do this",
  "can't anymore",
  "cant anymore",
  "i give up",
  "about to quit",
  "thinking of quitting",
  "want to quit",
  "breaking point",
  "falling apart",
  "burnt out",
  "burned out",
  "i'm burning out",
  "brutal",
  "awful",
  "horrible",
  "worst day",
  "worst week",
  "rough day",
  "rough week",
  "long day",
  "long week",
  "hard day",
  "hard week",
  "terrible day",
  "was just a lot",
  "been a lot",
  "it's too much",
  "its too much",
  "this is too much",
  "too much for me",
  "called in sick",
  "i'm struggling",
  "im struggling",
  "i am struggling",
  "i'm failing",
  "failing them",
  "i feel like a failure",
  "not good enough",
  "i cried",
  "in tears",
  "close to tears",
  "humiliated",
  "embarrassed myself",
  "i lost it",
  "i hate",
  "i dread",
  "dreading",
  "overwhelmed",
  "no idea what to do",
  "don't know what to do",
  "dont know what to do",
  "at a loss",
  "hopeless",
  "helpless",
  "losing my mind",
  "losing it",
]

// An outcome that went well, not a hope that one might.
const GLAD = [
  "went really well",
  "went well",
  "went great",
  "went brilliantly",
  "it worked",
  "finally worked",
  "really worked",
  "it did work",
  "that did work",
  "definitely worked",
  "that worked",
  "actually worked",
  "worked really well",
  "worked perfectly",
  "nailed it",
  "was a win",
  "huge win",
  "small win",
  "a good day",
  "good day today",
  "they got it",
  "finally got it",
  "they did great",
  "did really well",
  "did so well",
  "they loved",
  "loved it",
  "so engaged",
  "really engaged",
  "fully engaged",
  "hands up",
  "all participating",
  "they surprised me",
  "surprised me",
  "best lesson",
  "proud of them",
  "so proud",
  "i was proud",
  "really pleased",
  "so pleased",
  "happy with how",
  "pleased with how",
  "it was great",
  "was fantastic",
  "so much better",
  "much better",
  "better than last",
  "turned a corner",
  "finally clicked",
  "it clicked",
  "breakthrough",
]

function mentions(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}

export function moodOf(transcript: string): TurnMood {
  const text = transcript.toLowerCase()
  const trimmed = transcript.trim()

  // Distress outranks everything, including a question mark: a teacher who
  // says "I'm exhausted, what do I even do?" wants to be heard before they
  // want to be thought about.
  if (mentions(text, HARD)) return 'hard'
  // And good news outranks the question mark too, for the same reason in
  // reverse — "it finally worked, what should I do next?" is a win first.
  if (mentions(text, GLAD)) return 'glad'
  if (trimmed.endsWith('?')) return 'asked'
  return 'neutral'
}
