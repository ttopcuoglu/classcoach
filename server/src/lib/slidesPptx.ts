import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { fetchImageData, type SlideImage } from './imageSearch.ts'

export const SLIDE_LAYOUTS = ['title', 'cards', 'split', 'keyterm', 'prompt', 'steps', 'compare', 'visual'] as const
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]

export type Slide = {
  title: string
  bullets: string[]
  notes: string | null
  layout: SlideLayout
  icon: string | null
  // For the 'visual' layout: what image, diagram or map belongs on the slide.
  visual: string | null
  // Search words for finding that picture, and the picture once one is found.
  imageQuery: string | null
  image: SlideImage | null
  // The number of the teacher's original slide this one came from, so their own
  // picture from that slide can be carried over.
  sourceSlide: number | null
}

type Decor = 'circles' | 'stripes' | 'squares'
export type Theme = {
  dark: string // title / prompt background
  light: string // content-slide background
  ink: string // text on light
  accents: [string, string, string, string]
  highlight: string // underline / subtitle on dark
  head: string
  body: string
  decor: Decor
}

// One look per kind of content, so a history deck and a math deck don't
// share a template. Mirrored in web/src/components/ExportModal.tsx — keep the
// two in sync.
export const THEMES = {
  wivoza: { dark: '1B2E28', light: 'F7F3EA', ink: '1B2E28', accents: ['C96A45', '2F7F76', '7A4E8C', 'E4B84A'], highlight: 'E4B84A', head: 'Arial', body: 'Arial', decor: 'circles' },
  history: { dark: '2E1F1A', light: 'F4EBDD', ink: '2E1F1A', accents: ['8C2F39', '3B6478', 'B08D57', '5B6B4E'], highlight: 'D4AF6A', head: 'Georgia', body: 'Georgia', decor: 'stripes' },
  science: { dark: '0E2A3F', light: 'EEF6F8', ink: '0E2A3F', accents: ['0097A7', 'F2A900', '3D7EAA', '6BAA2B'], highlight: '5CE1E6', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
  math: { dark: '1E2A5E', light: 'F2F4FF', ink: '1E2A5E', accents: ['3B5BDB', 'F76707', '12A87C', 'AE3EC9'], highlight: 'FFD43B', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
  ela: { dark: '38213F', light: 'FBF5EC', ink: '38213F', accents: ['9C4A8C', 'C98A1B', 'C25B56', '4F7CAC'], highlight: 'F0C36A', head: 'Georgia', body: 'Georgia', decor: 'circles' },
  arts: { dark: '1B1830', light: 'FFF7EE', ink: '1B1830', accents: ['E63E8C', 'F5A300', '0BB3C9', '7B3FE4'], highlight: 'FFD166', head: 'Trebuchet MS', body: 'Arial', decor: 'circles' },
  early: { dark: '22579E', light: 'FFFBEA', ink: '22406B', accents: ['F25C54', 'F7B32B', '3F88C5', '4CB963'], highlight: 'FFE066', head: 'Trebuchet MS', body: 'Trebuchet MS', decor: 'circles' },
  wellness: { dark: '1D4A3A', light: 'F1F8F3', ink: '1D3A30', accents: ['2A9D6F', 'F29E4C', '3C7AA8', 'D9534F'], highlight: 'C7F464', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
} as const satisfies Record<string, Theme>

export const THEME_NAMES = Object.keys(THEMES) as (keyof typeof THEMES)[]
export type ThemeName = keyof typeof THEMES

// `variant` (0-3) rotates the accent colors, so two decks on the same
// subject don't come out looking identical.
export type SlideDeck = { theme: ThemeName; variant: number; slides: Slide[]; changes: string[] }

// Shown to Claude wherever it picks a deck's theme, so every feature that
// builds a deck chooses the same way.
export const THEME_GUIDE = `Choose ONE <theme> for the whole deck that fits its subject and audience — decide from the content, not from habit, and don't default to wivoza when a subject theme fits:
- history — history, social studies, civics, geography, government, culture (warm parchment, serif type).
- science — science, biology, chemistry, physics, earth science, technology, engineering (deep blue and teal, techy).
- math — math, numbers, algebra, geometry, data, statistics (indigo and orange, crisp).
- ela — reading, writing, literature, grammar, poetry, world languages (plum and gold, serif type).
- arts — art, music, drama, design, creative projects (bold magenta, amber, violet).
- early — grades K-3 or any playful, young-learner deck (bright, friendly colors).
- wellness — health, PE, SEL, mindfulness, classroom community and culture (fresh greens).
- wivoza — only when nothing above fits (school-wide, general, mixed).`

const WHITE = 'FFFFFF'
// pptxgenjs rewrites an options object's numbers in place while it writes the
// slide, so a shadow shared between shapes gets multiplied on every reuse until
// it overflows to Infinity — which PowerPoint reports as a corrupt file. Always
// hand it a fresh object.
const shadow = () => ({ type: 'outer' as const, color: '000000', opacity: 0.14, blur: 8, offset: 3, angle: 90 })

// White text on a dark or mid accent, dark ink on a light one (gold, yellow).
function onColor(hex: string, ink: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.6 ? ink : WHITE
}

const accentAt = (t: Theme, i: number) => t.accents[i % 4]

// PowerPoint only shrinks text to fit when someone edits it, so long lines have
// to be sized here. A rough estimate (average character ~0.55 of the font size,
// plus a little slack for word wrapping) is close enough to avoid overflow.
function lineCount(text: string, widthIn: number, size: number): number {
  const perLine = Math.max(1, Math.floor((widthIn * 72) / (size * 0.55)))
  return Math.max(1, Math.ceil((text.length * 1.08) / perLine))
}
function fitSize(text: string, widthIn: number, base: number, min: number, maxLines: number): number {
  let size = base
  while (size > min && lineCount(text, widthIn, size) > maxLines) size -= 1
  return size
}
// Stacked pill rows: shrink each line to fit on one line if it can, and grow
// the pill for any line that still wraps.
function pillRows(items: string[], widthIn: number, base: number, min: number, minH: number, gap: number, startY: number) {
  let y = startY
  return items.map((text) => {
    const size = fitSize(text, widthIn, base, min, 1)
    const h = Math.max(minH, (lineCount(text, widthIn, size) * size * 1.25) / 72 + 0.3)
    const row = { text, size, y, h }
    y += h + gap
    return row
  })
}
const isWordBank = (text: string) => /^word bank\b/i.test(text)

function footer(slide: PptxGenJS.Slide, t: Theme, onDark: boolean) {
  slide.addText('Wivoza', {
    x: 0.6, y: 7.0, w: 2, h: 0.3, fontFace: t.body, fontSize: 10, bold: true,
    color: onDark ? WHITE : t.accents[0], transparency: onDark ? 40 : 0,
  })
  slide.slideNumber = { x: 12.3, y: 7.0, w: 0.5, h: 0.3, fontFace: t.body, fontSize: 10, color: onDark ? WHITE : '8A8A80' }
}

// Big decorative shapes on the title slide, in the theme's own style.
function decorTitle(slide: PptxGenJS.Slide, t: Theme) {
  const [a, b, c] = t.accents
  if (t.decor === 'stripes') {
    slide.addShape('rect', { x: 9.4, y: -2, w: 1.0, h: 12, rotate: 18, fill: { color: a } })
    slide.addShape('rect', { x: 10.7, y: -2, w: 0.45, h: 12, rotate: 18, fill: { color: t.highlight } })
    slide.addShape('rect', { x: 11.5, y: -2, w: 1.5, h: 12, rotate: 18, fill: { color: b } })
    slide.addShape('rect', { x: 12.9, y: -2, w: 0.5, h: 12, rotate: 18, fill: { color: c } })
  } else if (t.decor === 'squares') {
    slide.addShape('roundRect', { x: 9.6, y: -0.9, w: 3.8, h: 3.8, rectRadius: 0.35, rotate: 18, fill: { color: a } })
    slide.addShape('roundRect', { x: 11.3, y: 4.5, w: 2.4, h: 2.4, rectRadius: 0.3, rotate: -14, fill: { color: b } })
    slide.addShape('roundRect', { x: 8.1, y: 3.8, w: 0.95, h: 0.95, rectRadius: 0.15, rotate: 30, fill: { color: t.highlight } })
    slide.addShape('roundRect', { x: -0.9, y: 6.3, w: 2.3, h: 2.3, rectRadius: 0.3, rotate: 20, fill: { color: c } })
  } else {
    slide.addShape('ellipse', { x: 9.4, y: -1.6, w: 5.4, h: 5.4, fill: { color: a } })
    slide.addShape('ellipse', { x: 11.3, y: 4.6, w: 3.2, h: 3.2, fill: { color: b } })
    slide.addShape('ellipse', { x: -1.5, y: 6.0, w: 3.3, h: 3.3, fill: { color: t.highlight } })
    slide.addShape('ellipse', { x: 8.2, y: 3.9, w: 1.1, h: 1.1, fill: { color: t.highlight, transparency: 25 } })
  }
}

// Subtler version for full-color slides, drawn as translucent white.
function decorSoft(slide: PptxGenJS.Slide, t: Theme) {
  const soft = () => ({ color: WHITE, transparency: 86 })
  if (t.decor === 'stripes') {
    slide.addShape('rect', { x: 10.2, y: -2, w: 1.3, h: 12, rotate: 18, fill: soft() })
    slide.addShape('rect', { x: 11.9, y: -2, w: 0.6, h: 12, rotate: 18, fill: soft() })
  } else if (t.decor === 'squares') {
    slide.addShape('roundRect', { x: 10.6, y: -1.2, w: 3.6, h: 3.6, rectRadius: 0.3, rotate: 18, fill: soft() })
    slide.addShape('roundRect', { x: -1.2, y: 5.3, w: 3.2, h: 3.2, rectRadius: 0.3, rotate: -16, fill: soft() })
  } else {
    slide.addShape('ellipse', { x: 10.6, y: -1.4, w: 4.4, h: 4.4, fill: soft() })
    slide.addShape('ellipse', { x: -1.6, y: 4.9, w: 4.2, h: 4.2, fill: soft() })
  }
}

function addTitleSlide(pptx: PptxGenJS, s: Slide, t: Theme) {
  const slide = pptx.addSlide()
  slide.background = { color: t.dark }
  decorTitle(slide, t)
  if (s.icon) {
    slide.addText(s.icon, { x: 10.0, y: 0.75, w: 2.6, h: 2.4, fontSize: 96, align: 'center', valign: 'middle' })
  }
  slide.addText(s.title, {
    x: 0.9, y: 2.0, w: 8.4, h: 2.6, fontFace: t.head, fontSize: 50, bold: true, color: WHITE, valign: 'middle', fit: 'shrink',
  })
  slide.addShape('roundRect', { x: 0.95, y: 4.85, w: 1.6, h: 0.14, rectRadius: 0.07, fill: { color: t.highlight } })
  const sub = s.bullets.join('  ·  ')
  if (sub) {
    slide.addText(sub, { x: 0.9, y: 5.15, w: 8.2, h: 0.8, fontFace: t.body, fontSize: 20, color: t.light, valign: 'top' })
  }
  slide.addText('Made with Wivoza', { x: 2.7, y: 6.85, w: 4, h: 0.35, fontFace: t.body, fontSize: 12, bold: true, color: t.highlight })
  return slide
}

function addCardsSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const accent = accentAt(t, index)
  const slide = pptx.addSlide()
  slide.background = { color: t.light }
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: accent } })
  if (s.icon) {
    slide.addShape('ellipse', { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fill: { color: accent } })
    slide.addText(s.icon, { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fontSize: 34, align: 'center', valign: 'middle' })
  }
  slide.addText(s.title, {
    x: s.icon ? 1.9 : 0.6, y: 0.5, w: s.icon ? 10.8 : 12.1, h: 1.15, fontFace: t.head, fontSize: 34, bold: true,
    color: t.ink, valign: 'middle', fit: 'shrink',
  })

  const n = s.bullets.length
  if (n > 0) {
    const top = 1.95
    const gap = 0.16
    const cardH = Math.min(1.2, (4.85 - gap * (n - 1)) / n)
    const baseSize = n >= 5 ? 20 : n === 4 ? 22 : 24
    let step = 0
    s.bullets.forEach((b, i) => {
      const y = top + i * (cardH + gap)
      const c = accentAt(t, index + i)
      const bank = isWordBank(b)
      slide.addShape('roundRect', { x: 0.6, y, w: 12.1, h: cardH, rectRadius: 0.16, fill: { color: bank ? t.accents[3] : WHITE, transparency: bank ? 82 : 0 }, shadow: shadow() })
      slide.addShape('ellipse', { x: 0.85, y: y + (cardH - 0.62) / 2, w: 0.62, h: 0.62, fill: { color: c } })
      slide.addText(bank ? '📚' : String(++step), {
        x: 0.85, y: y + (cardH - 0.62) / 2, w: 0.62, h: 0.62, fontFace: t.body, fontSize: bank ? 16 : 18, bold: true, color: onColor(c, t.ink), align: 'center', valign: 'middle',
      })
      slide.addText(b, { x: 1.75, y, w: 10.7, h: cardH, fontFace: t.body, fontSize: fitSize(b, 10.5, baseSize, 14, 2), color: t.ink, valign: 'middle', fit: 'shrink' })
    })
  }
  footer(slide, t, false)
  return slide
}

function addSplitSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const accent = accentAt(t, index)
  const slide = pptx.addSlide()
  slide.background = { color: t.light }
  slide.addShape('rect', { x: 0, y: 0, w: 4.7, h: 7.5, fill: { color: accent } })
  slide.addShape('ellipse', { x: -1.2, y: -1.2, w: 3.2, h: 3.2, fill: { color: WHITE, transparency: 85 } })
  slide.addShape('ellipse', { x: 2.6, y: 5.2, w: 3.4, h: 3.4, fill: { color: WHITE, transparency: 88 } })
  slide.addText(s.icon ?? '★', { x: 0.3, y: 1.9, w: 4.1, h: 3.4, fontSize: 130, align: 'center', valign: 'middle', color: onColor(accent, t.ink) })
  slide.addText(s.title, {
    x: 5.2, y: 0.7, w: 7.6, h: 1.7, fontFace: t.head, fontSize: 36, bold: true, color: t.ink, valign: 'middle', fit: 'shrink',
  })
  slide.addShape('roundRect', { x: 5.25, y: 2.45, w: 1.3, h: 0.12, rectRadius: 0.06, fill: { color: accent } })
  if (s.bullets.length > 0) {
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 24 }, breakLine: true } })),
      { x: 5.2, y: 2.85, w: 7.6, h: 3.9, fontFace: t.body, fontSize: 26, color: t.ink, valign: 'top', paraSpaceAfter: 14, fit: 'shrink' },
    )
  }
  footer(slide, t, false)
  return slide
}

function addKeytermSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const accent = accentAt(t, index)
  const fg = onColor(accent, t.ink)
  const slide = pptx.addSlide()
  slide.background = { color: accent }
  decorSoft(slide, t)
  if (s.icon) slide.addText(s.icon, { x: 5.4, y: 0.5, w: 2.5, h: 1.5, fontSize: 64, align: 'center', valign: 'middle' })
  slide.addText(s.title, {
    x: 0.8, y: 1.9, w: 11.7, h: 1.6, fontFace: t.head, fontSize: 64, bold: true, color: fg, align: 'center', valign: 'middle', fit: 'shrink',
  })
  for (const row of pillRows(s.bullets.slice(0, 4), 8.1, 22, 16, 0.72, 0.14, 3.7)) {
    slide.addShape('roundRect', { x: 2.2, y: row.y, w: 8.9, h: row.h, rectRadius: Math.min(0.36, row.h / 2), fill: { color: WHITE }, shadow: shadow() })
    slide.addText(row.text, { x: 2.5, y: row.y, w: 8.3, h: row.h, fontFace: t.body, fontSize: row.size, color: t.ink, align: 'center', valign: 'middle', fit: 'shrink' })
  }
  footer(slide, t, true)
  return slide
}

function addPromptSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const accent = accentAt(t, index + 1)
  const fg = onColor(accent, t.ink)
  const slide = pptx.addSlide()
  slide.background = { color: t.dark }
  slide.addShape('roundRect', { x: 0.6, y: 0.6, w: 12.1, h: 6.1, rectRadius: 0.35, fill: { color: accent } })
  slide.addShape('ellipse', { x: 10.4, y: 0.95, w: 2.0, h: 2.0, fill: { color: WHITE, transparency: 82 } })
  slide.addText(s.icon ?? '💬', { x: 1.0, y: 1.0, w: 1.6, h: 1.4, fontSize: 60, align: 'center', valign: 'middle' })
  slide.addText(s.title, {
    x: 2.8, y: 0.9, w: 9.4, h: 2.4, fontFace: t.head, fontSize: 38, bold: true, color: fg, valign: 'middle', fit: 'shrink',
  })
  for (const row of pillRows(s.bullets.slice(0, 3), 10.1, 20, 14, 0.78, 0.17, 3.75)) {
    slide.addShape('roundRect', { x: 1.2, y: row.y, w: 10.9, h: row.h, rectRadius: Math.min(0.39, row.h / 2), fill: { color: WHITE, transparency: 12 } })
    slide.addText(row.text, { x: 1.5, y: row.y, w: 10.3, h: row.h, fontFace: t.body, fontSize: row.size, color: t.ink, valign: 'middle', fit: 'shrink' })
  }
  footer(slide, t, true)
  return slide
}


