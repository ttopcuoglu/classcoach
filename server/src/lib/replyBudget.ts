// How many words of a spoken reply the teacher actually hears.
//
// Enforced in code rather than asked for in the prompt, because asking does
// not work. Measured across five runs against the same four teacher turns:
// told "two sentences", one reply came back at 123 words and 38 seconds of
// speech, packing its content into two run-ons; told "three sentences", 87
// words; told "NEVER more than sixty words" in capitals, six of eight
// replies were over sixty and one pass averaged eighty. A sentence count
// moves where the full stops go, not how long the reply is, and a word limit
// in a prompt is a suggestion.
//
// Sixty words is about nineteen seconds of Deepgram speech at the measured
// 5.8 characters per word and 18.2 characters per second.
export const TALK_REPLY_WORD_BUDGET = 60

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/// Whether one more sentence may be spoken.
///
/// A sentence that would cross the budget is dropped WHOLE — the limit is
/// never met by cutting a sentence in half, which would be the chopped-off
/// sound this feature spent a day removing. The first sentence is always
/// admitted: a reply has to say something, even when the model opens with a
/// sixty-word run-on that nothing can rescue.
export function admitsSentence(wordsSoFar: number, sentence: string, budget: number | undefined): boolean {
  if (budget === undefined) return true
  if (wordsSoFar === 0) return true
  return wordsSoFar + countWords(sentence) <= budget
}

/// The same rule applied to a whole reply at once — what the teacher ends up
/// hearing, given everything Claude wrote.
export function sentencesWithinBudget(sentences: string[], budget: number | undefined): string[] {
  const kept: string[] = []
  let words = 0
  for (const sentence of sentences) {
    if (!admitsSentence(words, sentence, budget)) break
    kept.push(sentence)
    words += countWords(sentence)
  }
  return kept
}
