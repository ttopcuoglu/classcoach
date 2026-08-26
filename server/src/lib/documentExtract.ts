import ExcelJS from 'exceljs'
import mammoth from 'mammoth'

// Caps how much extracted text goes into a single Claude prompt — a lesson
// plan document is a page or two, not a novel.
const MAX_EXTRACTED_CHARS = 6000

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
  return lines.join('\n').trim().slice(0, MAX_EXTRACTED_CHARS)
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return result.value.trim().slice(0, MAX_EXTRACTED_CHARS)
}
