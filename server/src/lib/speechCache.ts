import { SPEECH_WAV_SAMPLE_RATE, synthesizeSpeechStream } from './deepgram.ts'
import { BREATHY_PHRASES, isGapFillerPhrase, isWittyFillerPhrase } from './fillerPhrases.ts'
import { DEFAULT_TALK_VOICE, isValidTalkVoice } from './talkVoices.ts'

// Starts synthesizing a sentence before anyone asks for it.
//
// The spoken path used to be strictly serial: Claude finishes a sentence ->
// the server sends it to the browser -> the browser asks /api/tts for it ->
// the server asks Deepgram -> audio comes back. The last two steps are dead
// time for the teacher, and the first byte of audio measured ~160ms away
// from a cold request.
//
// So the moment a sentence exists, synthesis starts here, and the browser's
// request a moment later reads from a stream that is already flowing. A miss
// is not a failure: /api/tts simply does what it always did.
//
// Only the FIRST sentence of a reply is worth this. Every later one is
// already prefetched by the client while earlier ones play, and doing it for
// all of them would pay Deepgram twice for anything the teacher interrupts.

type Entry = {
  chunks: Buffer[]
  done: boolean
  failed: boolean
  listeners: Set<(chunk: Buffer | null) => void>
  createdAt: number
}

// Long enough to cover the round trip to the browser and back many times
// over, short enough that nothing lingers: a teacher who never asks for the
// audio (they interrupted, or closed the tab) leaves at most this behind.
const TTL_MS = 60_000
const MAX_ENTRIES = 24

const cache = new Map<string, Entry>()

// Keyed by the voice that will actually be used, not by what was passed:
// the web client omits the parameter for a teacher who never chose one,
// while the iOS app names it outright. Both mean the same voice, and
// without this they would miss each other's entries entirely.
function keyFor(text: string, voice: string | undefined): string {
  const resolved = isValidTalkVoice(voice) ? voice : DEFAULT_TALK_VOICE
  return `${resolved}|${text}`
}

function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) cache.delete(key)
  }
  // A cap as well as an age limit: a single teacher talking quickly should
  // not be able to hold more than a handful of clips at once.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function prefetchSpeech(text: string, voice: string | undefined): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const key = keyFor(trimmed, voice)
  prune(Date.now())
  if (cache.has(key)) return

  const entry: Entry = { chunks: [], done: false, failed: false, listeners: new Set(), createdAt: Date.now() }
  cache.set(key, entry)

  void (async () => {
    try {
      const upstream = await synthesizeSpeechStream(trimmed, voice)
      if (!upstream.body) throw new Error('Deepgram returned no audio')
      const reader = upstream.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = Buffer.from(value)
        entry.chunks.push(chunk)
        for (const listener of entry.listeners) listener(chunk)
      }
    } catch (error) {
      console.error('[speech] prefetch failed:', error)
      entry.failed = true
    } finally {
      entry.done = true
      for (const listener of entry.listeners) listener(null)
      entry.listeners.clear()
      // A failed prefetch must not poison the request that follows it; the
      // route falls back to asking Deepgram itself.
      if (entry.failed) cache.delete(key)
    }
  })()
}

export type SpeechStream = {
  /// Everything synthesized so far, already in hand.
  buffered: Buffer[]
  /// Resolves once the clip is complete, calling `onChunk` for each piece
  /// that arrives after the buffered ones.
  rest: (onChunk: (chunk: Buffer) => void) => Promise<void>
}

/// The in-flight (or finished) audio for a sentence, or null when nothing
/// was prefetched and the caller should synthesize it the usual way.
export function takeSpeech(text: string, voice: string | undefined): SpeechStream | null {
  const key = keyFor(text.trim(), voice)
  const entry = cache.get(key)
  if (!entry || entry.failed) return null
  // Served once. A second request for the same sentence is a different
  // conversation (or a reload) and can pay the normal price rather than
  // keeping audio alive here indefinitely.
  cache.delete(key)

  return {
    buffered: entry.chunks.slice(),
    rest: (onChunk) =>
      new Promise<void>((resolve) => {
        if (entry.done) {
          resolve()
          return
        }
        const listener = (chunk: Buffer | null) => {
          if (chunk === null) {
            entry.listeners.delete(listener)
            resolve()
            return
          }
          onChunk(chunk)
        }
        entry.listeners.add(listener)
      }),
  }
}

