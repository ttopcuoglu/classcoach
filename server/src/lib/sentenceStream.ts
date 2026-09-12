// Pulls whole sentences out of a growing buffer as Claude writes them, so
// speech synthesis for sentence one can start while sentence two is still
// being generated. Without this the whole reply has to finish before any
// audio is requested, which is most of the gap a teacher hears between
// finishing their sentence and Coach answering.
//
// A sentence only counts as complete once the character AFTER its closing
// punctuation has arrived — otherwise "Mr." would be spoken as a sentence
// the moment the period streams in, and the rest of the thought would be
// synthesized as a separate clip with a seam in the middle. This is the
// same boundary rule splitIntoSentences uses on the client; keeping them
// identical is what lets the spoken reply and the saved transcript agree.
const BOUNDARY = /[.!?](?:["')\]]?)\s/g

export function takeCompleteSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let cut = 0
  BOUNDARY.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BOUNDARY.exec(buffer)) !== null) {
    const end = match.index + match[0].length
    const sentence = buffer.slice(cut, end).trim()
    if (sentence) sentences.push(sentence)
    cut = end
  }
  return { sentences, rest: buffer.slice(cut) }
}

// The model is told to end its response with a <memory_update> block, which
// is bookkeeping and must never be spoken. Streaming means reacting to a
// partial tag too: the moment text that could be the start of that tag
// appears, everything from there on is withheld until we know what it is.
const HIDDEN_TAG = '<memory_update>'

export function visibleSoFar(text: string): string {
  const full = text.indexOf(HIDDEN_TAG)
  if (full !== -1) return text.slice(0, full)
  // No complete tag yet — hold back a trailing fragment that could still
  // grow into one ("<", "<mem", "<memory_up"...).
  const open = text.lastIndexOf('<')
  if (open !== -1 && HIDDEN_TAG.startsWith(text.slice(open))) return text.slice(0, open)
  return text
}

// Coach must never say something different from what gets saved. Sentences
// are emitted during streaming, but the saved reply is only known at the end
// (stripTag and trimIfTruncated both run on the complete text), so the two
// have to be reconciled: this returns whatever still needs saying.
//
// Normally that is just the final sentence, which never streams out because
// a boundary is only recognised once a character follows it. If the two have
// somehow diverged, it returns nothing rather than risk speaking a
// contradiction on top of what the teacher already heard.
export function reconcileTail(spoken: string[], reply: string): string {
  const normalize = (t: string) => t.replace(/\s+/g, ' ').trim()
  if (spoken.length === 0) return reply
  const spokenNorm = normalize(spoken.join(' '))
  const replyNorm = normalize(reply)
  if (!replyNorm.startsWith(spokenNorm)) return ''
  return replyNorm.slice(spokenNorm.length).trim()
}
