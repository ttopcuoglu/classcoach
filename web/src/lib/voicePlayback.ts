import { buildJoinSoundUrl, buildSpeechUrl, type TalkVoice } from './api'

// Shared by Talk It Through and Lesson Debrief's Reflect tab — both need
// the identical sentence-splitting/prefetch/playback behavior (including
// the Chrome streamed-audio-blob quirk below), so this lives in one place
// rather than being duplicated.

// 40ms of silence. Priming needs a REAL source, and that is the whole point
// of this constant: calling play() on a src-less <audio> in Chrome returns a
// promise that never settles — the resource selection algorithm parks at
// NETWORK_EMPTY waiting for a source, so it neither resolves nor rejects.
//
// That produced a genuinely confusing bug. The unlock ran on the first tap,
// set muted = true, and left its promise pending. It then resolved much
// later, at the moment the FIRST real reply assigned a src and started
// playing — running the unlock's cleanup against live playback: pause(),
// currentTime = 0, muted = false. So the first reply of every session was
// silent and never fired `ended` (playQueue's 20s timeout had to rescue it),
// while every reply after it was fine, because the promise had settled and
// the handler could not fire twice. Safari never showed this: it rejects
// play() with no source immediately, so the catch ran cleanly at prime time.
const SILENT_WAV = 'data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

