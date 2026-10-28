// What kind of sound each second of a lesson was: one voice, many voices at
// once, sound that is not voices, or quiet.
//
// PROTOTYPE. Computed and stored with every iPhone recording, read by nothing
// in the report yet.
//
// Why it exists: "Sound, no words" answers whether the TRANSCRIPT caught
// anything, not what was happening in the room. A phone lying face down
// during a lecture and a class in pair work both come out as sound with no
// words. These four classes are about the room instead, and they do not need
// words — the audio itself shows the difference:
//
//   - One voice rises and falls several times a second: syllables, then the
//     short gaps between words. Its pitch is a single clear periodicity.
//   - Many voices at once fill each other's gaps, so the level stays up, and
//     several pitches together blur the periodicity without removing it.
//   - Other sound (a fan, chairs, a projector, music without singing) is
//     either not periodic at all or periodic without the rise and fall.
//
// This is the idea behind DART (Owens et al., PNAS 2017), which sorted
// classroom recordings into single voice, multiple voices and no voice from
// the audio alone. The thresholds here are a first pass tuned on synthetic
// speech, not on classrooms: the first real lessons will move them.
//
// It only ever runs on the scratch copy of the upload, before that copy is
// deleted. What it returns is one character a second, and nothing that
// sounds like anyone can be rebuilt from it.

import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'

/// One character per second: v one voice, m many voices, o other sound,
/// q quiet, - too little audio to say.
export type VoiceTrace = string

/// Pitch analysis runs at 8 kHz: a speaking voice's periodicity sits far
/// below 4 kHz, and half the samples is half the work.
const ANALYSIS_RATE = 8000
const FRAMES_PER_SEC = 50
const HOP = ANALYSIS_RATE / FRAMES_PER_SEC
/// 40 ms: two periods of the lowest voice looked for.
const WINDOW = 320
/// Speaking pitch from 80 Hz (a low adult voice) to 400 Hz (a child's).
const MIN_LAG = ANALYSIS_RATE / 400
const MAX_LAG = ANALYSIS_RATE / 80

/// A frame this far above the recording's own floor has something in it.
const ACTIVE_ABOVE_FLOOR_DB = 10
/// Below this, digital silence or close to it — whatever the floor says.
const ABSOLUTE_FLOOR_DB = -70
/// No room is "quiet" at this level or louder.
const QUIET_CEILING_DB = -50

/// How clearly periodic a frame must be to count as one clear pitch, and as
/// some pitch at all. Normalised autocorrelation, 0...1.
const CLEAR_PITCH = 0.75
const SOME_PITCH = 0.45

export type FrameFeatures = {
  /// Level of each 20 ms frame, dB relative to full scale.
  db: Float32Array
  /// How periodic each frame is in the speaking-pitch range, 0...1.
  pitch: Float32Array
}

export type SecondFeatures = {
  active: boolean
  /// Spread of the level across the two seconds around this one, dB: the
  /// rise and fall of a single voice.
  depthDb: number
  /// Share of frames with one clear pitch.
  clearPitch: number
  /// Share of frames with any pitch.
  somePitch: number
}

type WavFormat = { float: boolean; channels: number; sampleRate: number; dataStart: number; dataEnd: number }

/// Where the samples are in a 16-bit or 32-bit float PCM WAV, from its first
/// bytes. Null for anything else, including the compressed audio browsers
/// record: that path has no classes, and the report treats it as not measured.
///
/// `fileSize` is the whole file's: a recording cut off mid-lesson never had
/// its header finished, so the stated size can be zero or past the end, and
/// the file holds what it holds.
function readWavFormat(head: Buffer, fileSize: number): WavFormat | null {
  if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null
  let format = 0
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let offset = 12
  while (offset + 8 <= head.length) {
    const id = head.toString('ascii', offset, offset + 4)
    const size = head.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      format = head.readUInt16LE(body)
      channels = head.readUInt16LE(body + 2)
      sampleRate = head.readUInt32LE(body + 4)
      bits = head.readUInt16LE(body + 14)
      // WAVE_FORMAT_EXTENSIBLE carries the real format in its sub-format GUID.
      if (format === 0xfffe && size >= 26) format = head.readUInt16LE(body + 24)
    } else if (id === 'data') {
      if (!channels || !sampleRate) return null
      if (!((format === 1 && bits === 16) || (format === 3 && bits === 32))) return null
      const dataEnd = size > 0 && body + size <= fileSize ? body + size : fileSize
      return { float: format === 3, channels, sampleRate, dataStart: body, dataEnd }
    }
    // Chunks are padded to an even length.
    offset = body + size + (size % 2)
  }
  return null
}

/// Mono samples from whole sample frames of `bytes`, which starts on a frame.
function toSamples(bytes: Buffer, fmt: WavFormat): Float32Array {
  const width = fmt.float ? 4 : 2
  const frameBytes = width * fmt.channels
  const out = new Float32Array(Math.floor(bytes.length / frameBytes))
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    for (let c = 0; c < fmt.channels; c++) {
      const at = i * frameBytes + c * width
      sum += fmt.float ? bytes.readFloatLE(at) : bytes.readInt16LE(at) / 32768
    }
    out[i] = sum / fmt.channels
  }
  return out
}

