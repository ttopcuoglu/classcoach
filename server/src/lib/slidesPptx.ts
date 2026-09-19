import PptxGenJS from 'pptxgenjs'

export const SLIDE_LAYOUTS = ['title', 'cards', 'split', 'keyterm', 'prompt'] as const
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]

export type Slide = {
  title: string
  bullets: string[]
  notes: string | null
  layout: SlideLayout
  icon: string | null
}

const CREAM = 'F7F3EA'
const FOREST = '1B2E28'
const TERRACOTTA = 'C96A45'
const GOLD = 'E4B84A'
const TEAL = '2F7F76'
const PLUM = '7A4E8C'
const WHITE = 'FFFFFF'
const FONT = 'Arial'

// Rotated per slide so consecutive slides don't look identical.
const ACCENTS = [TERRACOTTA, TEAL, PLUM, GOLD]
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length]
// Gold needs dark text on it; the others take white.
const onAccent = (accent: string) => (accent === GOLD ? FOREST : WHITE)

const SHADOW = { type: 'outer' as const, color: '000000', opacity: 0.14, blur: 8, offset: 3, angle: 90 }

function footer(slide: PptxGenJS.Slide, dark: boolean) {
  slide.addText('Wivoza', {
    x: 0.6, y: 7.0, w: 2, h: 0.3, fontFace: FONT, fontSize: 10, bold: true,
    color: dark ? 'FFFFFF' : TERRACOTTA, transparency: dark ? 40 : 0,
  })
  slide.slideNumber = { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 10, color: dark ? 'FFFFFF' : '8A8A80' }
}

function addTitleSlide(pptx: PptxGenJS, s: Slide) {
  const slide = pptx.addSlide()
  slide.background = { color: FOREST }
  slide.addShape('ellipse', { x: 9.4, y: -1.6, w: 5.4, h: 5.4, fill: { color: TERRACOTTA } })
  slide.addShape('ellipse', { x: 11.3, y: 4.6, w: 3.2, h: 3.2, fill: { color: TEAL } })
  slide.addShape('ellipse', { x: -1.5, y: 6.0, w: 3.3, h: 3.3, fill: { color: GOLD } })
  slide.addShape('ellipse', { x: 8.2, y: 3.9, w: 1.1, h: 1.1, fill: { color: GOLD, transparency: 25 } })
  if (s.icon) {
    slide.addText(s.icon, { x: 10.0, y: 0.75, w: 2.6, h: 2.4, fontSize: 96, align: 'center', valign: 'middle' })
  }
  slide.addText(s.title, {
    x: 0.9, y: 2.0, w: 8.4, h: 2.6, fontFace: FONT, fontSize: 50, bold: true, color: WHITE, valign: 'middle', fit: 'shrink',
  })
  slide.addShape('roundRect', { x: 0.95, y: 4.85, w: 1.6, h: 0.14, rectRadius: 0.07, fill: { color: GOLD } })
  const sub = s.bullets.join('  ·  ')
  if (sub) {
    slide.addText(sub, { x: 0.9, y: 5.15, w: 8.2, h: 0.8, fontFace: FONT, fontSize: 20, color: CREAM, valign: 'top' })
  }
  slide.addText('Made with Wivoza', { x: 2.7, y: 6.85, w: 4, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: GOLD })
  return slide
}

function addCardsSlide(pptx: PptxGenJS, s: Slide, index: number) {
  const accent = accentFor(index)
  const slide = pptx.addSlide()
  slide.background = { color: CREAM }
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: accent } })
  if (s.icon) {
    slide.addShape('ellipse', { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fill: { color: accent } })
    slide.addText(s.icon, { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fontSize: 34, align: 'center', valign: 'middle' })
  }
  slide.addText(s.title, {
    x: s.icon ? 1.9 : 0.6, y: 0.5, w: s.icon ? 10.8 : 12.1, h: 1.15, fontFace: FONT, fontSize: 34, bold: true,
    color: FOREST, valign: 'middle', fit: 'shrink',
  })

  const n = s.bullets.length
  if (n > 0) {
    const top = 1.95
    const gap = 0.16
    const cardH = Math.min(1.2, (4.85 - gap * (n - 1)) / n)
    const fontSize = n >= 5 ? 20 : n === 4 ? 22 : 24
    s.bullets.forEach((b, i) => {
      const y = top + i * (cardH + gap)
      const c = accentFor(index + i)
      slide.addShape('roundRect', { x: 0.6, y, w: 12.1, h: cardH, rectRadius: 0.16, fill: { color: WHITE }, shadow: SHADOW })
      slide.addShape('ellipse', { x: 0.85, y: y + (cardH - 0.62) / 2, w: 0.62, h: 0.62, fill: { color: c } })
      slide.addText(String(i + 1), {
        x: 0.85, y: y + (cardH - 0.62) / 2, w: 0.62, h: 0.62, fontFace: FONT, fontSize: 18, bold: true, color: onAccent(c), align: 'center', valign: 'middle',
      })
      slide.addText(b, {
        x: 1.75, y, w: 10.7, h: cardH, fontFace: FONT, fontSize, color: FOREST, valign: 'middle', fit: 'shrink',
      })
    })
  }
  footer(slide, false)
  return slide
}

