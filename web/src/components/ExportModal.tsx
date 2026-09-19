import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import { downloadExportFile, getExportPreview } from '../lib/api'
import { ProgressRing } from './ProgressRing'
import type { ExportDeck, ExportDoc, ExportFormat, ExportKind, ExportSlide, ExportTheme } from '../lib/api'

const FOREST = '#1B2E28'
const GOLD = '#E4B84A'
const INK = '#26312D'
const WHITE = '#FFFFFF'
// Document accents mirror server/src/lib/docxBuilder.ts and pdfBuilder.ts.
const ACCENTS = [
  { color: '#C96A45', tint: '#FBEAE2' },
  { color: '#2F7F76', tint: '#E2F1EE' },
  { color: '#7A4E8C', tint: '#EEE6F3' },
  { color: '#C99A1E', tint: '#FFF3D1' },
]
const accentAt = (i: number) => ACCENTS[i % ACCENTS.length]

type Decor = 'circles' | 'stripes' | 'squares'
type Theme = {
  dark: string
  light: string
  ink: string
  accents: [string, string, string, string]
  highlight: string
  head: string
  body: string
  decor: Decor
}
// Mirrors THEMES in server/src/lib/slidesPptx.ts — keep the two in sync.
const THEMES: Record<ExportTheme, Theme> = {
  wivoza: { dark: '#1B2E28', light: '#F7F3EA', ink: '#1B2E28', accents: ['#C96A45', '#2F7F76', '#7A4E8C', '#E4B84A'], highlight: '#E4B84A', head: 'Arial', body: 'Arial', decor: 'circles' },
  history: { dark: '#2E1F1A', light: '#F4EBDD', ink: '#2E1F1A', accents: ['#8C2F39', '#3B6478', '#B08D57', '#5B6B4E'], highlight: '#D4AF6A', head: 'Georgia', body: 'Georgia', decor: 'stripes' },
  science: { dark: '#0E2A3F', light: '#EEF6F8', ink: '#0E2A3F', accents: ['#0097A7', '#F2A900', '#3D7EAA', '#6BAA2B'], highlight: '#5CE1E6', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
  math: { dark: '#1E2A5E', light: '#F2F4FF', ink: '#1E2A5E', accents: ['#3B5BDB', '#F76707', '#12A87C', '#AE3EC9'], highlight: '#FFD43B', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
  ela: { dark: '#38213F', light: '#FBF5EC', ink: '#38213F', accents: ['#9C4A8C', '#C98A1B', '#C25B56', '#4F7CAC'], highlight: '#F0C36A', head: 'Georgia', body: 'Georgia', decor: 'circles' },
  arts: { dark: '#1B1830', light: '#FFF7EE', ink: '#1B1830', accents: ['#E63E8C', '#F5A300', '#0BB3C9', '#7B3FE4'], highlight: '#FFD166', head: 'Trebuchet MS', body: 'Arial', decor: 'circles' },
  early: { dark: '#22579E', light: '#FFFBEA', ink: '#22406B', accents: ['#F25C54', '#F7B32B', '#3F88C5', '#4CB963'], highlight: '#FFE066', head: 'Trebuchet MS', body: 'Trebuchet MS', decor: 'circles' },
  wellness: { dark: '#1D4A3A', light: '#F1F8F3', ink: '#1D3A30', accents: ['#2A9D6F', '#F29E4C', '#3C7AA8', '#D9534F'], highlight: '#C7F464', head: 'Trebuchet MS', body: 'Arial', decor: 'squares' },
}

// The deck's variant rotates the accent colors, matching the .pptx builder.
function themedFor(deck: ExportDeck): Theme {
  const base = THEMES[deck.theme] ?? THEMES.wivoza
  const shift = ((deck.variant % 4) + 4) % 4
  return { ...base, accents: [0, 1, 2, 3].map((i) => base.accents[(i + shift) % 4]) as Theme['accents'] }
}

function onColor(hex: string, ink: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? ink : WHITE
}

// A deck's text is short lines; a worksheet has full sentences. Only picks
// which format the general header button opens with — the teacher can switch.
export function guessFormat(text: string): ExportFormat {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 15) return 'docx'
  const sorted = lines.map((l) => l.length).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] < 50 ? 'pptx' : 'docx'
}

const kindOf = (format: ExportFormat): ExportKind => (format === 'pptx' ? 'slides' : 'document')

