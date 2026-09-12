import type { Server } from 'node:http'
import { parseCookie } from 'cookie'
import { WebSocketServer, type WebSocket } from 'ws'
import { openLiveTranscription, type LiveTranscriber } from '../lib/deepgramLive.ts'
import { SESSION_COOKIE, verifySession } from '../lib/auth.ts'
import { startTiming } from '../lib/turnTiming.ts'

// Bridges the browser to Deepgram's live transcription so a turn is being
// transcribed while the teacher is still speaking, rather than after.
//
// The browser never talks to Deepgram directly, for the same reason it never
// talks to Anthropic directly: that would mean putting a Deepgram credential
// in client-side code where anyone can take it.
//
// This is strictly a fast path. The client keeps recording the full turn and
// falls back to POST /api/debriefs/transcribe if the socket fails, is not
// enabled, or returns nothing — so every failure here costs latency, never a
// lost turn.
const MAX_SESSION_MS = 15 * 60 * 1000
const MAX_SAMPLE_RATE = 48000
const MIN_SAMPLE_RATE = 8000

type ClientMessage = { type: 'finish' }

export function attachLiveSttServer(server: Server, allowedOrigins: string[]): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url ?? '', 'http://localhost')
    if (pathname !== '/api/stt/live') return

    // Same two credentials the HTTP middleware accepts: the browser's
    // httpOnly session cookie, or a bearer token for native clients (which
    // has to ride in the query string, because a browser WebSocket cannot
    // set request headers).
    const cookies = parseCookie(req.headers.cookie ?? '')
    const cookieToken = cookies[SESSION_COOKIE]
    const queryToken = searchParams.get('token')
    const token = cookieToken ?? queryToken ?? ''

    // WebSockets are not covered by CORS, so the cors() middleware protecting
    // every HTTP route does nothing here. And because the session cookie is
    // SameSite=None (the API is a different origin from the site), the
    // browser attaches it to a socket opened by ANY page a signed-in teacher
    // happens to visit. That page could not reach their microphone — that
    // permission belongs to the site that asked — but it could stream audio
    // through our Deepgram key on their account.
    //
    // So a cookie is only honoured from our own front end. A token in the
    // query string needs no such check: a hostile page has no way to know
    // it, and the iOS app, which is the thing that sends one, may not send
    // an Origin header at all.
    if (cookieToken) {
      const origin = req.headers.origin
      if (!origin || !allowedOrigins.includes(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
    }

    const session = token ? verifySession(token) : null
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const rate = Number(searchParams.get('sample_rate'))
    if (!Number.isFinite(rate) || rate < MIN_SAMPLE_RATE || rate > MAX_SAMPLE_RATE) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, Math.round(rate)))
  })
}

async function handleConnection(ws: WebSocket, sampleRate: number): Promise<void> {
  const timing = startTiming('stt_live')
  let transcriber: LiveTranscriber | null = null
  let finishing = false

  // Nothing should hold a socket (and a Deepgram stream) open indefinitely,
  // however a turn ends.
  const lifetime = setTimeout(() => ws.close(), MAX_SESSION_MS)

  const teardown = () => {
    clearTimeout(lifetime)
    transcriber?.close()
    transcriber = null
  }

  try {
    transcriber = await openLiveTranscription(sampleRate)
    timing.mark('deepgram_open')
    ws.send(JSON.stringify({ type: 'ready' }))
  } catch (error) {
    console.error('[stt-live] could not open Deepgram stream:', error)
    // The client falls back to the batch upload on anything but a clean
    // transcript, so telling it plainly is enough.
    ws.send(JSON.stringify({ type: 'unavailable' }))
    ws.close()
    clearTimeout(lifetime)
    return
  }

  ws.on('message', async (data, isBinary) => {
    if (isBinary) {
      transcriber?.send(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer))
      return
    }
    let message: ClientMessage
    try {
      message = JSON.parse(data.toString()) as ClientMessage
    } catch {
      return
    }
    if (message.type !== 'finish' || finishing || !transcriber) return
    finishing = true
    // Marked separately so the line below distinguishes how long the teacher
    // spoke from how long finalizing took. Only the second is latency the
    // teacher waits on; the first is just how long their turn was.
    timing.mark('streaming')
    const transcript = await transcriber.finish()
    timing.mark('finalize')
    timing.end({ chars: transcript.length })
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'transcript', transcript }))
    teardown()
    ws.close()
  })

  ws.on('close', teardown)
  ws.on('error', (err) => {
    console.error('[stt-live] client socket error:', err)
    teardown()
  })
}
