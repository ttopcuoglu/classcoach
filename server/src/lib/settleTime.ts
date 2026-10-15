// How long the room stayed loud after the teacher asked for attention.
//
// PROTOTYPE. Nothing calls this yet, and no recording in the database carries
// the trace it needs.
//
// This is the one signal that separates the two rooms a transcript cannot
// tell apart: a bubbly class that rises during partner work and drops when
// asked, and a class where directions compete with chatter the whole way
// through. Both produce the same transcript, the same talk percentages and
// the same redirection count. The difference is whether asking WORKED, and
// that is a question about the seconds AFTER the ask.
//
// Why it needs a new input: Deepgram's utterances are sequential by
// construction, so crosstalk is resolved away before anything we store sees
// it — measured across 1,856 adjacent segment pairs in real lessons, 0.4%
// overlap, zero on most lessons. The transcript cannot show a room staying
// loud. Only the audio can, and the audio is deleted by design.
//
// The way through is a LOUDNESS ENVELOPE captured on-device while recording:
// one RMS sample a second, uploaded as plain numbers. A 40-minute lesson is
// ~2,400 values, a few KB, and speech cannot be reconstructed from a 1Hz
// amplitude curve — so "audio is never saved" stays true.
//
// The confound this has to handle, and the reason it takes the transcript as
// well as the trace: AFTER an attention bid the teacher usually keeps
// talking, and the teacher is the loudest thing in the room. Measuring raw
// loudness would score a teacher who carried on explaining as a room that
// never settled. So the measurement only looks at moments when the teacher is
// NOT speaking, which is exactly where student noise is the only explanation
// for a high level.

/// One RMS sample per second, 0...1, in recording order. Index is seconds
/// from the start of the recording.
export type LevelTrace = number[]

/// Two hours at 1Hz. A cap is needed because this arrives from the client:
/// without one, a request could ask the database to store an arbitrarily
/// long array.
export const MAX_TRACE_SECONDS = 7200

/// Validates and normalises a trace sent by a client. Returns null for
/// anything that is not a usable envelope, so a malformed or hostile value
/// becomes "no trace" rather than a stored shape nothing downstream expects.
///
/// Values are rounded to two decimals: the measurement is far coarser than
/// that, and it roughly halves what gets stored.
export function parseLevelTrace(raw: unknown): LevelTrace | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!Array.isArray(value) || value.length === 0) return null
  const out: number[] = []
  for (const entry of value.slice(0, MAX_TRACE_SECONDS)) {
    // Only genuine numbers. Coercing with Number() turned a null in the JSON
    // into 0 — and zero reads as silence, so a trace with holes in it would
    // have credited settles that were never measured. Caught by the test
    // written for exactly that.
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 1) return null
    out.push(Math.round(entry * 100) / 100)
  }
  return out.length > 0 ? out : null
}

/// When the teacher was speaking, from the transcript.
export type SpeechInterval = { startSec: number; endSec: number }

export type SettleResult = {
  /// settled — the room dropped to its own baseline and stayed there.
  /// did_not_settle — still elevated when the window ran out.
  /// not_measurable — the teacher talked through the whole window, or there
  ///   is no trace, so there is nothing to read.
  state: 'settled' | 'did_not_settle' | 'not_measurable'
  /// Seconds from the ask until the room settled. Null unless state is
  /// 'settled'.
  settleSec: number | null
  /// Seconds actually examined — teacher-free time inside the window.
  measuredSec: number
  reason: string | null
}

/// How long after an ask we keep looking. Past this the lesson has moved on
/// and whatever the level is doing has other explanations.
const WINDOW_SEC = 60

/// The room has to stay down this long to count as settled, so one lucky
/// quiet second between two bursts of chatter is not a result.
const SUSTAIN_SEC = 3

/// Below this much teacher-free time inside the window there is nothing to
/// read, and a verdict would be about the teacher's own talking.
const MIN_MEASURABLE_SEC = 5

