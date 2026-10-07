import { SPEECH_WAV_SAMPLE_RATE, synthesizeSpeechStream } from './deepgram.ts'
import { isGapFillerPhrase, isWittyFillerPhrase } from './fillerPhrases.ts'
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
    return softenEnding(audio, isGapFillerPhrase(phrase), isWittyFillerPhrase(phrase))
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
// The hesitation in front of a thinking sound
// ---------------------------------------------------------------------------
//
// A thinking sound that arrives out of nowhere still reads as a machine,
// where the same sound after a hesitation reads as somebody gathering
// themselves.
//
// This began as a synthesized inhale, which was the wrong instrument: noise
// shaped to sound like breathing sounds like air, and the version that swept
// a filter open sounded like a whoosh, because that is what a sweep is.
// Coach's own voice can just hum, which is more convincing than any of it
// and costs nothing after the first time — these are cached as hard as the
// phrases themselves.
//
// Aura will not say the same thing twice. The identical request for
// "Hmmm..." came back at 0.76s, then 0.36s, then 0.44s, with peaks of 6068,
// 5088 and 10992 — and "Mm..." once came back at a peak of 371, which is
// silence. So neither the length nor the level of a hesitation can be chosen
// by choosing its spelling, and an earlier version of this that picked
// between a "long" and a "short" hum was choosing between two draws of the
// same dice.
//
// Instead: ask a few times and keep the usable ones. It happens once per
// voice for the life of the process, so a handful of requests costs nothing,
// it turns a lottery into clips we have actually looked at, and because the
// draws differ Coach does not hum in exactly the same way every time.
const LEAD_IN_SOUND = 'Hmmm...'
const LEAD_IN_DRAWS = 3
// Below this a draw is effectively silent, and amplifying it just raises its
// own noise.
const MIN_USABLE_PEAK = 2000
// And a long draw is as bad as a quiet one: a hesitation is a beat, not a
// sigh, and anything longer eats the budget below.
const MAX_LEAD_IN_MS = 700

// Aura's level for these is a lottery even among usable draws, so a
// hesitation is scaled to a fixed share of the words it precedes rather than
// trusted as recorded. Well under half: it should be felt rather than heard,
// and a hum at conversational level sounds like Coach agreeing with itself.
const HESITATION_LEVEL = 0.22
// A cap on that scaling, so a quiet clip is left quiet rather than being
// amplified into its own noise floor.
const LEAD_IN_MAX_GAIN = 3

// And rolled off, so what is left is the chest of the hum rather than the
// front of it. Aura puts a bright attack on "Hmmm" that reads as a syllable;
// without it the same clip reads as breath.
const LEAD_IN_LOWPASS_HZ = 900

// Then a real pause, and nothing else. This is the point of the whole
// thing: a hum that runs straight into words is a mouth noise, where a hum
// and then a beat of nothing is somebody thinking.
//
// It took two tries to get this right. The first version baked the hum onto
// the FRONT of a spoken phrase — "Hmmm... [pause] Let me see..." — which
// fails twice over. The clip budget then has to cover hum, pause and words
// together, so only the shortest phrase in the list ever qualified. And
// worse, Coach's reply is ready about 0.9s in, which lands inside the pause:
// the clip is faded there, so the teacher heard the hum, a fraction of the
// pause, and then the answer. The pause the hum exists to create was the
// first thing thrown away.
//
// So the hesitation is its own clip, played INSTEAD of a spoken phrase. A
// hum and a beat is about 1.2s, which means a reply ready at 0.9s has 0.3s
// left to wait — inside the hold, so Coach waits it out and the pause is
// heard in full. The pause is no longer competing with words for the budget;
// it is what the clip is.
const HESITATION_PAUSE_MS = 500

// A thinking sound only plays in full if it fits inside the beat before
// Coach's reply: the clip starts about 250ms into the pause, the first
// sentence is ready around 0.9s later, and a clip with 1.2s or less left is
// then allowed to finish (HOLD_FOR_FILLER_MS). Past this it is faded
// mid-word, and a hesitation that pushes it over the line has cost more than
// it added.
const CLIP_BUDGET_MS = 2100

function peakOf(pcm: Buffer, sampleCount: number): number {
  let peak = 0
  for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)))
  return peak
}

/// The hesitation sounds for a voice: raw samples, trimmed of Deepgram's
/// leading silence, the usable draws kept for good.
const hesitations = new Map<string, Promise<Buffer[]>>()

