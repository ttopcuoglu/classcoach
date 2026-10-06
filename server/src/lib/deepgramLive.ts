import WebSocket from 'ws'

// Live transcription, as opposed to the prerecorded endpoint in deepgram.ts.
//
// The difference is where the waiting happens. Prerecorded cannot start until
// the teacher has stopped talking and the whole recording has been uploaded,
// so its entire cost lands in the gap between their last word and Coach's
// first. Live transcribes while they are still speaking, so by the time they
// stop, the transcript is essentially already there.
//
// Audio arrives as linear16 PCM rather than the webm the MediaRecorder
// produces. That is a deliberate choice: a container split into chunks is
// ambiguous to stream (only the first chunk carries the header), while raw
// PCM at a declared sample rate has exactly one interpretation. The client
// pays for it with a little more work; this end gets a format with no room
// for a protocol misunderstanding we would only discover in production.
const KEEPALIVE_MS = 8000

export type LiveTranscriber = {
  send: (audio: Buffer) => void
  // Asks Deepgram to flush and finish. Resolves with everything transcribed.
  finish: () => Promise<string>
  close: () => void
}

// Called with the transcript so far — settled text plus whatever Deepgram
// currently thinks the unfinished words are — every time that changes. It is
// a draft: it can be revised right up until the final result. Talk It
// Through uses it to start writing a reply during the pause at the end of a
// turn rather than after it (see onSpeculate in useVoiceTurn).
export type OnDraft = (transcript: string) => void

export function openLiveTranscription(sampleRate: number, onDraft?: OnDraft): Promise<LiveTranscriber> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return Promise.reject(new Error('DEEPGRAM_API_KEY is not set'))

  const params = new URLSearchParams({
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: String(sampleRate),
    channels: '1',
    punctuate: 'true',
    smart_format: 'true',
    // Interim results are what make the draft above possible. They arrive
    // while the teacher is still talking — measured at roughly 280ms before
    // their last word lands.
    interim_results: 'true',
    // Opts out of Deepgram's Model Improvement Program, as every other
    // Deepgram request does (see deepgram.ts) — the Privacy Notice promises it.
    mip_opt_out: 'true',
  })

  return new Promise<LiveTranscriber>((resolve, reject) => {
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${apiKey}` },
    })

    // Deepgram closes an idle socket. A teacher thinking mid-sentence is
    // exactly the silence this feature is built to allow, so it must not be
    // read as an abandoned connection.
    let keepalive: NodeJS.Timeout | null = null
    const finals: string[] = []
    let lastInterim = ''
    let finishResolve: ((transcript: string) => void) | null = null
    let closed = false

    const settleFinish = () => {
      if (!finishResolve) return
      const resolveFn = finishResolve
      finishResolve = null
      resolveFn(finals.join(' ').replace(/\s+/g, ' ').trim())
    }

    const shutdown = () => {
      if (closed) return
      closed = true
      if (keepalive) clearInterval(keepalive)
      keepalive = null
      settleFinish()
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
    }

    socket.on('open', () => {
      keepalive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'KeepAlive' }))
      }, KEEPALIVE_MS)
      resolve({
        send(audio) {
          if (socket.readyState === WebSocket.OPEN) socket.send(audio)
        },
        finish() {
          return new Promise<string>((resolveFinish) => {
            if (closed || socket.readyState !== WebSocket.OPEN) {
              resolveFinish(finals.join(' ').replace(/\s+/g, ' ').trim())
              return
            }
            finishResolve = resolveFinish
            socket.send(JSON.stringify({ type: 'CloseStream' }))
            // CloseStream should be answered with the remaining results and a
            // close. If it is not, the turn still has to end — a teacher
            // waiting on a socket that will never answer is worse than a
            // transcript that is missing its last few words.
            setTimeout(settleFinish, 2500)
          })
        },
        close: shutdown,
      })
    })

    socket.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString()) as {
          type?: string
          is_final?: boolean
          channel?: { alternatives?: { transcript?: string }[] }
        }
        if (payload.type !== 'Results' && !payload.channel) return
        const text = payload.channel?.alternatives?.[0]?.transcript?.trim()
        if (!text) return
        // Only settled results are kept; an interim is Deepgram's current
        // guess at the words still in flight and is replaced wholesale by
        // the next one, so appending them would repeat half the sentence.
        if (payload.is_final === false) {
          lastInterim = text
        } else {
          finals.push(text)
          lastInterim = ''
        }
        onDraft?.([...finals, lastInterim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())
      } catch {
        // A frame we cannot parse is not worth failing a turn over.
      }
    })

    socket.on('error', (err) => {
      console.error('[deepgram-live] socket error:', err)
      reject(err)
      shutdown()
    })
    socket.on('close', shutdown)
  })
}
