// "Right?", "okay?", "k?" — the tags a teacher ends a sentence with and talks
// straight through. They carry a question mark but ask nothing of students,
// so the question count leaves them out. Counted here from the transcript
// itself rather than by the model read: a two-letter quote is too short for
// the quote check every model read goes through, and one "right?" is
// indistinguishable from the next, so a model list of them could only ever
// collapse. "Yes?" and "huh?" are left out on purpose: said to a raised hand,
// or to hear an answer again, they do ask something.

const TAGS = new Set(['right', 'okay', 'ok', 'k', 'kay', 'you know', 'yeah', 'alright', 'all right', 'mhm', 'mm-hmm'])

export type TagMoment = { tag: string; timestampSec: number }

/// Every tag the teacher said, in order. A tag is a question-marked piece of
/// a teacher line that is nothing but one of the words above ("Right?", "So,
/// okay?"); "Right answer?" or "Is that right?" are not tags.
export function questionTags(segments: { speakerLabel: string; startSec: number; text: string }[]): TagMoment[] {
  const out: TagMoment[] = []
  for (const s of segments) {
    if (s.speakerLabel !== 'Teacher') continue
    for (const piece of s.text.match(/[^.?!]*\?/g) ?? []) {
      const words = piece
        .toLowerCase()
        .replace(/[?,]/g, ' ')
        .replace(/^\s*(so|and|but|now)\s+/, '')
        .trim()
      if (TAGS.has(words)) out.push({ tag: words, timestampSec: s.startSec })
    }
  }
  return out
}
