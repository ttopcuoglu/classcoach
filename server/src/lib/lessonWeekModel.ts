// Plan a Week: a week of lessons in two steps. First an objective for each
// day, built so the days lead into each other; the teacher edits those. Then
// the week filled in — in their school's weekly form when they have one, or
// in a plain weekly layout when they don't. Any day can then be opened as a
// full Planning Coach lesson (see /generate's weekPlanId).
//
// Stored on LessonPlan.week (planKind "week"). The prompts and parsers sit
// together for the reason lessonTemplateModel.ts gives; lessonWeekModel.test.ts
// is the pairing.

import { CORE_COACHING_RULES, INSTRUCTION_PRIORITY_NOTICE } from './coachPersona.ts'
import { extractTag } from './extractTag.ts'
import {
  clean,
  KIND_MEANING,
  sectionScope,
  type LaidOutSection,
  type TemplateSection,
} from './lessonTemplateModel.ts'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const MAX_WEEK_DAYS = 7
const MAX_OBJECTIVE = 600
const MAX_NOTE = 300

export type WeekDay = {
  label: string
  minutes: number
  /** What the teacher said was already fixed on this day: a quiz, a half day, an objective they have. */
  note: string | null
  objective: string
  /** The full lesson opened from this day, once there is one. */
  lessonPlanId?: string | null
}

export type WeekContent = {
  /** Null when the week is in Wivoza's own weekly layout. */
  templateId: string | null
  templateName: string
  shared: LaidOutSection[]
  days: { label: string; sections: LaidOutSection[] }[]
}

export type WeekPlan = { days: WeekDay[]; content: WeekContent | null }

/// Days as the client sends them, before objectives exist. Labels are kept
/// only when they are a weekday name, so nothing else lands in a prompt.
export function sanitizeWeekDays(
  raw: unknown,
  readMinutes: (value: unknown) => number | null,
  fallbackMinutes: number,
): { label: string; minutes: number; note: string | null }[] | null {
  if (!Array.isArray(raw)) return null
  const days: { label: string; minutes: number; note: string | null }[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, MAX_WEEK_DAYS)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const label = WEEKDAYS.find((d) => d === record.label)
    if (!label || seen.has(label)) continue
    seen.add(label)
    days.push({ label, minutes: readMinutes(record.minutes) ?? fallbackMinutes, note: clean(record.note, MAX_NOTE) })
  }
  days.sort((a, b) => WEEKDAYS.indexOf(a.label as (typeof WEEKDAYS)[number]) - WEEKDAYS.indexOf(b.label as (typeof WEEKDAYS)[number]))
  return days.length ? days : null
}

export function cleanObjective(value: unknown): string | null {
  return clean(value, MAX_OBJECTIVE)
}

/// Everything about the week a prompt needs, as the teacher gave it.
export type WeekContext = {
  goal: string
  subject: string | null
  gradeLevel: string | null
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  additionalContext: string | null
  sourceMaterial: string | null
}

