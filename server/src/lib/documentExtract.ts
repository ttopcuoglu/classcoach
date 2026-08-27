import ExcelJS from 'exceljs'
import mammoth from 'mammoth'

// Caps how much extracted text goes into a single Claude prompt. Raised from
// an earlier, prose-oriented 6000 — a dense weekly/multi-day spreadsheet plan
// runs much longer per "page" than a single-day prose plan, and a hard slice
// at 6000 was cutting off mid-week (and mid-word) for exactly the weekly
// plans this feature is meant to support.
const MAX_EXTRACTED_CHARS = 20000

// Slices at the last full line within the cap instead of an arbitrary byte
// offset, so a truncated plan still reads as "cut off after day N" rather
// than dying mid-sentence — much easier for Claude (and a teacher glancing
// at "Your plan") to make sense of.
function truncateAtLineBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const lastNewline = slice.lastIndexOf('\n')
  const boundary = lastNewline > maxChars * 0.5 ? lastNewline : maxChars
  return `${slice.slice(0, boundary).trim()}\n\n[Plan truncated — too long to include in full.]`
}

export type FileKind = 'pdf' | 'xlsx' | 'docx' | 'legacy' | 'unsupported'

export function detectFileKind(filename: string, mimetype: string): FileKind {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf' || mimetype === 'application/pdf') return 'pdf'
  if (ext === 'xlsx' || mimetype.includes('spreadsheetml')) return 'xlsx'
  if (ext === 'docx' || mimetype.includes('wordprocessingml.document')) return 'docx'
  if (ext === 'doc' || ext === 'xls' || mimetype === 'application/msword' || mimetype === 'application/vnd.ms-excel') {
    return 'legacy'
  }
  return 'unsupported'
}

export async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const lines: string[] = []
  workbook.eachSheet((worksheet) => {
    lines.push(`--- ${worksheet.name} ---`)
    worksheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      const line = values
        .map((cell) => (cell == null ? '' : String(cell)))
        .join(' | ')
        .trim()
      if (line) lines.push(line)
    })
  })
  return truncateAtLineBoundary(lines.join('\n').trim(), MAX_EXTRACTED_CHARS)
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return truncateAtLineBoundary(result.value.trim(), MAX_EXTRACTED_CHARS)
}
