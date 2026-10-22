// Lesson plan templates: a school's (or a teacher's own) lesson plan format,
// and laying a Planning Coach lesson out in it.
//
// The lesson itself is still built in Wivoza's own shape (lessonPlanModel.ts)
// — adaptations, the classroom deck, Telegram and the iPhone app all read
// that shape. A template is a second, derived view of the same lesson: the
// school's section names in the school's order, filled from what the lesson
// already says. Nothing here changes the lesson.
//
// Prompts and parsers sit together for the same reason as in
// lessonPlanModel.ts: a tag renamed in one and not the other is a section that
// silently comes back empty. lessonTemplateModel.test.ts is the pairing.

import { createHash } from 'node:crypto'
import { CORE_COACHING_RULES, INSTRUCTION_PRIORITY_NOTICE } from './coachPersona.ts'
import { extractTag } from './extractTag.ts'
import { lessonAsText, type LessonStep } from './lessonPlanModel.ts'

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/// What Wivoza writes in a section. The school's own title is kept for the
/// teacher to see; the kind is how the layout call knows what belongs there.
export const SECTION_KINDS = [
  'details',
  'objective',
  'standards',
  'essential_question',
  'success_criteria',
  'vocabulary',
  'materials',
  'opening',
  'instruction',
  'guided_practice',
  'independent_practice',
  'activities',
  'closing',
  'checks',
  'assessment',
  'misconceptions',
  'differentiation',
  'exit_ticket',
  'homework',
  'other',
  'teacher_fills',
] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

/// One line per kind, for the read prompt (so the model picks from a list it
/// understands) and for the layout prompt (so it knows what to put there).
const KIND_MEANING: Record<SectionKind, string> = {
  details: 'header information such as subject, grade, unit, class length, date, teacher or period',
  objective: 'the learning objective or target',
  standards: 'the curriculum standard(s) the lesson addresses',
  essential_question: 'the essential or guiding question',
  success_criteria: 'success criteria, "I can" statements, or what mastery looks like',
  vocabulary: 'key vocabulary or academic language',
  materials: 'materials, resources, technology or preparation',
  opening: 'the start of the lesson: Do Now, warm-up, hook, bell ringer or anticipatory set',
  instruction: 'direct instruction, mini-lesson, modelling or "I do"',
  guided_practice: 'guided practice or "we do"',
  independent_practice: 'independent or group practice, or "you do"',
  activities: 'the lesson activities or agenda as a whole, in order',
  closing: 'closure, wrap-up, summary or reflection with students',
  checks: 'checks for understanding during the lesson',
  assessment: 'assessment, formative or summative, or evidence of learning',
  misconceptions: 'likely misconceptions or anticipated difficulties',
  differentiation: 'differentiation, scaffolds, extensions, or support for multilingual learners',
  exit_ticket: 'the exit ticket',
  homework: 'homework or follow-up work',
  other: 'anything else the form asks about the lesson',
  teacher_fills:
    'something only the teacher can answer: their name, the date, reflection after teaching, or anything about specific students (IEP or 504 accommodations, named groups)',
}

export const KIND_LABEL: Record<SectionKind, string> = {
  details: 'Lesson details',
  objective: 'Objective',
  standards: 'Standards',
  essential_question: 'Essential question',
  success_criteria: 'Success criteria',
  vocabulary: 'Vocabulary',
  materials: 'Materials',
  opening: 'Opening / Do Now',
  instruction: 'Instruction (I do)',
  guided_practice: 'Guided practice (we do)',
  independent_practice: 'Independent practice (you do)',
  activities: 'All activities',
  closing: 'Closing',
  checks: 'Checks for understanding',
  assessment: 'Assessment',
  misconceptions: 'Misconceptions',
  differentiation: 'Differentiation',
  exit_ticket: 'Exit ticket',
  homework: 'Homework',
  other: 'Other',
  teacher_fills: 'Teacher fills in',
}

export function isSectionKind(value: unknown): value is SectionKind {
  return typeof value === 'string' && (SECTION_KINDS as readonly string[]).includes(value)
}