/// The room's own quiet level, taken as a low percentile of the whole
/// recording rather than a fixed number — a carpeted room with eight
/// students and a hard-floored room with thirty have different floors, and a
/// fixed threshold would call one of them loud all day.
const BASELINE_PERCENTILE = 0.2

/// How far above its own baseline the room counts as still up. Provisional:
/// no real trace exists yet to tune it against, and it should be set from
/// data before this ships.
const ELEVATED_MARGIN = 0.05

export function roomBaseline(trace: LevelTrace): number | null {
  const usable = trace.filter((v) => Number.isFinite(v))
  if (usable.length < 30) return null
  const sorted = [...usable].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * BASELINE_PERCENTILE)]
}

function teacherSpeakingAt(sec: number, intervals: SpeechInterval[]): boolean {
  return intervals.some((i) => sec >= i.startSec && sec < i.endSec)
}

/// Settle time for one attention bid.
export function settleTime(
  trace: LevelTrace,
  teacherSpeech: SpeechInterval[],
  bidSec: number,
): SettleResult {
  const baseline = roomBaseline(trace)
  if (baseline == null) {
    return { state: 'not_measurable', settleSec: null, measuredSec: 0, reason: 'No usable level trace for this recording.' }
  }
  const settleThreshold = baseline + ELEVATED_MARGIN

  const from = Math.ceil(bidSec)
  const to = Math.min(trace.length, from + WINDOW_SEC)

  // Collect the readable seconds FIRST, before looking for a settle. An
  // earlier version scanned and returned the moment it saw three quiet
  // seconds, which let a bid three seconds from the end of the recording
  // report a confident settle off three samples — below this function's own
  // floor for saying anything at all. How much there was to read is a
  // question about the window, not about what the window happened to hold.
  const readable: { sec: number; level: number }[] = []
  for (let sec = from; sec < to; sec++) {
    // Only the teacher-free seconds. While the teacher is talking, the level
    // says nothing about the room.
    if (teacherSpeakingAt(sec, teacherSpeech)) continue
    const level = trace[sec]
    if (!Number.isFinite(level)) continue
    readable.push({ sec, level })
  }

  if (readable.length < MIN_MEASURABLE_SEC) {
    return {
      state: 'not_measurable',
      settleSec: null,
      measuredSec: readable.length,
      reason:
        'There is too little of the minute after this ask where you were not speaking, so the room\u2019s own level cannot be read.',
    }
  }

  let sustained = 0
  let runStartSec: number | null = null
  for (const { sec, level } of readable) {
    if (level <= settleThreshold) {
      // Teacher talk is skipped rather than breaking a run, so a run can span
      // a stretch of teacher speech. That makes the run's start a value to
      // remember rather than one to subtract back to.
      if (sustained === 0) runStartSec = sec
      sustained++
      if (sustained >= SUSTAIN_SEC) {
        return {
          // Credited from where the quiet BEGAN, not where it completed: a
          // room that went quiet at 4s and stayed quiet settled in four
          // seconds, not seven.
          state: 'settled',
          settleSec: Math.max(0, (runStartSec ?? sec) - bidSec),
          measuredSec: readable.length,
          reason: null,
        }
      }
    } else {
      sustained = 0
      runStartSec = null
    }
  }

  return {
    state: 'did_not_settle',
    settleSec: null,
    measuredSec: readable.length,
    reason: `The room was still above its own usual level ${WINDOW_SEC} seconds after this ask.`,
  }
}

/// Teacher speaking intervals from stored transcript segments.
export function teacherIntervals(
  segments: { speakerLabel: string; startSec: number; endSec: number }[],
): SpeechInterval[] {
  return segments
    .filter((s) => s.speakerLabel === 'Teacher')
    .map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
}

// --- separating silence from sound we could not make out ---------------------