// Unlocks a persistent <audio> element for later script-triggered playback.
// Must be called from a real user gesture (mobile Safari only allows
// programmatic play() on an element that has already played from one).
export function primeAudioElement(audio: HTMLAudioElement): void {
  let settled = false
  const restore = () => {
    if (settled) return
    settled = true
    window.clearTimeout(guardId)
    // A real reply can start while this is in flight; never clobber it.
    if (audio.src === SILENT_WAV) {
      audio.pause()
      audio.currentTime = 0
    }
    // Whatever happened, the element must not be left muted — that is the
    // failure mode this whole function exists to avoid.
    audio.muted = false
  }

  // Measured in Chrome: calling play() immediately after assigning src loses
  // a race with the load that assignment kicks off and rejects with
  // AbortError, so no playback actually happens and the gesture unlock does
  // not take. Waiting for `loadeddata` first resolves cleanly in ~2ms.
  const play = () => {
    audio.play().then(restore, (err) => {
      console.warn('[voicePlayback] audio unlock (priming) rejected', err?.name, err?.message)
      restore()
    })
  }

  // Belt and braces: if `loadeddata` somehow never fires, unmute anyway
  // rather than leaving every reply of the session silent.
  const guardId = window.setTimeout(() => {
    console.warn('[voicePlayback] audio unlock timed out waiting for loadeddata')
    restore()
  }, 2000)

  audio.muted = true
  audio.addEventListener('loadeddata', play, { once: true })
  audio.src = SILENT_WAV
  audio.load()
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Fetches one sentence's TTS audio as a blob URL rather than handing the
// live /api/tts URL straight to the <audio> element — a plain fetch()
// isn't subject to mobile Safari's playback-gesture rules the way
// audio.play() is, so this can safely run in the background regardless
// of whose "turn" it is to play. Returns null (rather than throwing) on
// failure so a single bad segment doesn't take down the whole reply.
export async function fetchSentenceAudio(sentence: string, voice: TalkVoice | null): Promise<string | null> {
  try {
    const res = await fetch(buildSpeechUrl(sentence, voice), { credentials: 'include' })
    if (!res.ok) {
      console.warn('[voicePlayback] TTS fetch failed', res.status, await res.text().catch(() => ''))
      return null
    }
    const blob = await res.blob()
    if (blob.size === 0) console.warn('[voicePlayback] TTS fetch returned an empty audio blob')
    return URL.createObjectURL(blob)
  } catch (err) {
    console.warn('[voicePlayback] TTS fetch threw', err)
    return null
  }
}

/// The short hum Coach makes between its own sentences, fetched once a
/// conversation. In the teacher's own Coach voice, and the same clip every
/// time, so both sides cache it.
export async function loadJoinSound(voice: TalkVoice | null): Promise<string | null> {
  try {
    const res = await fetch(buildJoinSoundUrl(voice), { credentials: 'include' })
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

// How long to wait for a directly-streamed clip to become playable before
// giving up and falling back to the buffered path. Generous enough to cover
// Deepgram's synthesis latency on a slow connection, short enough that the
// fallback still beats saying nothing.
const DIRECT_STALL_MS = 4000

// A single sentence's audio, in one of two forms. The first sentence of a
// reply is played straight from /api/tts so playback can begin on Deepgram's
// first byte instead of after the last one; every later sentence is
// prefetched into a blob while earlier ones are still playing, by which time
// it is already downloaded and a live URL would only re-introduce latency at
// the exact moment it is needed.
// Stop and Close have to be able to silence a clip that has not started yet.
// Pausing the element is not enough on its own: a clip still loading will
// call play() the moment it becomes playable, so Coach would start talking
// just after the teacher asked for quiet. Pausing also means `ended` never
// fires, which would otherwise leave the queue waiting out its full guard
// timeout before reporting that it had finished.
type Cancellation = { cancelled: boolean; onAbort: (() => void) | null }

// A direct clip keeps its sentence so the buffered fallback can re-request
// it without the queue having to track the text separately.
type Clip = { kind: 'direct'; url: string; sentence: string } | { kind: 'blob'; url: string }

// Chrome has a known quirk with streamed audio blobs (which is what this
// pipeline always produces) where `ended` can simply never fire, even though
// the file played and finished fine — Safari doesn't share this quirk, which
// is exactly the "works on Safari, gets stuck on Chrome" symptom this timeout
// exists to catch. A single sentence's TTS clip should never legitimately run
// anywhere near this long, so hitting it always means something's wrong, not
// that the reply is genuinely still speaking.
const ENDED_GUARD_MS = 20000

function playOne(
  audio: HTMLAudioElement,
  url: string,
  cancellation: Cancellation,
  onStart?: () => void,
): Promise<void> {
  if (cancellation.cancelled) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let settled = false
    const onPlaying = () => onStart?.()
    const settle = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      audio.removeEventListener('playing', onPlaying)
      if (cancellation.onAbort === settle) cancellation.onAbort = null
      resolve()
    }
    cancellation.onAbort = settle
    const timeoutId = window.setTimeout(() => {
      console.warn('[voicePlayback] audio playback timed out waiting for "ended" — advancing anyway')
      settle()
    }, ENDED_GUARD_MS)
    audio.addEventListener('playing', onPlaying, { once: true })
    audio.onended = () => settle()
    audio.onerror = () => {
      console.warn('[voicePlayback] <audio> element error', audio.error?.code, audio.error?.message)
      settle()
    }
    audio.src = url
    audio.play().catch((err) => {
      console.warn('[voicePlayback] audio.play() rejected', err?.name, err?.message)
      settle()
    })
  })
}

