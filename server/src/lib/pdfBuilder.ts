import PDFDocument from 'pdfkit'
import type { DocModel } from './exportModels.ts'

const FOREST = '#1B2E28'
const GOLD = '#E4B84A'
const INK = '#26312D'
const ACCENTS = [
  { color: '#C96A45', tint: '#FBEAE2' },
  { color: '#2F7F76', tint: '#E2F1EE' },
  { color: '#7A4E8C', tint: '#EEE6F3' },
  { color: '#C99A1E', tint: '#FFF3D1' },
]
const PAGE_W = 612
const PAGE_H = 792
const M = 54
const CONTENT_W = PAGE_W - M * 2
const BOTTOM = PAGE_H - M - 16

// The built-in PDF fonts only cover Latin-1 plus a few Windows-1252 extras.
// Emoji are dropped and other characters degrade to something readable
// instead of printing as garbage.
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
function pdfText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[→⇒]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[✓✔]/g, 'v')
    .replace(/[ -​]/g, ' ')
    .replace(/./gsu, (ch) => (ch.charCodeAt(0) <= 0xff || CP1252_EXTRAS.has(ch) ? ch : '?'))
}

export function buildPdf(model: DocModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: M, bufferPages: true, info: { Title: pdfText(model.title), Creator: 'Wivoza' } })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const height = (text: string, font: string, size: number, width: number, lineGap = 3) => {
      doc.font(font).fontSize(size)
      return doc.heightOfString(text, { width, lineGap })
    }
    const ensure = (h: number) => {
      if (doc.y + h > BOTTOM) doc.addPage()
    }

    // Title band
    const title = pdfText(model.title)
    const subtitle = model.subtitle ? pdfText(model.subtitle) : null
    const titleH = height(title, 'Helvetica-Bold', 28, CONTENT_W - 16, 2)
    const subH = subtitle ? height(subtitle, 'Helvetica-Bold', 13, CONTENT_W - 16) + 6 : 0
    const bandH = 34 + titleH + subH + 26
    doc.rect(0, 0, PAGE_W, bandH).fill(FOREST)
    doc.rect(0, bandH, PAGE_W, 5).fill(ACCENTS[0].color)
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(28).text(title, M + 8, 34, { width: CONTENT_W - 16, lineGap: 2 })
    if (subtitle) doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(13).text(subtitle, M + 8, 34 + titleH + 8, { width: CONTENT_W - 16 })
    doc.y = bandH + 30

    let headingIndex = 0
    let calloutIndex = 0

    for (const block of model.blocks) {
      if (block.type === 'heading') {
        const accent = ACCENTS[headingIndex++ % ACCENTS.length]
        const text = pdfText(block.text)
        const h = height(text, 'Helvetica-Bold', 17, CONTENT_W - 16, 2)
        ensure(h + 60) // keep a heading with the content that follows it
        doc.y += 10
        const y = doc.y
        doc.rect(M, y, 5, h).fill(accent.color)
        doc.fillColor(FOREST).font('Helvetica-Bold').fontSize(17).text(text, M + 16, y, { width: CONTENT_W - 16, lineGap: 2 })
        doc.y = y + h + 10
      } else if (block.type === 'paragraph') {
        const text = pdfText(block.text)
        ensure(Math.min(height(text, 'Helvetica', 11.5, CONTENT_W), 60))
        doc.fillColor(INK).font('Helvetica').fontSize(11.5).text(text, M, doc.y, { width: CONTENT_W, lineGap: 3 })
        doc.y += 8
      } else if (block.type === 'bullets' || block.type === 'numbered') {
        block.items.forEach((raw, i) => {
          const text = pdfText(raw)
          const h = height(text, 'Helvetica', 11.5, CONTENT_W - 26)
          ensure(h + 6)
          const y = doc.y
          if (block.type === 'bullets') {
            doc.circle(M + 9, y + 6.5, 3).fill(ACCENTS[0].color)
          } else {
            doc.fillColor(ACCENTS[0].color).font('Helvetica-Bold').fontSize(11.5).text(`${i + 1}.`, M, y, { width: 22 })
          }
          doc.fillColor(INK).font('Helvetica').fontSize(11.5).text(text, M + 26, y, { width: CONTENT_W - 26, lineGap: 3 })
          doc.y = y + h + 6
        })
        doc.y += 4
      } else {
        const accent = ACCENTS[calloutIndex++ % ACCENTS.length]
        const label = block.label ? pdfText(block.label).toUpperCase() : ''
        const text = pdfText(block.text)
        const labelH = label ? height(label, 'Helvetica-Bold', 8.5, CONTENT_W - 40) + 6 : 0
        const textH = height(text, 'Helvetica', 11.5, CONTENT_W - 40)
        const boxH = 14 + labelH + textH + 14
        ensure(Math.min(boxH, BOTTOM - M))
        const y = doc.y
        doc.roundedRect(M, y, CONTENT_W, boxH, 6).fill(accent.tint)
        doc.rect(M, y, 5, boxH).fill(accent.color)
        let ty = y + 14
        if (label) {
          doc.fillColor(accent.color).font('Helvetica-Bold').fontSize(8.5).text(label, M + 20, ty, { width: CONTENT_W - 40 })
          ty += labelH
        }
        doc.fillColor(INK).font('Helvetica').fontSize(11.5).text(text, M + 20, ty, { width: CONTENT_W - 40, lineGap: 3 })
        doc.y = y + boxH + 12
      }
    }

    // Footer on every page. Margin is zeroed while drawing it so pdfkit
    // doesn't treat text near the bottom edge as overflow and add a page.
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      const bottomMargin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.fillColor(ACCENTS[0].color).font('Helvetica-Bold').fontSize(8).text('Wivoza', M, PAGE_H - 34, { lineBreak: false })
      doc.fillColor('#8A8A80').font('Helvetica').fontSize(8).text(`${i + 1}`, PAGE_W - M - 30, PAGE_H - 34, { width: 30, align: 'right', lineBreak: false })
      doc.page.margins.bottom = bottomMargin
    }
    doc.end()
  })
}
