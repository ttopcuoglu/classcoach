import { SPEECH_WAV_SAMPLE_RATE, synthesizeSpeechStream } from './deepgram.ts'
import { BREATHY_PHRASES } from './fillerPhrases.ts'
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
    const upstream = await synthesizeSpeechStream(text.trim(), voice, 'wav')
    const audio = Buffer.from(await upstream.arrayBuffer())
    if (audio.length === 0) throw new Error('Deepgram returned no audio')
    return softenEnding(audio)
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

function softenEnding(wav: Buffer): Buffer {
  // Deepgram streams its wav, so the header's declared sizes are a
  // placeholder; the samples are whatever follows the data chunk.
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const pcm = wav.subarray(marker + 8)
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
// Noise alone sounds like wind. What makes it read as breath is movement:
// it brightens as the air speeds up, wavers rather than hissing evenly, and
// builds more slowly than it stops. Baked in once when a clip is cached, so
// it costs nothing per turn.
const BREATH_MS = 460
const BREATH_GAP_MS = 55
// Measured against the clip's own peak: a real breath beside speech sits far
// below it, and anything louder sounds like a sigh of exasperation.
const BREATH_LEVEL = 0.15

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

function breathSamples(peak: number, seed: number): Int16Array {
  const random = seededRandom(seed)
  const length = Math.round((SPEECH_WAV_SAMPLE_RATE * BREATH_MS) / 1000)
  const out = new Int16Array(length)
  let lowPass = 0
  let rumble = 0
  let drift = 0
  for (let i = 0; i < length; i++) {
    const t = i / length
    // The filter opens as the breath goes on: air moving faster is brighter.
    const openness = 0.04 + (0.26 - 0.04) * t
    const white = random() * 2 - 1
    lowPass += openness * (white - lowPass)
    rumble += 0.004 * (lowPass - rumble)
    // A slow wander in loudness, so it breathes rather than hisses.
    drift = Math.max(-1, Math.min(1, drift * 0.995 + (random() - 0.5) * 0.1))
    const envelope = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.2)
    const value = (lowPass - rumble) * envelope * peak * (1 + 0.22 * drift)
    out[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767)
  }
  return out
}

/// Puts an intake of breath in front of a clip.
export function withBreath(wav: Buffer, phrase: string): Buffer {
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const pcm = wav.subarray(marker + 8)
  const sampleCount = Math.floor(pcm.length / 2)
  if (sampleCount === 0) return wav

  let peak = 0
  for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)))
  if (peak === 0) return wav

  let seed = 0
  for (let i = 0; i < phrase.length; i++) seed = (seed * 31 + phrase.charCodeAt(i)) >>> 0
  const breath = breathSamples((peak / 32767) * BREATH_LEVEL, seed)
  const gap = Math.round((SPEECH_WAV_SAMPLE_RATE * BREATH_GAP_MS) / 1000)

  const out = Buffer.alloc((breath.length + gap + sampleCount) * 2)
  for (let i = 0; i < breath.length; i++) out.writeInt16LE(breath[i], i * 2)
  pcm.copy(out, (breath.length + gap) * 2, 0, sampleCount * 2)
  return wavFile(out)
}
