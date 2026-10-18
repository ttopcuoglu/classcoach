import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { DEFAULT_TALK_VOICE, isValidTalkVoice } from './talkVoices.ts'

// One-shot (non-streaming) transcription against Deepgram's prerecorded
// endpoint. The caller is responsible for never persisting `buffer` — this
// function only ever holds it in memory long enough to make the request.
//
// mip_opt_out=true is required on every request to both endpoints below —
// this is classroom/student audio, and without it Deepgram's Model
// Improvement Program is allowed to retain and train on it. There is no
// account-level toggle for this (confirmed against the live project via
// the Management API); it's a per-request parameter only, so it must
// never be dropped from either URL, including if either call is ever
// rewritten to use an SDK instead of a raw fetch.

export type DeepgramUtterance = {
  speaker: number
  start: number
  end: number
  transcript: string
  /// How sure Deepgram is that each word is this speaker's, as runs in word
  /// order: [number of words, confidence]. Null when the response had no
  /// per-word confidence. See `speakerConfidenceRuns`.
  speakerConfidence: SpeakerConfidenceRuns | null
}

/// [words, confidence] pairs, in order. Kept per word rather than one figure
/// per line because diarization can fold a second voice into a line: on a
/// synthetic two-voice clip, Deepgram labelled everything one speaker, and
/// a single line ran "Take a second and think about it" at 0.76 then a
/// different voice's "Because the earth casts a shadow…" at 0.11. An average
/// would have hidden that.
export type SpeakerConfidenceRuns = [number, number][]

/// Words grouped into runs of the same confidence (to two places), so a
/// line is a few pairs rather than one number per word.
export function speakerConfidenceRuns(words: unknown): SpeakerConfidenceRuns | null {
  if (!Array.isArray(words) || words.length === 0) return null
  const runs: SpeakerConfidenceRuns = []
  for (const w of words) {
    const c = (w as { speaker_confidence?: unknown })?.speaker_confidence
    if (typeof c !== 'number' || !Number.isFinite(c)) return null
    const rounded = Math.round(c * 100) / 100
    const last = runs[runs.length - 1]
    if (last && last[1] === rounded) last[0]++
    else runs.push([1, rounded])
  }
  return runs
}

if (!process.env.DEEPGRAM_API_KEY) {
  console.warn(
    '[deepgram] DEEPGRAM_API_KEY is not set — audio transcription will fail. Add it to server/.env',
  )
}

/// A lesson recording is now 16 kHz PCM rather than AAC — ~1.9 MB a minute, so
/// 90 minutes is ~173 MB. Read into a Buffer that is 173 MB of Node heap for the
/// whole upload, per concurrent request; streamed off disk it is a few hundred
/// KB. Short clips (a Talk It Through turn, onboarding) still come through
/// `transcribeAudio` as a Buffer, where the difference does not matter.
export async function transcribeAudioFile(filePath: string, contentType: string): Promise<DeepgramUtterance[]> {
  const { size } = await stat(filePath)
  // Content-Length set explicitly: a stream body would otherwise go out
  // chunked, and Deepgram is happier being told the length up front.
  return sendToDeepgram(createReadStream(filePath) as unknown as BodyInit, contentType, size)
}

export async function transcribeAudio(buffer: Buffer, contentType: string): Promise<DeepgramUtterance[]> {
  return sendToDeepgram(buffer as unknown as BodyInit, contentType, buffer.byteLength)
}

async function sendToDeepgram(
  body: BodyInit,
  contentType: string,
  byteLength: number,
): Promise<DeepgramUtterance[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  // Only a STREAM needs `duplex` and a hand-written Content-Length. A buffer
  // does not, and saying so anyway is not harmless: undici rejects the
  // combination before a connection is made, which surfaces as the bare
  // "fetch failed" seen on a phone whose every turn fell back to this path.
  // Audio Coaching sends a read stream here and still needs both.
  const isStream = typeof (body as { pipe?: unknown })?.pipe === 'function'
  const response = await fetch(
    // model must stay explicit: with none, Deepgram falls back to its oldest
    // "base" model (confirmed via response metadata), not Nova.
    'https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&punctuate=true&utterances=true&smart_format=true&mip_opt_out=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType || 'audio/webm',
        ...(isStream ? { 'Content-Length': String(byteLength) } : {}),
      },
      body,
      ...(isStream ? { duplex: 'half' } : {}),
    } as RequestInit,
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Deepgram request failed (${response.status}): ${body}`)
  }

  const data: unknown = await response.json()
  const utterances = (data as { results?: { utterances?: unknown } })?.results?.utterances
  if (!Array.isArray(utterances)) return []

  return utterances.map((u) => {
    const utterance = u as { speaker?: number; start?: number; end?: number; transcript?: string; words?: unknown }
    return {
      speaker: typeof utterance.speaker === 'number' ? utterance.speaker : 0,
      start: Number(utterance.start) || 0,
      end: Number(utterance.end) || 0,
      transcript: typeof utterance.transcript === 'string' ? utterance.transcript : '',
      speakerConfidence: speakerConfidenceRuns(utterance.words),
    }
  })
}

// Text-to-speech via Deepgram's Aura model — same account/key as
// transcribeAudio above, just a different REST endpoint. Deepgram streams
// this response via chunked transfer-encoding (first byte arrives well
// before the full clip is synthesized), so this returns the raw Response
// for the caller to pipe straight through rather than buffering the whole
// thing into memory first.
// Linear PCM rather than mp3, for audio that is going to be edited before
// anyone hears it. The mp3 encoder clips roughly 0.15s off the end of a
// short clip — barely noticeable in a sentence, but it is most of the trail
// on a thinking sound, which is what made them sound chopped.
export const SPEECH_WAV_SAMPLE_RATE = 24000

export async function synthesizeSpeechStream(
  text: string,
  voice?: string,
  format: 'mp3' | 'wav' = 'mp3',
): Promise<Response> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const safeVoice = isValidTalkVoice(voice) ? voice : DEFAULT_TALK_VOICE
  const encoding =
    format === 'wav' ? `&encoding=linear16&sample_rate=${SPEECH_WAV_SAMPLE_RATE}&container=wav` : ''
  const response = await fetch(`https://api.deepgram.com/v1/speak?model=aura-2-${safeVoice}-en&mip_opt_out=true${encoding}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Deepgram TTS request failed (${response.status}): ${body}`)
  }

  return response
}