function hesitationDraws(voice: string | undefined): Promise<Buffer[]> {
  const key = keyFor(LEAD_IN_SOUND, voice)
  const existing = hesitations.get(key)
  if (existing) return existing

  const draws = (async () => {
    const usable: Buffer[] = []
    let loudest: Buffer | null = null
    let loudestPeak = 0
    for (let draw = 0; draw < LEAD_IN_DRAWS; draw++) {
      const upstream = await synthesizeSpeechStream(LEAD_IN_SOUND, voice, 'wav')
      const audio = Buffer.from(await upstream.arrayBuffer())
      const marker = audio.indexOf('data')
      if (marker === -1) continue
      const whole = audio.subarray(marker + 8)
      const trimmed = trimLeadingSilence(whole, Math.floor(whole.length / 2))
      const count = Math.floor(trimmed.length / 2)
      if (count === 0) continue
      if ((count / SPEECH_WAV_SAMPLE_RATE) * 1000 > MAX_LEAD_IN_MS) continue
      const peak = peakOf(trimmed, count)
      if (peak > loudestPeak) {
        loudest = trimmed
        loudestPeak = peak
      }
      if (peak >= MIN_USABLE_PEAK) usable.push(trimmed)
    }
    // A draw that is merely quiet still beats no hesitation at all, since it
    // is levelled against the words it precedes anyway.
    if (usable.length === 0 && loudest) usable.push(loudest)
    if (usable.length === 0) throw new Error('no usable hesitation came back')
    return usable
  })()
  draws.catch(() => hesitations.delete(key))
  hesitations.set(key, draws)
  return draws
}

/// Quieter and darker, in one pass: a one-pole roll-off takes the bright
/// attack off the hum, and the gain puts it under the words.
function soften(pcm: Buffer, sampleCount: number, gain: number): Buffer {
  const coeff = Math.min(1, (2 * Math.PI * LEAD_IN_LOWPASS_HZ) / SPEECH_WAV_SAMPLE_RATE)
  const out = Buffer.alloc(sampleCount * 2)
  let y = 0
  let peak = 0
  const filtered = new Float64Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    y += coeff * (pcm.readInt16LE(i * 2) - y)
    filtered[i] = y
    peak = Math.max(peak, Math.abs(y))
  }
  // The roll-off costs level, so the gain is applied to what came out of it
  // rather than to what went in.
  const rawPeak = peakOf(pcm, sampleCount)
  const correction = peak > 0 ? rawPeak / peak : 1
  for (let i = 0; i < sampleCount; i++) {
    out.writeInt16LE(Math.round(Math.max(-32767, Math.min(32767, filtered[i] * correction * gain))), i * 2)
  }
  return out
}

/// A hum and then a beat of silence: Coach thinking, with no words in it.
/// Played in place of a spoken thinking sound, not in front of one.
const hesitationClips = new Map<string, Promise<Buffer>>()

export function hesitationClip(voice: string | undefined): Promise<Buffer> {
  const key = keyFor('hesitate', voice)
  const existing = hesitationClips.get(key)
  if (existing) return existing
  const clip = (async () => {
    const draws = await hesitationDraws(voice)
    const lead = draws[Math.floor(Math.random() * draws.length)]
    const sampleCount = Math.floor(lead.length / 2)
    const peak = peakOf(lead, sampleCount)
    // Nothing to level it against here — it plays into silence rather than
    // in front of words — so a fixed share of full scale, near enough to the
    // level it had beside a phrase.
    const gain = peak > 0 ? Math.min(LEAD_IN_MAX_GAIN, (32767 * HESITATION_LEVEL) / peak) : 1
    const pause = Math.round((SPEECH_WAV_SAMPLE_RATE * HESITATION_PAUSE_MS) / 1000)
    const out = Buffer.alloc((sampleCount + pause) * 2)
    soften(lead, sampleCount, gain).copy(out, 0)
    return wavFile(out)
  })()
  clip.catch(() => hesitationClips.delete(key))
  hesitationClips.set(key, clip)
  return clip
}

// ---------------------------------------------------------------------------
// The sound between sentences
// ---------------------------------------------------------------------------
//
// A reply of three sentences is three separate clips played back to back,
// and each one begins with about 100ms of Deepgram's own silence — so the
// joins are quiet, even, and identical, which is what makes a long reply
// sound assembled rather than spoken.
//
// The short hum goes there, well under the speech around it, on its own
// element so it tucks into the join rather than lengthening the reply. Softer
// and darker than the one in front of a thinking sound, because this one
// plays underneath Coach's own next sentence.
const JOIN_LEVEL = 0.11

export async function joinSound(voice: string | undefined): Promise<Buffer> {
  const draws = await hesitationDraws(voice)
  // The shortest of them: this one plays inside a join, not into silence.
  const lead = draws.reduce((a, b) => (a.length <= b.length ? a : b))
  const sampleCount = Math.floor(lead.length / 2)
  const peak = peakOf(lead, sampleCount)
  if (peak === 0) return wavFile(lead)
  // Scaled to a fixed level rather than to its neighbours: it plays over the
  // start of the next sentence, whose loudness is not known here.
  const gain = Math.min(LEAD_IN_MAX_GAIN, (32767 * JOIN_LEVEL) / peak)
  return wavFile(soften(lead, sampleCount, gain))
}