// ---------------------------------------------------------------------------
// Thinking sounds
// ---------------------------------------------------------------------------
//
// Unlike a sentence of coaching, these are the same every time, for everyone.
// Each one is synthesized once per voice for the life of the process and then
// handed out, which is the difference between paying Deepgram for a fixed
// fifteen clips once and paying for them in every conversation.
//
// Fifteen phrases across six voices is ninety short clips, a couple of
// megabytes at most, so there is no eviction: anything evicted would only be
// bought again.
const fillerClips = new Map<string, Promise<Buffer>>()

export function fillerAudio(text: string, voice: string | undefined): Promise<Buffer> {
  const key = keyFor(text.trim(), voice)
  const existing = fillerClips.get(key)
  if (existing) return existing

  const clip = (async () => {
    const phrase = text.trim()
    const upstream = await synthesizeSpeechStream(phrase, voice, 'wav')
    const audio = Buffer.from(await upstream.arrayBuffer())
    if (audio.length === 0) throw new Error('Deepgram returned no audio')
    const settled = softenEnding(audio, isGapFillerPhrase(phrase), isWittyFillerPhrase(phrase))
    return BREATHY_PHRASES.has(phrase) ? withBreath(settled, phrase) : settled
  })()
  // A failure must not be remembered as the answer forever.
  clip.catch(() => fillerClips.delete(key))
  fillerClips.set(key, clip)
  return clip
}

// How a thinking sound ends decides whether it sounds like someone trailing
// off or like a recording stopping. Deepgram's own clips end 20-30ms after
// the last sound, which on a short nasal one ("Mm", "Hmm") reads as a cut
// even though the waveform is complete.
//
// So the tail is faded by hand and real silence is left after it. Doing it
// here rather than choosing phrases that happen to end softly means the
// choice of words stops being delicate: anything short enough ends cleanly.
// Lengthened after listening: 70ms of fade and 140ms of silence still left
// the shortest clips feeling clipped. The fade is the part that is heard —
// it is the sound trailing away — and the silence after it is what stops the
// reply treading on its heels.
const FADE_SAMPLES = Math.round(SPEECH_WAV_SAMPLE_RATE * 0.12)
const PAD_SAMPLES = Math.round(SPEECH_WAV_SAMPLE_RATE * 0.3)

// Deepgram answers a leading "..." with real silence, which is right in a
// sentence and wrong in a clip: the gap it is covering may be shorter than
// the pause in front of the words. The beat is kept, just a short one.
const KEEP_LEAD_MS = 60

// Relative, not absolute: Aura's pauses are not digital silence, they carry
// room noise and breath, and an absolute floor low enough to be safe on a
// quiet clip sees none of it as a pause at all.
const SILENCE_FRACTION = 0.03
const MIN_SILENCE_FLOOR = 180

function silenceFloor(pcm: Buffer, sampleCount: number): number {
  let peak = 0
  for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)))
  return Math.max(MIN_SILENCE_FLOOR, peak * SILENCE_FRACTION)
}

function trimLeadingSilence(pcm: Buffer, sampleCount: number): Buffer {
  const floor = silenceFloor(pcm, sampleCount)
  let first = 0
  while (first < sampleCount && Math.abs(pcm.readInt16LE(first * 2)) < floor) first++
  if (first >= sampleCount) return pcm.subarray(0, sampleCount * 2)
  const keep = Math.round((SPEECH_WAV_SAMPLE_RATE * KEEP_LEAD_MS) / 1000)
  return pcm.subarray(Math.max(0, first - keep) * 2, sampleCount * 2)
}

// The pauses BETWEEN the words of a gap filler are the whole character of
// it — but Deepgram reads each "..." as a full breath's worth of silence,
// which turns "...well... okay then..." into 3.6s, far longer than the gap
// it is covering. Shortened to a beat, which keeps the hesitation and loses
// the dead air.
const MAX_INNER_PAUSE_MS = 220

// And a ceiling, because Aura's pacing is not ours to set: the same phrase
// came back at 1.7s on one run and 3.6s on another, and a client cannot plan
// around that. Past this the clip is simply cut short and faded, which costs
// a hesitation noise nobody was listening to the end of.
const MAX_GAP_CLIP_MS = 2400

// Except for the ones with a joke in them, where the ending is the point.
const MAX_WITTY_CLIP_MS = 3000

function collapseInnerPauses(pcm: Buffer): Buffer {
  const sampleCount = Math.floor(pcm.length / 2)
  const floor = silenceFloor(pcm, sampleCount)
  const limit = Math.round((SPEECH_WAV_SAMPLE_RATE * MAX_INNER_PAUSE_MS) / 1000)
  const out = Buffer.alloc(pcm.length)
  let written = 0
  let run = 0
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm.readInt16LE(i * 2)
    if (Math.abs(sample) < floor) {
      run += 1
      if (run > limit) continue
    } else {
      run = 0
    }
    out.writeInt16LE(sample, written * 2)
    written += 1
  }
  return out.subarray(0, written * 2)
}