function addSplitSlide(pptx: PptxGenJS, s: Slide, index: number) {
  const accent = accentFor(index)
  const slide = pptx.addSlide()
  slide.background = { color: CREAM }
  slide.addShape('rect', { x: 0, y: 0, w: 4.7, h: 7.5, fill: { color: accent } })
  slide.addShape('ellipse', { x: -1.2, y: -1.2, w: 3.2, h: 3.2, fill: { color: WHITE, transparency: 85 } })
  slide.addShape('ellipse', { x: 2.6, y: 5.2, w: 3.4, h: 3.4, fill: { color: WHITE, transparency: 88 } })
  slide.addText(s.icon ?? '★', { x: 0.3, y: 1.9, w: 4.1, h: 3.4, fontSize: 130, align: 'center', valign: 'middle', color: onAccent(accent) })
  slide.addText(s.title, {
    x: 5.2, y: 0.7, w: 7.6, h: 1.7, fontFace: FONT, fontSize: 36, bold: true, color: FOREST, valign: 'middle', fit: 'shrink',
  })
  slide.addShape('roundRect', { x: 5.25, y: 2.45, w: 1.3, h: 0.12, rectRadius: 0.06, fill: { color: accent } })
  if (s.bullets.length > 0) {
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 24 }, breakLine: true } })),
      { x: 5.2, y: 2.85, w: 7.6, h: 3.9, fontFace: FONT, fontSize: 26, color: FOREST, valign: 'top', paraSpaceAfter: 14, fit: 'shrink' },
    )
  }
  footer(slide, false)
  return slide
}

function addKeytermSlide(pptx: PptxGenJS, s: Slide, index: number) {
  const accent = accentFor(index)
  const fg = onAccent(accent)
  const slide = pptx.addSlide()
  slide.background = { color: accent }
  slide.addShape('ellipse', { x: 10.6, y: -1.4, w: 4.4, h: 4.4, fill: { color: WHITE, transparency: 85 } })
  slide.addShape('ellipse', { x: -1.6, y: 4.9, w: 4.2, h: 4.2, fill: { color: WHITE, transparency: 88 } })
  if (s.icon) slide.addText(s.icon, { x: 5.4, y: 0.5, w: 2.5, h: 1.5, fontSize: 64, align: 'center', valign: 'middle' })
  slide.addText(s.title, {
    x: 0.8, y: 1.9, w: 11.7, h: 1.6, fontFace: FONT, fontSize: 64, bold: true, color: fg, align: 'center', valign: 'middle', fit: 'shrink',
  })
  const n = Math.min(s.bullets.length, 4)
  const pillH = 0.8
  const startY = 3.85
  s.bullets.slice(0, n).forEach((b, i) => {
    const y = startY + i * (pillH + 0.18)
    slide.addShape('roundRect', { x: 2.2, y, w: 8.9, h: pillH, rectRadius: 0.4, fill: { color: WHITE }, shadow: SHADOW })
    slide.addText(b, { x: 2.5, y, w: 8.3, h: pillH, fontFace: FONT, fontSize: 22, color: FOREST, align: 'center', valign: 'middle', fit: 'shrink' })
  })
  footer(slide, true)
  return slide
}

function addPromptSlide(pptx: PptxGenJS, s: Slide, index: number) {
  const accent = accentFor(index + 1)
  const fg = onAccent(accent)
  const slide = pptx.addSlide()
  slide.background = { color: FOREST }
  slide.addShape('roundRect', { x: 0.6, y: 0.6, w: 12.1, h: 6.1, rectRadius: 0.35, fill: { color: accent } })
  slide.addShape('ellipse', { x: 10.4, y: 0.95, w: 2.0, h: 2.0, fill: { color: WHITE, transparency: 82 } })
  slide.addText(s.icon ?? '💬', { x: 1.0, y: 1.0, w: 1.6, h: 1.4, fontSize: 60, align: 'center', valign: 'middle' })
  slide.addText(s.title, {
    x: 2.8, y: 0.9, w: 9.4, h: 2.4, fontFace: FONT, fontSize: 38, bold: true, color: fg, valign: 'middle', fit: 'shrink',
  })
  const n = Math.min(s.bullets.length, 3)
  s.bullets.slice(0, n).forEach((b, i) => {
    const y = 3.75 + i * 0.95
    slide.addShape('roundRect', { x: 1.2, y, w: 10.9, h: 0.78, rectRadius: 0.39, fill: { color: WHITE, transparency: 12 } })
    slide.addText(b, { x: 1.5, y, w: 10.3, h: 0.78, fontFace: FONT, fontSize: 20, color: FOREST, valign: 'middle', fit: 'shrink' })
  })
  footer(slide, true)
  return slide
}

export async function buildPptx(deckTitle: string, slides: Slide[]): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deckTitle

  slides.forEach((s, i) => {
    let slide: PptxGenJS.Slide
    if (s.layout === 'title') slide = addTitleSlide(pptx, s)
    else if (s.layout === 'split') slide = addSplitSlide(pptx, s, i)
    else if (s.layout === 'keyterm') slide = addKeytermSlide(pptx, s, i)
    else if (s.layout === 'prompt') slide = addPromptSlide(pptx, s, i)
    else slide = addCardsSlide(pptx, s, i)
    if (s.notes) slide.addNotes(s.notes)
  })

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return out as Buffer
}