// Process, sequence, timeline or cycle: one card per step, joined by arrows.
function addStepsSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const accent = accentAt(t, index)
  const slide = pptx.addSlide()
  slide.background = { color: t.light }
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: accent } })
  if (s.icon) {
    slide.addShape('ellipse', { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fill: { color: accent } })
    slide.addText(s.icon, { x: 0.6, y: 0.55, w: 1.05, h: 1.05, fontSize: 34, align: 'center', valign: 'middle' })
  }
  slide.addText(s.title, {
    x: s.icon ? 1.9 : 0.6, y: 0.5, w: s.icon ? 10.8 : 12.1, h: 1.15, fontFace: t.head, fontSize: 34, bold: true,
    color: t.ink, valign: 'middle', fit: 'shrink',
  })
  const steps = s.bullets.slice(0, 5)
  const n = steps.length
  if (n > 0) {
    const gap = 0.5
    const w = (12.1 - gap * (n - 1)) / n
    steps.forEach((b, i) => {
      const x = 0.6 + i * (w + gap)
      const c = accentAt(t, index + i)
      slide.addShape('roundRect', { x, y: 2.3, w, h: 3.4, rectRadius: 0.2, fill: { color: WHITE }, shadow: shadow() })
      slide.addShape('ellipse', { x: x + w / 2 - 0.42, y: 2.55, w: 0.84, h: 0.84, fill: { color: c } })
      slide.addText(String(i + 1), { x: x + w / 2 - 0.42, y: 2.55, w: 0.84, h: 0.84, fontFace: t.body, fontSize: 26, bold: true, color: onColor(c, t.ink), align: 'center', valign: 'middle' })
      slide.addText(b, { x: x + 0.15, y: 3.6, w: w - 0.3, h: 1.95, fontFace: t.body, fontSize: n >= 5 ? 18 : n === 4 ? 20 : 24, color: t.ink, align: 'center', valign: 'top', fit: 'shrink' })
      if (i < n - 1) {
        slide.addText('→', { x: x + w, y: 2.55, w: gap, h: 0.84, fontFace: t.body, fontSize: 28, bold: true, color: accent, align: 'center', valign: 'middle' })
      }
    })
  }
  footer(slide, t, false)
  return slide
}

