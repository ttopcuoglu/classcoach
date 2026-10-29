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
//   - The audio, for seconds with no words. Quiet and other sound are what
//     they say. A voice, or voices, are read against this lesson's own
//     seconds that had words in them.
//
// That last part is the point. Fixed thresholds were tried first and the
// first real lesson broke them: the teacher, close to the phone, read as
// "many voices" for most of the time they spoke. A teacher, a room and a
// phone each sound different, but every lesson labels its own examples —
// the transcript says when the teacher spoke and when a student did. So
// each speaker's pitch, loudness, rise and fall, and
// clarity are measured from those seconds, and a second with no words goes
// to the speaker it is within the usual spread of. A second of several voices
// that is like no one speaker on their own is group talk.
//
// It is a judgement per second, and wrong some of the time — most where a
// teacher's voice is close to their students' and the phone sits among them.

import { voiceAt, type StoredVoices, type VoiceAt } from './voiceActivity.ts'

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

/// Seconds of a speaker with words before what they sound like is trusted.
const MIN_REFERENCE_SEC = 10

/// The smallest spread each measure is given, so a speaker who happened to
/// sound very alike in their few seconds is not matched to nothing else.
const MIN_SPREAD: Record<keyof VoiceAt, number> = { pitch: 1.5, level: 3, depth: 2, clarity: 0.08 }

/// Within this many of a speaker's own spreads, on average across measures,
/// a second of several voices is still taken to be that one speaker.
const SAME_SPEAKER_SPREADS = 2

/// Who a wordless second is put down to can change no faster than this: two
/// seconds each side, so a single second does not flip a stretch of talk.
const SMOOTH_HALF_WINDOW = 2

type Who = 't' | 's'
type Profile = { [K in keyof VoiceAt]: { mid: number; spread: number } | null }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/// The middle and spread of each measure over a speaker's seconds. The spread
/// is the median distance from the middle, scaled to a standard deviation's
/// worth, so a few odd seconds do not widen it.
function profileOf(seconds: VoiceAt[]): Profile | null {
  if (seconds.length < MIN_REFERENCE_SEC) return null
  const measure = (key: keyof VoiceAt) => {
    const values = seconds.flatMap((s) => (s[key] == null ? [] : [s[key]!]))
    if (values.length < MIN_REFERENCE_SEC) return null
    const mid = median(values)
    return { mid, spread: Math.max(MIN_SPREAD[key], 1.48 * median(values.map((v) => Math.abs(v - mid)))) }
  }
  return { pitch: measure('pitch'), level: measure('level'), depth: measure('depth'), clarity: measure('clarity') }
}

/// How far a second is from a speaker, in that speaker's own spreads,
/// averaged over the measures both have. Null when they share none.
function distance(v: VoiceAt, p: Profile): number | null {
  let total = 0
  let count = 0
  for (const key of ['pitch', 'level', 'depth', 'clarity'] as const) {
    const m = p[key]
    if (m == null || v[key] == null) continue
    total += Math.abs(v[key]! - m.mid) / m.spread
    count++
  }
  return count ? total / count : null
}

/// Who spoke in each second according to the transcript: 't', 's', or ''
/// for no words. A shared second goes to whoever spoke more of it.
function wordsBySecond(segments: Segment[], seconds: number): string[] {
  const time = { t: new Float32Array(seconds), s: new Float32Array(seconds) }
  for (const seg of segments) {
    const into = time[seg.speakerLabel === 'Teacher' ? 't' : 's']
    for (let sec = Math.max(0, Math.floor(seg.startSec)); sec < Math.min(seconds, Math.ceil(seg.endSec)); sec++) {
      into[sec] += Math.min(sec + 1, seg.endSec) - Math.max(sec, seg.startSec)
    }
  }
  return Array.from({ length: seconds }, (_, sec) => {
    const best = time.s[sec] > time.t[sec] ? 's' : 't'
    return time[best][sec] > 0 ? best : ''
  })
}

export function buildRoomTrace(voices: StoredVoices, segments: Segment[]): RoomTrace {
  const trace = voices.voiceTrace
  const words = wordsBySecond(segments, trace.length)
  const at = (sec: number) => voiceAt(voices, sec)

  // What each speaker sounds like in this lesson. The teacher's from every
  // second of theirs with sound in it; a student's only
  // from seconds the audio heard one voice in, because a student's words in
  // a crowd are a crowd.
  const secondsOf = (who: Who) =>
    Array.from(trace, (c, sec) => (words[sec] === who && (c === 'v' || (c === 'm' && who !== 's')) ? at(sec) : null)).filter(
      (v): v is VoiceAt => v != null,
    )
  const profiles = (['t', 's'] as const).flatMap((who) => {
    const p = profileOf(secondsOf(who))
    return p ? [{ who, p }] : []
  })

  /// The speaker a wordless voice is closest to, and how close, or null when
  /// there is nothing to compare it with.
  const nearest = (v: VoiceAt): { who: Who; d: number } | null => {
    let best: { who: Who; d: number } | null = null
    for (const { who, p } of profiles) {
      const d = distance(v, p)
      if (d != null && (best == null || d < best.d)) best = { who, d }
    }
    return best
  }

  const out = Array.from(trace, (c, sec): string => {
    if (words[sec] === 't') return 't'
    if (words[sec] === 's') return c === 'm' ? 'g' : 's'
    if (c !== 'v' && c !== 'm') return c
    const near = nearest(at(sec))
    // One voice is always someone's. With no one to compare it to — every
    // word lost, as with a phone face down — it is the teacher's: the phone
    // is theirs, and a lone voice nearest it is theirs far more often than not.
    if (c === 'v') return near ? near.who : 't'
    // Several voices are one speaker only if they sound like that speaker.
    return near && near.d <= SAME_SPEAKER_SPREADS ? near.who : 'g'
  })

  // Smooth what wordless voices were put down to, among those seconds only.
  const wordless = Array.from(trace, (c, sec) => (c === 'v' || c === 'm') && !words[sec])
  const smoothed = [...out]
  for (let sec = 0; sec < out.length; sec++) {
    if (!wordless[sec]) continue
    const votes = new Map<string, number>()
    for (let k = Math.max(0, sec - SMOOTH_HALF_WINDOW); k <= Math.min(out.length - 1, sec + SMOOTH_HALF_WINDOW); k++) {
      if (wordless[k]) votes.set(out[k], (votes.get(out[k]) ?? 0) + 1)
    }
    let most = votes.get(out[sec]) ?? 0
    for (const [label, n] of votes) {
      if (n > most) {
        most = n
        smoothed[sec] = label
      }
    }
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