// The three "export as" buttons shown on the revised-assignment cards.
export function ExportButtons({ onOpen }: { onOpen: (format: ExportFormat) => void }) {
  const options: { format: ExportFormat; label: string; badge: string; color: string }[] = [
    { format: 'docx', label: 'Word Document', badge: 'W', color: '#2B579A' },
    { format: 'pdf', label: 'PDF Document', badge: 'PDF', color: '#D93025' },
    { format: 'pptx', label: 'PowerPoint Presentation', badge: 'P', color: '#D24726' },
  ]
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => (
        <button
          key={o.format}
          type="button"
          onClick={() => onOpen(o.format)}
          className="flex items-center gap-2.5 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-forest shadow-sm transition-colors hover:border-forest/50 hover:bg-cream"
        >
          <span
            className="flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-[11px] font-extrabold text-white"
            style={{ background: o.color }}
          >
            {o.badge}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DocPreview({ model }: { model: ExportDoc }) {
  let headingIndex = 0
  let calloutIndex = 0
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-xl bg-white shadow-md">
      <div className="px-7 py-6" style={{ background: FOREST }}>
        <h1 className="font-heading text-2xl font-bold leading-tight text-white">{model.title}</h1>
        {model.subtitle && (
          <p className="mt-1 text-sm font-bold" style={{ color: GOLD }}>
            {model.subtitle}
          </p>
        )}
      </div>
      <div style={{ height: 4, background: ACCENTS[0].color }} />
      <div className="flex flex-col gap-4 px-7 py-6" style={{ color: INK }}>
        {model.blocks.map((block, i) => {
          if (block.type === 'heading') {
            const accent = accentAt(headingIndex++)
            return (
              <h2 key={i} className="mt-2 border-l-4 pl-3 font-heading text-lg font-bold" style={{ borderColor: accent.color, color: FOREST }}>
                {block.text}
              </h2>
            )
          }
          if (block.type === 'paragraph') {
            return (
              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                {block.text}
              </p>
            )
          }
          if (block.type === 'bullets') {
            return (
              <ul key={i} className="flex flex-col gap-1.5 text-sm leading-relaxed">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACCENTS[0].color }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )
          }
          if (block.type === 'numbered') {
            return (
              <ol key={i} className="flex flex-col gap-1.5 text-sm leading-relaxed">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="w-5 shrink-0 font-bold" style={{ color: ACCENTS[0].color }}>
                      {j + 1}.
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            )
          }
          const accent = accentAt(calloutIndex++)
          return (
            <div key={i} className="rounded-lg border-l-4 px-4 py-3" style={{ background: accent.tint, borderColor: accent.color }}>
              {block.label && (
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: accent.color }}>
                  {block.label}
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{block.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Slides are laid out in the same inch coordinates the .pptx builder uses
// (a 13.33 x 7.5 in slide = 100cqw wide), so the preview matches the file.
const inch = (n: number) => `${n * 7.5}cqw`
const pt = (n: number) => `${(n / 72) * 7.5}cqw`
const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${alpha})`
}
type Box = { x: number; y: number; w: number; h: number; fill?: string; radius?: number | '50%'; rotate?: number; shadow?: boolean }
const shape = ({ x, y, w, h, fill, radius, rotate, shadow }: Box): CSSProperties => ({
  position: 'absolute',
  left: inch(x),
  top: inch(y),
  width: inch(w),
  height: inch(h),
  background: fill,
  borderRadius: radius === '50%' ? '50%' : radius ? inch(radius) : undefined,
  transform: rotate ? `rotate(${rotate}deg)` : undefined,
  boxShadow: shadow ? '0 0.3cqw 0.8cqw rgba(0,0,0,0.14)' : undefined,
})
type Txt = { size: number; color: string; font: string; bold?: boolean; align?: 'left' | 'center'; valign?: 'top' | 'middle' }
const text = (x: number, y: number, w: number, h: number, t: Txt): CSSProperties => ({
  ...shape({ x, y, w, h }),
  display: 'flex',
  flexDirection: 'column',
  justifyContent: t.valign === 'top' ? 'flex-start' : 'center',
  textAlign: t.align ?? 'left',
  fontFamily: `${t.font}, sans-serif`,
  fontSize: pt(t.size),
  fontWeight: t.bold ? 700 : 400,
  color: t.color,
  lineHeight: 1.15,
  overflow: 'hidden',
})

function TitleDecor({ t }: { t: Theme }) {
  const [a, b, c] = t.accents
  if (t.decor === 'stripes') {
    return (
      <>
        <div style={shape({ x: 9.4, y: -2, w: 1.0, h: 12, rotate: 18, fill: a })} />
        <div style={shape({ x: 10.7, y: -2, w: 0.45, h: 12, rotate: 18, fill: t.highlight })} />
        <div style={shape({ x: 11.5, y: -2, w: 1.5, h: 12, rotate: 18, fill: b })} />
        <div style={shape({ x: 12.9, y: -2, w: 0.5, h: 12, rotate: 18, fill: c })} />
      </>
    )
  }
  if (t.decor === 'squares') {
    return (
      <>
        <div style={shape({ x: 9.6, y: -0.9, w: 3.8, h: 3.8, radius: 0.35, rotate: 18, fill: a })} />
        <div style={shape({ x: 11.3, y: 4.5, w: 2.4, h: 2.4, radius: 0.3, rotate: -14, fill: b })} />
        <div style={shape({ x: 8.1, y: 3.8, w: 0.95, h: 0.95, radius: 0.15, rotate: 30, fill: t.highlight })} />
        <div style={shape({ x: -0.9, y: 6.3, w: 2.3, h: 2.3, radius: 0.3, rotate: 20, fill: c })} />
      </>
    )
  }
  return (
    <>
      <div style={shape({ x: 9.4, y: -1.6, w: 5.4, h: 5.4, radius: '50%', fill: a })} />
      <div style={shape({ x: 11.3, y: 4.6, w: 3.2, h: 3.2, radius: '50%', fill: b })} />
      <div style={shape({ x: -1.5, y: 6.0, w: 3.3, h: 3.3, radius: '50%', fill: t.highlight })} />
      <div style={shape({ x: 8.2, y: 3.9, w: 1.1, h: 1.1, radius: '50%', fill: rgba(t.highlight, 0.75) })} />
    </>
  )
}

function SoftDecor({ t }: { t: Theme }) {
  const soft = 'rgba(255,255,255,0.14)'
  if (t.decor === 'stripes') {
    return (
      <>
        <div style={shape({ x: 10.2, y: -2, w: 1.3, h: 12, rotate: 18, fill: soft })} />
        <div style={shape({ x: 11.9, y: -2, w: 0.6, h: 12, rotate: 18, fill: soft })} />
      </>
    )
  }
  if (t.decor === 'squares') {
    return (
      <>
        <div style={shape({ x: 10.6, y: -1.2, w: 3.6, h: 3.6, radius: 0.3, rotate: 18, fill: soft })} />
        <div style={shape({ x: -1.2, y: 5.3, w: 3.2, h: 3.2, radius: 0.3, rotate: -16, fill: soft })} />
      </>
    )
  }
  return (
    <>
      <div style={shape({ x: 10.6, y: -1.4, w: 4.4, h: 4.4, radius: '50%', fill: soft })} />
      <div style={shape({ x: -1.6, y: 4.9, w: 4.2, h: 4.2, radius: '50%', fill: soft })} />
    </>
  )
}

function SlideThumb({ slide, index, t }: { slide: ExportSlide; index: number; t: Theme }) {
  const accent = t.accents[index % 4]
  const frame: CSSProperties = { containerType: 'inline-size', position: 'relative', width: '100%', aspectRatio: '13.33 / 7.5', overflow: 'hidden' }
  const wordmark = (onDark: boolean) => (
    <div style={text(0.6, 7.0, 2, 0.3, { size: 10, color: onDark ? 'rgba(255,255,255,0.6)' : t.accents[0], font: t.body, bold: true })}>Wivoza</div>
  )

  if (slide.layout === 'title') {
    return (
      <div style={{ ...frame, background: t.dark }}>
        <TitleDecor t={t} />
        {slide.icon && <div style={text(10.0, 0.75, 2.6, 2.4, { size: 96, color: WHITE, font: t.head, align: 'center' })}>{slide.icon}</div>}
        <div style={text(0.9, 2.0, 8.4, 2.6, { size: 50, color: WHITE, font: t.head, bold: true })}>{slide.title}</div>
        <div style={shape({ x: 0.95, y: 4.85, w: 1.6, h: 0.14, radius: 0.07, fill: t.highlight })} />
        {slide.bullets.length > 0 && (
          <div style={text(0.9, 5.15, 8.2, 0.8, { size: 20, color: t.light, font: t.body, valign: 'top' })}>{slide.bullets.join('  ·  ')}</div>
        )}
        <div style={text(2.7, 6.85, 4, 0.35, { size: 12, color: t.highlight, font: t.body, bold: true })}>Made with Wivoza</div>
      </div>
    )
  }

  if (slide.layout === 'split') {
    return (
      <div style={{ ...frame, background: t.light }}>
        <div style={shape({ x: 0, y: 0, w: 4.7, h: 7.5, fill: accent })} />
        <div style={shape({ x: -1.2, y: -1.2, w: 3.2, h: 3.2, radius: '50%', fill: 'rgba(255,255,255,0.15)' })} />
        <div style={shape({ x: 2.6, y: 5.2, w: 3.4, h: 3.4, radius: '50%', fill: 'rgba(255,255,255,0.12)' })} />
        <div style={text(0.3, 1.9, 4.1, 3.4, { size: 130, color: onColor(accent, t.ink), font: t.head, align: 'center' })}>{slide.icon ?? '★'}</div>
        <div style={text(5.2, 0.7, 7.6, 1.7, { size: 36, color: t.ink, font: t.head, bold: true })}>{slide.title}</div>
        <div style={shape({ x: 5.25, y: 2.45, w: 1.3, h: 0.12, radius: 0.06, fill: accent })} />
        <ul style={{ ...text(5.2, 2.85, 7.6, 3.9, { size: 26, color: t.ink, font: t.body, valign: 'top' }), margin: 0, padding: 0, listStyle: 'none', gap: inch(0.2) }}>
          {slide.bullets.map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
        {wordmark(false)}
      </div>
    )
  }

  if (slide.layout === 'keyterm') {
    const fg = onColor(accent, t.ink)
    return (
      <div style={{ ...frame, background: accent }}>
        <SoftDecor t={t} />
        {slide.icon && <div style={text(5.4, 0.5, 2.5, 1.5, { size: 64, color: fg, font: t.head, align: 'center' })}>{slide.icon}</div>}
        <div style={text(0.8, 1.9, 11.7, 1.6, { size: 64, color: fg, font: t.head, bold: true, align: 'center' })}>{slide.title}</div>
        {slide.bullets.slice(0, 4).map((b, i) => {
          const y = 3.7 + i * 0.86
          return (
            <div key={i}>
              <div style={shape({ x: 2.2, y, w: 8.9, h: 0.72, radius: 0.36, fill: WHITE, shadow: true })} />
              <div style={text(2.5, y, 8.3, 0.72, { size: 22, color: t.ink, font: t.body, align: 'center' })}>{b}</div>
            </div>
          )
        })}
        {wordmark(true)}
      </div>
    )
  }

  if (slide.layout === 'prompt') {
    const card = t.accents[(index + 1) % 4]
    const fg = onColor(card, t.ink)
    return (
      <div style={{ ...frame, background: t.dark }}>
        <div style={shape({ x: 0.6, y: 0.6, w: 12.1, h: 6.1, radius: 0.35, fill: card })} />
        <div style={shape({ x: 10.4, y: 0.95, w: 2.0, h: 2.0, radius: '50%', fill: 'rgba(255,255,255,0.18)' })} />
        <div style={text(1.0, 1.0, 1.6, 1.4, { size: 60, color: fg, font: t.head, align: 'center' })}>{slide.icon ?? '💬'}</div>
        <div style={text(2.8, 0.9, 9.4, 2.4, { size: 38, color: fg, font: t.head, bold: true })}>{slide.title}</div>
        {slide.bullets.slice(0, 3).map((b, i) => {
          const y = 3.75 + i * 0.95
          return (
            <div key={i}>
              <div style={shape({ x: 1.2, y, w: 10.9, h: 0.78, radius: 0.39, fill: 'rgba(255,255,255,0.88)' })} />
              <div style={text(1.5, y, 10.3, 0.78, { size: 20, color: t.ink, font: t.body })}>{b}</div>
            </div>
          )
        })}
        {wordmark(true)}
      </div>
    )
  }

  // cards
  const n = slide.bullets.length
  const cardH = n > 0 ? Math.min(1.2, (4.85 - 0.16 * (n - 1)) / n) : 1
  return (
    <div style={{ ...frame, background: t.light }}>
      <div style={shape({ x: 0, y: 0, w: 13.33, h: 0.22, fill: accent })} />
      {slide.icon && (
        <>
          <div style={shape({ x: 0.6, y: 0.55, w: 1.05, h: 1.05, radius: '50%', fill: accent })} />
          <div style={text(0.6, 0.55, 1.05, 1.05, { size: 34, color: WHITE, font: t.head, align: 'center' })}>{slide.icon}</div>
        </>
      )}
      <div style={text(slide.icon ? 1.9 : 0.6, 0.5, slide.icon ? 10.8 : 12.1, 1.15, { size: 34, color: t.ink, font: t.head, bold: true })}>{slide.title}</div>
      {slide.bullets.map((b, i) => {
        const c = t.accents[(index + i) % 4]
        const y = 1.95 + i * (cardH + 0.16)
        return (
          <div key={i}>
            <div style={shape({ x: 0.6, y, w: 12.1, h: cardH, radius: 0.16, fill: WHITE, shadow: true })} />
            <div style={shape({ x: 0.85, y: y + (cardH - 0.62) / 2, w: 0.62, h: 0.62, radius: '50%', fill: c })} />
            <div style={text(0.85, y + (cardH - 0.62) / 2, 0.62, 0.62, { size: 18, color: onColor(c, t.ink), font: t.body, bold: true, align: 'center' })}>{i + 1}</div>
            <div style={text(1.75, y, 10.7, cardH, { size: n >= 5 ? 20 : n === 4 ? 22 : 24, color: t.ink, font: t.body })}>{b}</div>
          </div>
        )
      })}
      {wordmark(false)}
    </div>
  )
}

function SlidesPreview({ deck }: { deck: ExportDeck }) {
  const t = themedFor(deck)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {deck.slides.map((slide, i) => (
        <div key={i}>
          <SlideThumb slide={slide} index={i} t={t} />
          <p className="mt-1 text-[11px] font-semibold text-ink-soft">Slide {i + 1}</p>
        </div>
      ))}
    </div>
  )
}

const THEME_LABELS: Record<ExportTheme, string> = {
  wivoza: 'Wivoza',
  history: 'History',
  science: 'Science',
  math: 'Math',
  ela: 'ELA',
  arts: 'Arts',
  early: 'Early learners',
  wellness: 'Wellness',
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  docx: 'Word document',
  pdf: 'PDF document',
  pptx: 'PowerPoint presentation',
}
const DOWNLOAD_LABELS: Record<ExportFormat, string> = {
  docx: 'Download Word (.docx)',
  pdf: 'Download PDF',
  pptx: 'Download PowerPoint (.pptx)',
}

// Laying a document out is a paid Claude call, so a finished layout is kept
// for the same assignment text — reopening the window or switching back is
// instant instead of waiting (and paying) again.
const previewCache = new Map<string, ExportDoc | ExportDeck>()
function cacheKey(sessionId: string, kind: ExportKind, text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return `${sessionId}|${kind}|${text.length}|${h}`
}
function remember(key: string, model: ExportDoc | ExportDeck) {
  previewCache.set(key, model)
  if (previewCache.size > 8) previewCache.delete(previewCache.keys().next().value as string)
}

export default function ExportModal({
  sessionId,
  text: sourceText,
  initialFormat,
  onClose,
}: {
  sessionId: string
  text: string
  initialFormat: ExportFormat
  onClose: () => void
}) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat)
  const kind = kindOf(format)
  const [doc, setDoc] = useState<ExportDoc | null>(() => (previewCache.get(cacheKey(sessionId, 'document', sourceText)) as ExportDoc | undefined) ?? null)
  const [deck, setDeck] = useState<ExportDeck | null>(() => (previewCache.get(cacheKey(sessionId, 'slides', sourceText)) as ExportDeck | undefined) ?? null)
  const [loading, setLoading] = useState(() => !previewCache.has(cacheKey(sessionId, kindOf(initialFormat), sourceText)))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const requestRef = useRef(0)

  async function load(which: ExportKind) {
    const request = ++requestRef.current
    try {
      if (which === 'document') {
        const result = await getExportPreview(sessionId, 'document', sourceText)
        remember(cacheKey(sessionId, 'document', sourceText), result.model)
        if (request === requestRef.current) setDoc(result.model)
      } else {
        const result = await getExportPreview(sessionId, 'slides', sourceText)
        remember(cacheKey(sessionId, 'slides', sourceText), result.model)
        if (request === requestRef.current) setDeck(result.model)
      }
      if (request === requestRef.current) setError(null)
    } catch (err) {
      if (request === requestRef.current) setError((err as Error).message || 'Could not lay this out. Please try again.')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    // A layout that's already cached for this text is shown immediately.
    if (!(kind === 'document' ? doc : deck)) void load(kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function switchKind(next: ExportKind) {
    setFormat(next === 'slides' ? 'pptx' : 'docx')
    setError(null)
    requestRef.current++ // ignore any layout still loading for the other kind
    if (!(next === 'document' ? doc : deck)) {
      setLoading(true)
      void load(next)
    } else {
      setLoading(false)
    }
  }

  function regenerate() {
    setLoading(true)
    setError(null)
    void load(kind)
  }

  async function handleDownload(target: ExportFormat) {
    const model = target === 'pptx' ? deck : doc
    if (!model || busy) return
    setBusy(target)
    setError(null)
    try {
      await downloadExportFile(target, model)
    } catch (err) {
      setError((err as Error).message || 'Could not build that file. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  // No real "% done" comes back from Claude, so this is the same honest
  // estimate the other loading states use.
  const progress = useSimulatedProgress(loading, kind === 'slides' ? 26000 : 20000)
  const stepLabel =
    progress < 25
      ? 'Reading your assignment…'
      : progress < 70
        ? kind === 'slides'
          ? 'Designing your slides…'
          : 'Laying out your document…'
        : 'Adding the finishing touches…'

  const ready = kind === 'document' ? doc : deck
  const otherDocFormat: ExportFormat = format === 'docx' ? 'pdf' : 'docx'
  const linkClass = 'text-xs font-semibold text-forest underline decoration-forest/30 underline-offset-2 hover:decoration-forest disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/50 p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview and export"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-cream shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="shrink-0 font-heading text-base font-bold text-forest">Preview</h2>
            <span className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-cream">{FORMAT_LABELS[format]}</span>
            {kind === 'slides' && deck && (
              <span className="rounded-full bg-cream-card px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                Theme: {THEME_LABELS[deck.theme]}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg font-semibold leading-none text-ink-soft hover:text-forest">
            ✕
          </button>
        </div>

        <div className="min-h-[16rem] flex-1 overflow-y-auto bg-cream-card p-4 sm:p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-forest">
              <ProgressRing progress={progress} size={96} label={stepLabel} hint="This usually takes 15–30 seconds." />
            </div>
          ) : error && !ready ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-terracotta-600">{error}</p>
              <button type="button" onClick={regenerate} className="rounded-lg border border-hairline bg-cream px-4 py-2 text-xs font-semibold text-forest">
                Try again
              </button>
            </div>
          ) : kind === 'document' && doc ? (
            <DocPreview model={doc} />
          ) : kind === 'slides' && deck ? (
            <SlidesPreview deck={deck} />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-ink-soft">
              {kind === 'document' ? 'Opens in Word, Google Docs, and Pages.' : 'Opens in PowerPoint, Google Slides, and Keynote.'} Your original structure is kept.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {kind === 'document' ? (
                <>
                  <button type="button" onClick={() => handleDownload(otherDocFormat)} disabled={!doc || loading || busy !== null} className={linkClass}>
                    {busy === otherDocFormat ? 'Building…' : `Also download as ${otherDocFormat === 'pdf' ? 'PDF' : 'Word'}`}
                  </button>
                  <button type="button" onClick={() => switchKind('slides')} className={linkClass}>
                    Switch to a presentation
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => switchKind('document')} className={linkClass}>
                  Switch to a document
                </button>
              )}
            </div>
            {error && ready && <p className="text-xs text-terracotta-600">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={regenerate} disabled={loading} className="text-xs font-semibold text-ink-soft hover:text-forest disabled:opacity-50">
              Regenerate ↻
            </button>
            <button
              type="button"
              onClick={() => handleDownload(format)}
              disabled={!ready || loading || busy !== null}
              className="rounded-lg bg-forest px-5 py-2.5 text-sm font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === format ? 'Building…' : DOWNLOAD_LABELS[format]}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