// Two things side by side. The first bullet is "Left heading | Right heading";
// each bullet after it is "left item | right item".
function addCompareSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme) {
  const rows = s.bullets.map((b) => b.split('|').map((part) => part.trim()))
  const [headL, headR] = rows[0] ?? ['', '']
  const body = rows.slice(1)
  const [a, b] = [accentAt(t, index), accentAt(t, index + 1)]
  const slide = pptx.addSlide()
  slide.background = { color: t.light }
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: a } })
  slide.addText(s.title, { x: 0.6, y: 0.5, w: 12.1, h: 1.15, fontFace: t.head, fontSize: 34, bold: true, color: t.ink, valign: 'middle', fit: 'shrink' })
  const cols: { x: number; head: string; color: string; items: string[] }[] = [
    { x: 0.6, head: headL, color: a, items: body.map((r) => r[0]).filter(Boolean) },
    { x: 6.83, head: headR ?? '', color: b, items: body.map((r) => r[1] ?? '').filter(Boolean) },
  ]
  for (const col of cols) {
    slide.addShape('roundRect', { x: col.x, y: 1.9, w: 5.9, h: 0.85, rectRadius: 0.2, fill: { color: col.color } })
    slide.addText(col.head, { x: col.x, y: 1.9, w: 5.9, h: 0.85, fontFace: t.head, fontSize: 24, bold: true, color: onColor(col.color, t.ink), align: 'center', valign: 'middle', fit: 'shrink' })
    slide.addShape('roundRect', { x: col.x, y: 2.9, w: 5.9, h: 3.6, rectRadius: 0.2, fill: { color: WHITE }, shadow: shadow() })
    if (col.items.length > 0) {
      slide.addText(
        col.items.map((item) => ({ text: item, options: { bullet: { indent: 20 }, breakLine: true } })),
        { x: col.x + 0.25, y: 3.05, w: 5.4, h: 3.3, fontFace: t.body, fontSize: 24, color: t.ink, valign: 'top', paraSpaceAfter: 12, fit: 'shrink' },
      )
    }
  }
  slide.addShape('ellipse', { x: 6.2, y: 1.98, w: 0.93, h: 0.7, fill: { color: t.dark } })
  slide.addText('vs', { x: 6.2, y: 1.98, w: 0.93, h: 0.7, fontFace: t.head, fontSize: 18, bold: true, color: WHITE, align: 'center', valign: 'middle' })
  footer(slide, t, false)
  return slide
}

