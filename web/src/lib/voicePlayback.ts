import { buildSpeechUrl, type TalkVoice } from './api'

// Shared by Talk It Through and Lesson Debrief's Reflect tab — both need
// the identical sentence-splitting/prefetch/playback behavior (including
// the Chrome streamed-audio-blob quirk below), so this lives in one place
// rather than being duplicated.

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

// Plays a queue of sentences back to back on ONE persistent <audio>
// element, reused for the whole conversation. This has to be the same
// element every time: mobile Safari only allows script-triggered
// playback on a media element that was previously played successfully
// from a real user gesture — a brand-new Audio() object created deep
// inside an async chain gets its play() silently rejected there, which
// .catch() then swallows as if the clip had simply finished, producing
// total silence with no visible error.
//
// TTS synthesis takes real time per sentence, so naively fetching each
// one only after the last finished playing left an audible gap between
// every sentence. A first attempt at fixing this only started fetching
// sentence N+1 once sentence N's audio arrived — giving it a head start
// equal to sentence N's playback duration, which usually isn't enough,
// since synthesizing one sentence typically takes about as long (or
// longer) than *speaking* one. Fixed properly by firing off every
// sentence's fetch in parallel up front, the moment the full reply is
// known, so all of them are synthesizing concurrently while the first
// one plays. This doesn't fight the single-<audio>-element constraint
// above — prefetching is just a network request; only the actual
// assigned `src`/`play()` needs to be the one persistent, gesture-
// unlocked element.
export async function playQueue(audio: HTMLAudioElement, sentences: string[], voice: TalkVoice | null): Promise<void> {
  if (sentences.length === 0) return
  const audioUrls = sentences.map((sentence) => fetchSentenceAudio(sentence, voice))
  for (let i = 0; i < sentences.length; i++) {
    const url = await audioUrls[i]
    if (!url) continue // this segment failed to fetch — skip it, not fatal to the turn
    await new Promise<void>((resolve) => {
      // Chrome has a known quirk with streamed audio blobs (which is what
      // this pipeline always produces) where `ended` can simply never
      // fire, even though the file played and finished fine — Safari
      // doesn't share this quirk, which is exactly the "works on Safari,
      // gets stuck on Chrome" symptom this timeout exists to catch. A
      // single sentence's TTS clip should never legitimately run anywhere
      // near this long, so hitting it always means something's wrong,
      // not that the reply is genuinely still speaking.
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        resolve()
      }
      const timeoutId = window.setTimeout(() => {
        console.warn('[voicePlayback] audio playback timed out waiting for "ended" — advancing anyway')
        settle()
      }, 20000)
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
    URL.revokeObjectURL(url)
  }
}