// Plays the live /api/tts URL rather than a downloaded copy. The route is a
// plain GET that pipes Deepgram's stream straight through precisely so the
// element can start on the first byte; fetching it into a blob first, as the
// prefetch path must, throws that away and waits for the whole clip.
//
// Resolves 'failed' only if nothing was ever heard, so the caller can fall
// back to the buffered path. That fallback is not hypothetical bookkeeping:
// the element carries crossOrigin="use-credentials" because in production the
// API is a different origin, and if that authentication ever stops working
// the failure mode without a fallback is Coach silently saying nothing.
function playDirect(
  audio: HTMLAudioElement,
  url: string,
  cancellation: Cancellation,
  onStart?: () => void,
): Promise<'played' | 'failed'> {
  if (cancellation.cancelled) return Promise.resolve('played')
  return new Promise<'played' | 'failed'>((resolve) => {
    let settled = false
    let heard = false
    const onProgress = () => {
      if (heard) return
      heard = true
      onStart?.()
    }
    const cleanup = () => {
      window.clearTimeout(stallId)
      window.clearTimeout(endedId)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('playing', onProgress)
      audio.onended = null
      audio.onerror = null
    }
    const settle = (result: 'played' | 'failed') => {
      if (settled) return
      settled = true
      cleanup()
      if (cancellation.onAbort === abort) cancellation.onAbort = null
      resolve(result)
    }
    // Cancelled counts as 'played' so the caller does not treat the silence
    // as a stream failure and go fetch a buffered copy of a clip nobody
    // wants any more.
    const abort = () => settle('played')
    cancellation.onAbort = abort
    // Waiting for `canplay` before calling play() rather than calling it
    // straight after assigning src: that race is what made priming reject
    // with AbortError in Chrome, and a network URL takes far longer to load
    // than the data: URL that first exposed it.
    const onCanPlay = () => {
      window.clearTimeout(stallId)
      if (cancellation.cancelled) {
        settle('played')
        return
      }
      audio.play().catch((err) => {
        console.warn('[voicePlayback] direct play() rejected', err?.name, err?.message)
        settle(heard ? 'played' : 'failed')
      })
    }
    const stallId = window.setTimeout(() => {
      console.warn('[voicePlayback] direct stream never became playable — falling back to buffered audio')
      settle('failed')
    }, DIRECT_STALL_MS)
    const endedId = window.setTimeout(() => {
      console.warn('[voicePlayback] direct playback timed out waiting for "ended" — advancing anyway')
      settle(heard ? 'played' : 'failed')
    }, ENDED_GUARD_MS)

    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('playing', onProgress)
    audio.onended = () => settle('played')
    audio.onerror = () => {
      console.warn('[voicePlayback] direct stream error', audio.error?.code, audio.error?.message)
      settle(heard ? 'played' : 'failed')
    }
    audio.src = url
    audio.load()
  })
}

// A queue that can be fed while it is already playing — which is the whole
// point. Coach's reply is streamed sentence by sentence as Claude writes it,
// so sentence one can be synthesizing and playing while sentence three does
// not exist yet. Previously nothing could start until the entire reply had
// been generated, which was most of the silence a teacher heard after
// finishing their own sentence.
//
// Everything here has to keep using ONE persistent <audio> element: mobile
// Safari only allows script-triggered playback on a media element that was
// previously played successfully from a real user gesture — a brand-new
// Audio() object created deep inside an async chain gets its play() silently
// rejected there, which .catch() then swallows as if the clip had simply
// finished, producing total silence with no visible error.
//
// Prefetching does not fight that constraint — it is just a network request;
// only the assigned `src`/`play()` needs the gesture-unlocked element.
export type PlaybackQueue = {
  push: (sentence: string) => void
  end: () => void
  cancel: () => void
  finished: Promise<void>
}

/// What the page does with a gap in the middle of a reply. `onOpen` is
/// called when the queue runs dry and may start a sound; `onClose` is
/// awaited before the next sentence plays, so a sound that is nearly
/// finished can be allowed to end.
export type GapHandler = {
  onOpen: () => void
  onClose: () => Promise<void>
  /// Called after a sentence when the next one is already in hand, which is
  /// where a person would hesitate. Not awaited: the sound is meant to tuck
  /// into the join, not lengthen it.
  onJoin: () => void
}

