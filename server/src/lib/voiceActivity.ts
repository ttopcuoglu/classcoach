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

import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'

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
  /// The period that periodicity was found at, in 8 kHz samples; 0 for none.
  lag: Float32Array
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
  /// The voice's pitch over this second, Hz — the middle of its clearly
  /// pitched frames — or null when none was clear. With `levelDb`, what tells
  /// one speaker from another; see roomTrace.ts.
  pitchHz: number | null
  /// How loud this second was at its loudest, dB (90th percentile of frames).
  levelDb: number
}

type WavFormat = { float: boolean; channels: number; sampleRate: number; dataStart: number; dataEnd: number }

/// Where the samples are in a 16-bit or 32-bit float PCM WAV, from its first
/// bytes. For anything else — including the compressed audio browsers record —
/// a short reason instead, stored with the lesson, because a lesson that came
/// back without classes and no word why could not be diagnosed.
///
/// `fileSize` is the whole file's: a recording cut off mid-lesson never had
/// its header finished, so the stated size can be zero or past the end, and
/// the file holds what it holds.
function readWavFormat(head: Buffer, fileSize: number): WavFormat | string {
  if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') {
    return `not WAV: starts ${head.subarray(0, 12).toString('hex')}`
  }
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
      if (!channels || !sampleRate) return 'no fmt chunk before data'
      if (!((format === 1 && bits === 16) || (format === 3 && bits === 32))) return `unsupported format ${format}, ${bits}-bit`
      const dataEnd = size > 0 && body + size <= fileSize ? body + size : fileSize
      return { float: format === 3, channels, sampleRate, dataStart: body, dataEnd }
    }
    // Chunks are padded to an even length.
    offset = body + size + (size % 2)
  }
  return `no data chunk in the first ${head.length} bytes`
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
  if (typeof fmt === 'string') return null
  return { samples: toSamples(buf.subarray(fmt.dataStart, fmt.dataEnd), fmt), sampleRate: fmt.sampleRate }
}

