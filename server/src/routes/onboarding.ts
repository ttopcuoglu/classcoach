import { Router } from 'express'
import multer from 'multer'
import { analyzeDemoClip } from '../lib/audioAnalysis.ts'
import { transcribeAudio } from '../lib/deepgram.ts'

export const onboardingRouter = Router()

// Audio only ever lives in memory long enough to reach Deepgram — same
// discipline as the main Audio Coaching transcribe route. Never written to
// disk, never persisted anywhere, and the result of this route is purely
// ephemeral (no DB writes at all).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

onboardingRouter.post('/demo-analysis', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file received' })
    return
  }

  try {
    const utterances = await transcribeAudio(req.file.buffer, req.file.mimetype)
    const transcript = utterances
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((u) => u.transcript)
      .join(' ')
      .trim()

    const result = analyzeDemoClip(transcript)
    res.json({ transcript, ...result })
  } catch (error) {
    console.error('[onboarding] demo analysis failed:', error)
    res.status(502).json({ error: 'Could not analyze the recording. Please try again.' })
  }
})
