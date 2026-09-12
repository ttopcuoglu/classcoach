import { buildSpeechUrl, type TalkVoice } from './api'

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

export function createPlaybackQueue(
  audio: HTMLAudioElement,
  voice: TalkVoice | null,
  onFirstPlay?: () => void,
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
    while (!cancellation.cancelled) {
      if (i >= pending.length) {
        if (closed) break
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        continue
      }
      const clip = await pending[i++]
      if (!clip) continue // this segment failed to fetch — skip it, not fatal
      if (cancellation.cancelled) {
        release(clip)
        break
      }
      played += 1
      if (clip.kind === 'blob') {
        await playOne(audio, clip.url, cancellation, announce)
        release(clip)
        continue
      }
      const result = await playDirect(audio, clip.url, cancellation, announce)
      if (result === 'played' || cancellation.cancelled) continue
      // Nothing was heard — download it the slow way rather than skipping a
      // sentence of Coach's answer.
      const fallback = await fetchSentenceAudio(clip.sentence, voice)
      if (!fallback || cancellation.cancelled) {
        if (fallback) URL.revokeObjectURL(fallback)
        continue
      }
      await playOne(audio, fallback, cancellation, announce)
      URL.revokeObjectURL(fallback)
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