export type TemplateSection = { id: string; title: string; kind: SectionKind; prompt: string | null }
export type Cadence = 'daily' | 'weekly'

export const MAX_SECTIONS = 30
const MAX_TITLE = 120
const MAX_PROMPT = 400
export const MAX_NAME = 80

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/// Sections as sent by the client (the review screen) or parsed from the
/// model. Ids are kept when they look like ours and made up when they don't,
/// so a section keeps its id across edits and a layout can be matched to it.
export function sanitizeSections(raw: unknown): TemplateSection[] | null {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const sections: TemplateSection[] = []
  for (const item of raw.slice(0, MAX_SECTIONS)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const title = clean(record.title, MAX_TITLE)
    if (!title) continue
    let id = typeof record.id === 'string' && /^s[a-z0-9]{1,12}$/.test(record.id) ? record.id : ''
    if (!id || seen.has(id)) id = freshId(seen)
    seen.add(id)
    sections.push({
      id,
      title,
      kind: isSectionKind(record.kind) ? record.kind : 'other',
      prompt: clean(record.prompt, MAX_PROMPT),
    })
  }
  return sections.length ? sections : null
}

function freshId(taken: Set<string>): string {
  for (let n = taken.size + 1; ; n++) {
    const id = `s${n}`
    if (!taken.has(id)) return id
  }
}

export function readCadence(value: unknown): Cadence {
  return value === 'weekly' ? 'weekly' : 'daily'
}

// ---------------------------------------------------------------------------
// Reading an uploaded template
// ---------------------------------------------------------------------------

export const READ_TEMPLATE_PROMPT = `A school administrator or a teacher uploaded their school's lesson plan template so lessons can be written in it. It may be a blank form, or a filled-in example plan. Read it for its STRUCTURE only: the sections the form asks teachers to fill in, in the form's own order and the form's own words. If it is a filled-in example, ignore what was written in it — only the section headings and their instructions matter.

For each section, choose the one kind that best says what goes in it:
${SECTION_KINDS.map((kind) => `- ${kind}: ${KIND_MEANING[kind]}`).join('\n')}

Rules:
- Keep the form's own section titles, shortened only if a title is a full sentence. Never rename "Do Now" to "Opening" or "Learning Target" to "Objective" — the title is what the teacher's school calls it.
- Header fields that only identify the lesson (teacher name, date, period, room, subject, grade, unit) go together in ONE section titled "Lesson details" with kind details, unless the form gives one of them its own substantial box.
- Anything only the teacher can answer, or anything about specific students, is teacher_fills. Never use another kind for accommodations for named students.
- A grid with a column or row for each day of the week, or headings like "Monday" ... "Friday", is weekly. Otherwise daily. For a weekly form, list the sections a single day has, plus any sections shared by the whole week, once each.
- If the document is not a lesson plan template at all, return no sections and say so in the note.

Plain text only. Respond with exactly this structure and nothing outside it:

<template_name>A short name for this format, under 8 words (for example "Maple Ridge daily lesson plan")</template_name>
<cadence>daily or weekly</cadence>
<section>
<section_title>The form's own title for this section</section_title>
<section_kind>one kind from the list</section_kind>
<section_prompt>What the form asks for here, in its own words, if it says more than the title. Empty otherwise.</section_prompt>
</section>
(one <section> per section, in the form's order)
<note>One sentence on anything the person should check — a part of the form you could not read clearly, or a section you were unsure how to classify. Write "none" if there is nothing.</note>
${INSTRUCTION_PRIORITY_NOTICE}`

export type ReadTemplate = { name: string | null; cadence: Cadence; sections: TemplateSection[]; note: string | null }

export function parseTemplateRead(text: string): ReadTemplate {
  const raw: { title: string | null; kind: string | null; prompt: string | null }[] = []
  for (const m of text.matchAll(/<section>([\s\S]*?)<\/section>/g)) {
    const block = m[1]
    raw.push({
      title: extractTag(block, 'section_title'),
      kind: extractTag(block, 'section_kind')?.trim().toLowerCase() ?? null,
      prompt: extractTag(block, 'section_prompt'),
    })
  }
  const note = extractTag(text, 'note')
  return {
    name: clean(extractTag(text, 'template_name'), MAX_NAME),
    cadence: readCadence(extractTag(text, 'cadence')?.trim().toLowerCase()),
    sections: sanitizeSections(raw) ?? [],
    note: note && note.trim().toLowerCase() !== 'none' ? note.trim() : null,
  }
}