export function createPlaybackQueue(
  audio: HTMLAudioElement,
  voice: TalkVoice | null,
  onFirstPlay?: () => void,
  gap?: GapHandler,
): PlaybackQueue {
  const pending: Promise<Clip | null>[] = []
  const cancellation: Cancellation = { cancelled: false, onAbort: null }
  let closed = false
  let wake: (() => void) | null = null
  const nudge = () => {
    const w = wake
    wake = null
    w?.()
  }

  const release = (clip: Clip | null) => {
    if (clip?.kind === 'blob') URL.revokeObjectURL(clip.url)
  }

  const finished = (async () => {
    let i = 0
    let played = 0
    const announce = () => {
      if (played > 1) return
      onFirstPlay?.()
    }
    // A gap is open from the moment the queue has nothing in hand until the
    // next sentence is about to play. Both waits below count: Claude may not
    // have written the sentence yet, or it may be written and still
    // downloading. Never before the first sentence — that silence belongs to
    // the thinking sound, and two of them at once is one too many.
    let inGap = false
    const openGap = () => {
      if (!gap || inGap || played === 0) return
      inGap = true
      gap.onOpen()
    }
    const closeGap = async () => {
      if (!inGap || !gap) return
      inGap = false
      await gap.onClose()
    }
    // Only when the next sentence is already here. If the queue has run dry
    // the gap machinery owns that silence, and this would be fighting it for
    // the same audio element.
    const breatheIfMoreToCome = () => {
      if (!gap || cancellation.cancelled) return
      if (i < pending.length) gap.onJoin()
    }

    while (!cancellation.cancelled) {
      if (i >= pending.length) {
        if (closed) break
        openGap()
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }
      openGap()
      const clip = await pending[i++]
      if (!clip) continue // this segment failed to fetch — skip it, not fatal
      if (cancellation.cancelled) {
        release(clip)
        break
      }
      // Nothing here schedules a sound itself: `onOpen` waits out its own
      // delay, so a clip that was already in hand closes the gap again
      // before anything was heard.
      await closeGap()
      if (cancellation.cancelled) {
        release(clip)
        break
      }
      played += 1
      if (clip.kind === 'blob') {
        await playOne(audio, clip.url, cancellation, announce)
        release(clip)
        breatheIfMoreToCome()
        continue
      }
      const result = await playDirect(audio, clip.url, cancellation, announce)
      if (result === 'played' || cancellation.cancelled) {
        breatheIfMoreToCome()
        continue
      }
      // Nothing was heard — download it the slow way rather than skipping a
      // sentence of Coach's answer.
      const fallback = await fetchSentenceAudio(clip.sentence, voice)
      if (!fallback || cancellation.cancelled) {
        if (fallback) URL.revokeObjectURL(fallback)
        continue
      }
      await playOne(audio, fallback, cancellation, announce)
      URL.revokeObjectURL(fallback)
      breatheIfMoreToCome()
    }
    // Anything fetched but never played still holds an object URL.
    for (; i < pending.length; i++) release(await pending[i].catch(() => null))
  })()

  return {
    push(sentence: string) {
      if (closed || cancellation.cancelled || !sentence.trim()) return
      // Only the first sentence is worth streaming live: it is the one
      // nothing can be prefetched behind, so its download time is heard as
      // silence. Later sentences are fetched now and played from memory
      // once the ones ahead of them finish.
      pending.push(
        pending.length === 0
          ? Promise.resolve({ kind: 'direct' as const, url: buildSpeechUrl(sentence, voice), sentence })
          : fetchSentenceAudio(sentence, voice).then((url) => (url ? { kind: 'blob' as const, url } : null)),
      )
      nudge()
    },
    end() {
      closed = true
      nudge()
    },
    cancel() {
      cancellation.cancelled = true
      closed = true
      audio.pause()
      // Settles whatever is loading or playing right now, so `finished`
      // resolves immediately instead of waiting out a guard timeout for an
      // `ended` event that a paused element will never fire.
      cancellation.onAbort?.()
      cancellation.onAbort = null
      nudge()
    },
    finished,
  }
}

// The all-at-once form, for callers that already have the complete text
// (Lesson Debrief's Reflect tab, and Talk It Through's typed path). Same
// queue underneath, so there is only one copy of the playback behaviour.
export async function playQueue(
  audio: HTMLAudioElement,
  sentences: string[],
  voice: TalkVoice | null,
): Promise<void> {
  if (sentences.length === 0) return
  const queue = createPlaybackQueue(audio, voice)
  for (const sentence of sentences) queue.push(sentence)
  queue.end()
  await queue.finished
}

