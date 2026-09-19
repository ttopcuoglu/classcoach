import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { downloadExportFile, getExportPreview } from '../lib/api'
import type { ExportDoc, ExportFormat, ExportKind, ExportSlide } from '../lib/api'

const FOREST = '#1B2E28'
const CREAM = '#F7F3EA'
const GOLD = '#E4B84A'
const INK = '#26312D'
const WHITE = '#FFFFFF'
// Mirrors the colors the .docx/.pdf/.pptx builders use on the server, so the
// preview looks like the file that gets downloaded.
const ACCENTS = [
  { color: '#C96A45', tint: '#FBEAE2' },
  { color: '#2F7F76', tint: '#E2F1EE' },
  { color: '#7A4E8C', tint: '#EEE6F3' },
  { color: '#C99A1E', tint: '#FFF3D1' },
]
const accentAt = (i: number) => ACCENTS[i % ACCENTS.length]
const slideAccent = (i: number) => (['#C96A45', '#2F7F76', '#7A4E8C', GOLD] as const)[i % 4]
const onAccent = (accent: string) => (accent === GOLD ? FOREST : WHITE)

// A deck's text is short lines; a worksheet has full sentences. Only picks
// which tab opens first — the teacher can always switch.
function guessKind(text: string): ExportKind {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 15) return 'document'
  const sorted = lines.map((l) => l.length).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] < 50 ? 'slides' : 'document'
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

// Sized in container-query units so the whole slide scales with its width.
const cq = (n: number) => `${n}cqw`
const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style })
const circle = (x: number, y: number, size: number, background: string): CSSProperties =>
  abs({ left: cq(x), top: cq(y), width: cq(size), height: cq(size), borderRadius: '50%', background })

