import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyVoices,
  classifyVoicesInFile,
  decodeWav,
  frameFeatures,
  keepVoiceClasses,
  secondFeatures,
  smoothVoices,
  voiceShares,
} from './voiceActivity.ts'

// No real classroom recording reaches this code yet, so these signals are
// built by hand: a "voice" is a pitched buzz switched on and off at syllable
// rate, a "crowd" is several of them at different pitches and timings. They
// are far cleaner than a classroom. What they pin down is the shape of the
// answer — a single talker is one voice, a crowd is many, a steady tone or a
// fan is neither, a quiet room is quiet — not the thresholds.

const SR = 16000

let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

/// A voice at `pitchHz` speaking in syllables of ~150 ms with short gaps
/// between them and a longer pause every couple of seconds.
function voice(sec: number, pitchHz: number, offsetSec = 0, level = 0.2): Float32Array {
  const out = new Float32Array(sec * SR)
  // Phase is accumulated so the pitch wobbles ±5% and no more: sin(2π·p(t)·t)
  // with a moving p drifts further from p the longer the clip runs.
  let phase = 0
  for (let n = 0; n < out.length; n++) {
    const t = n / SR + offsetSec
    const p = pitchHz * (1 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t))
    phase += (2 * Math.PI * p) / SR
    const syllable = t % 0.25 < 0.15
    const breath = t % 2.3 < 2.0
    if (!syllable || !breath) continue
    let v = 0
    for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h
    out[n] = level * v * Math.sin((Math.PI * (t % 0.25)) / 0.15)
  }
  return out
}

function noise(sec: number, level: number): Float32Array {
  return new Float32Array(sec * SR).map(() => (rnd() * 2 - 1) * level)
}

function mix(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts[0].length)
  for (const p of parts) for (let n = 0; n < out.length; n++) out[n] += p[n]
  return out
}

function crowd(sec: number, voices: number): Float32Array {
  return mix(...Array.from({ length: voices }, (_, i) => voice(sec, 110 + i * 37, i * 0.093 + rnd(), 0.08)), noise(sec, 0.001))
}

/// The share of seconds (edges trimmed) that came out as `c`.
function share(trace: string, c: string): number {
  const inner = trace.slice(1, -1)
  return (inner.split(c).length - 1) / inner.length
}

test('one voice is heard at its own pitch', () => {
  const features = secondFeatures(frameFeatures(mix(voice(10, 140), noise(10, 0.001)), SR))
  const pitched = features.slice(1, -1).filter((f) => f.pitchHz != null)
  assert.ok(pitched.length >= 6, JSON.stringify(features.map((f) => f.pitchHz)))
  // The synthetic voice wobbles ±5% around 140 Hz.
  for (const f of pitched) assert.ok(Math.abs(f.pitchHz! - 140) < 12, String(f.pitchHz))
})

test('one person talking is one voice', () => {
  const trace = classifyVoices(mix(voice(20, 140), noise(20, 0.001)), SR)
  assert.ok(share(trace, 'v') >= 0.8, trace)
})

test('a room of people talking at once is many voices', () => {
  const trace = classifyVoices(crowd(20, 6), SR)
  assert.ok(share(trace, 'm') >= 0.8, trace)
})

test('a steady fan is other sound, not voices', () => {
  const trace = classifyVoices(noise(20, 0.05), SR)
  assert.ok(share(trace, 'o') >= 0.8, trace)
})

test('a sustained tone is other sound, not a voice', () => {
  const tone = new Float32Array(20 * SR).map((_, n) => 0.2 * Math.sin((2 * Math.PI * 220 * n) / SR))
  const trace = classifyVoices(mix(tone, noise(20, 0.001)), SR)
  assert.ok(share(trace, 'o') >= 0.8, trace)
})

test('a quiet room is quiet', () => {
  const trace = classifyVoices(noise(20, 0.0005), SR)
  assert.ok(share(trace, 'q') >= 0.9, trace)
})

test('a lesson that moves from talk to group work to quiet is read in order', () => {
  const lesson = new Float32Array(60 * SR)
  lesson.set(voice(20, 150), 0)
  lesson.set(crowd(20, 6), 20 * SR)
  const withFloor = mix(lesson, noise(60, 0.0005))
  const trace = classifyVoices(withFloor, SR)
  assert.equal(trace.length, 60)
  assert.ok(share(trace.slice(0, 20), 'v') >= 0.8, trace)
  assert.ok(share(trace.slice(20, 40), 'm') >= 0.8, trace)
  assert.ok(share(trace.slice(40), 'q') >= 0.9, trace)
})

test('one stray second inside a stretch of talk takes the stretch it sits in', () => {
  assert.equal(smoothVoices('vvvmvvv'), 'vvvvvvv')
  assert.equal(smoothVoices('mmmvmmm'), 'mmmmmmm')
  // Quiet and other sound are never rewritten.
  assert.equal(smoothVoices('vvqvv'), 'vvqvv')
})

test('shares count each class', () => {
  assert.deepEqual(voiceShares('vvmqo-'), { voiceOneSec: 2, voiceManySec: 1, voiceOtherSec: 1, voiceQuietSec: 1 })
})

