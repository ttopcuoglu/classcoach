// One-shot (non-streaming) transcription against Deepgram's prerecorded
// endpoint. The caller is responsible for never persisting `buffer` — this
// function only ever holds it in memory long enough to make the request.

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
    'https://api.deepgram.com/v1/listen?diarize=true&punctuate=true&utterances=true&smart_format=true',
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
// transcribeAudio above, just a different REST endpoint. Returns raw MP3
// bytes; the caller streams them straight back to the browser and never
// persists them.
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set')

  const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en', {
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

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
