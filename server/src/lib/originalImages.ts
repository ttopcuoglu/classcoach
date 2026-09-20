import JSZip from 'jszip'
import { PDFParse } from 'pdf-parse'

// Reading a teacher's own pictures out of the deck they uploaded, so the
// improved deck can keep them. Everything happens in memory during one request:
// nothing is stored, and the pictures only travel back to the teacher's browser
// as part of their own deck.

export type OriginalImage = { url: string; width: number; height: number }

const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MIN_IMAGE_BYTES = 3 * 1024
const MIN_PICTURE_AREA_EMU = 0.36 * 914400 * 914400 // ignore logos and small icons (< ~0.36 sq in)
export const MAX_TOTAL_IMAGE_BYTES = 18 * 1024 * 1024

// The slide files in the order the deck actually plays them. File names
// (slide1.xml, slide2.xml…) stop matching the real order once slides have been
// moved or deleted, so the order comes from presentation.xml.
export async function orderedSlideParts(zip: JSZip): Promise<string[]> {
  const fallback = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1]) - Number(b.match(/slide(\d+)\.xml$/)?.[1]))
  try {
    const presentation = await zip.file('ppt/presentation.xml')?.async('string')
    const rels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
    if (!presentation || !rels) return fallback
    const targets = new Map<string, string>()
    for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
      const id = tag.match(/\bId="([^"]+)"/)?.[1]
      const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
      if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target}`)
    }
    const ordered = (presentation.match(/<p:sldId\b[^>]*>/g) ?? [])
      .map((tag) => targets.get(tag.match(/\br:id="([^"]+)"/)?.[1] ?? ''))
      .filter((path): path is string => !!path && !!zip.file(path))
    return ordered.length > 0 ? ordered : fallback
  } catch {
    return fallback
  }
}

// Width and height straight from the file header — enough to fit a picture in
// its frame without decoding it.
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (bytes.length > 10 && bytes.toString('ascii', 0, 3) === 'GIF') {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) }
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      }
      offset += 2 + bytes.readUInt16BE(offset + 2)
    }
  }
  return null
}

const MIME_BY_EXTENSION: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' }

// The largest real picture on each slide, keyed by 1-based slide number in play
// order. Slides without a picture (or with only small icons) are left out.
export async function extractPptxImages(buffer: Buffer): Promise<Map<number, OriginalImage>> {
  const zip = await JSZip.loadAsync(buffer)
  const slides = await orderedSlideParts(zip)
  const found = new Map<number, OriginalImage>()
  let totalBytes = 0

  for (let i = 0; i < slides.length; i++) {
    const slidePath = slides[i]
    const xml = await zip.file(slidePath)?.async('string')
    const relsPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'
    const rels = await zip.file(relsPath)?.async('string')
    if (!xml || !rels) continue

    const targets = new Map<string, string>()
    for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
      const id = tag.match(/\bId="([^"]+)"/)?.[1]
      const target = tag.match(/\bTarget="([^"]+)"/)?.[1]
      if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, '')}`)
    }

    // Every picture shape on the slide, biggest on the page first.
    const pictures = (xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) ?? [])
      .map((block) => {
        const embed = block.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1]
        const cx = Number(block.match(/<a:ext\b[^>]*\bcx="(\d+)"/)?.[1] ?? 0)
        const cy = Number(block.match(/<a:ext\b[^>]*\bcy="(\d+)"/)?.[1] ?? 0)
        return { path: embed ? targets.get(embed) : undefined, area: cx * cy }
      })
      .filter((p): p is { path: string; area: number } => !!p.path && p.area >= MIN_PICTURE_AREA_EMU)
      .sort((a, b) => b.area - a.area)

    for (const picture of pictures) {
      const mime = MIME_BY_EXTENSION[picture.path.split('.').pop()?.toLowerCase() ?? '']
      const file = zip.file(picture.path)
      if (!mime || !file) continue
      const bytes = Buffer.from(await file.async('uint8array'))
      if (bytes.length < MIN_IMAGE_BYTES || bytes.length > MAX_IMAGE_BYTES || totalBytes + bytes.length > MAX_TOTAL_IMAGE_BYTES) continue
      const size = imageSize(bytes)
      if (!size || size.width < 1 || size.height < 1) continue
      totalBytes += bytes.length
      found.set(i + 1, { url: `data:${mime};base64,${bytes.toString('base64')}`, width: size.width, height: size.height })
      break
    }
  }
  return found
}

// The same for a PDF export of a deck (one page per slide): the largest real
// picture on each page. pdf-parse hands pictures back re-encoded as PNG.
export async function extractPdfImages(buffer: Buffer): Promise<Map<number, OriginalImage>> {
  const found = new Map<number, OriginalImage>()
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getImage({ imageDataUrl: true, imageBuffer: false })
    let totalBytes = 0
    for (const page of result.pages) {
      const candidates = page.images
        .filter((image) => image.dataUrl && image.width >= 150 && image.height >= 150)
        .sort((a, b) => b.width * b.height - a.width * a.height)
      for (const image of candidates) {
        const bytes = Math.floor(((image.dataUrl as string).length * 3) / 4)
        if (bytes < MIN_IMAGE_BYTES || bytes > MAX_IMAGE_BYTES || totalBytes + bytes > MAX_TOTAL_IMAGE_BYTES) continue
        totalBytes += bytes
        found.set(page.pageNumber, { url: image.dataUrl as string, width: image.width, height: image.height })
        break
      }
    }
  } catch (error) {
    // Picture recovery is a bonus — some PDFs make the reader throw. The
    // improved deck is still built, just without the original pictures.
    console.warn('[original-images] pdf picture extraction failed, continuing without:', error)
  } finally {
    await parser.destroy()
  }
  return found
}