function capLength(pcm: Buffer, witty: boolean): Buffer {
  const ms = witty ? MAX_WITTY_CLIP_MS : MAX_GAP_CLIP_MS
  const limit = Math.round((SPEECH_WAV_SAMPLE_RATE * ms) / 1000) * 2
  return pcm.length > limit ? pcm.subarray(0, limit) : pcm
}

function softenEnding(wav: Buffer, collapse = false, witty = false): Buffer {
  // Deepgram streams its wav, so the header's declared sizes are a
  // placeholder; the samples are whatever follows the data chunk.
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const whole = wav.subarray(marker + 8)
  if (Math.floor(whole.length / 2) === 0) return wav
  const trimmed = trimLeadingSilence(whole, Math.floor(whole.length / 2))
  const pcm = collapse ? capLength(collapseInnerPauses(trimmed), witty) : trimmed
  const sampleCount = Math.floor(pcm.length / 2)
  if (sampleCount === 0) return wav

  const out = Buffer.alloc((sampleCount + PAD_SAMPLES) * 2)
  pcm.copy(out, 0, 0, sampleCount * 2)
  const fade = Math.min(FADE_SAMPLES, sampleCount)
  for (let i = 0; i < fade; i++) {
    const at = (sampleCount - 1 - i) * 2
    out.writeInt16LE(Math.round(out.readInt16LE(at) * (i / fade)), at)
  }
  return wavFile(out)
}

function wavFile(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // uncompressed
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SPEECH_WAV_SAMPLE_RATE, 24)
  header.writeUInt32LE(SPEECH_WAV_SAMPLE_RATE * 2, 28) // bytes per second
  header.writeUInt16LE(2, 32) // bytes per sample
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

// ---------------------------------------------------------------------------
// Breath
// ---------------------------------------------------------------------------
//
// Asked for, and worth the trouble: a thinking sound that arrives out of
// nowhere still reads as a machine, where the same sound after an intake of
// breath reads as somebody gathering themselves. Deepgram has no breath to
// request — "Phew", "Hhh" and "*sigh*" are all spoken as words — so it is
// made here.
//
// The first attempt swept a low-pass filter open across the clip, which is
// exactly how you synthesize a whoosh: a smooth sweep is a jet of air, not a
// person. A breath is turbulent noise in a more or less FIXED band — a broad
// one around 500Hz with a little hiss above it — and what makes it read as
// breath is that the loudness flutters irregularly while the shape of it
// rises slowly and falls more slowly still.
//
// Baked in once when a clip is cached, so it costs nothing per turn.

// A real inhale in speech runs 300-700ms. Longer sounds like a sigh, and
// shorter has to be loud to be heard at all, which is the whoosh again.
const BREATH_MS = 620
const BREATH_GAP_MS = 55
// The shortest worth having: under this it stops sounding like breathing.
const MIN_BREATH_MS = 400
// Measured against the clip's own peak: a real breath beside speech sits far
// below it, and anything louder sounds like exasperation.
const BREATH_LEVEL = 0.095
// The band. Low and broad for the body of it, with a quieter, brighter layer
// for the air — a single band alone sounds like a filtered hiss.
const BREATH_HZ = 520
const BREATH_Q = 0.65
const BREATH_AIR_HZ = 2600
const BREATH_AIR_Q = 1.2
const BREATH_AIR_LEVEL = 0.22
// The rise takes half the breath; the fall takes the rest and is gentler.
const BREATH_ATTACK = 0.5
// Turbulence: how much the loudness wanders, and how quickly.
const BREATH_FLUTTER = 0.22
const BREATH_FLUTTER_HZ = 28

// Seeded, so a given phrase always breathes the same way rather than
// sounding different each time the cache is rebuilt.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/// One band of a two-pole band-pass (RBJ cookbook), which is what gives the
/// noise a formant rather than a hiss.
function bandPass(input: Float64Array, hz: number, q: number): Float64Array {
  const w0 = (2 * Math.PI * hz) / SPEECH_WAV_SAMPLE_RATE
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  const b0 = alpha / a0
  const b2 = -alpha / a0
  const a1 = (-2 * Math.cos(w0)) / a0
  const a2 = (1 - alpha) / a0
  const out = new Float64Array(input.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x = input[i]
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    out[i] = y
  }
  return out
}

