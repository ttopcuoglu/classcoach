import PptxGenJS from 'pptxgenjs'

export type Slide = { title: string; bullets: string[]; notes: string | null }

const CREAM = 'F7F3EA'
const FOREST = '1B2E28'
const TERRACOTTA = 'C96A45'
const FONT = 'Arial'

export async function buildPptx(deckTitle: string, slides: Slide[]): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deckTitle

  slides.forEach((s, i) => {
    const slide = pptx.addSlide()
    slide.background = { color: CREAM }

    if (i === 0 && s.bullets.length === 0) {
      slide.addShape('rect', { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: TERRACOTTA } })
      slide.addText(s.title, {
        x: 1, y: 2.4, w: 11.3, h: 2, fontFace: FONT, fontSize: 44, bold: true, color: FOREST, valign: 'middle',
      })
    } else {
      slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: TERRACOTTA } })
      slide.addText(s.title, {
        x: 0.7, y: 0.45, w: 11.9, h: 1.1, fontFace: FONT, fontSize: 32, bold: true, color: FOREST, valign: 'middle',
      })
      if (s.bullets.length > 0) {
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.9, y: 1.8, w: 11.5, h: 5, fontFace: FONT, fontSize: 28, color: FOREST, valign: 'top', paraSpaceAfter: 10 },
        )
      }
    }
    if (s.notes) slide.addNotes(s.notes)
  })

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return out as Buffer
}
