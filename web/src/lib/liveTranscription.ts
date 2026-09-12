import { API_BASE_URL } from './api'

// Streams microphone audio to the server (and on to Deepgram) while the
// teacher is still talking, so the transcript is ready the moment they stop
// instead of being requested then.
//
// OFF BY DEFAULT. Enable per-browser:
//
//   localStorage.wivozaLiveStt = '1'    (or open the page with ?livestt=1)
//
// The flag exists because this replaces a request that either works or
// returns an error with a live connection that can also stall, half-connect,
// or lose audio — failure modes worth meeting deliberately rather than
// discovering during a teacher's first conversation. Whatever happens here,
// useVoiceTurn still has the full recording and still falls back to the
// batch upload, so the worst outcome is the latency we have today.
export function liveTranscriptionEnabled(): boolean {
  try {
    return (
      localStorage.getItem('wivozaLiveStt') === '1' ||
      new URLSearchParams(location.search).get('livestt') === '1'
    )
  } catch {
    return false
  }
}

// Deepgram is told the rate the AudioContext is actually running at rather
// than a resampled one — browsers pick their own (44100 or 48000 typically)
// and resampling in JS would cost more than it saves.
export type LiveSession = {
  // Feeds one block of mono PCM. Silently ignored once finished.
  send: (samples: Float32Array) => void
  // Resolves with the transcript, or null if live transcription did not
  // produce one and the caller should fall back to the batch upload.
  finish: () => Promise<string | null>
  abandon: () => void
}

const OPEN_TIMEOUT_MS = 2500
const FINISH_TIMEOUT_MS = 3000

export function openLiveSession(sampleRate: number): Promise<LiveSession | null> {
  return new Promise<LiveSession | null>((resolve) => {
    let socket: WebSocket
    try {
      // API_BASE_URL is empty in dev (Vite proxies /api) and an absolute
      // https:// origin in production, so derive the ws origin from whichever
      // applies rather than assuming same-origin.
      const httpOrigin = API_BASE_URL || location.origin
      const wsUrl = new URL(httpOrigin)
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl.pathname = '/api/stt/live'
      wsUrl.search = `?sample_rate=${Math.round(sampleRate)}`
      socket = new WebSocket(wsUrl.toString())
    } catch (err) {
      console.warn('[liveTranscription] could not open socket', err)
      resolve(null)
      return
    }
    socket.binaryType = 'arraybuffer'

    let settled = false
    let transcriptResolve: ((t: string | null) => void) | null = null
    let finishTimer: number | null = null

    const giveUp = () => {
      if (!settled) {
        settled = true
        resolve(null)
      }
      // A finish() already waiting gets null so the caller falls back rather
      // than hanging on a socket that is not coming back.
      if (transcriptResolve) {
        const fn = transcriptResolve
        transcriptResolve = null
        if (finishTimer) window.clearTimeout(finishTimer)
        fn(null)
      }
    }

    const openTimer = window.setTimeout(() => {
      if (settled) return
      console.warn('[liveTranscription] socket did not open in time — using the batch path')
      try {
        socket.close()
      } catch {
        // Already closing.
      }
      giveUp()
    }, OPEN_TIMEOUT_MS)

    socket.onmessage = (event) => {
      let frame: { type?: string; transcript?: string }
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (frame.type === 'ready') {
        if (settled) return
        settled = true
        window.clearTimeout(openTimer)
        resolve(session)
        return
      }
      if (frame.type === 'unavailable') {
        giveUp()
        return
      }
      if (frame.type === 'transcript' && transcriptResolve) {
        const fn = transcriptResolve
        transcriptResolve = null
        if (finishTimer) window.clearTimeout(finishTimer)
        const text = (frame.transcript ?? '').trim()
        // An empty transcript is not proof the teacher said nothing — it is
        // equally consistent with audio never arriving. The batch upload has
        // the real recording and can answer the question properly.
        fn(text || null)
      }
    }
    socket.onerror = () => {
      console.warn('[liveTranscription] socket error — using the batch path')
      giveUp()
    }
    socket.onclose = () => {
      window.clearTimeout(openTimer)
      giveUp()
    }

    const session: LiveSession = {
      send(samples) {
        if (socket.readyState !== WebSocket.OPEN) return
        socket.send(floatToPcm16(samples))
      },
      finish() {
        return new Promise<string | null>((resolveFinish) => {
          if (socket.readyState !== WebSocket.OPEN) {
            resolveFinish(null)
            return
          }
          transcriptResolve = resolveFinish
          socket.send(JSON.stringify({ type: 'finish' }))
          finishTimer = window.setTimeout(() => {
            console.warn('[liveTranscription] no transcript before the deadline — using the batch path')
            giveUp()
          }, FINISH_TIMEOUT_MS)
        })
      },
      abandon() {
        transcriptResolve = null
        if (finishTimer) window.clearTimeout(finishTimer)
        try {
          socket.close()
        } catch {
          // Already closing.
        }
      },
    }
  })
}

// Web Audio hands out float samples in [-1, 1]; Deepgram is told to expect
// linear16, which is what a container-free stream has to be for both ends to
// agree on how to read it.
function floatToPcm16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out.buffer
}
