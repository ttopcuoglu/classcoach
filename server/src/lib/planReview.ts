// A supervisor's review of a teacher's lesson plan (2026-11-24). Two reads of
// the plan's text: Danielson Domain 1 with word-for-word quotes (the same
// reading a Self Evaluation and an Observation use, buildPlanningPrompt in
// lib/selfEvalReport.ts), and this one — what the lesson is, how it follows
// the school's own lesson plan format, strengths and next steps. The
// supervisor sets every final level, edits, and sends.

import { extractTag } from './extractTag.ts'
import { RUBRIC_LEVEL_NAMES } from './rubricLens.ts'
import type { PlanSection, PlanningComponent } from './selfEvalReport.ts'

export type FormatStatus = 'present' | 'thin' | 'missing'
export type PlanReviewReport = {
  version: 1
  generatedAt: string
  about: string
  planning: PlanningComponent[] | null
  /// How the plan follows the school's lesson plan format, when it has one.
  format: { name: string; sections: { title: string; status: FormatStatus; note: string | null }[] } | null
  strengths: string[]
  nextSteps: string[]
  /// The supervisor's own comments, written before sending.
  comments: string | null
}

export const PLAN_REVIEW_COMMENTS_MAX = 3000

export function buildPlanReviewPrompt(input: {
  sections: PlanSection[]
  context: { lessonTitle: string | null; grade: string | null }
  format: { name: string; sections: { title: string; prompt: string | null }[] } | null
  sharedRules: string
}): string {
  const levelWords = Object.values(RUBRIC_LEVEL_NAMES).map((w) => w.toLowerCase()).join(', ')
  const lesson = [input.context.grade ? `grade ${input.context.grade}` : null, input.context.lessonTitle ? `"${input.context.lessonTitle}"` : null].filter(Boolean).join(' ')
  return `You are a fair, practical instructional coach helping a school supervisor review a teacher's lesson plan. The supervisor reads your draft, edits it, and decides what the teacher receives. Write to the supervisor about the teacher, in the third person ("the teacher"), warmly and specifically.
${lesson ? `\nThe lesson: ${lesson}.\n` : ''}
Rules:
- Use only what the plan says. A plan is a document, not the lesson: never guess what happened in class.
- Be specific: name the part of the plan you mean.
- Never write a level number or a level word (${levelWords}, unsatisfactory, basic, proficient, distinguished). Levels are given separately.
- Never name or describe an individual student.
${
  input.format
    ? `\nThe school's own lesson plan format is "${input.format.name}". Its sections, in order:\n${input.format.sections.map((s, i) => `${i + 1}. ${s.title}${s.prompt ? ` (asks for: ${s.prompt.slice(0, 200)})` : ''}`).join('\n')}\nFor each section, say whether the plan covers it: present (clearly there), thin (there, but too brief to be useful), or missing.\n`
    : ''
}
The plan, in numbered sections:
${input.sections.map((s, i) => `(${i + 1}) ${s.ref}: ${s.text.slice(0, 1500)}`).join('\n')}

Write, in this order:
<about>2 sentences (50 words at most): what the lesson is and how it is organised.</about>
${input.format ? '<format_section><title>the section title, exactly as listed</title><status>present, thin or missing</status><note>one short sentence, or none</note></format_section> (one per section of the school\'s format, in order)\n' : ''}<strength>one specific strength of the plan (30 words at most)</strength> (2 or 3 of these)
<next_step>one concrete, small change that would make the plan stronger (35 words at most)</next_step> (2 or 3 of these)

Plain text only, no markdown.
${input.sharedRules}`
}

function clean(text: string | null): string | null {
  const t = text?.trim()
  return t && !/^none\.?$/i.test(t) ? t : null
}

export function parsePlanReview(
  text: string,
  input: { planning: PlanningComponent[] | null; format: { name: string; sections: { title: string }[] } | null },
): PlanReviewReport | null {
  const all = (tag: string) => [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1].trim()).filter(Boolean)
  const about = clean(extractTag(text, 'about'))
  const strengths = all('strength').slice(0, 3)
  const nextSteps = all('next_step').slice(0, 3)
  if (!about && strengths.length === 0 && nextSteps.length === 0) return null

  let format: PlanReviewReport['format'] = null
  if (input.format) {
    const read = new Map<string, { status: FormatStatus; note: string | null }>()
    for (const block of text.match(/<format_section>[\s\S]*?<\/format_section>/g) ?? []) {
      const title = extractTag(block, 'title')?.trim().toLowerCase()
      const status = extractTag(block, 'status')?.trim().toLowerCase()
      if (!title || !status || !['present', 'thin', 'missing'].includes(status)) continue
      read.set(title, { status: status as FormatStatus, note: clean(extractTag(block, 'note')) })
    }
    // Every section of the school's format, in its order; one the model
    // didn't read is shown as missing rather than left out.
    format = {
      name: input.format.name,
      sections: input.format.sections.map((s) => ({ title: s.title, ...(read.get(s.title.trim().toLowerCase()) ?? { status: 'missing' as const, note: null }) })),
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    about: about ?? '',
    planning: input.planning,
    format,
    strengths,
    nextSteps,
    comments: null,
  }
}