export function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } | null {
  const fmt = readWavFormat(buf, buf.length)
  if (!fmt) return null
  return { samples: toSamples(buf.subarray(fmt.dataStart, fmt.dataEnd), fmt), sampleRate: fmt.sampleRate }
}

/// Level and pitch of one 40 ms frame of 8 kHz audio starting at `start`.
function measureFrame(x: Float32Array, start: number): [db: number, pitch: number] {
  let mean = 0
  for (let n = 0; n < WINDOW; n++) mean += x[start + n]
  mean /= WINDOW
  let energy = 0
  for (let n = 0; n < WINDOW; n++) {
    const v = x[start + n] - mean
    energy += v * v
  }
  const db = 10 * Math.log10(energy / WINDOW + 1e-12)
  // A frame at the floor has no pitch worth the work of looking for one.
  if (db < ABSOLUTE_FLOOR_DB) return [db, 0]
  let best = 0
  for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
    let r = 0
    let e0 = 0
    let e1 = 0
    for (let n = 0; n + lag < WINDOW; n++) {
      const a = x[start + n] - mean
      const b = x[start + n + lag] - mean
      r += a * b
      e0 += a * a
      e1 += b * b
    }
    const norm = Math.sqrt(e0 * e1)
    if (norm > 0 && r / norm > best) best = r / norm
  }
  return [db, best]
}

/// Takes audio a piece at a time and keeps only what each frame measured, so
/// a ninety-minute lesson never has to be in memory at once — the reason the
/// upload goes to disk in the first place.
class FrameMeter {
  private readonly factor: number
  /// Samples at the source rate not yet averaged down (fewer than `factor`).
  private carry: number[] = []
  /// 8 kHz samples from the start of the next frame on.
  private pending = new Float32Array(0)
  private readonly db: number[] = []
  private readonly pitch: number[] = []

  constructor(sampleRate: number) {
    // Brings audio down to the analysis rate by averaging blocks of samples.
    // Crude as a filter, but the averaging is itself a low-pass, and what is
    // measured afterwards — level and pitch periodicity — survives it.
    this.factor = Math.max(1, Math.round(sampleRate / ANALYSIS_RATE))
  }

  push(samples: Float32Array) {
    const all = this.carry.length ? Float32Array.from([...this.carry, ...samples]) : samples
    const count = Math.floor(all.length / this.factor)
    this.carry = Array.from(all.subarray(count * this.factor))
    const x = new Float32Array(this.pending.length + count)
    x.set(this.pending)
    for (let i = 0; i < count; i++) {
      let sum = 0
      for (let k = 0; k < this.factor; k++) sum += all[i * this.factor + k]
      x[this.pending.length + i] = sum / this.factor
    }
    let start = 0
    for (; start + WINDOW <= x.length; start += HOP) {
      const [db, pitch] = measureFrame(x, start)
      this.db.push(db)
      this.pitch.push(pitch)
    }
    this.pending = x.slice(start)
  }

  finish(): FrameFeatures {
    return { db: Float32Array.from(this.db), pitch: Float32Array.from(this.pitch) }
  }
}

