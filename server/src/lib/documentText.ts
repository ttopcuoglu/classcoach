// Turning an uploaded file into text — every format the app accepts, in one
// place.
//
// Pulled out of routes/assignmentCoach.ts when Look It Over needed the same
// thing. Deliberately shared rather than copied: the pdf-parse `first`
// gotcha documented below cost a crashed process to find, and a second copy
// of this dispatch is exactly how that knowledge gets lost.

import { tmpdir } from 'node:os'
import { NoTextFoundError, UnsupportedFileError } from './extractErrors.ts'
import type { Worker } from 'tesseract.js'

// Loaded per format, not per process. The container has 512MB for everything,
// and these cost pdf-parse 176MB, xlsx 34MB, mammoth 6MB at import — so
// reading one .docx used to pay for the PDF engine as well. Even in a child
// that exists for one document, the document only has one type.
const loadMammoth = async () => (await import('mammoth')).default
const loadPdfParse = async () => (await import('pdf-parse')).PDFParse
const loadXlsx = async () => await import('xlsx')
const loadTesseract = async () => (await import('tesseract.js')).createWorker
import { extractPptxText } from './pptxText.ts'

// English trained-data download only happens on the very first OCR call,
// not on every upload. Never terminated: this route may be hit again at
// any time for the life of the process.
let ocrWorkerPromise: Promise<Worker> | null = null
function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    // Cache the downloaded English trained-data in the OS temp dir, not the
    // working directory — keeps this out of the repo regardless of where
    // the process runs.
    ocrWorkerPromise = loadTesseract().then((createWorker) =>
      createWorker('eng', undefined, { cachePath: tmpdir() }),
    )
  }
  return ocrWorkerPromise
}

// Plain OCR has no concept of math notation, fractions, or a blank
// coordinate-grid graph — it just pattern-matches pixel shapes into
// letters, so dense equations and graph grids come out as unreadable
// noise no confidence threshold can turn into real math. Rather than
// showing that noise, this drops any line OCR itself isn't confident
// about — real prose (titles, instructions, word problems) reliably
// scores well above this line; garbled equations and grid noise don't.
// The tradeoff is explicit: some real content is lost along with the
// noise, but nothing gibberish reaches the teacher or Coach.
const OCR_MIN_LINE_CONFIDENCE = 60

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true })
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((para) => para.lines))
  const confident = lines.filter((line) => line.confidence >= OCR_MIN_LINE_CONFIDENCE)
  return confident.map((line) => line.text).join('')
}

// pdf-parse's own text output for a page with no real text layer is just
// this separator artifact, not an empty string — strip it before judging
// whether OCR is actually needed.
function stripPdfPageMarkers(text: string): string {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim()
}

// Scanned/photographed pages are just an embedded image with no text
// layer at all — pdf-parse (or any text-layer extractor) correctly finds
// nothing. Falls back to OCR by rendering each page to an image via
// pdf-parse's own built-in (pure-JS, no native/poppler dependency)
// screenshot renderer. Capped at a handful of pages to bound memory/latency
// on an unexpectedly long scanned packet — critically, `first` must be
// passed to getScreenshot itself, not applied by slicing its result
// afterward: without it, pdf-parse rasterizes every page in the document
// up front (at full resolution, each also serialized to a base64 data URL
// by default) regardless of how many pages are actually used afterward,
// which was enough to exhaust memory and crash the process on a multi-page
// scan (surfacing as an opaque 502 rather than a real error response).
const MAX_OCR_PAGES = 3

// Every sheet becomes a small labeled CSV block — plain enough for Claude to
// read as a document, and honest about which sheet a row came from when a
// workbook has more than one.
async function extractXlsxText(buffer: Buffer): Promise<string> {
  const XLSX = await loadXlsx()
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
    if (!csv) return ''
    return workbook.SheetNames.length > 1 ? `Sheet: ${name}\n${csv}` : csv
  })
    .filter(Boolean)
    .join('\n\n')
}

/// Text and page count from ONE parse.
///
/// They used to be two calls, which meant two PDFParse instances over the
/// same bytes — the whole engine, twice, for a number the first pass already
/// had. On a 512MB container that second parse is the one that does not fit,
/// and it is the difference between this surface working and not.
async function extractPdfTextAndPages(buffer: Buffer): Promise<{ text: string; pageCount: number | null }> {
  const PDFParse = await loadPdfParse()
  const parser = new PDFParse({ data: buffer })
  let pageCount: number | null = null
  try {
    try {
      // `total` is pdf-parse's page count on InfoResult.
      pageCount = (await parser.getInfo()).total ?? null
    } catch {
      pageCount = null
    }
    const direct = stripPdfPageMarkers((await parser.getText()).text)
    if (direct.length >= 15) return { text: direct, pageCount }

    const screenshot = await parser.getScreenshot({ scale: 2, first: MAX_OCR_PAGES, imageDataUrl: false })
    const texts: string[] = []
    // Sequential, not Promise.all — keeps at most one rendered page buffer
    // in memory during OCR at a time, rather than holding all of them.
    for (const page of screenshot.pages) {
      texts.push(await ocrImageBuffer(Buffer.from(page.data)))
    }
    return { text: texts.join('\n\n').trim(), pageCount }
  } finally {
    await parser.destroy()
  }
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']

/// What a teacher may upload, for the error message and the file input's
/// accept attribute.
export const ACCEPTED_EXTENSIONS = ['.docx', '.pdf', '.pptx', '.xlsx', '.xls', '.txt', ...IMAGE_EXTENSIONS]


/// Text from an uploaded buffer, dispatched on the file name's extension.
///
/// Throws UnsupportedFileError for a format this app does not read, and
/// NoTextFoundError when the file was read but held nothing — those are
/// different messages to a teacher (change the file vs. retake the photo),
/// so they are different errors rather than one empty string.
export async function extractDocumentText(buffer: Buffer, originalName: string): Promise<string> {
  return (await extractDocument(buffer, originalName)).text
}

/// Text AND page count, from one read of the file.
///
/// The pair exists because asking for them separately meant opening the PDF
/// engine twice over the same bytes — and the second open is the one that
/// does not fit in a 512MB container.
export async function extractDocument(
  buffer: Buffer,
  originalName: string,
): Promise<{ text: string; pageCount: number | null }> {
  const name = originalName.toLowerCase()
  let text = ''
  let pageCount: number | null = null
  if (name.endsWith('.docx')) {
    text = (await (await loadMammoth()).extractRawText({ buffer })).value
  } else if (name.endsWith('.pdf')) {
    const read = await extractPdfTextAndPages(buffer)
    text = read.text
    pageCount = read.pageCount
  } else if (name.endsWith('.pptx')) {
    text = await extractPptxText(buffer)
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    text = await extractXlsxText(buffer)
  } else if (name.endsWith('.txt')) {
    text = buffer.toString('utf-8')
  } else if (IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    text = await ocrImageBuffer(buffer)
  } else {
    throw new UnsupportedFileError(
      `Please upload a ${ACCEPTED_EXTENSIONS.join(', ')} file.`,
    )
  }
  if (!text.trim()) {
    throw new NoTextFoundError(
      "Couldn't find any text in that file — if it's a scan or photo, make sure the writing is clear and well-lit.",
    )
  }
  return { text: text.trim(), pageCount }
}


// Re-exported so the child keeps one import, and so every caller sees the
// same classes regardless of which module it reached them through.
export { NoTextFoundError, UnsupportedFileError }