// ---------------------------------------------------------------------------
// Laying a lesson out in a template
// ---------------------------------------------------------------------------

export type LaidOutSection = { id: string; title: string; kind: SectionKind; text: string }
export type TemplateContent = {
  templateId: string
  templateName: string
  sourceKey: string
  sections: LaidOutSection[]
}

/// What a layout needs from a lesson plan row.
export type LayoutLesson = Parameters<typeof lessonAsText>[0] & {
  unitName?: string | null
  essentialQuestion?: string | null
  standard?: string | null
  subject?: string | null
  gradeLevel?: string | null
}

/// Sections the lesson's steps are placed into, rather than written by the
/// model. The steps themselves are copied word for word from the lesson.
const SEQUENCE_KINDS: readonly SectionKind[] = [
  'opening',
  'instruction',
  'guided_practice',
  'independent_practice',
  'activities',
  'closing',
]

export function isSequenceKind(kind: SectionKind): boolean {
  return SEQUENCE_KINDS.includes(kind)
}

export function buildLayoutPrompt(): string {
  return `You put a finished K-12 lesson into the lesson plan template a teacher's school requires, so they can hand it in or post it without retyping. The lesson is already written. Your job is to place what it says into the school's sections — not to write a new or different lesson.

There are two kinds of section.

STEP SECTIONS hold the lesson's steps (the Do Now, the instruction, the practice, the closing). You do not rewrite the steps: you only say which section each step goes in, and the steps are copied in word for word. Go through the steps in teaching order and place each one in the step section it fits best. Steps stay in teaching order, so a step can go in the same section as the step before it or a later one, never an earlier one — if the next step looks like it belongs in an earlier section, put it in the same section as the step before it.

WRITTEN SECTIONS are everything else. Write them from the lesson and the details given:
- Use only what the lesson and the details say. Group and condense; do not add activities, timings, resources, facts or examples that are not in the lesson.
- Never invent a standard code. A standards section gets the standard the teacher gave, or stays empty.
- A details section is the form's header fields. Write one line per field its title names, in its order, filled only from the details given and the lesson length — for example "Course/Period: Math, 5th grade". A field nothing answers (teacher name, date, room) is written as its label with nothing after it.
- Write differentiation from the lesson's own content — support for students who need more and a stretch for those ready for it. Never name, describe or guess at a specific student.
- Each part of the lesson goes in the one section that fits it: misconceptions only in a misconceptions section, checks for understanding only in a checks or assessment section. Do not repeat the same content in two sections, and leave out a part the template has no section for.
- If the lesson has nothing for a section, leave it empty rather than filling it with something generic.
- Plain text, no markdown. A leading "-" for list items, a blank line between paragraphs.

Respond with exactly this, and nothing outside it — one <place> per step, in step order, then one <field> per written section:

<place>
<step_number>1</step_number>
<field_id>the id of the step section this step goes in</field_id>
</place>
<field>
<field_id>a written section's id, exactly as given</field_id>
<content>What goes in this section. Empty if the lesson has nothing for it.</content>
</field>
${CORE_COACHING_RULES}`
}

/// The sections the model fills: everything except what the teacher fills
/// in themselves, which never leaves this server.
export function sectionsToFill(sections: TemplateSection[]): TemplateSection[] {
  return sections.filter((s) => s.kind !== 'teacher_fills')
}

function describe(s: TemplateSection): string {
  return `- id ${s.id}: "${s.title}" — ${KIND_MEANING[s.kind]}${s.prompt ? `. The form says: ${s.prompt}` : ''}`
}

