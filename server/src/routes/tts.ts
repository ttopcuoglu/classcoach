import { Router } from 'express'
import { Readable } from 'node:stream'
import { synthesizeSpeechStream } from '../lib/deepgram.ts'
import { takeSpeech } from '../lib/speechCache.ts'

export const ttsRouter = Router()

const MAX_TEXT_LENGTH = 2000

// GET, not POST — an <audio src="..."> element can only stream natively
// from a plain GET it points directly at, which is what lets the browser
// start playback from Deepgram's first byte instead of waiting for the
// whole clip to download.
ttsRouter.get('/', async (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text : ''
  if (!text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: 'text is too long' })
    return
  }

  const voice = typeof req.query.voice === 'string' ? req.query.voice : undefined

  try {
    // Usually already in flight: the reply stream starts synthesizing its
    // first sentence the moment Claude writes it, which is a round trip
    // before this request arrives (see lib/speechCache.ts).
    const prefetched = takeSpeech(text.trim(), voice)
    if (prefetched) {
      res.setHeader('Content-Type', 'audio/mpeg')
      for (const chunk of prefetched.buffered) res.write(chunk)
      await prefetched.rest((chunk) => res.write(chunk))
      res.end()
      return
    }

    const upstream = await synthesizeSpeechStream(text.trim(), voice)
    res.setHeader('Content-Type', 'audio/mpeg')
    if (!upstream.body) {
      res.status(502).json({ error: 'Could not generate speech. Please try again.' })
      return
    }
    Readable.fromWeb(upstream.body as import('stream/web').ReadableStream).pipe(res)
  } catch (error) {
    console.error('[tts] synthesis failed:', error)
    res.status(502).json({ error: 'Could not generate speech. Please try again.' })
  }
})
