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
// The whole curve came down by about 500ms in October 2026, as half of a
// pair of changes. On its own that would have been the wrong trade — these
// waits were set deliberately high, and cutting a thinking teacher off is
// the worst failure this feature has. What makes the shorter waits safe is
// the other half: the microphone now stays live through the "thinking"
// phase, and a teacher who carries on talking before Coach has said
// anything silently cancels the reply and keeps the same turn going (see
// watchForResume in useVoiceTurn and handleTurnComplete in TalkToMe). An
// end-of-turn guess that fires too early now costs a cancelled request
// nobody heard, instead of costing the teacher their sentence.
//
// The floor still sits above a natural mid-sentence pause. The recovery
// above is a safety net, not a licence to guess: it only covers the window
// before Coach is audible, so a wait short enough to fire mid-breath would
// still talk over a teacher once the reply started.
const CURVE: { speechMs: number; waitMs: number }[] = [
  { speechMs: 0, waitMs: 1500 },
  { speechMs: 1500, waitMs: 1200 },
  { speechMs: 4000, waitMs: 900 },
  { speechMs: 9000, waitMs: 750 },
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