export function layoutUserMessage(lesson: LayoutLesson, sections: TemplateSection[]): string {
  const details = [
    lesson.subject && `Subject: ${lesson.subject}`,
    lesson.gradeLevel && `Grade: ${lesson.gradeLevel}`,
    lesson.unitName && `Unit: ${lesson.unitName}`,
    lesson.essentialQuestion && `Essential question: ${lesson.essentialQuestion}`,
    lesson.standard && `Standard (as the teacher gave it): ${lesson.standard}`,
  ].filter(Boolean)
  const fill = sectionsToFill(sections)
  const stepSections = fill.filter((s) => isSequenceKind(s.kind))
  const written = fill.filter((s) => !isSequenceKind(s.kind))
  return [
    stepSections.length
      ? `Step sections, in the form's order:\n${stepSections.map(describe).join('\n')}`
      : 'This form has no step sections: give no <place> tags, and put the steps into whichever written section asks for the lesson activities.',
    `Written sections, in the form's order:\n${written.map(describe).join('\n') || '(none)'}`,
    details.length ? `Details the teacher gave:\n${details.join('\n')}` : 'The teacher gave no subject, grade, unit or standard.',
    `The lesson:\n${lessonAsText(lesson)}`,
  ].join('\n\n')
}

function stepText(step: LessonStep): string {
  const head = `${step.title}${step.minutes ? ` (${step.minutes} min)` : ''}`
  return [head, step.teacher && `Teacher: ${step.teacher}`, step.students && `Students: ${step.students}`].filter(Boolean).join('\n')
}

/// Builds the laid-out sections. Written sections take the model's text; step
/// sections take the lesson's own steps, verbatim, wherever the model placed
/// them — held to teaching order here, whatever came back, so a step is never
/// shown before one that is taught earlier.
export function parseLayout(text: string, sections: TemplateSection[], steps: LessonStep[]): LaidOutSection[] {
  const written = new Map<string, string>()
  for (const m of text.matchAll(/<field>([\s\S]*?)<\/field>/g)) {
    const id = extractTag(m[1], 'field_id')?.trim()
    if (!id) continue
    written.set(id, extractTag(m[1], 'content')?.trim() ?? '')
  }

  const stepSections = sections.filter((s) => isSequenceKind(s.kind))
  const placedAt = new Map<number, number>()
  for (const m of text.matchAll(/<place>([\s\S]*?)<\/place>/g)) {
    const n = Number.parseInt(extractTag(m[1], 'step_number') ?? '', 10)
    const at = stepSections.findIndex((s) => s.id === extractTag(m[1], 'field_id')?.trim())
    if (Number.isInteger(n) && at >= 0) placedAt.set(n - 1, at)
  }
  const stepsIn = new Map<string, string[]>()
  let current = 0
  if (stepSections.length) {
    steps.forEach((step, i) => {
      current = Math.max(current, placedAt.get(i) ?? current)
      const id = stepSections[current].id
      stepsIn.set(id, [...(stepsIn.get(id) ?? []), stepText(step)])
    })
  }

  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    text:
      s.kind === 'teacher_fills'
        ? ''
        : isSequenceKind(s.kind)
          ? (stepsIn.get(s.id) ?? []).join('\n\n')
          : (written.get(s.id) ?? ''),
  }))
}

/// A layout with nothing in it is a response that went wrong, not a lesson
/// that had nothing to say — every lesson has at least an objective and steps.
export function isUsableLayout(sections: LaidOutSection[]): boolean {
  return sections.some((s) => s.text.trim())
}

/// Fingerprints the lesson and the template a layout was made from. When an
/// adaptation, an undo or a template edit changes either, the key changes and
/// the stored layout is stale — so nothing has to remember to clear it.
export function layoutSourceKey(
  lesson: LayoutLesson,
  template: { id: string; updatedAt: Date | string; sections: TemplateSection[] },
): string {
  const lessonPart = [
    lessonAsText(lesson),
    lesson.subject,
    lesson.gradeLevel,
    lesson.unitName,
    lesson.essentialQuestion,
    lesson.standard,
  ].join('\u0001')
  const templatePart = [template.id, new Date(template.updatedAt).toISOString(), JSON.stringify(template.sections)].join('\u0001')
  return createHash('sha256').update(`v1\u0002${lessonPart}\u0002${templatePart}`).digest('hex').slice(0, 16)
}
