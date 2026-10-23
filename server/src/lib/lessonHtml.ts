// A Planning Coach plan as the HTML body of a Canvas page. Plain, semantic
// HTML only — headings, paragraphs, lists — because Canvas's editor strips
// styles and scripts and a teacher will edit it there. No Wivoza branding:
// it is their lesson, on their course page.

import type { DocBlock } from './exportModels.ts'
import { lessonDocBlocks, type QuickIdea } from './lessonPlanModel.ts'
import type { TemplateContent } from './lessonTemplateModel.ts'
import type { WeekPlan } from './lessonWeekModel.ts'

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const BULLET = /^\s*[-•*–]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/// Wivoza's plain-text convention (a blank line between paragraphs, a
/// leading "-" for list items) as HTML. Lines inside a paragraph keep their
/// breaks — "Teacher:" / "Date:" header fields depend on it.
export function textToHtml(text: string): string {
  const out: string[] = []
  for (const chunk of text.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim())
    if (!lines.length) continue
    if (lines.every((l) => BULLET.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${esc(l.replace(BULLET, ''))}</li>`).join('')}</ul>`)
    } else if (lines.every((l) => NUMBERED.test(l))) {
      out.push(`<ol>${lines.map((l) => `<li>${esc(l.replace(NUMBERED, ''))}</li>`).join('')}</ol>`)
    } else {
      out.push(`<p>${lines.map((l) => esc(l.trim())).join('<br>')}</p>`)
    }
  }
  return out.join('\n')
}

function sectionHtml(sections: { title: string; text: string; kind: string }[], level: 2 | 3): string {
  return sections
    .map((s) => {
      // A box the teacher fills in stays in the page, empty, so the page is
      // the whole form they hand in.
      const body = s.text.trim() ? textToHtml(s.text) : '<p>&nbsp;</p>'
      return `<h${level}>${esc(s.title)}</h${level}>\n${body}`
    })
    .join('\n')
}

function docBlocksHtml(blocks: DocBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading') return `<h2>${esc(b.text)}</h2>`
      if (b.type === 'paragraph') return textToHtml(b.text)
      if (b.type === 'bullets') return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
      if (b.type === 'numbered') return `<ol>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`
      if (b.type === 'callout') return `<h2>${esc(b.label)}</h2>\n${textToHtml(b.text)}`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export type HtmlPlan = Parameters<typeof lessonDocBlocks>[0] & {
  objective?: string | null
  planKind?: string | null
  planText?: string | null
  quickIdeas?: unknown
  templateContent?: unknown
  week?: unknown
}

/// The page body. `useFormat` is what the teacher is looking at: the lesson
/// in their school's format, or Wivoza's own layout.
export function lessonHtml(plan: HtmlPlan, useFormat: boolean): string {
  const week = plan.week as WeekPlan | null | undefined
  if (plan.planKind === 'week' && week?.content) {
    const shared = week.content.shared.length ? `<h2>This week</h2>\n${sectionHtml(week.content.shared, 3)}` : ''
    const days = week.content.days.map((d) => `<h2>${esc(d.label)}</h2>\n${sectionHtml(d.sections, 3)}`).join('\n')
    return [shared, days].filter(Boolean).join('\n')
  }
  const content = plan.templateContent as TemplateContent | null | undefined
  if (useFormat && content?.sections?.length) return sectionHtml(content.sections, 2)
  if (Array.isArray(plan.sequence) && plan.sequence.length) return docBlocksHtml(lessonDocBlocks(plan))
  const ideas = (plan.quickIdeas as QuickIdea[] | null) ?? []
  if (ideas.length) return ideas.map((i) => `<h2>${esc(i.title)}</h2>\n${textToHtml(i.how)}`).join('\n')
  return plan.planText?.trim() ? textToHtml(plan.planText) : ''
}
