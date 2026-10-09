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

// Said about themselves, about now. "Hard" on its own is not here: a hard
// test, a hard question and a hard chapter are all ordinary teaching talk.
const HARD = [
  'exhausted',
  'exhausting',
  'overwhelmed',
  'burnt out',
  'burned out',
  'i cried',
  'in tears',
  'breaking point',
  'falling apart',
  "can't do this",
  'cant do this',
  'at my limit',
  'had enough',
  'lost it',
  'humiliated',
  'i hate',
  'dreading',
  'i give up',
  'no idea what to do',
  "don't know what to do",
  'at a loss',
  'worst day',
  'rough day',
  'long day',
  'awful',
  'horrible',
  'hopeless',
  'helpless',
]

// An outcome that went well, not a hope that one might.
const GLAD = [
  'went really well',
  'went well',
  'went great',
  'it worked',
  'they got it',
  'so proud',
  'i was proud',
  'really pleased',
  'so pleased',
  'best lesson',
  'first time',
  'finally',
  'nailed it',
  'loved it',
  'they loved',
  'was a win',
  'huge win',
  'surprised me',
  'better than',
  'turned a corner',
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
