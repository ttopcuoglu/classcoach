// Who or what each second of a lesson was: the teacher, a student, a group
// of students at once, other sound, or quiet. Every second gets one of the
// five; there is no "can't tell".
//
// PROTOTYPE, like the voice classes it is built from (voiceActivity.ts):
// stored with each analysed iPhone lesson, shown nowhere yet.
//
// Two sources, and the transcript wins where it has anything:
//
//   - Words. The transcript says who spoke them, once the teacher has said
//     which speaker is them. A student's words in a second the audio heard
//     many voices in are group talk: one voice the transcript happened to
//     catch out of several.
//   - The audio, for seconds with no words. Many voices is group talk, other
//     sound and quiet are what they say. One person talking with no words —
//     the teacher with the phone face down, a student across the room — is
//     put down to whichever of the two it sounds closer to.
//
// "Sounds closer to" is pitch and loudness against this lesson's own
// transcribed seconds: the teacher's voice is the one the transcript always
// locates, the phone is usually nearest them, and their pitch is their own.
// It is a judgement per second, and wrong some of the time — most where a
// teacher's pitch is close to their students' and the phone sits among them.

import { levelAt, pitchAt, type VoiceTrace } from './voiceActivity.ts'

/// One character per second: t teacher, s student, g group, o other sound,
/// q quiet, - too little audio to say.
export type RoomTrace = string

export type RoomShares = {
  roomTeacherSec: number
  roomStudentSec: number
  roomGroupSec: number
  roomOtherSec: number
  roomQuietSec: number
}

type Segment = { speakerLabel: string; startSec: number; endSec: number }

/// Seconds of a voice heard alone, with words, before its pitch and loudness
/// are trusted as what that voice sounds like here.
const MIN_REFERENCE_SEC = 10

/// How far apart counts as different: about the spread of one speaker's
/// pitch across a lesson, and of their loudness as they move about.
const PITCH_SPREAD_SEMITONES = 3
const LEVEL_SPREAD_DB = 6

/// With no student heard alone in the transcript, a wordless voice is the
/// teacher's unless it is clearly quieter or pitched elsewhere: students are
/// mostly further from the phone.
const STUDENT_QUIETER_DB = 6
const STUDENT_PITCH_APART_SEMITONES = 4

/// Who a wordless voice is put down to can change no faster than this: one
/// second each side, so a single second does not flip a stretch of talk.
const SMOOTH_HALF_WINDOW = 2

type Voice = { pitch: number | null; level: number | null }
type Profile = { pitch: number | null; level: number }

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function profileOf(voices: Voice[]): Profile | null {
  const levels = voices.flatMap((v) => (v.level == null ? [] : [v.level]))
  if (levels.length < MIN_REFERENCE_SEC) return null
  const pitches = voices.flatMap((v) => (v.pitch == null ? [] : [v.pitch]))
  return { level: median(levels)!, pitch: pitches.length >= MIN_REFERENCE_SEC ? median(pitches) : null }
}

function distance(v: Voice, p: Profile): number {
  let d = v.level == null ? 0 : Math.abs(v.level - p.level) / LEVEL_SPREAD_DB
  if (v.pitch != null && p.pitch != null) d += Math.abs(v.pitch - p.pitch) / PITCH_SPREAD_SEMITONES
  return d
}

/// Who spoke in each second according to the transcript: 't', 's', or ''
/// for no words. A second shared by both goes to whoever spoke more of it.
function wordsBySecond(segments: Segment[], seconds: number): string[] {
  const teacher = new Float32Array(seconds)
  const student = new Float32Array(seconds)
  for (const seg of segments) {
    const into = seg.speakerLabel === 'Teacher' ? teacher : student
    for (let sec = Math.max(0, Math.floor(seg.startSec)); sec < Math.min(seconds, Math.ceil(seg.endSec)); sec++) {
      into[sec] += Math.min(sec + 1, seg.endSec) - Math.max(sec, seg.startSec)
    }
  }
  return Array.from({ length: seconds }, (_, sec) =>
    teacher[sec] === 0 && student[sec] === 0 ? '' : teacher[sec] >= student[sec] ? 't' : 's',
  )
}

export function buildRoomTrace(
  voices: { voiceTrace: VoiceTrace; voicePitch?: string; voiceLevel?: string },
  segments: Segment[],
): RoomTrace {
  const { voiceTrace: trace, voicePitch, voiceLevel } = voices
  const words = wordsBySecond(segments, trace.length)
  const voiceAt = (sec: number): Voice => ({
    pitch: voicePitch ? pitchAt(voicePitch, sec) : null,
    level: voiceLevel ? levelAt(voiceLevel, sec) : null,
  })

  // What each speaker sounds like in this lesson, from seconds where the
  // transcript names them and the audio heard them alone.
  const heardAlone = (who: string) =>
    Array.from(trace, (c, sec) => (c === 'v' && words[sec] === who ? voiceAt(sec) : null)).filter((v): v is Voice => v != null)
  const teacher = profileOf(heardAlone('t'))
  const student = profileOf(heardAlone('s'))

  const whoseVoice = (v: Voice): 't' | 's' => {
    // No measure of the teacher at all — every word lost, as with a phone
    // face down. The phone is theirs and a lone voice nearest it is theirs
    // far more often than not.
    if (!teacher) return 't'
    if (student) return distance(v, teacher) <= distance(v, student) ? 't' : 's'
    const quieter = v.level != null && v.level < teacher.level - STUDENT_QUIETER_DB
    const elsewhere = v.pitch != null && teacher.pitch != null && Math.abs(v.pitch - teacher.pitch) > STUDENT_PITCH_APART_SEMITONES
    return quieter || elsewhere ? 's' : 't'
  }

  const out = Array.from(trace, (c, sec): string => {
    if (words[sec] === 't') return 't'
    if (words[sec] === 's') return c === 'm' ? 'g' : 's'
    if (c === 'v') return whoseVoice(voiceAt(sec))
    if (c === 'm') return 'g'
    return c
  })

  // Smooth who a wordless voice was put down to, among those seconds only.
  const wordless = Array.from(trace, (c, sec) => c === 'v' && !words[sec])
  const smoothed = [...out]
  for (let sec = 0; sec < out.length; sec++) {
    if (!wordless[sec]) continue
    let t = 0
    let s = 0
    for (let k = Math.max(0, sec - SMOOTH_HALF_WINDOW); k <= Math.min(out.length - 1, sec + SMOOTH_HALF_WINDOW); k++) {
      if (!wordless[k]) continue
      if (out[k] === 't') t++
      else s++
    }
    smoothed[sec] = t >= s ? 't' : 's'
  }
  return smoothed.join('')
}

export function roomShares(trace: RoomTrace): RoomShares {
  const count = (c: string) => trace.split(c).length - 1
  return {
    roomTeacherSec: count('t'),
    roomStudentSec: count('s'),
    roomGroupSec: count('g'),
    roomOtherSec: count('o'),
    roomQuietSec: count('q'),
  }
}