// A slide built around a picture. With a found photo it's framed with its
// credit; without one it's a clearly marked spot that says exactly what to add.
function addVisualSlide(pptx: PptxGenJS, s: Slide, index: number, t: Theme, photo: string | null) {
  const accent = accentAt(t, index)
  const slide = pptx.addSlide()
  slide.background = { color: t.light }
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.22, fill: { color: accent } })
  slide.addText(s.title, { x: 0.6, y: 0.5, w: 5.9, h: 1.7, fontFace: t.head, fontSize: 32, bold: true, color: t.ink, valign: 'middle', fit: 'shrink' })
  if (s.bullets.length > 0) {
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: { indent: 22 }, breakLine: true } })),
      { x: 0.6, y: 2.4, w: 5.9, h: 4.3, fontFace: t.body, fontSize: 22, color: t.ink, valign: 'top', paraSpaceAfter: 12, fit: 'shrink' },
    )
  }

  if (photo && s.image) {
    slide.addShape('roundRect', { x: 6.9, y: 0.75, w: 5.85, h: 5.95, rectRadius: 0.25, fill: { color: WHITE }, shadow: shadow() })
    const box = { x: 7.1, y: 0.95, w: 5.45, h: 4.6 }
    const scale = Math.min(box.w / s.image.width, box.h / s.image.height)
    const w = s.image.width * scale
    const h = s.image.height * scale
    slide.addImage({ data: photo, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText: s.visual ?? s.title })
    slide.addText(s.image.original ? s.image.credit : `Picture: ${s.image.credit}`, {
      x: 7.1, y: 5.7, w: 5.45, h: 0.85, fontFace: t.body, fontSize: 11, italic: true, color: '6B6B6B', align: 'center', valign: 'top', fit: 'shrink',
    })
  } else {
    slide.addShape('roundRect', { x: 6.9, y: 0.75, w: 5.85, h: 5.95, rectRadius: 0.25, fill: { color: accent, transparency: 88 }, line: { color: accent, width: 2, dashType: 'dash' } })
    slide.addShape('roundRect', { x: 7.15, y: 1.0, w: 1.6, h: 0.42, rectRadius: 0.21, fill: { color: accent } })
    slide.addText('VISUAL', { x: 7.15, y: 1.0, w: 1.6, h: 0.42, fontFace: t.body, fontSize: 12, bold: true, color: onColor(accent, t.ink), align: 'center', valign: 'middle' })
    slide.addText(s.icon ?? '🖼️', { x: 6.9, y: 1.6, w: 5.85, h: 2.6, fontSize: 88, align: 'center', valign: 'middle' })
    slide.addText(s.visual || 'Add a picture, diagram or map that shows this idea.', {
      x: 7.2, y: 4.35, w: 5.25, h: 2.1, fontFace: t.body, fontSize: 17, italic: true, color: t.ink, align: 'center', valign: 'top', fit: 'shrink',
    })
  }
  footer(slide, t, false)
  return slide
}