export function frameFeatures(samples: Float32Array, sampleRate: number): FrameFeatures {
  const meter = new FrameMeter(sampleRate)
  meter.push(samples)
  return meter.finish()
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return -Infinity
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

export function secondFeatures({ db, pitch }: FrameFeatures): SecondFeatures[] {
  const seconds = Math.ceil(db.length / FRAMES_PER_SEC)
  // The recording's own floor: its quietest moments. Calibrating to the
  // recording rather than to a number survives a different phone and a
  // different room. Capped, because a lesson that was mostly group work has
  // no quiet moments, and its "floor" would be the group work.
  const floor = Math.min(QUIET_CEILING_DB, Math.max(ABSOLUTE_FLOOR_DB, percentile(Array.from(db), 0.05)))
  const activeAt = floor + ACTIVE_ABOVE_FLOOR_DB
  const out: SecondFeatures[] = []
  for (let s = 0; s < seconds; s++) {
    const own = Array.from(db.subarray(s * FRAMES_PER_SEC, (s + 1) * FRAMES_PER_SEC))
    // Two seconds around this one: a single voice can hold a vowel for most
    // of a second, and its rise and fall only shows over a little longer.
    const from = Math.max(0, s * FRAMES_PER_SEC - FRAMES_PER_SEC / 2)
    const to = Math.min(db.length, (s + 1) * FRAMES_PER_SEC + FRAMES_PER_SEC / 2)
    const around = Array.from(db.subarray(from, to))
    const pitches = Array.from(pitch.subarray(from, to))
    // Only frames with sound in them say anything about pitch: counting the
    // quiet ones would read a voice with long pauses as no voice.
    const loud = pitches.filter((_, i) => around[i] >= activeAt)
    out.push({
      active: percentile(own, 0.9) >= activeAt,
      depthDb: percentile(around, 0.95) - percentile(around, 0.1),
      clearPitch: loud.length ? loud.filter((p) => p >= CLEAR_PITCH).length / loud.length : 0,
      somePitch: loud.length ? loud.filter((p) => p >= SOME_PITCH).length / loud.length : 0,
    })
  }
  return out
}

/// One clear voice: the level rises and falls, and pitch comes through clean.
/// On synthetic speech one voice in a room measured 23-38 dB of rise and
/// fall, two voices at once 14, six or more about 5.
const ONE_VOICE_DEPTH_DB = 16
const ONE_VOICE_CLEAR_PITCH = 0.3
/// Voices without the gaps: pitch is there but blurred, the level stays up.
const MANY_VOICES_SOME_PITCH = 0.3
/// Pitch this clean nearly all the time, with little rise and fall, is a
/// tone or music. A crowd's pitch is never this clean: six voices measured
/// 0.1, music 0.97.
const STEADY_DEPTH_DB = 8
const STEADY_CLEAR_PITCH = 0.6

export function classifySecond(f: SecondFeatures): string {
  if (!f.active) return 'q'
  if (f.clearPitch >= ONE_VOICE_CLEAR_PITCH && f.depthDb >= ONE_VOICE_DEPTH_DB) return 'v'
  if (f.depthDb < STEADY_DEPTH_DB && f.clearPitch >= STEADY_CLEAR_PITCH) return 'o'
  if (f.somePitch >= MANY_VOICES_SOME_PITCH) return 'm'
  return 'o'
}

/// Talk does not switch between one voice and many every second; a single
/// second that disagrees with the seconds around it is usually a pause in one
/// voice or a lull in a crowd. Each voice second takes whichever of the two
/// holds the majority of the five seconds around it. Quiet and other sound
/// are left as measured.
const SMOOTH_HALF_WINDOW = 2

export function smoothVoices(raw: string): VoiceTrace {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c !== 'v' && c !== 'm') {
      out += c
      continue
    }
    const near = raw.slice(Math.max(0, i - SMOOTH_HALF_WINDOW), i + SMOOTH_HALF_WINDOW + 1)
    const ones = near.split('v').length - 1
    const many = near.split('m').length - 1
    out += ones > many ? 'v' : many > ones ? 'm' : c
  }
  return out
}

export function classifyVoices(samples: Float32Array, sampleRate: number): VoiceTrace {
  return smoothVoices(secondFeatures(frameFeatures(samples, sampleRate)).map(classifySecond).join(''))
}

/// The whole step as the upload route runs it: the file is read a megabyte
/// at a time, and other requests are served between pieces. Null when the
/// file is not audio this can read, so a browser recording is "not measured"
/// rather than an error.
export async function classifyVoicesInFile(path: string): Promise<VoiceTrace | null> {
  const file = await open(path)
  let fmt: WavFormat | null
  try {
    const { size } = await file.stat()
    const head = Buffer.alloc(Math.min(size, 64 * 1024))
    await file.read(head, 0, head.length, 0)
    fmt = readWavFormat(head, size)
  } finally {
    await file.close()
  }
  if (!fmt || fmt.dataEnd - fmt.dataStart < fmt.sampleRate * fmt.channels * (fmt.float ? 4 : 2)) return null
  const meter = new FrameMeter(fmt.sampleRate)
  const frameBytes = fmt.channels * (fmt.float ? 4 : 2)
  let carry = Buffer.alloc(0)
  for await (const chunk of createReadStream(path, { start: fmt.dataStart, end: fmt.dataEnd - 1, highWaterMark: 1 << 20 })) {
    const bytes = carry.length ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer)
    const whole = bytes.length - (bytes.length % frameBytes)
    meter.push(toSamples(bytes.subarray(0, whole), fmt))
    carry = Buffer.from(bytes.subarray(whole))
    // A megabyte is about half a minute of audio and ~40 ms of work; giving
    // the event loop a turn between pieces keeps the server answering.
    await new Promise((resolve) => setImmediate(resolve))
  }
  return smoothVoices(secondFeatures(meter.finish()).map(classifySecond).join(''))
}

/// Named apart from `quietSec` and `unresolvedSec`, which the level-trace
/// split already stores in the same metricsDetail.
export type VoiceShares = { voiceOneSec: number; voiceManySec: number; voiceOtherSec: number; voiceQuietSec: number }

export function voiceShares(trace: VoiceTrace): VoiceShares {
  const count = (c: string) => trace.split(c).length - 1
  return { voiceOneSec: count('v'), voiceManySec: count('m'), voiceOtherSec: count('o'), voiceQuietSec: count('q') }
}

/// The voice classes already stored in a lesson's metricsDetail, to carry
/// into a rewrite of it.
export function keepVoiceClasses(metricsDetail: unknown): ({ voiceTrace: VoiceTrace } & VoiceShares) | Record<string, never> {
  const trace = (metricsDetail as { voiceTrace?: unknown } | null)?.voiceTrace
  if (typeof trace !== 'string' || !/^[vmoq-]*$/.test(trace)) return {}
  return { voiceTrace: trace, ...voiceShares(trace) }
}