/// Level and pitch of one 40 ms frame of 8 kHz audio starting at `start`.
function measureFrame(x: Float32Array, start: number): [db: number, pitch: number, lag: number] {
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
  if (db < ABSOLUTE_FLOOR_DB) return [db, 0, 0]
  let best = 0
  let bestLag = 0
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
    if (norm > 0 && r / norm > best) {
      best = r / norm
      bestLag = lag
    }
  }
  return [db, best, bestLag]
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
  private readonly lag: number[] = []

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
      const [db, pitch, lag] = measureFrame(x, start)
      this.db.push(db)
      this.pitch.push(pitch)
      this.lag.push(lag)
    }
    this.pending = x.slice(start)
  }

  finish(): FrameFeatures {
    return { db: Float32Array.from(this.db), pitch: Float32Array.from(this.pitch), lag: Float32Array.from(this.lag) }
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

/// A fifth of a second of clear pitch before a second is given one: fewer is
/// a stray periodic noise as often as a voice.
const MIN_PITCHED_FRAMES = 10

export function secondFeatures({ db, pitch, lag }: FrameFeatures): SecondFeatures[] {
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
    // Pitch from this second's own frames only, unlike the shares above: it
    // names who was speaking in THIS second.
    const hz: number[] = []
    for (let f = s * FRAMES_PER_SEC; f < Math.min(db.length, (s + 1) * FRAMES_PER_SEC); f++) {
      if (db[f] >= activeAt && pitch[f] >= CLEAR_PITCH && lag[f] > 0) hz.push(ANALYSIS_RATE / lag[f])
    }
    out.push({
      active: percentile(own, 0.9) >= activeAt,
      depthDb: percentile(around, 0.95) - percentile(around, 0.1),
      clearPitch: loud.length ? loud.filter((p) => p >= CLEAR_PITCH).length / loud.length : 0,
      somePitch: loud.length ? loud.filter((p) => p >= SOME_PITCH).length / loud.length : 0,
      pitchHz: hz.length >= MIN_PITCHED_FRAMES ? percentile(hz, 0.5) : null,
      levelDb: percentile(own, 0.9),
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

/// What each second sounded like, besides its class: `pitch` and `level`, one
/// character a second each, in the code below. Kept so that once the teacher
/// has said which speaker is them, a second of talk with no words can be put
/// down to them or to a student (roomTrace.ts). Like the trace, nothing that
/// sounds like anyone can be rebuilt from two numbers a second.
export type VoiceSeconds = { trace: VoiceTrace; pitch: string; level: string }

type Classified = VoiceSeconds | { unread: string }

/// 64 steps, one character each. Pitch is in semitones above 55 Hz, so a
/// step is the same heard difference at any pitch, with '-' for none; level
/// is in 1.5 dB steps down from full scale.
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_~'
const PITCH_BASE_HZ = 55
const LEVEL_STEP_DB = 1.5

const toCode = (n: number) => CODE[Math.max(0, Math.min(CODE.length - 1, Math.round(n)))]

export function encodeSeconds(seconds: SecondFeatures[]): { pitch: string; level: string } {
  return {
    pitch: seconds.map((f) => (f.pitchHz == null ? '-' : toCode(12 * Math.log2(f.pitchHz / PITCH_BASE_HZ)))).join(''),
    level: seconds.map((f) => toCode(-f.levelDb / LEVEL_STEP_DB)).join(''),
  }
}

/// Semitones above 55 Hz, or null for a second with no clear pitch.
export function pitchAt(pitch: string, sec: number): number | null {
  const i = CODE.indexOf(pitch[sec] ?? '-')
  return i < 0 ? null : i
}

/// dB relative to full scale, or null past the end.
export function levelAt(level: string, sec: number): number | null {
  const i = CODE.indexOf(level[sec] ?? '')
  return i < 0 ? null : -i * LEVEL_STEP_DB
}

/// The whole step as the upload route runs it. A WAV is read straight off
/// disk; anything else — the iPhone's upload is AAC, compressed after Stop to
/// spare a teacher a 115 MB upload, and a browser's is WebM — is decoded by
/// ffmpeg on the way in. Either way the audio arrives in pieces and other
/// requests are served between them. When the file cannot be read, the
/// reason why, so a lesson without classes says what went wrong.
export async function classifyVoicesInFile(path: string): Promise<Classified> {
  const file = await open(path)
  let fmt: WavFormat | string
  try {
    const { size } = await file.stat()
    const head = Buffer.alloc(Math.min(size, 64 * 1024))
    await file.read(head, 0, head.length, 0)
    fmt = readWavFormat(head, size)
  } finally {
    await file.close()
  }
  if (typeof fmt === 'string') {
    const decoded = await classifyDecoded(path)
    return 'unread' in decoded ? { unread: `${fmt}; ${decoded.unread}` } : decoded
  }
  if (fmt.dataEnd - fmt.dataStart < bytesPerSec(fmt)) return { unread: `under a second of audio (${fmt.dataEnd - fmt.dataStart} bytes)` }
  return measure(createReadStream(path, { start: fmt.dataStart, end: fmt.dataEnd - 1, highWaterMark: 1 << 20 }), fmt)
}

/// What ffmpeg is asked to decode to: the same 16 kHz mono 16-bit samples the
/// iPhone records, so a decoded upload is measured exactly as a WAV one is.
const DECODED: WavFormat = { float: false, channels: 1, sampleRate: 16000, dataStart: 0, dataEnd: 0 }

async function classifyDecoded(path: string): Promise<Classified> {
  if (!ffmpegPath) return { unread: 'no ffmpeg for this platform' }
  const child = spawn(ffmpegPath, ['-nostdin', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(DECODED.sampleRate), '-f', 's16le', 'pipe:1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-300)))
  // Resolves rather than rejects: the process exits on an unhandled rejection
  // (see index.ts), and a failed spawn is only a lesson without classes.
  const exited = new Promise<string | null>((resolve) => {
    child.on('error', (error) => resolve(`ffmpeg did not start: ${error.message}`))
    child.on('close', (code) => resolve(code === 0 ? null : `ffmpeg exited ${code}: ${stderr.trim()}`))
  })
  const result = await measure(child.stdout, DECODED)
  const failed = await exited
  return failed ? { unread: failed } : result
}

function bytesPerSec(fmt: WavFormat): number {
  return fmt.sampleRate * fmt.channels * (fmt.float ? 4 : 2)
}

async function measure(chunks: AsyncIterable<Buffer>, fmt: WavFormat): Promise<Classified> {
  const meter = new FrameMeter(fmt.sampleRate)
  const frameBytes = fmt.channels * (fmt.float ? 4 : 2)
  let carry = Buffer.alloc(0)
  let total = 0
  for await (const chunk of chunks) {
    total += chunk.length
    const bytes = carry.length ? Buffer.concat([carry, chunk]) : chunk
    const whole = bytes.length - (bytes.length % frameBytes)
    meter.push(toSamples(bytes.subarray(0, whole), fmt))
    carry = Buffer.from(bytes.subarray(whole))
    // A megabyte is about half a minute of audio and ~40 ms of work; giving
    // the event loop a turn between pieces keeps the server answering.
    await new Promise((resolve) => setImmediate(resolve))
  }
  if (total < bytesPerSec(fmt)) return { unread: `under a second of audio (${total} bytes)` }
  const seconds = secondFeatures(meter.finish())
  const trace = smoothVoices(seconds.map(classifySecond).join(''))
  return trace ? { trace, ...encodeSeconds(seconds) } : { unread: `no frames from ${total} bytes at ${fmt.sampleRate} Hz` }
}

/// Named apart from `quietSec` and `unresolvedSec`, which the level-trace
/// split already stores in the same metricsDetail.
export type VoiceShares = { voiceOneSec: number; voiceManySec: number; voiceOtherSec: number; voiceQuietSec: number }

export function voiceShares(trace: VoiceTrace): VoiceShares {
  const count = (c: string) => trace.split(c).length - 1
  return { voiceOneSec: count('v'), voiceManySec: count('m'), voiceOtherSec: count('o'), voiceQuietSec: count('q') }
}

/// The voice classes already stored in a lesson's metricsDetail, to carry
/// into a rewrite of it — or the reason there are none.
export function keepVoiceClasses(
  metricsDetail: unknown,
):
  | ({ voiceTrace: VoiceTrace; voicePitch?: string; voiceLevel?: string } & VoiceShares)
  | { voiceTraceUnread: string; voiceTrace?: undefined }
  | { voiceTrace?: undefined } {
  const stored = metricsDetail as { voiceTrace?: unknown; voicePitch?: unknown; voiceLevel?: unknown; voiceTraceUnread?: unknown } | null
  const trace = stored?.voiceTrace
  if (typeof trace === 'string' && /^[vmoq-]+$/.test(trace)) {
    // Lessons classified before pitch and level were kept have only the trace.
    const coded = (v: unknown) => typeof v === 'string' && v.length === trace.length && /^[0-9A-Za-z_~-]*$/.test(v)
    return {
      voiceTrace: trace,
      ...(coded(stored?.voicePitch) && coded(stored?.voiceLevel) ? { voicePitch: stored!.voicePitch as string, voiceLevel: stored!.voiceLevel as string } : {}),
      ...voiceShares(trace),
    }
  }
  if (typeof stored?.voiceTraceUnread === 'string') return { voiceTraceUnread: stored.voiceTraceUnread }
  return {}
}
