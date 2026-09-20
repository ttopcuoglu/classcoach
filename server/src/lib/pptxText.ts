import JSZip from 'jszip'
import { orderedSlideParts } from './originalImages.ts'

const decodeXmlEntities = (value: string): string =>
  value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// A .pptx is a zip of XML parts. Each paragraph (<a:p>) becomes one line and
// slides are separated by a blank line, so slide boundaries survive — unlike
// a PDF export, which loses its page breaks.
export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = await orderedSlideParts(zip)

  const slides: string[] = []
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string')
    const lines = xml
      // A soft line break (Shift+Enter) inside a paragraph starts a new line.
      .replace(/<a:br\s*\/?>/g, '</a:p>')
      .split('</a:p>')
      .map((paragraph) =>
        Array.from(paragraph.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g))
          .map((m) => decodeXmlEntities(m[1]))
          .join('')
          .trim(),
      )
      .filter(Boolean)
    if (lines.length > 0) slides.push(lines.join('\n'))
  }
  return slides.join('\n\n')
}
