// How loud the room is, measured continuously.
//
// Both decisions that used a fixed level needed this, and for the same
// reported reason: a number chosen in a quiet room does not survive a
// classroom.
//
//   - Interrupting Coach was "level above 20 for 350ms". Steady noise sits
//     above 20 indefinitely, so Coach stopped mid-sentence for nobody.
//   - Deciding the teacher has STOPPED talking was "level below 8". Steady
//     noise never goes below 8, so `lastSpeechAt` was pushed forward on every
//     single frame and the silence window could never elapse: the turn ran
//     forever, the page sat on "listening", and nothing was ever sent.
//     Reported on iOS as Coach not hearing them at all, which is the opposite
//     of the cause — it was hearing the room and could not tell when they had
//     finished.
//
// Measured for as long as the microphone is open, including while Coach is
// speaking, so a turn never has to begin by guessing. Measuring from the
// first frame of a turn instead fails exactly when someone starts talking
// immediately: their own voice becomes "the room" and is then inaudible.
//
// Mirrors RoomLevel in ClassCoach/Features/TalkToMe/VoiceTurnRecorder.swift.
// Both follow the room on a TIME constant rather than a per-frame fraction,
// because the two surfaces sample at very different rates — 60fps here,
// about eleven callbacks a second there — and the same per-frame number
// would mean two quite different followers.

/// Rises slowly, so a voice cannot drag the floor up and gate itself out.
/// Measured on the phone at a 2s rise, a twelve-second sentence was detected
/// for only 25 of its 132 callbacks, which would cut a teacher off mid-word.
const RISE_SECONDS = 20
/// Falls quickly, because the pauses inside real speech are what reveal the
/// room, and a room that goes quiet should become sensitive again at once.
const FALL_SECONDS = 0.3

export type RoomLevel = {
  /// How far this sample stands above the room. 0 on the very first sample,
  /// where there is nothing to compare against yet.
  ///
  /// Updates the measurement as a side effect, so it must be called once per
  /// frame, in order, whether or not the caller cares about the answer — that
  /// is how the room gets measured at all. Putting it behind a condition that
  /// only fires on loud frames means it sees nothing but loud ones and takes
  /// the first of them as the room.
  excess: (level: number, dtMs: number) => number
  /// The room as currently measured, for logging and tests.
  floor: () => number
}

export function createRoomLevel(): RoomLevel {
  let floor: number | null = null
  return {
    excess(level: number, dtMs: number): number {
      if (floor === null) {
        floor = level
        return 0
      }
      const above = level - floor
      const dt = Math.max(0.001, Math.min(1, dtMs / 1000))
      const tau = level > floor ? RISE_SECONDS : FALL_SECONDS
      floor = floor + (1 - Math.exp(-dt / tau)) * (level - floor)
      return above
    },
    floor: () => floor ?? 0,
  }
}
