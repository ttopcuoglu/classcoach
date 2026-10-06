import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
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

  // A reply to an upgrade that a proxy can read: a bare status line with no
  // headers and an abrupt destroy() is ambiguous to anything in front of
  // this server, which can turn a deliberate 401 into an opaque 502/500.
  const refuse = (socket: Duplex, status: number, reason: string) => {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    socket.destroy()
  }

  server.on('upgrade', (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url ?? '', 'http://localhost')
    if (pathname !== '/api/stt/live') return

    // Every branch below logs under the same [stt-live] prefix. This path
    // failed in production for a while with nothing but a 500 at the
    // browser and silence in the log, which is what made it hard to find.
    try {

      // Same two credentials the HTTP middleware accepts: the browser's
      // httpOnly session cookie, or a bearer token for native clients (which
      // has to ride in the query string, because a browser WebSocket cannot
      // set request headers).
      const cookies = parseCookie(req.headers.cookie ?? '')
      const cookieToken = cookies[SESSION_COOKIE]
      const queryToken = searchParams.get('token')
      // A native client can set headers on an upgrade, which a browser
      // cannot, so the iOS app sends its session token the same way it sends
      // it everywhere else rather than writing it into a URL.
      const header = req.headers.authorization
      const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined
      const token = cookieToken ?? headerToken ?? queryToken ?? ''

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
          console.warn(`[stt-live] refused: origin ${origin ?? '(none)'} is not in FRONTEND_ORIGINS`)
          refuse(socket, 403, 'Forbidden')
          return
        }
      }

      // Either a socket token (the browser, and the only thing that works
      // through the proxy) or a plain session token (the iOS app).
      const session = token ? verifySession(token, 'stt') : null
      if (!session) {
        console.warn(
          `[stt-live] refused: no usable session (cookie=${Boolean(cookieToken)} header=${Boolean(headerToken)} query=${Boolean(queryToken)})`,
        )
        refuse(socket, 401, 'Unauthorized')
        return
      }

      const rate = Number(searchParams.get('sample_rate'))
      if (!Number.isFinite(rate) || rate < MIN_SAMPLE_RATE || rate > MAX_SAMPLE_RATE) {
        console.warn(`[stt-live] refused: sample_rate ${searchParams.get('sample_rate')} is out of range`)
        refuse(socket, 400, 'Bad Request')
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        console.log(`[stt-live] upgraded at ${Math.round(rate)}Hz`)
        // Nothing in one teacher's socket may take the server down with it,
        // which is what an unhandled rejection here would do.
        void handleConnection(ws, Math.round(rate)).catch((error) => {
          console.error('[stt-live] connection failed:', error)
          try {
            ws.close()
          } catch {
            // Already gone.
          }
        })
      })
    } catch (error) {
      // Before this, a throw here reached Node as an uncaught exception,
      // which ends the process — taking every other teacher's turn with it
      // and leaving the browser to report an unexplained 500.
      console.error('[stt-live] upgrade threw:', error)
      try {
        refuse(socket, 500, 'Internal Server Error')
      } catch {
        // Socket already unusable.
      }
    }
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
    // Drafts are forwarded as they change, so the browser always has the
    // latest words without asking for them — it needs them the moment the
    // teacher pauses, and a round trip then would defeat the point.
    transcriber = await openLiveTranscription(sampleRate, (draft) => {
      if (!finishing && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'draft', transcript: draft }))
    })
    timing.mark('deepgram_open')
    console.log('[stt-live] deepgram stream open, transcribing')
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
