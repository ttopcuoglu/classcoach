import { SPEECH_WAV_SAMPLE_RATE, synthesizeSpeechStream } from './deepgram.ts'
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

// Every filler is now a single short utterance, which is where Aura is least
// reliable: asked for "Yeah." three times it came back at 26%, 0% and 27% of
// full scale, and a 0% draw is silence. Cached for the life of the process,
// one bad draw silences that acknowledgement for days — so a draw is checked
// before it is kept.
//
// The word-by-word splicing that used to live here went with the jokes: it
// existed because Aura could not say two interjections in one breath, and
// nothing asks it to any more.
const MIN_AUDIBLE_PEAK = 2000
const AUDIBLE_DRAWS = 4

// And then the level is set here rather than accepted from Aura, because
// retrying is not enough. Measured through this very path, "Let me see..."
// came back at 5% of full scale after all FOUR draws — Aura is simply bad at
// that phrase, and a teacher on that server instance would hear almost
// nothing for days. Other fillers landed anywhere between 12% and 50%.
//
// So every clip is brought to the same loudness: well under Coach's own
// speech, which measures 37-49%, and comfortably audible. The gain is capped
// so a near-silent draw is lifted without its noise floor coming with it.
const FILLER_TARGET_PEAK = 0.3
const MAX_NORMALISE_GAIN = 8

function normalise(wav: Buffer): Buffer {
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const pcm = wav.subarray(marker + 8)
  const sampleCount = Math.floor(pcm.length / 2)
  const peak = peakOf(pcm, sampleCount)
  if (peak === 0) return wav
  const wanted = (32767 * FILLER_TARGET_PEAK) / peak
  // Only ever lifted, never pushed down: a clip that came back loud is a
  // clip Aura meant to be loud.
  if (wanted <= 1) return wav
  const gain = Math.min(MAX_NORMALISE_GAIN, wanted)
  const out = Buffer.alloc(sampleCount * 2)
  for (let i = 0; i < sampleCount; i++) {
    const scaled = pcm.readInt16LE(i * 2) * gain
    out.writeInt16LE(Math.round(Math.max(-32767, Math.min(32767, scaled))), i * 2)
  }
  return wavFile(out)
}

async function drawAudible(text: string, voice: string | undefined): Promise<Buffer> {
  let best: Buffer | null = null
  let bestPeak = -1
  for (let draw = 0; draw < AUDIBLE_DRAWS; draw++) {
    const upstream = await synthesizeSpeechStream(text, voice, 'wav')
    const audio = Buffer.from(await upstream.arrayBuffer())
    const marker = audio.indexOf('data')
    if (audio.length === 0 || marker === -1) continue
    const body = audio.subarray(marker + 8)
    const peak = peakOf(body, Math.floor(body.length / 2))
    if (peak > bestPeak) {
      best = audio
      bestPeak = peak
    }
    if (bestPeak >= MIN_AUDIBLE_PEAK) break
  }
  if (!best) throw new Error('Deepgram returned no audio')
  if (bestPeak < MIN_AUDIBLE_PEAK) {
    console.warn(`[speech] "${text}" is barely audible after ${AUDIBLE_DRAWS} draws (peak ${bestPeak})`)
  }
  return best
}

export function fillerAudio(text: string, voice: string | undefined): Promise<Buffer> {
  const key = keyFor(text.trim(), voice)
  const existing = fillerClips.get(key)
  if (existing) return existing

  const clip = (async () => {
    const phrase = text.trim()
    // Anything made of several interjections is built word by word; a single
    // utterance ("Well, let me think...") Aura says reliably in one go.
    const audio = await drawAudible(phrase, voice)
    return softenEnding(normalise(audio))
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

function softenEnding(wav: Buffer): Buffer {
  // Deepgram streams its wav, so the header's declared sizes are a
  // placeholder; the samples are whatever follows the data chunk.
  const marker = wav.indexOf('data')
  if (marker === -1) return wav
  const whole = wav.subarray(marker + 8)
  if (Math.floor(whole.length / 2) === 0) return wav
  const trimmed = trimLeadingSilence(whole, Math.floor(whole.length / 2))
  const pcm = trimmed
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


// peakOf stays because the splice path and the audible-draw check both use
// it. Everything else that lived down here — the hum in front of a turn, the
// hum between sentences, the draw-and-keep machinery that fed them, the
// low-pass and the fade — went with the sounds themselves.
function peakOf(pcm: Buffer, sampleCount: number): number {
  let peak = 0
  for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)))
  return peak
}