test('stored classes carry over a re-analysis, and nothing else passes as them', () => {
  assert.deepEqual(keepVoiceClasses({ voiceTrace: 'vvm', quietSec: 9 }), {
    voiceTrace: 'vvm', voiceOneSec: 2, voiceManySec: 1, voiceOtherSec: 0, voiceQuietSec: 0,
  })
  assert.deepEqual(keepVoiceClasses({ voiceTrace: 'not a trace' }), {})
  assert.deepEqual(keepVoiceClasses({ voiceTrace: 'vm', voicePitch: 'H-', voiceLevel: 'CD' }), {
    voiceTrace: 'vm', voicePitch: 'H-', voiceLevel: 'CD', voiceOneSec: 1, voiceManySec: 1, voiceOtherSec: 0, voiceQuietSec: 0,
  })
  // Pitch that does not line up with the trace is dropped, not trusted.
  assert.equal('voicePitch' in keepVoiceClasses({ voiceTrace: 'vm', voicePitch: 'H', voiceLevel: 'CD' }), false)
  assert.deepEqual(keepVoiceClasses({ voiceTraceUnread: 'not WAV' }), { voiceTraceUnread: 'not WAV' })
  assert.deepEqual(keepVoiceClasses(null), {})
})

/// A minimal 16-bit mono WAV of `samples`, the way AVAudioRecorder writes one.
function wav(samples: Float32Array, dataSize?: number): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SR, 24)
  header.writeUInt32LE(SR * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataSize ?? data.length, 40)
  return Buffer.concat([header, data])
}

test('a 16-bit WAV decodes to its samples', () => {
  const decoded = decodeWav(wav(new Float32Array([0, 0.5, -0.5])))
  assert.ok(decoded)
  assert.equal(decoded.sampleRate, SR)
  assert.equal(decoded.samples.length, 3)
  assert.ok(Math.abs(decoded.samples[1] - 0.5) < 0.001)
})

test('a recording cut off before its header was finished still decodes', () => {
  const decoded = decodeWav(wav(new Float32Array(100).fill(0.1), 0))
  assert.equal(decoded?.samples.length, 100)
})

test('audio that is not WAV is not read', () => {
  assert.equal(decodeWav(Buffer.from('\x1aE\xdf\xa3 webm bytes', 'binary')), null)
})

test('reading a file in pieces gives the same answer as reading it whole', async () => {
  // Sixty seconds of 16 kHz audio is about 1.9 MB, so the file is read in two
  // pieces that split mid-frame.
  const lesson = new Float32Array(60 * SR)
  lesson.set(voice(30, 150), 0)
  lesson.set(crowd(20, 6), 30 * SR)
  const audio = mix(lesson, noise(60, 0.0005))
  const dir = await mkdtemp(join(tmpdir(), 'voices-'))
  try {
    const path = join(dir, 'lesson.wav')
    await writeFile(path, wav(audio))
    // Quantised to 16 bits on the way into the file, as a real recording is.
    const result = await classifyVoicesInFile(path)
    assert.ok('trace' in result)
    assert.equal(result.trace, classifyVoices(decodeWav(wav(audio))!.samples, SR))
    // Pitch and level come with it, a character a second.
    assert.equal(result.pitch.length, result.trace.length)
    assert.equal(result.level.length, result.trace.length)
  } finally {
    await rm(dir, { recursive: true })
  }
})

/// The fraction of seconds two traces agree on.
function agreement(a: string, b: string): number {
  let same = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++
  return same / Math.max(a.length, b.length)
}

// The iPhone uploads AAC at 32 kbps (AudioCompressor.swift) and a browser
// uploads WebM/Opus. Compression must not change what the room sounded like.
for (const [name, codec] of [
  ['an iPhone upload (AAC)', ['-c:a', 'aac', '-b:a', '32k', 'lesson.m4a']],
  ['a browser upload (WebM)', ['-c:a', 'libopus', '-b:a', '32k', 'lesson.webm']],
] as const) {
  test(`${name} is decoded and reads like the recording it came from`, async () => {
    const lesson = new Float32Array(60 * SR)
    lesson.set(voice(20, 150), 0)
    lesson.set(crowd(20, 6), 20 * SR)
    const audio = mix(lesson, noise(60, 0.0005))
    const dir = await mkdtemp(join(tmpdir(), 'voices-'))
    try {
      const source = join(dir, 'lesson.wav')
      await writeFile(source, wav(audio))
      const target = join(dir, codec[codec.length - 1])
      execFileSync(ffmpegPath!, ['-v', 'error', '-i', source, ...codec.slice(0, -1), target])
      const fromWav = await classifyVoicesInFile(source)
      const decoded = await classifyVoicesInFile(target)
      assert.ok('trace' in fromWav && 'trace' in decoded, JSON.stringify(decoded))
      // Encoders pad a few milliseconds at the start, so a second can shift.
      assert.ok(Math.abs(decoded.trace.length - fromWav.trace.length) <= 1, `${decoded.trace}\n${fromWav.trace}`)
      assert.ok(agreement(decoded.trace, fromWav.trace) >= 0.9, `${decoded.trace}\n${fromWav.trace}`)
    } finally {
      await rm(dir, { recursive: true })
    }
  })
}

test('a file that is neither WAV nor anything ffmpeg can decode has no classes, and says why', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voices-'))
  try {
    const path = join(dir, 'lesson.webm')
    await writeFile(path, Buffer.alloc(4096, 1))
    const result = await classifyVoicesInFile(path)
    assert.ok('unread' in result)
    assert.match(result.unread, /^not WAV: starts 010101010101010101010101; ffmpeg exited \d+: /)
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('a WAV too short to measure says so', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voices-'))
  try {
    const path = join(dir, 'lesson.wav')
    await writeFile(path, wav(new Float32Array(100)))
    assert.deepEqual(await classifyVoicesInFile(path), { unread: 'under a second of audio (200 bytes)' })
  } finally {
    await rm(dir, { recursive: true })
  }
})