export async function buildPptx(deckTitle: string, deck: SlideDeck): Promise<Buffer> {
  const base: Theme = THEMES[deck.theme] ?? THEMES.wivoza
  const shift = ((deck.variant % 4) + 4) % 4
  const t: Theme = { ...base, accents: [0, 1, 2, 3].map((i) => base.accents[(i + shift) % 4]) as Theme['accents'] }
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deckTitle

  // Download each slide's picture up front, all at once. One that can't be
  // fetched just leaves that slide with its "add a picture" spot.
  const photos = await Promise.all(deck.slides.map((s) => (s.layout === 'visual' && s.image ? fetchImageData(s.image.url) : null)))

  deck.slides.forEach((s, i) => {
    let slide: PptxGenJS.Slide
    if (s.layout === 'title') slide = addTitleSlide(pptx, s, t)
    else if (s.layout === 'split') slide = addSplitSlide(pptx, s, i, t)
    else if (s.layout === 'keyterm') slide = addKeytermSlide(pptx, s, i, t)
    else if (s.layout === 'prompt') slide = addPromptSlide(pptx, s, i, t)
    else if (s.layout === 'steps') slide = addStepsSlide(pptx, s, i, t)
    else if (s.layout === 'compare' && s.bullets.length > 1 && s.bullets[0].includes('|')) slide = addCompareSlide(pptx, s, i, t)
    else if (s.layout === 'visual') slide = addVisualSlide(pptx, s, i, t, photos[i]?.data ?? null)
    else slide = addCardsSlide(pptx, s, i, t)
    if (s.notes) slide.addNotes(s.notes)
  })

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  await assertValidNumbers(out)
  return out
}

// A last line of defense: a NaN or Infinity anywhere in the slide XML makes
// PowerPoint say the file is corrupt, so fail loudly here instead of handing
// the teacher a file that needs "repairing".
async function assertValidNumbers(buffer: Buffer): Promise<void> {
  const zip = await JSZip.loadAsync(buffer)
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(name)) continue
    const xml = await zip.files[name].async('string')
    const bad = xml.match(/="(?:NaN|-?Infinity|undefined|null)"/)
    if (bad) throw new Error(`Invalid value ${bad[0]} in ${name}`)
  }
}
