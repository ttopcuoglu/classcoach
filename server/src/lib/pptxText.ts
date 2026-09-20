import { extractPptxSlideTexts } from './originalImages.ts'

// A .pptx is a zip of XML parts. Each paragraph becomes one line and slides are
// separated by a blank line, so slide boundaries survive — unlike a PDF export,
// which loses its page breaks.
export async function extractPptxText(buffer: Buffer): Promise<string> {
  return (await extractPptxSlideTexts(buffer)).filter(Boolean).join('\n\n')
}
