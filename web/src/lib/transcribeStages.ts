// What to say during the wait after Stop.
//
// A 50-minute class takes roughly seven and a half minutes to come back, and
// for all of it the screen used to show one unchanging line under a ring. A
// number that creeps and a sentence that never moves reads as frozen — the
// teacher's first instinct is to press something, and pressing something
// during an upload is how a recording gets lost.
//
// The stages below are the real pipeline, in the real order: the audio is
// sent, Deepgram transcribes and separates speakers, the server counts, and
// Claude reads the transcript for what the lesson covered. What we do NOT
// have is any signal about which stage is running — Deepgram's batch endpoint
// reports no completion fraction — so these are keyed to the same honest
// estimate that drives the ring. They describe the work, in order; they never
// claim to have detected it.

// The upload is the client's part and the only part a teacher has to stay for.
// It is short, and it has exactly one thing to say.
export const UPLOAD_STAGE = 'Sending your audio'

// Everything after the upload runs on the server, which is why these are
// keyed to the session row rather than to a request in flight.
export const TRANSCRIBE_STAGES: { from: number; text: string }[] = [
  { from: 0, text: 'Transcribing what was said' },
  { from: 40, text: 'Separating the voices in the room' },
  { from: 75, text: 'Almost there' },
]

export function transcribeStage(progress: number): string {
  let current = TRANSCRIBE_STAGES[0].text
  for (const stage of TRANSCRIBE_STAGES) {
    if (progress >= stage.from) current = stage.text
    else break
  }
  return current
}

/// How long the wait after Stop actually is.
///
/// The old 0.15x came from a constant nobody had measured. Timed against a real
/// call, Deepgram runs at about 0.005x — a fifty-minute class transcribes in
/// seconds, not eight minutes. What is left is moving the audio, so the
/// estimate scales with the upload rather than with the length of the lesson.
export const SECONDS_PER_RECORDED_MINUTE = 1.5

export function transcribeEstimateSec(recordingSec: number): number {
  return Math.max(8, (recordingSec / 60) * SECONDS_PER_RECORDED_MINUTE)
}

export function transcribeHint(recordingSec: number): string {
  return transcribeEstimateSec(recordingSec) < 90
    ? 'This usually takes a few seconds.'
    : 'About a minute for a full class period.'
}
