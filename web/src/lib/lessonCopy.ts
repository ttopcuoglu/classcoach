import type { LessonCheck, LessonExitTicket, LessonMisconception, LessonPlan, LessonStep } from './api'

// What the Lesson Workspace puts on the clipboard. Teachers paste these into
// their own school's template — a Word table, a Google Doc, a district form —
// so every piece is written twice: plain text that survives any box it lands
// in, and simple HTML that keeps headings and real bullets where the box
// understands it. Interface labels ("Copy", helper notes) are never in here;
// only the lesson.

export type CopyBlock =
  | { t: 'h1' | 'h2' | 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'label'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }

const BULLET = /^\s*[-•*–]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/// A stored field as blocks: "- " and "1. " lines become real lists, blank
/// lines split paragraphs, and anything else stays as written.
export function textBlocks(value: string | null | undefined): CopyBlock[] {
  const text = (value ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const blocks: CopyBlock[] = []
  let para: string[] = []
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', text: para.join('\n') })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push(list as CopyBlock)
    list = null
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const kind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null
    if (kind) {
      flushPara()
      if (!list || list.t !== kind) {
        flushList()
        list = { t: kind, items: [] }
      }
      list.items.push(line.replace(kind === 'ul' ? BULLET : NUMBERED, '').trim())
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return blocks
}

function labelled(label: string, value: string | null | undefined): CopyBlock[] {
  const body = textBlocks(value)
  return body.length ? [{ t: 'label', text: label }, ...body] : []
}

export function toPlainText(blocks: CopyBlock[]): string {
  let out = ''
  blocks.forEach((block, i) => {
    // A label sits directly on top of what it labels; everything else is a
    // paragraph of its own.
    if (i > 0) out += blocks[i - 1].t === 'label' ? '\n' : '\n\n'
    if (block.t === 'ul' || block.t === 'ol')
      out += block.items.map((item, n) => (block.t === 'ul' ? `• ${item}` : `${n + 1}. ${item}`)).join('\n')
    else if (block.t === 'label') out += `${block.text}:`
    else out += block.text
  })
  return out
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

export function toHtml(blocks: CopyBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.t) {
        case 'ul':
        case 'ol':
          return `<${block.t}>${block.items.map((item) => `<li>${escape(item)}</li>`).join('')}</${block.t}>`
        case 'label':
          return `<p><strong>${escape(block.text)}:</strong></p>`
        case 'p':
          return `<p>${escape(block.text)}</p>`
        default:
          return `<${block.t}>${escape(block.text)}</${block.t}>`
      }
    })
    .join('')
}

// ---------------------------------------------------------------------------
// The lesson's parts, as blocks
// ---------------------------------------------------------------------------

export function stepHeading(step: LessonStep, i: number): string {
  return `${i + 1}. ${step.title || `Activity ${i + 1}`}${step.minutes != null ? ` (${step.minutes} min)` : ''}`
}

export function stepBlocks(step: LessonStep, i: number, level: 'h2' | 'h3' = 'h3'): CopyBlock[] {
  return [
    { t: level, text: stepHeading(step, i) },
    ...labelled('Teacher actions', step.teacher),
    ...labelled('Student actions', step.students),
  ]
}

export function checkBlocks(check: LessonCheck, i: number): CopyBlock[] {
  return [
    { t: 'h3', text: `${i + 1}. ${check.when || 'Check'}` },
    ...labelled('Check', check.check),
    ...labelled('Look for', check.lookFor),
  ]
}

export function misconceptionBlocks(item: LessonMisconception, i: number): CopyBlock[] {
  return [
    { t: 'h3', text: `${i + 1}. ${item.belief}` },
    ...labelled('How to surface it', item.surface),
    ...labelled('How to address it', item.response),
  ]
}

export function ticketPromptBlocks(ticket: LessonExitTicket): CopyBlock[] {
  return textBlocks(ticket.task)
}

export function ticketLookForBlocks(ticket: LessonExitTicket): CopyBlock[] {
  return [
    ...labelled('Expected answer', ticket.expected),
    ...labelled('What different responses show', ticket.signals),
    ...labelled('Suggested next step', ticket.nextStep),
  ]
}

export function hasLookFors(ticket: LessonExitTicket | null | undefined): boolean {
  return !!ticket && !!(ticket.expected || ticket.signals || ticket.nextStep)
}

export const DURATION_CHOICES = [30, 45, 50, 60, 90]

/// What the lesson actually runs to, said honestly: the steps' own minutes,
/// and what the teacher asked for when the two drifted apart.
export function lessonMinutes(plan: LessonPlan): string | null {
  const total = (plan.sequence ?? []).reduce((sum, step) => sum + (step.minutes ?? 0), 0)
  if (!total) return plan.durationMinutes ? `${plan.durationMinutes} min` : null
  if (plan.durationMinutes && plan.durationMinutes !== total) return `${total} min of ${plan.durationMinutes} planned`
  return `${total} min`
}

/// The minutes an Adjust Time revision is working from — what the lesson runs
/// to now.
export function currentMinutes(plan: LessonPlan): number | null {
  const total = (plan.sequence ?? []).reduce((sum, step) => sum + (step.minutes ?? 0), 0)
  return total || plan.durationMinutes || null
}

/// The short name a lesson goes by on its own page. There is no title field,
/// so it comes from the objective with the "Students will be able to" taken
/// off — and kept short, because the full objective is the first section.
export function lessonTitle(plan: LessonPlan): string {
  const raw = (plan.objective ?? '').trim()
  if (!raw) return plan.unitName?.trim() || plan.fileName?.trim() || 'Your lesson'
  let title = raw
    .replace(/^(students|learners|scholars)\s+will\s+(be\s+able\s+to\s+)?/i, '')
    .replace(/^swbat:?\s*/i, '')
    .replace(/^i\s+can\s+/i, '')
    .replace(/[.\s]+$/, '')
  if (title.length > 72) {
    const cut = title.slice(0, 72)
    const space = cut.lastIndexOf(' ')
    title = `${cut.slice(0, space > 40 ? space : 72).replace(/[,;:\s]+$/, '')}…`
  }
  return title.charAt(0).toUpperCase() + title.slice(1)
}
