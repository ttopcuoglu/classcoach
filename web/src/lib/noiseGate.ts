// Telling a voice apart from the room it is in.
//
// The microphone level was compared against a fixed number: above 20 for
// 350ms meant the teacher had started talking over Coach, so Coach stopped.
// That number was chosen against the echo of Coach's own voice leaking back
// in, in a quiet room. A classroom is not a quiet room. Steady background
// noise sits above 20 indefinitely, clears the 350ms with ease, and stops
// Coach mid-sentence for nobody — reported as "in a loud environment Coach's
// voice stops".
//
// A level alone cannot answer the question, because what matters is not how
// loud the room is but whether something just got LOUDER than the room. So
// the room is measured continuously and a voice has to stand above it.
//
// The follower is deliberately asymmetric. It rises slowly, so a voice does
// not drag the floor up with it and gate itself out mid-sentence; it falls
// quickly, so when a noisy corridor goes quiet the gate becomes sensitive
// again within a moment rather than staying deaf. If watching happens to
// begin while something is already loud, the fast fall is also what recovers
// from starting with too high a floor.
const FLOOR_RISE = 0.02
const FLOOR_FALL = 0.25

export type NoiseGate = {
  /// True when this sample is both loud in absolute terms and clearly above
  /// the room. Call once per frame, in order — it is a running measurement.
  test: (level: number) => boolean
  /// The room as currently measured. Exposed for logging and tests.
  floor: () => number
}

/// `threshold` is the absolute floor kept from before, so a voice in a quiet
/// room triggers exactly as it always did. `margin` is how far above the
/// room's own level the sample has to reach.
export function createNoiseGate(threshold: number, margin: number): NoiseGate {
  let floor: number | null = null
  return {
    test(level: number): boolean {
      if (floor === null) {
        floor = level
        // Never on the first sample: with nothing to compare against, any
        // answer would be a guess about a room that has not been heard yet.
        return false
      }
      const loudEnough = level > threshold && level > floor + margin
      floor = floor + (level > floor ? FLOOR_RISE : FLOOR_FALL) * (level - floor)
      return loudEnough
    },
    floor: () => floor ?? 0,
  }
}