function SlideThumb({ slide, index }: { slide: ExportSlide; index: number }) {
  const accent = slideAccent(index)
  const fg = onAccent(accent)
  const frame: CSSProperties = { containerType: 'inline-size', position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden' }
  const text = (style: CSSProperties): CSSProperties => abs({ fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.15, ...style })

  if (slide.layout === 'title') {
    return (
      <div style={{ ...frame, background: FOREST }}>
        <div style={circle(70, -12, 40, '#C96A45')} />
        <div style={circle(85, 34, 24, '#2F7F76')} />
        <div style={circle(-11, 45, 25, GOLD)} />
        {slide.icon && <div style={text({ left: cq(76), top: cq(5), width: cq(20), textAlign: 'center', fontSize: cq(11) })}>{slide.icon}</div>}
        <div style={text({ left: cq(7), top: cq(14), width: cq(60), fontSize: cq(5.2), fontWeight: 700, color: WHITE })}>{slide.title}</div>
        <div style={abs({ left: cq(7), top: cq(37), width: cq(12), height: cq(1), borderRadius: cq(1), background: GOLD })} />
        {slide.bullets.length > 0 && <div style={text({ left: cq(7), top: cq(39), width: cq(60), fontSize: cq(1.7), color: CREAM })}>{slide.bullets.join('  ·  ')}</div>}
        <div style={text({ left: cq(21), top: cq(51), fontSize: cq(1), fontWeight: 700, color: GOLD })}>Made with Wivoza</div>
      </div>
    )
  }

  if (slide.layout === 'split') {
    return (
      <div style={{ ...frame, background: CREAM }}>
        <div style={abs({ left: 0, top: 0, width: cq(35), height: '100%', background: accent })} />
        <div style={text({ left: 0, top: cq(15), width: cq(35), textAlign: 'center', fontSize: cq(13), color: fg })}>{slide.icon ?? '★'}</div>
        <div style={text({ left: cq(39), top: cq(5), width: cq(56), fontSize: cq(3.1), fontWeight: 700, color: FOREST })}>{slide.title}</div>
        <div style={abs({ left: cq(39), top: cq(19), width: cq(10), height: cq(0.8), borderRadius: cq(1), background: accent })} />
        <ul style={text({ left: cq(39), top: cq(22), width: cq(55), fontSize: cq(2.1), color: FOREST, margin: 0, padding: 0, listStyle: 'none' })}>
          {slide.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: cq(1.2) }}>
              • {b}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (slide.layout === 'keyterm') {
    return (
      <div style={{ ...frame, background: accent }}>
        <div style={circle(80, -10, 33, 'rgba(255,255,255,0.15)')} />
        <div style={circle(-12, 37, 32, 'rgba(255,255,255,0.12)')} />
        {slide.icon && <div style={text({ left: 0, top: cq(3.5), width: '100%', textAlign: 'center', fontSize: cq(6) })}>{slide.icon}</div>}
        <div style={text({ left: cq(5), top: cq(13), width: cq(90), textAlign: 'center', fontSize: cq(6), fontWeight: 700, color: fg })}>{slide.title}</div>
        {slide.bullets.slice(0, 4).map((b, i) => (
          <div
            key={i}
            style={text({ left: cq(17), top: cq(29 + i * 6.4), width: cq(66), height: cq(5.6), borderRadius: cq(3), background: WHITE, color: FOREST, fontSize: cq(1.9), textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0.3cqw 0.8cqw rgba(0,0,0,0.15)' })}
          >
            {b}
          </div>
        ))}
      </div>
    )
  }

  if (slide.layout === 'prompt') {
    const cardAccent = slideAccent(index + 1)
    return (
      <div style={{ ...frame, background: FOREST }}>
        <div style={abs({ left: cq(4.5), top: cq(4.5), width: cq(91), height: cq(47), borderRadius: cq(2.6), background: cardAccent })} />
        <div style={text({ left: cq(7.5), top: cq(7.5), width: cq(12), textAlign: 'center', fontSize: cq(4.5) })}>{slide.icon ?? '💬'}</div>
        <div style={text({ left: cq(21), top: cq(7), width: cq(70), fontSize: cq(3.2), fontWeight: 700, color: onAccent(cardAccent) })}>{slide.title}</div>
        {slide.bullets.slice(0, 3).map((b, i) => (
          <div
            key={i}
            style={text({ left: cq(9), top: cq(28 + i * 7.1), width: cq(82), height: cq(5.8), borderRadius: cq(3), background: 'rgba(255,255,255,0.88)', color: FOREST, fontSize: cq(1.7), display: 'flex', alignItems: 'center', paddingLeft: cq(2.4) })}
          >
            {b}
          </div>
        ))}
      </div>
    )
  }

  // cards
  const n = slide.bullets.length
  const rowH = n > 0 ? Math.min(8.6, (36 - 1.2 * (n - 1)) / n) : 8
  return (
    <div style={{ ...frame, background: CREAM }}>
      <div style={abs({ left: 0, top: 0, width: '100%', height: cq(1.6), background: accent })} />
      {slide.icon && (
        <>
          <div style={circle(4.5, 4, 8, accent)} />
          <div style={text({ left: cq(4.5), top: cq(5.6), width: cq(8), textAlign: 'center', fontSize: cq(3.4) })}>{slide.icon}</div>
        </>
      )}
      <div style={text({ left: cq(slide.icon ? 14.5 : 4.5), top: cq(5), width: cq(80), fontSize: cq(3.2), fontWeight: 700, color: FOREST })}>{slide.title}</div>
      {slide.bullets.map((b, i) => {
        const c = slideAccent(index + i)
        const y = 15 + i * (rowH + 1.2)
        return (
          <div key={i}>
            <div style={abs({ left: cq(4.5), top: cq(y), width: cq(91), height: cq(rowH), borderRadius: cq(1.3), background: WHITE, boxShadow: '0 0.3cqw 0.8cqw rgba(0,0,0,0.1)' })} />
            <div style={{ ...circle(6.4, y + (rowH - 4.6) / 2, 4.6, c), display: 'flex', alignItems: 'center', justifyContent: 'center', color: onAccent(c), fontSize: cq(1.8), fontWeight: 700, fontFamily: 'Arial, sans-serif' }}>{i + 1}</div>
            <div style={text({ left: cq(13.5), top: cq(y), width: cq(80), height: cq(rowH), display: 'flex', alignItems: 'center', fontSize: cq(n >= 5 ? 1.7 : 2), color: FOREST })}>{b}</div>
          </div>
        )
      })}
    </div>
  )
}

function SlidesPreview({ slides }: { slides: ExportSlide[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {slides.map((slide, i) => (
        <div key={i}>
          <SlideThumb slide={slide} index={i} />
          <p className="mt-1 text-[11px] font-semibold text-ink-soft">Slide {i + 1}</p>
        </div>
      ))}
    </div>
  )
}

export default function ExportModal({ sessionId, text, onClose }: { sessionId: string; text: string; onClose: () => void }) {
  const [kind, setKind] = useState<ExportKind>(() => guessKind(text))
  const [doc, setDoc] = useState<ExportDoc | null>(null)
  const [slides, setSlides] = useState<ExportSlide[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const requestRef = useRef(0)

  async function load(which: ExportKind) {
    const request = ++requestRef.current
    try {
      if (which === 'document') {
        const result = await getExportPreview(sessionId, 'document', text)
        if (request === requestRef.current) setDoc(result.model)
      } else {
        const result = await getExportPreview(sessionId, 'slides', text)
        if (request === requestRef.current) setSlides(result.model)
      }
      if (request === requestRef.current) setError(null)
    } catch (err) {
      if (request === requestRef.current) setError((err as Error).message || 'Could not lay this out. Please try again.')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    // Only the tab that's showing is generated, so the teacher isn't billed
    // for a layout they never open.
    void load(kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function switchTo(next: ExportKind) {
    if (next === kind) return
    setKind(next)
    setError(null)
    const ready = next === 'document' ? doc : slides
    if (!ready) {
      setLoading(true)
      void load(next)
    }
  }

  function regenerate() {
    setLoading(true)
    setError(null)
    void load(kind)
  }

  async function handleDownload(format: ExportFormat) {
    const model = format === 'pptx' ? slides : doc
    if (!model || busy) return
    setBusy(format)
    setError(null)
    try {
      await downloadExportFile(format, model)
    } catch (err) {
      setError((err as Error).message || 'Could not build that file. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const ready = kind === 'document' ? doc : slides
  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 ${active ? 'bg-forest text-cream' : 'text-ink-soft hover:text-forest'}`
  const downloadClass =
    'rounded-lg bg-forest px-4 py-2 text-xs font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-50'

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
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h2 className="shrink-0 font-heading text-base font-bold text-forest">Preview &amp; export</h2>
            <div className="flex rounded-full border border-hairline bg-cream-card p-0.5">
              <button type="button" onClick={() => switchTo('document')} className={tabClass(kind === 'document')}>
                Document
              </button>
              <button type="button" onClick={() => switchTo('slides')} className={tabClass(kind === 'slides')}>
                Slides
              </button>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg font-semibold leading-none text-ink-soft hover:text-forest">
            ✕
          </button>
        </div>

        <div className="min-h-[16rem] flex-1 overflow-y-auto bg-cream-card p-4 sm:p-6">
          {loading ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-sm text-ink-soft">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-hairline border-t-terracotta" />
              {kind === 'document' ? 'Laying out your document…' : 'Designing your slides…'}
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
          ) : kind === 'slides' && slides ? (
            <SlidesPreview slides={slides} />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-ink-soft">
              {kind === 'document' ? 'Opens in Word, Google Docs, and Pages.' : 'Opens in PowerPoint, Google Slides, and Keynote.'} Your original structure is kept.
            </p>
            {error && ready && <p className="text-xs text-terracotta-600">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={regenerate} disabled={loading} className="text-xs font-semibold text-ink-soft hover:text-forest disabled:opacity-50">
              Regenerate ↻
            </button>
            {kind === 'document' ? (
              <>
                <button type="button" onClick={() => handleDownload('docx')} disabled={!doc || loading || busy !== null} className={downloadClass}>
                  {busy === 'docx' ? 'Building…' : 'Download .docx'}
                </button>
                <button type="button" onClick={() => handleDownload('pdf')} disabled={!doc || loading || busy !== null} className={downloadClass}>
                  {busy === 'pdf' ? 'Building…' : 'Download .pdf'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => handleDownload('pptx')} disabled={!slides || loading || busy !== null} className={downloadClass}>
                {busy === 'pptx' ? 'Building…' : 'Download .pptx'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