/// What the non-speech part of a recording actually was.
///
/// The report has always shown one combined "Silence or other" slice, and the
/// comment on the bar said why: batch transcription has no voice-activity
/// signal, so a quiet room and a room the microphone could not resolve
/// produce the identical number. On one real lesson that slice was 85%, and a
/// teacher reading it had no way to tell whether the class sat in silence or
/// talked over itself for twenty minutes.
///
/// The envelope answers it. Seconds with no transcript but real sound in them
/// are not silence.
export type NonSpeechSplit = {
  quietSec: number
  /// Sound was present and no words came out of it. NOT "off-task talk" — it
  /// could be a video, a fire drill, or a teacher at the far side of the
  /// room. It is "the microphone heard something and the transcript has
  /// nothing for it".
  unresolvedSec: number
}

/// Non-speech seconds below this share of the teacher's own speaking level
/// count as quiet.
///
/// Calibrated against the teacher's voice IN THIS RECORDING rather than an
/// absolute number, which makes it survive a different phone, a different
/// room, and the two platforms disagreeing about scale. The teacher is the
/// one sound we can always locate in the envelope, because the transcript
/// says exactly when they were speaking.
const QUIET_FRACTION_OF_SPEECH = 0.35

/// Below this many seconds of located teacher speech there is no reference to
/// calibrate against, and the split would be guesswork.
const MIN_REFERENCE_SEC = 20

/// One character per second of the recording: 'w' someone's words are in the
/// transcript, 'q' quiet, 's' sound with no words for it, '-' no reading for
/// that second. Null when there is no teacher speech to calibrate against.
///
/// Calibration uses the TEACHER's seconds only — the one voice the transcript
/// always locates — but every transcribed second is excluded from the
/// non-speech count. An earlier version excluded only the teacher's, so a
/// student's transcribed answer was counted a second time as quiet or as
/// sound-with-no-words, and the talk bar could add up past 100%.
export function classifySeconds(
  trace: LevelTrace,
  teacherSpeech: SpeechInterval[],
  durationSec: number,
  anySpeech: SpeechInterval[] = teacherSpeech,
): string | null {
  if (trace.length === 0 || durationSec <= 0) return null
  const total = Math.ceil(durationSec)
  const inAny = (sec: number, list: SpeechInterval[]) => list.some((i) => sec >= i.startSec && sec < i.endSec)

  const speakingLevels: number[] = []
  for (let sec = 0; sec < Math.min(trace.length, total); sec++) {
    const level = trace[sec]
    if (Number.isFinite(level) && inAny(sec, teacherSpeech)) speakingLevels.push(level)
  }
  if (speakingLevels.length < MIN_REFERENCE_SEC) return null

  const sorted = [...speakingLevels].sort((a, b) => a - b)
  const medianSpeech = sorted[Math.floor(sorted.length / 2)]
  // A teacher whose own speech sits at the floor means the microphone never
  // really heard them either, and everything would be classed as quiet.
  if (medianSpeech <= 0) return null
  const quietThreshold = medianSpeech * QUIET_FRACTION_OF_SPEECH

  let out = ''
  for (let sec = 0; sec < total; sec++) {
    if (inAny(sec, anySpeech) || inAny(sec, teacherSpeech)) out += 'w'
    else if (sec >= trace.length || !Number.isFinite(trace[sec])) out += '-'
    else out += trace[sec] <= quietThreshold ? 'q' : 's'
  }
  return out
}

export function splitNonSpeech(
  trace: LevelTrace,
  teacherSpeech: SpeechInterval[],
  durationSec: number,
  anySpeech: SpeechInterval[] = teacherSpeech,
): NonSpeechSplit | null {
  const seconds = classifySeconds(trace, teacherSpeech, durationSec, anySpeech)
  if (seconds == null) return null
  let quietSec = 0
  let unresolvedSec = 0
  for (const c of seconds) {
    if (c === 'q') quietSec++
    else if (c === 's') unresolvedSec++
  }
  return { quietSec, unresolvedSec }
}
