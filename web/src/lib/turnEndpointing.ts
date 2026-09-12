// How long to wait in silence before deciding a teacher has finished their
// turn. This used to be a flat 1400ms regardless of what they had just said,
// which gets both ends wrong: it makes someone who has been talking for
// fifteen seconds wait out the same pause as someone who has said two words
// and is obviously still assembling the thought.
//
// The rule is that how long someone has just been speaking predicts what a
// pause means. A long, flowing answer that stops has usually finished. A
// three-word fragment that stops is usually mid-thought — "The thing is..."
// — and cutting that off is the worst failure this feature has, far worse
// than a few hundred milliseconds of delay. So the window is shortened after
// long speech and lengthened after short speech, and the lengthening is
// deliberately the bigger move of the two.
//
// The floor stays well above a natural mid-sentence pause on purpose. Talk It
// Through exists to give teachers room to think out loud; shaving the last
// couple of hundred milliseconds off is not worth ever talking over one.
const CURVE: { speechMs: number; waitMs: number }[] = [
  { speechMs: 0, waitMs: 2000 },
  { speechMs: 1500, waitMs: 1700 },
  { speechMs: 4000, waitMs: 1300 },
  { speechMs: 9000, waitMs: 1100 },
]

export const MIN_SILENCE_MS = CURVE[CURVE.length - 1].waitMs
export const MAX_SILENCE_MS = CURVE[0].waitMs

// `speechMs` is time spent actually above the speech threshold this turn,
// not wall-clock time since the turn started — a teacher who opened the page
// and sat quietly for ten seconds has not been talking for ten seconds.
export function silenceWindowFor(speechMs: number): number {
  if (!Number.isFinite(speechMs) || speechMs <= 0) return MAX_SILENCE_MS
  for (let i = 1; i < CURVE.length; i++) {
    const prev = CURVE[i - 1]
    const next = CURVE[i]
    if (speechMs >= next.speechMs) continue
    const ratio = (speechMs - prev.speechMs) / (next.speechMs - prev.speechMs)
    return Math.round(prev.waitMs + ratio * (next.waitMs - prev.waitMs))
  }
  return MIN_SILENCE_MS
}