// Thinking sounds.
//
// Claude takes about a second to write its first sentence, and no amount of
// plumbing removes that — it is the model thinking. What it does not have to
// be is silence. A colleague who is considering what you just said makes
// noise while they do it, so Coach does too.
//
// These are fetched once per conversation and kept as blobs, so playing one
// costs nothing and starts instantly. Fetching them per turn would reintroduce
// exactly the delay they exist to cover.
// One sound per pause, not a running commentary. A second, longer one for
// slow turns was tried on 2026-10-06 and taken back out: it covered the
// silence, but two thinking noises in a row sounded less like a colleague
// considering something and more like a machine filling air. A single "hmm"
// and then quiet is what a person actually does.
//
// All of them have to fit ANY turn, because they are recorded before anyone
// knows what the teacher said. That rules out the reactions Coach uses in
// its actual replies: "Oof" is right half the time and badly wrong the other
// half, and "Oh..." or "Huh..." carry a read on news nobody has heard yet.
//
// Two measured rules shaped this list, and the server keeps the same one in
// fillerPhrases.ts so the audio can be kept forever:
//
//  - They start 250ms into the pause, Coach's first sentence lands around
//    1.2s, and the reply waits for one with 1.2s or less left to finish. So
//    anything up to ~2.15s plays in full; past that it fades mid-word, which
//    is what made an earlier, wordier set sound chopped.
//  - Ending in "..." rather than ".", which makes the voice trail off rather
//    than stop.
export const FILLER_PHRASES = [
  'Let me see...',
  "Well, let's see...",
  "Okay, let's see...",
  "Alright, let's see...",
  "So, let's see...",
  'Well, let me think...',
  'Okay, let me think...',
  'Hmm, let me think...',
  'Let me take a moment...',
  'Just a moment...',
  'Give me a second...',
  'Let me gather my thoughts...',
  "Let's think about this...",
  'Well, now...',
  'Okay, so...',
  'Alright, then...',
  'Hmm, okay...',
]

// The second pool: what Coach says between its own sentences, when Claude
// has not finished writing the next one. A different job from an opener —
// the teacher is already mid-answer, so "Let me think..." would sound like
// Coach losing its place. These hold the floor instead of taking it.
//
// They lead with "..." deliberately: Coach comes in a beat late rather than
// jumping into its own pause. The server trims the dead air that produces
// and shortens the pauses between the words (speechCache.ts), so what
// arrives here is between 0.7s and 2.5s.
export const BETWEEN_FILLER_PHRASES = [
  "...well... okay then...",
  "...hmm... alrighty...",
  "...so... yeah...",
  "...okay... well, well...",
  "...well... you know...",
  "...I mean... yeah...",
  "...hmm... okay, okay...",
  "...alrighty... so...",
  "...well... huh...",
  "...okay-dokey...",
  "...yeah... well...",
  "...so... um... yeah...",
  "...well... I mean...",
  "...hmm... right...",
  "...okay... well then...",
  "...ah... okay...",
  "...right... right...",
  "...oh... well...",
  "...okay... so, yeah...",
  "...well... hmm...",
]

// The third pool: the same gaps, with a joke in them.
//
// These are the one kind that has to be heard to the end — "...my words took
// the scenic route..." faded after "...my words took the..." is worse than
// silence — so they are never faded for a sentence that is ready, only for
// a teacher who starts talking. Which is also why they are rare: a joke
// Coach refuses to be interrupted out of is charming once a conversation
// and wearing by the fourth time.
export const WITTY_FILLER_PHRASES = [
  "...well... the wheels are turning...",
  "...so... little mental pit stop...",
  "...hmm... a little traffic upstairs...",
  "...well... my words took the scenic route...",
  "...so... the gears are warming up...",
  "...hmm... just catching a wandering thought...",
  "...well... one brain cell at a time...",
  "...so... the mental hamster is running...",
  "...well... my brain and mouth are negotiating...",
]

// Roughly one turn in four, and never two running. The rest of the time the
// plain hesitation noises do the work.
//
// These are drawn mostly at the START of a turn, not between sentences,
// which is the opposite of where they were first put. A gap between Coach's
// sentences almost never opens: Claude writes a sentence in a few hundred
// milliseconds and Coach takes three or four seconds to say one, so the
// queue is never dry. The second of silence after the teacher stops talking
// is the only reliable gap there is — and "the gears are warming up" is a
// thinking-out-loud line anyway, so that is where it belongs.
export const WITTY_GAP_CHANCE = 0.25

