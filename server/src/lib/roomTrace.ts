// Who or what each second of a lesson was: the teacher, a student, a group
// of students at once, a video, a voice with no words, other sound, or quiet. Every
// second gets one; there is no "can't tell".
//
// PROTOTYPE, like the voice classes it is built from (voiceActivity.ts):
// stored with each analysed iPhone lesson, shown nowhere yet.
//
// A second is put down to someone only when the transcript says they spoke
// in it, once the teacher has said which voice is them and which, if any,
// was a video:
//
//   - Words. The teacher's are the teacher's. A student's are a student's,
//     or group talk when the audio heard many voices in that second: one
//     voice the transcript happened to catch out of several. A video's
//     words are the video — it is not anyone in the room.
//   - A short pause inside one speaker's talk, with their words either side,
//     is still them: a breath, a word too quiet to transcribe.
//   - Any other voice with no words is just that, and goes to no one.
//
// That last rule is the point. Reading a wordless voice against what each
// speaker sounds like in this lesson was tried first, and on the first real
// lesson it found the teacher and a video well but students one second in
// five: with a minute of student words to learn from, a student no one
// transcribed sounded most like the teacher, and the teacher's share grew by
// every student it missed. A share built only from words can be smaller
// than the truth, but it says only what is known.

import type { StoredVoices } from './voiceActivity.ts'

/// One character per second: t teacher, s student, g group, x a video the
/// teacher tagged, u a voice with no words, o other sound, q quiet, - too
/// little audio to say.
export type RoomTrace = string

export type RoomShares = {
  roomTeacherSec: number
  roomStudentSec: number
  roomGroupSec: number
  roomVideoSec: number
  roomUnclearSec: number
  roomOtherSec: number
  roomQuietSec: number
}

type Segment = { speakerLabel: string; startSec: number; endSec: number }

/// The speaker label for a video playing; see VIDEO_SPEAKER in the route.
const VIDEO = 'Video'

/// The longest gap in one speaker's words still taken as their pause.
const MAX_PAUSE_SEC = 10

type Who = 't' | 's' | 'v'

/// Who spoke in each second according to the transcript: 't', 's', 'v' for a
/// video, or '' for no words. A shared second goes to whoever spoke more of it.
function wordsBySecond(segments: Segment[], seconds: number): (Who | '')[] {
  const time = { t: new Float32Array(seconds), s: new Float32Array(seconds), v: new Float32Array(seconds) }
  for (const seg of segments) {
    const into = time[seg.speakerLabel === 'Teacher' ? 't' : seg.speakerLabel === VIDEO ? 'v' : 's']
    for (let sec = Math.max(0, Math.floor(seg.startSec)); sec < Math.min(seconds, Math.ceil(seg.endSec)); sec++) {
      into[sec] += Math.min(sec + 1, seg.endSec) - Math.max(sec, seg.startSec)
    }
  }
  return Array.from({ length: seconds }, (_, sec) => {
    const best = (['t', 's', 'v'] as const).reduce((a, b) => (time[b][sec] > time[a][sec] ? b : a))
    return time[best][sec] > 0 ? best : ''
  })
}

/// A second as the speaker it is put down to: a student's in a crowd is
/// group talk.
function asRoom(who: Who, voiceClass: string): string {
  if (who === 'v') return 'x'
  if (who === 's') return voiceClass === 'm' ? 'g' : 's'
  return 't'
}

export function buildRoomTrace(voices: StoredVoices, segments: Segment[]): RoomTrace {
  const trace = voices.voiceTrace
  const words = wordsBySecond(segments, trace.length)
  const out = Array.from(trace, (c, sec) => {
    const who = words[sec]
    if (who) return asRoom(who, c)
    return c === 'v' || c === 'm' ? 'u' : c
  })

  // Give each short gap between one speaker's words back to them. Only its
  // voiced seconds: quiet and other sound in a pause stay what they were.
  let sec = 0
  while (sec < out.length) {
    if (words[sec]) {
      sec++
      continue
    }
    const start = sec
    while (sec < out.length && !words[sec]) sec++
    const before = words[start - 1]
    if (before && before === words[sec] && sec - start <= MAX_PAUSE_SEC) {
      for (let k = start; k < sec; k++) if (out[k] === 'u') out[k] = asRoom(before, trace[k])
    }
  }
  return out.join('')
}

export function roomShares(trace: RoomTrace): RoomShares {
  const count = (c: string) => trace.split(c).length - 1
  return {
    roomTeacherSec: count('t'),
    roomStudentSec: count('s'),
    roomGroupSec: count('g'),
    roomVideoSec: count('x'),
    roomUnclearSec: count('u'),
    roomOtherSec: count('o'),
    roomQuietSec: count('q'),
  }
}
