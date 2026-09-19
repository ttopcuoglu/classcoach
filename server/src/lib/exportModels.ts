import { extractTag } from './extractTag.ts'
import { SLIDE_LAYOUTS, THEME_NAMES, type Slide, type SlideDeck, type SlideLayout, type ThemeName } from './slidesPptx.ts'

export type DocBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'callout'; label: string; text: string }

export type DocModel = { title: string; subtitle: string | null; blocks: DocBlock[] }

const MAX_BLOCKS = 300
const MAX_ITEMS = 60
const MAX_TEXT = 4000
const MAX_SLIDES = 40
const MAX_BULLETS = 8

const clean = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Validates a document model — used both on Claude's parsed output and on
// whatever the client posts back for the file download, so a malformed or
// oversized body can never reach the renderers.
export function sanitizeDocModel(raw: unknown): DocModel | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = clean(r.title, 200)
  if (!title || !Array.isArray(r.blocks)) return null

  const blocks: DocBlock[] = []
  for (const b of r.blocks.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== 'object') continue
    const block = b as Record<string, unknown>
    if (block.type === 'heading' || block.type === 'paragraph') {
      const text = clean(block.text)
      if (text) blocks.push({ type: block.type, text })
    } else if (block.type === 'bullets' || block.type === 'numbered') {
      const items = Array.isArray(block.items) ? block.items.map((i) => clean(i, 600)).filter(Boolean).slice(0, MAX_ITEMS) : []
      if (items.length) blocks.push({ type: block.type, items })
    } else if (block.type === 'callout') {
      const text = clean(block.text)
      if (text) blocks.push({ type: 'callout', label: clean(block.label, 60), text })
    }
  }
  if (blocks.length === 0) return null
  return { title, subtitle: clean(r.subtitle, 200) || null, blocks }
}

export function sanitizeDeck(raw: unknown): SlideDeck | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.slides)) return null
  const theme = (THEME_NAMES as readonly string[]).includes(r.theme as string) ? (r.theme as ThemeName) : 'wivoza'

  const slides: Slide[] = []
  for (const item of r.slides.slice(0, MAX_SLIDES)) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const title = clean(s.title, 200)
    if (!title) continue
    const layout = (SLIDE_LAYOUTS as readonly string[]).includes(s.layout as string) ? (s.layout as SlideLayout) : 'cards'
    const bullets = Array.isArray(s.bullets) ? s.bullets.map((b) => clean(b, 300)).filter(Boolean).slice(0, MAX_BULLETS) : []
    const icon = clean(s.icon, 16)
    slides.push({
      title,
      bullets,
      notes: clean(s.notes, 1000) || null,
      layout,
      // An emoji is a few code units at most; anything longer is a word.
      icon: icon && [...icon].length <= 6 ? icon : null,
    })
  }
  if (slides.length === 0) return null
  slides[0].layout = 'title'
  return { theme, slides }
}

const listItems = (body: string): string[] =>
  body
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)

// Parses Claude's <doc> tag output into a validated model.
export function parseDocOutput(text: string): DocModel | null {
  const blocks: unknown[] = []
  for (const m of text.matchAll(/<block\s+type="(\w+)"(?:\s+label="([^"]*)")?\s*>([\s\S]*?)<\/block>/g)) {
    const [, type, label, body] = m
    if (type === 'bullets' || type === 'numbered') blocks.push({ type, items: listItems(body) })
    else if (type === 'callout') blocks.push({ type, label: label ?? '', text: body.trim() })
    else blocks.push({ type, text: body.trim() })
  }
  return sanitizeDocModel({ title: extractTag(text, 'title'), subtitle: extractTag(text, 'subtitle'), blocks })
}

// Parses Claude's <theme> + repeated <slide> tag output into a validated deck.
export function parseSlidesOutput(text: string): SlideDeck | null {
  const raw: unknown[] = []
  for (const m of text.matchAll(/<slide>([\s\S]*?)<\/slide>/g)) {
    const block = m[1]
    raw.push({
      title: extractTag(block, 'title'),
      bullets: listItems(extractTag(block, 'bullets') ?? ''),
      notes: extractTag(block, 'notes'),
      layout: (extractTag(block, 'layout') ?? '').trim().toLowerCase(),
      icon: extractTag(block, 'icon'),
    })
  }
  return sanitizeDeck({ theme: (extractTag(text.split('<slide>')[0], 'theme') ?? '').trim().toLowerCase(), slides: raw })
}