// Coach has just reacted to something painful: "Ugh, that's rough." — and
// then "the mental hamster is running" would be the worst thing this
// feature could do. Checked against Coach's own first sentence, which is
// where the prompt puts its sympathy, and it silences the jokes for the
// rest of that turn. Kept in step with SpeechPlayer.swift.
// At the start of a turn there is no reply yet to read the mood from, so the
// teacher's own words are what decide. Deliberately broad: suppressing a
// joke that would have been fine costs nothing, and telling one over a
// teacher who just said they cried in their car is unforgivable.
const HARD_MOMENT_MARKERS = [
  'cried',
  'crying',
  'in tears',
  'quit',
  'quitting',
  'resign',
  'burnt out',
  'burned out',
  'exhausted',
  'overwhelmed',
  'breaking point',
  'falling apart',
  "can't do this",
  'cant do this',
  'at my limit',
  'had enough',
  'lost it',
  'humiliated',
  'awful',
  'terrible',
  'the worst',
  'hate teaching',
  'panic',
  'anxiety',
  'depressed',
  'no idea what to do',
  'helpless',
  'hopeless',
]

/// Whether what the teacher just said rules out a joke this turn.
export function soundsLikeAHardTurn(transcript: string): boolean {
  const text = transcript.toLowerCase()
  return HARD_MOMENT_MARKERS.some((marker) => text.includes(marker))
}

const SYMPATHY_MARKERS = [
  'oof',
  'ugh',
  'oh no',
  "i'm sorry",
  'im sorry',
  "that's rough",
  "that's hard",
  "that's awful",
  "that's a lot",
  "that's frustrating",
  'sounds hard',
  'sounds exhausting',
  'long day',
  'rough day',
  'exhausting',
  'overwhelming',
  'in tears',
  'crying',
  'burnt out',
  'burned out',
]

/// Whether Coach's own words mean this is not a moment for a joke.
export function soundsLikeAHardMoment(sentence: string): boolean {
  const text = sentence.toLowerCase()
  return SYMPATHY_MARKERS.some((marker) => text.includes(marker))
}

export type Fillers = {
  /// A clip that is not the one played last, so Coach does not say "Hmm"
  /// twice in a row. Null when none loaded.
  nextStarter: () => string | null
  /// The same, from the between-sentence pool.
  nextGap: () => string | null
  /// A gap filler with a joke in it, for the rare turn that gets one.
  nextWitty: () => string | null
  release: () => void
}

// Not the whole list. Thirty-seven clips is a couple of megabytes, which is
// a lot to spend on a teacher's cellular data for sounds they will hear
// perhaps ten of. A handful from each pool gives all the variety a single
// conversation can use, and a different handful next time.
const CLIPS_PER_POOL = 6

// Fewer still of these: they are drawn a quarter as often, and three is
// already more than one conversation will get through.
const WITTY_CLIPS = 3

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = items.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

/// Draws from a loaded pool without repeating the clip it just gave out.
function rotate(urls: string[]): () => string | null {
  let last = -1
  return () => {
    if (urls.length === 0) return null
    let index = Math.floor(Math.random() * urls.length)
    if (urls.length > 1 && index === last) index = (index + 1) % urls.length
    last = index
    return urls[index]
  }
}

export async function loadFillers(voice: TalkVoice | null): Promise<Fillers> {
  const fetchPool = async (phrases: readonly string[], count: number) =>
    (await Promise.all(sample(phrases, count).map((phrase) => fetchSentenceAudio(phrase, voice)))).filter(
      (url): url is string => url !== null,
    )
  const [starters, gaps, witty] = await Promise.all([
    fetchPool(FILLER_PHRASES, CLIPS_PER_POOL),
    fetchPool(BETWEEN_FILLER_PHRASES, CLIPS_PER_POOL),
    fetchPool(WITTY_FILLER_PHRASES, WITTY_CLIPS),
  ])
  return {
    nextStarter: rotate(starters),
    nextGap: rotate(gaps),
    nextWitty: rotate(witty),
    release() {
      for (const url of [...starters, ...gaps, ...witty]) URL.revokeObjectURL(url)
      starters.length = 0
      gaps.length = 0
      witty.length = 0
    },
  }
}
