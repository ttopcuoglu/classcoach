// Reading what is on a photograph, with the model that can actually see.
//
// This used to be OCR (tesseract), which is the right tool for a clean
// scan and the wrong one for what teachers actually send: a page shot at
// an angle on a desk, handwriting, a worksheet where the layout is half
// the meaning. The model reads those; OCR guesses at them, slowly — the
// upload screens budget eighteen seconds for a photo against six for a
// document, and most of that is tesseract.
//
// It also takes a parser out of a container that has had memory trouble:
// a network call needs no heap ceiling and no child process.
//
// OCR still runs for a scanned PDF, where there are many pages and the
// cost of looking at each one is a different trade.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'

export const IMAGE_MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png'> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

export function imageMediaType(fileName: string): 'image/jpeg' | 'image/png' | null {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? null : (IMAGE_MEDIA_TYPES[fileName.slice(dot).toLowerCase()] ?? null)
}

export type SniffedImage = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'heic' | null

/// What the bytes actually are, which is not always what the name says.
///
/// The iOS app writes a picked photo to "assignment-photo.jpg" and posts
/// the data it was given — and an iPhone's own photos are HEIC, so the
/// name is a jpg and the bytes are not. Trusting the name there means
/// telling the model an image is JPEG when it isn't, and the request
/// fails with nothing a teacher could act on.
export function sniffImage(buffer: Buffer): SniffedImage {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp'
  }
  // ISO base media: 'ftyp' at byte 4, then the brand. HEIC and its
  // relatives all land here, and none of them is a format Claude reads.
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1')
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) return 'heic'
  }
  return null
}

/// Claude's own ceiling for one image. The upload routes allow far larger
/// files, so this is checked by the caller, which owns the wording.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const READ_PROMPT = `You are reading a photograph of something from a teacher's classroom — a worksheet, a handout, a page of notes, what is written on the board. Write out everything on it as plain text, in order: titles, instructions, every question or prompt, point values where they are shown. Keep the structure readable, with each question on its own line.

Transcribe, don't summarise, don't comment, and never add anything that isn't there. If the page is too blurred, too dark or too small in frame to read with confidence, reply with exactly NOTHING_READABLE and nothing else — a wrong transcription is worse than none, because everything downstream will treat it as what the teacher wrote.`

const MAX_TOKENS = 1500
const UNREADABLE = 'NOTHING_READABLE'

/// The text on an image, or '' when there is nothing readable on it.
export async function readImageText(image: Buffer, mediaType: Exclude<SniffedImage, 'heic' | null>): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: READ_PROMPT,
    messages: [
      {
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } }],
      },
    ],
  })
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
  return text.includes(UNREADABLE) ? '' : text
}