function breathSamples(ms: number, peak: number, seed: number): Int16Array {
  const length = Math.round((SPEECH_WAV_SAMPLE_RATE * ms) / 1000)
  const random = seededRandom(seed)
  const white = new Float64Array(length)
  for (let i = 0; i < length; i++) white[i] = random() * 2 - 1

  const body = bandPass(white, BREATH_HZ, BREATH_Q)
  const air = bandPass(white, BREATH_AIR_HZ, BREATH_AIR_Q)

  // The flutter is its own slow noise, not a tone: a regular wobble would
  // read as tremolo.
  const flutterCoeff = Math.min(1, (BREATH_FLUTTER_HZ * 2 * Math.PI) / SPEECH_WAV_SAMPLE_RATE)
  const flutterNoise = seededRandom(seed + 7)
  const flutter = new Float64Array(length)
  let smoothed = 0
  let flutterPeak = 1e-9
  for (let i = 0; i < length; i++) {
    smoothed += flutterCoeff * (flutterNoise() * 2 - 1 - smoothed)
    flutter[i] = smoothed
    flutterPeak = Math.max(flutterPeak, Math.abs(smoothed))
  }

  let mixPeak = 1e-9
  const mixed = new Float64Array(length)
  for (let i = 0; i < length; i++) {
    mixed[i] = body[i] + BREATH_AIR_LEVEL * air[i]
    mixPeak = Math.max(mixPeak, Math.abs(mixed[i]))
  }

  const out = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    const t = i / length
    const envelope =
      t < BREATH_ATTACK
        ? // smooth rise
          ((u) => u * u * (3 - 2 * u))(t / BREATH_ATTACK)
        : // and a longer, gentler fall
          Math.pow(1 - (t - BREATH_ATTACK) / (1 - BREATH_ATTACK), 1.6)
    const value = (mixed[i] / mixPeak) * envelope * (1 + BREATH_FLUTTER * (flutter[i] / flutterPeak)) * peak
    out[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767)
  }
  return out
}

// A thinking sound only plays in full if it fits inside the beat before
// Coach's reply: the clip starts about 250ms into the pause, the first
// sentence is ready around 0.9s later, and a clip with 1.2s or less left is
// then allowed to finish (HOLD_FOR_FILLER_MS). So a clip over about this
// long is faded mid-word, and a breath that pushes it over the line costs
// more than it adds.
const CLIP_BUDGET_MS = 2100

/// Puts an intake of breath in front of a clip — as long a one as will fit
/// before the reply arrives, and none at all when the words alone already
/// fill the beat.
export function withBreath(wav: Buffer, phrase: string): Buffer {
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const pcm = wav.subarray(marker + 8)
  const sampleCount = Math.floor(pcm.length / 2)
  if (sampleCount === 0) return wav

  const speechMs = (sampleCount / SPEECH_WAV_SAMPLE_RATE) * 1000
  const room = CLIP_BUDGET_MS - speechMs - BREATH_GAP_MS
  const breathMs = Math.min(BREATH_MS, room)
  if (breathMs < MIN_BREATH_MS) return wav

  let peak = 0
  for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)))
  if (peak === 0) return wav

  let seed = 0
  for (let i = 0; i < phrase.length; i++) seed = (seed * 31 + phrase.charCodeAt(i)) >>> 0
  const breath = breathSamples(breathMs, (peak / 32767) * BREATH_LEVEL, seed)
  const gap = Math.round((SPEECH_WAV_SAMPLE_RATE * BREATH_GAP_MS) / 1000)

  const out = Buffer.alloc((breath.length + gap + sampleCount) * 2)
  for (let i = 0; i < breath.length; i++) out.writeInt16LE(breath[i], i * 2)
  pcm.copy(out, (breath.length + gap) * 2, 0, sampleCount * 2)
  return wavFile(out)
}

// ---------------------------------------------------------------------------
// The breath between sentences
// ---------------------------------------------------------------------------
//
// A reply of three sentences is three separate clips played back to back,
// and each one begins with about 100ms of Deepgram's own silence — so the
// joins are quiet, even, and identical, which is what makes a long reply
// sound assembled rather than spoken.
//
// A person breathes there. This is that breath: quieter and shorter than the
// one in front of a thinking sound, and played on its own element so it
// tucks into the join that already exists instead of adding to it. It costs
// nothing at all to make — no Deepgram call, just noise — and is the same
// for everyone, so it is built once for the life of the process.
const JOIN_BREATH_MS = 260
const JOIN_BREATH_LEVEL = 0.055

let joinBreath: Buffer | null = null

export function breathClip(): Buffer {
  joinBreath ??= wavFile(Buffer.from(breathSamples(JOIN_BREATH_MS, JOIN_BREATH_LEVEL, 101).buffer))
  return joinBreath
}
