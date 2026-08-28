import { Router } from 'express'
import { synthesizeSpeech } from '../lib/deepgram.ts'

export const ttsRouter = Router()

const MAX_TEXT_LENGTH = 2000

ttsRouter.post('/', async (req, res) => {
  const { text } = req.body ?? {}
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: 'text is too long' })
    return
  }

  try {
    const audio = await synthesizeSpeech(text.trim())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.send(audio)
  } catch (error) {
    console.error('[tts] synthesis failed:', error)
    res.status(502).json({ error: 'Could not generate speech. Please try again.' })
  }
})
