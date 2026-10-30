// The summary and section notes say no measurement in words: no counts of
// moves, no shares, no durations, no rates. Each of those is on a card the
// teacher is reading beside the note, and a note that restated one could only
// disagree with it — "seven of fourteen higher-order" sat beside a card
// showing one; "nothing for the first minutes" beside a strip full of sound.
//
// The prompt says so; this makes it hold. A sentence stating a measurement is
// dropped before the text is saved. Times that point to a moment ("at 14:01"),
// years, and numbers that belong to the lesson's content ("draw 50 trees",
// "12 p q") are left alone: only a number tied to a unit of measurement, or a
// count stated as one of the report's tallies, is taken out.

const NUM =
  '(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|a dozen|half)'
const TALLY = '(?:questions?|checks?|answers?|follow-ups?|redirections?|directions?|invitations?|moves?|student turns?)'

const MEASURE = [
  // A share: "79%", "a fifth of the lesson", "40 percent".
  /\d\s*%|\bpercent\b|\b(?:a|one|two|three) (?:fifth|quarter|third)s? of the (?:lesson|recording|class|period)\b/i,
  // A duration or a rate: "12 minutes", "about 40 seconds", "164 words a minute".
  new RegExp(`\\b${NUM}(?:\\s+or\\s+${NUM})?\\s+(?:full\\s+)?(?:seconds?|minutes?|secs?|mins?|words a minute|words per minute|wpm)\\b`, 'i'),
  // A tally in the report's own terms: "seven of the fourteen", "two of your
  // questions", "of the fourteen questions".
  new RegExp(`\\b${NUM} of (?:the |your )?${NUM}\\b|\\b${NUM} of (?:the |your )${TALLY}|\\bof the ${NUM} ${TALLY}`, 'i'),
  // A count stated as a finding: "two checks were heard", "three questions asked".
  new RegExp(`\\b${NUM} ${TALLY} (?:were|was|came|registered|got|heard|asked|landed)\\b`, 'i'),
]

export function statesMeasurement(sentence: string): boolean {
  return MEASURE.some((re) => re.test(sentence))
}

/// The text with every measurement sentence taken out, paragraph by
/// paragraph. A paragraph that would be left empty is kept as it was: an
/// unchecked paragraph beats a missing one, and the prompt has already asked.
export function withoutMeasures(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((para) => {
      const sentences = para.match(/[^.!?]+(?:[.!?]+["”’)]*|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [para]
      const kept = sentences.filter((x) => !statesMeasurement(x))
      return kept.length > 0 ? kept.join(' ') : para
    })
    .join('\n\n')
}