function contextLines(context: WeekContext): string {
  return [
    `What the class is learning this week: ${context.goal}`,
    context.subject && `Subject: ${context.subject}`,
    context.gradeLevel && `Grade level: ${context.gradeLevel}`,
    context.unitName && `Unit: ${context.unitName}`,
    context.essentialQuestion && `Essential question: ${context.essentialQuestion}`,
    context.standard && `Standard (as the teacher gave it): ${context.standard}`,
    context.additionalContext && `Other context from the teacher:\n${context.additionalContext}`,
    context.sourceMaterial && `The teacher's own material, to build the week around:\n${context.sourceMaterial}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Step 1: an objective for each day
// ---------------------------------------------------------------------------

export function buildWeekObjectivesPrompt(): string {
  return `You plan a week of lessons for a K-12 teacher. They give you what the class is learning this week and which days they teach. You give back one learning objective for each day, so the week builds: early days lay the foundation the later days need, and the week ends with students able to do what the week's goal says.

Rules:
- One objective per day, written as "Students will be able to ...", one sentence, in plain language.
- Each objective is something students can actually reach in that day's class length. A short day gets a smaller objective.
- Each day builds on the one before it. Do not repeat a day, and do not jump ahead of what earlier days have taught.
- The teacher may have written a note for a day. Treat it as fixed. Only a note that is a complete objective — a sentence saying what students will be able to do — is used as that day's objective, word for word. Anything else ("quiz", "lab", "assembly", "half day") is an event: plan the day around it and still write a full objective for it. A quiz day's objective says what students will show on the quiz, in the same "Students will be able to ..." form.
- Stay inside the week's goal, subject and grade. Do not invent standards, facts or resources.

Plain text only. Respond with exactly one <day> per day you were given, in the same order, and nothing outside them:

<day>
<day_number>1</day_number>
<day_objective>Students will be able to ...</day_objective>
</day>
${INSTRUCTION_PRIORITY_NOTICE}`
}

export function weekObjectivesUserMessage(context: WeekContext, days: { label: string; minutes: number; note: string | null }[]): string {
  return [
    contextLines(context),
    `The days:\n${days
      .map((d, i) => `${i + 1}. ${d.label}, ${d.minutes} minutes${d.note ? ` — the teacher's note for this day: ${d.note}` : ''}`)
      .join('\n')}`,
  ].join('\n\n')
}

/// One objective per day, in order. A day the model skipped gets null, which
/// the caller treats as a failed response rather than an empty box.
export function parseWeekObjectives(text: string, dayCount: number): (string | null)[] {
  const byDay = new Map<number, string>()
  for (const m of text.matchAll(/<day>([\s\S]*?)<\/day>/g)) {
    const n = Number.parseInt(extractTag(m[1], 'day_number') ?? '', 10)
    const objective = cleanObjective(extractTag(m[1], 'day_objective'))
    if (Number.isInteger(n) && n >= 1 && n <= dayCount && objective) byDay.set(n, objective)
  }
  return Array.from({ length: dayCount }, (_, i) => byDay.get(i + 1) ?? null)
}

// ---------------------------------------------------------------------------
// Step 2: the week, filled in
// ---------------------------------------------------------------------------

/// Wivoza's own weekly layout, for a teacher whose formats are all daily.
export const DEFAULT_WEEK_SECTIONS: TemplateSection[] = [
  { id: 'w1', title: 'This week', kind: 'other', prompt: 'What the class is learning this week and how the days build', scope: 'week' },
  { id: 'w2', title: 'Standards', kind: 'standards', prompt: null, scope: 'week' },
  { id: 'd1', title: 'Objective', kind: 'objective', prompt: null, scope: 'day' },
  { id: 'd2', title: 'Opening', kind: 'opening', prompt: null, scope: 'day' },
  { id: 'd3', title: 'Activities', kind: 'activities', prompt: null, scope: 'day' },
  { id: 'd4', title: 'Check for understanding', kind: 'checks', prompt: null, scope: 'day' },
  { id: 'd5', title: 'Materials', kind: 'materials', prompt: null, scope: 'day' },
  { id: 'd6', title: 'Homework', kind: 'homework', prompt: null, scope: 'day' },
]

export function buildWeekFillPrompt(): string {
  return `You fill in a teacher's weekly lesson plan. The week's daily objectives are already set — the teacher has checked them. You fill in the plan's boxes for the week and for each day, so the teacher can hand it in or post it.

A weekly plan is a summary, not a script: each box is short — one to five lines, concrete enough to teach from. Name the actual activity, task or question, not a category of one ("Partners sort 12 polynomial graphs by end behavior", not "Group activity").

Rules:
- Each day serves that day's objective, and the days connect: what a day practises is what an earlier day taught.
- Respect the teacher's note for a day (a quiz, a lab, a half day).
- A check for understanding has to show whether students reached the day's objective — what they do or answer, and what to look for. "Thumbs up if you understand" checks nothing; never use it.
- A day's objective box gets that day's objective.
- Never invent a standard code. A standards box gets the standard the teacher gave, or stays empty.
- Differentiation is written from the content — support and stretch — and never names, describes or guesses at a specific student.
- Do not invent facts, statistics, sources or resources the teacher has not mentioned. If something only the teacher can supply is needed, say so plainly.
- If a box has nothing that belongs in it for a day (homework on a quiz day, say), leave it empty.
- Plain text, no markdown. A leading "-" for list items.

Respond with exactly this, and nothing outside it — one <week_field> per week box, then one <day> per day in order, each with one <field> per day box:

<week_field>
<field_id>the box's id, exactly as given</field_id>
<content>What goes in it</content>
</week_field>
<day>
<day_number>1</day_number>
<field>
<field_id>the box's id, exactly as given</field_id>
<content>What goes in it for this day</content>
</field>
</day>
${CORE_COACHING_RULES}`
}

function describe(s: TemplateSection): string {
  return `- id ${s.id}: "${s.title}" — ${KIND_MEANING[s.kind]}${s.prompt ? `. The form says: ${s.prompt}` : ''}`
}

export function weekFillUserMessage(context: WeekContext, days: WeekDay[], sections: TemplateSection[]): string {
  const fill = sections.filter((s) => s.kind !== 'teacher_fills')
  const weekBoxes = fill.filter((s) => sectionScope(s) === 'week')
  const dayBoxes = fill.filter((s) => sectionScope(s) === 'day')
  return [
    `Week boxes (filled once):\n${weekBoxes.map(describe).join('\n') || '(none)'}`,
    `Day boxes (filled for each day):\n${dayBoxes.map(describe).join('\n') || '(none)'}`,
    contextLines(context),
    `The days and their objectives:\n${days
      .map((d, i) => `${i + 1}. ${d.label}, ${d.minutes} minutes: ${d.objective}${d.note ? ` (the teacher's note: ${d.note})` : ''}`)
      .join('\n')}`,
  ].join('\n\n')
}

function fieldsIn(block: string, tag: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const m of block.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))) {
    const id = extractTag(m[1], 'field_id')?.trim()
    if (id) fields.set(id, extractTag(m[1], 'content')?.trim() ?? '')
  }
  return fields
}

/// The filled-in week, in the template's own order. A day's objective box is
/// the objective the teacher checked, word for word, whatever came back; a
/// box the teacher fills in is blank whatever came back.
export function parseWeekFill(
  text: string,
  sections: TemplateSection[],
  days: WeekDay[],
): { shared: LaidOutSection[]; days: { label: string; sections: LaidOutSection[] }[] } {
  // The week's own boxes are outside every <day>, so read them with the days
  // cut out — a day's <field> is never a week box.
  const outside = text.replace(/<day>[\s\S]*?<\/day>/g, '')
  const weekFields = fieldsIn(outside, 'week_field')
  const dayFields = new Map<number, Map<string, string>>()
  for (const m of text.matchAll(/<day>([\s\S]*?)<\/day>/g)) {
    const n = Number.parseInt(extractTag(m[1], 'day_number') ?? '', 10)
    if (Number.isInteger(n)) dayFields.set(n - 1, fieldsIn(m[1], 'field'))
  }

  const lay = (s: TemplateSection, value: string | undefined): LaidOutSection => ({
    id: s.id,
    title: s.title,
    kind: s.kind,
    text: s.kind === 'teacher_fills' ? '' : (value ?? ''),
  })
  return {
    shared: sections.filter((s) => sectionScope(s) === 'week').map((s) => lay(s, weekFields.get(s.id))),
    days: days.map((day, i) => ({
      label: day.label,
      sections: sections
        .filter((s) => sectionScope(s) === 'day')
        .map((s) => lay(s, s.kind === 'objective' ? day.objective : dayFields.get(i)?.get(s.id))),
    })),
  }
}

/// A fill where no day has anything but its objective went wrong.
export function isUsableWeekFill(filled: { days: { sections: LaidOutSection[] }[] }): boolean {
  return filled.days.some((d) => d.sections.some((s) => s.kind !== 'objective' && s.text.trim()))
}

/// What /generate is told when a day is opened as a full lesson: the week it
/// sits in, so the lesson picks up from the day before and sets up the next.
export function dayLessonContext(context: WeekContext, week: WeekPlan, index: number): string {
  const day = week.days[index]
  const planned = week.content?.days[index]?.sections.filter((s) => s.text.trim() && s.kind !== 'objective') ?? []
  return [
    `This lesson is ${day.label}'s lesson in a week on: ${context.goal}.`,
    `The week's objectives, day by day:\n${week.days.map((d, i) => `${i === index ? '→ ' : ''}${d.label}: ${d.objective}`).join('\n')}`,
    day.note ? `The teacher's note for ${day.label}: ${day.note}` : null,
    planned.length ? `What the weekly plan already says for ${day.label} — build the lesson out from this:\n${planned.map((s) => `${s.title}: ${s.text}`).join('\n')}` : null,
    'Pick up from the days before and set up the days after; do not reteach what an earlier day covered or teach ahead of a later one.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
