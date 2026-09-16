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
}

if (!process.env.DEEPGRAM_API_KEY) {
  console.warn(
    '[deepgram] DEEPGRAM_API_KEY is not set — audio transcription will fail. Add it to server/.env',
  )
}

export async function transcribeAudio(buffer: Buffer, contentType: string): Promise<DeepgramUtterance[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const response = await fetch(
    // model must stay explicit: with none, Deepgram falls back to its oldest
    // "base" model (confirmed via response metadata), not Nova.
    'https://api.deepgram.com/v1/listen?model=nova-3&diarize=true&punctuate=true&utterances=true&smart_format=true&mip_opt_out=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType || 'audio/webm',
      },
      body: buffer as unknown as BodyInit,
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Deepgram request failed (${response.status}): ${body}`)
  }

  const data: unknown = await response.json()
  const utterances = (data as { results?: { utterances?: unknown } })?.results?.utterances
  if (!Array.isArray(utterances)) return []

  return utterances.map((u) => {
    const utterance = u as { speaker?: number; start?: number; end?: number; transcript?: string }
    return {
      speaker: typeof utterance.speaker === 'number' ? utterance.speaker : 0,
      start: Number(utterance.start) || 0,
      end: Number(utterance.end) || 0,
      transcript: typeof utterance.transcript === 'string' ? utterance.transcript : '',
    }
  })
}

// Text-to-speech via Deepgram's Aura model — same account/key as
// transcribeAudio above, just a different REST endpoint. Deepgram streams
// this response via chunked transfer-encoding (first byte arrives well
// before the full clip is synthesized), so this returns the raw Response
// for the caller to pipe straight through rather than buffering the whole
// thing into memory first.
export async function synthesizeSpeechStream(text: string, voice?: string): Promise<Response> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const safeVoice = isValidTalkVoice(voice) ? voice : DEFAULT_TALK_VOICE
  const response = await fetch(`https://api.deepgram.com/v1/speak?model=aura-2-${safeVoice}-en&mip_opt_out=true`, {
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
