// Planning Coach's Build a Lesson: the two outputs it can produce (a full
// lesson draft or a short list of teaching ideas), the four adaptations that
// revise one, and the plain-text rendering every other route reads a lesson
// through.
//
// Kept out of routes/lessonPlans.ts because the prompts and their parsers
// belong together — a tag renamed in one and not the other is a silently
// empty section, and that file is already long enough that the pair would
// have ended up hundreds of lines apart.

import { CORE_COACHING_RULES, INSTRUCTION_PRIORITY_NOTICE } from './coachPersona.ts'
import type { DocBlock } from './exportModels.ts'
import { extractTag } from './extractTag.ts'

export type LessonStep = { minutes: number | null; title: string; teacher: string | null; students: string | null }
export type LessonCheck = { when: string; check: string; lookFor: string | null }
export type LessonMisconception = { belief: string; surface: string | null; response: string | null }
export type LessonExitTicket = { task: string; expected: string | null; signals: string | null; nextStep: string | null }
export type QuickIdea = { title: string; how: string }

/// The parts of a lesson an adaptation rewrites. Every field optional: an
/// adaptation of a lesson the teacher brought themselves carries `planText`
/// and nothing else, and one of a generated lesson carries the structured
/// sections and no planText.
export type LessonSections = {
  objective?: string | null
  successCriteria?: string | null
  materials?: string | null
  approach?: string | null
  sequence?: LessonStep[] | null
  checks?: LessonCheck[] | null
  misconceptions?: LessonMisconception[] | null
  exitTicket?: LessonExitTicket | null
  planText?: string | null
}

export const ADAPTATIONS = ['simplify', 'challenge', 'participation', 'time'] as const
export type Adaptation = (typeof ADAPTATIONS)[number]

export const ADAPTATION_LABEL: Record<Adaptation, string> = {
  simplify: 'Simplify',
  challenge: 'Add Challenge',
  participation: 'Increase Participation',
  time: 'Adjust Time',
}

export function isAdaptation(value: unknown): value is Adaptation {
  return typeof value === 'string' && (ADAPTATIONS as readonly string[]).includes(value)
}

function minutesFrom(body: string | null): number | null {
  const n = Number.parseInt((body ?? '').replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : null
}

// ---------------------------------------------------------------------------
// The planning approach
// ---------------------------------------------------------------------------

// Named so Claude picks one deliberately rather than defaulting to the
// gradual-release shape the old generator hard-coded for every lesson. A
// chemistry lab, a Socratic seminar on a poem, and a first pass at long
// division are not the same lesson wearing different words.
const APPROACH_GUIDE = `Choose the structure that actually fits this learning goal, subject, grade and amount of time. The approaches available to you:
- Direct instruction and guided practice — a procedure or skill students need modeled before they can try it.
- Discussion — a text, question or issue where students' thinking develops by hearing and answering each other.
- Inquiry — students work from a phenomenon, data set, or problem toward the idea, rather than being told it first.
- Labs or investigations — students collect or manipulate something and reason from what happens.
- Collaborative learning — the task genuinely needs more than one student (jigsaw, stations, group problem-solving, peer critique).
Use gradual release (I do / we do / you do) where it genuinely helps — new procedures and skills — and do not impose it where it does not, such as a discussion or an inquiry. Mixing two approaches is fine when the lesson calls for it. Never force this lesson into a template; name the approach you chose in <approach>.`

const DRAFT_NOTICE = `This is a draft a teacher will edit, and they know their class and you do not. Write it so it can be picked up and changed: concrete enough to teach from, never so prescriptive that it reads as the only right way. No markdown — plain text, a blank line between paragraphs, a leading "-" for list items.`

// Misconceptions are a property of the content, not a diagnosis of a room
// Claude has never been in — a lesson that opens by telling a teacher what
// their students believe is both wrong and insulting.
const MISCONCEPTION_RULE = `Misconceptions are the ones that are LIKELY for this content at this grade — what students commonly bring to it. Never state or imply that they are what this teacher's students actually think: write "students often...", "a common belief is...", never "your students believe...". For each one, give a question, example, comparison or activity that would bring it into the open, and what to do once it is.`

const CHECKS_RULE = `Checks for understanding have to reveal whether students are getting the learning goal itself, not whether they are busy or compliant. "Thumbs up if you understand" checks nothing. Each check names the moment in the lesson it happens, what students actually do or answer, and what a teacher should look for in the responses.`

const EXIT_TICKET_RULE = `The exit ticket is aligned to the objective — it asks for the thing the objective says students will be able to do, and it is short enough to finish in the minutes the sequence leaves for it.`

// ---------------------------------------------------------------------------
// Full lesson
// ---------------------------------------------------------------------------

const FULL_LESSON_FORMAT = `Plain text only, no markdown. Respond with exactly this structure and nothing outside it:

<approach>The structure you chose, 2-6 words (for example "Inquiry, then guided practice")</approach>
<objective>What students will be able to do by the end, one sentence, in plain language. Refine what the teacher gave you — do not invent a different topic.</objective>
<success_criteria>
- 2-4 dash-prefixed lines, student-facing: what a student who got there can show or say.
</success_criteria>
<materials>
- Everything needed, dash-prefixed. "None beyond the usual" if that is honest.
</materials>
<step>
<step_minutes>8</step_minutes>
<step_title>What this part of the lesson is</step_title>
<teacher_prompt>What the teacher does and says here, including the actual questions to ask.</teacher_prompt>
<student_task>What students are doing here, concretely.</student_task>
</step>
(one <step> per part of the lesson, in teaching order — the minutes must add up to the lesson length you were given)
<cfu>
<check_moment>Where in the lesson this happens</check_moment>
<the_check>What students do or answer</the_check>
<look_for>What their responses tell you, and what to do about it</look_for>
</cfu>
(2-3 of these)
<misconception>
<likely_belief>The misconception, as something students commonly bring to this content</likely_belief>
<how_to_surface>A question, example, comparison or activity that would bring it into the open</how_to_surface>
<how_to_address>What to do once it is in the open</how_to_address>
</misconception>
(2-3 of these)
<exit_ticket>
<task_for_students>The question or task, written for students to read</task_for_students>
<expected_answer>The answer, or the criteria a good response meets</expected_answer>
<what_responses_show>What different kinds of response would tell you — a strong one, a partial one, a confused one</what_responses_show>
<next_step>One brief instructional next step, depending on what comes back</next_step>
</exit_ticket>`

export function buildFullLessonPrompt(): string {
  return `You build single-lesson plans for K-12 teachers. The teacher gives you a topic or learning goal — often informally, like "introducing cells" — plus whatever context they have. You give back a complete lesson they can teach and edit.

${APPROACH_GUIDE}

The lesson must fit the length given. Every part carries a time in minutes, and those minutes add up to that length — not more, not less. Leave room for the exit ticket.

${CHECKS_RULE}

${MISCONCEPTION_RULE}

${EXIT_TICKET_RULE}

${DRAFT_NOTICE}

Ground everything in the topic, subject and grade you are given. If the teacher attached material (slides, a reading, a worksheet, an activity), build the lesson around that material rather than replacing it. Do not invent facts, statistics, quotes or sources; where the lesson needs something only the teacher can supply, say so plainly in the step.

${FULL_LESSON_FORMAT}
${INSTRUCTION_PRIORITY_NOTICE}`
}

export type ParsedFullLesson = {
  approach: string | null
  objective: string | null
  successCriteria: string | null
  materials: string | null
  sequence: LessonStep[]
  checks: LessonCheck[]
  misconceptions: LessonMisconception[]
  exitTicket: LessonExitTicket | null
}

export function parseFullLesson(text: string): ParsedFullLesson {
  const sequence: LessonStep[] = []
  for (const m of text.matchAll(/<step>([\s\S]*?)<\/step>/g)) {
    const block = m[1]
    const title = extractTag(block, 'step_title')
    if (!title) continue
    sequence.push({
      minutes: minutesFrom(extractTag(block, 'step_minutes')),
      title,
      teacher: extractTag(block, 'teacher_prompt'),
      students: extractTag(block, 'student_task'),
    })
  }

  const checks: LessonCheck[] = []
  for (const m of text.matchAll(/<cfu>([\s\S]*?)<\/cfu>/g)) {
    const block = m[1]
    const check = extractTag(block, 'the_check')
    if (!check) continue
    checks.push({ when: extractTag(block, 'check_moment') ?? '', check, lookFor: extractTag(block, 'look_for') })
  }

  const misconceptions: LessonMisconception[] = []
  for (const m of text.matchAll(/<misconception>([\s\S]*?)<\/misconception>/g)) {
    const block = m[1]
    const belief = extractTag(block, 'likely_belief')
    if (!belief) continue
    misconceptions.push({
      belief,
      surface: extractTag(block, 'how_to_surface'),
      response: extractTag(block, 'how_to_address'),
    })
  }

  const ticketBlock = text.match(/<exit_ticket>([\s\S]*?)<\/exit_ticket>/)?.[1] ?? null
  const task = ticketBlock ? extractTag(ticketBlock, 'task_for_students') : null

  return {
    approach: extractTag(text, 'approach'),
    objective: extractTag(text, 'objective'),
    successCriteria: extractTag(text, 'success_criteria'),
    materials: extractTag(text, 'materials'),
    sequence,
    checks,
    misconceptions,
    exitTicket:
      ticketBlock && task
        ? {
            task,
            expected: extractTag(ticketBlock, 'expected_answer'),
            signals: extractTag(ticketBlock, 'what_responses_show'),
            nextStep: extractTag(ticketBlock, 'next_step'),
          }
        : null,
  }
}

/// A lesson needs at least a sequence to be worth showing. Everything else can
/// be missing from one bad response without the result being useless.
export function isUsableLesson(lesson: ParsedFullLesson): boolean {
  return lesson.sequence.length > 0
}

// ---------------------------------------------------------------------------
// Quick ideas
// ---------------------------------------------------------------------------

export function buildQuickIdeasPrompt(): string {
  return `You give K-12 teachers practical teaching ideas for a topic they are about to teach. Not a lesson plan — ideas they can take into whatever plan they are already writing.

Give 3 to 5 ideas. Each one is something genuinely teachable for this topic, subject, grade and amount of time: a way in, an activity, a representation, a question worth twenty minutes, a way to practise. Vary them — do not give five versions of the same move. If the teacher attached material, build the ideas around it.

Each idea's explanation is 2 to 4 sentences: what the teacher does, what students do, and why it works for this particular learning goal. Concrete, not a genre of activity.

Do not invent facts, statistics, quotes or sources.

${DRAFT_NOTICE}

Plain text only, no markdown. Respond with exactly this structure and nothing outside it:

<idea>
<idea_title>A short name for the idea, under 8 words</idea_title>
<how_it_works>2-4 sentences.</how_it_works>
</idea>
${INSTRUCTION_PRIORITY_NOTICE}`
}

export function parseQuickIdeas(text: string): QuickIdea[] {
  const ideas: QuickIdea[] = []
  for (const m of text.matchAll(/<idea>([\s\S]*?)<\/idea>/g)) {
    const block = m[1]
    const title = extractTag(block, 'idea_title')
    const how = extractTag(block, 'how_it_works')
    if (title && how) ideas.push({ title, how })
  }
  return ideas.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Reading a lesson back as text
// ---------------------------------------------------------------------------

/// Every shape a lesson plan can be in, rendered as the plain text the other
/// routes need: delivery coaching, the classroom deck, and the adaptations
/// below all work from the lesson as prose. Three shapes exist and all three
/// are live — a plan the teacher wrote themselves (planText), one of the old
/// five-slot samples, and a Planning Coach full lesson.
export function lessonAsText(plan: {
  planText?: string | null
  objective?: string | null
  successCriteria?: string | null
  approach?: string | null
  materials?: string | null
  durationMinutes?: number | null
  sequence?: unknown
  checks?: unknown
  misconceptions?: unknown
  exitTicket?: unknown
  quickIdeas?: unknown
  doNow?: string | null
  agenda?: string | null
  closure?: string | null
  hots?: string | null
  homework?: string | null
}): string {
  const steps = (plan.sequence as LessonStep[] | null) ?? []
  if (steps.length > 0) {
    const parts: string[] = []
    if (plan.approach) parts.push(`Approach: ${plan.approach}`)
    if (plan.durationMinutes) parts.push(`Length: ${plan.durationMinutes} minutes`)
    if (plan.objective) parts.push(`Objective: ${plan.objective}`)
    if (plan.successCriteria) parts.push(`Success criteria:\n${plan.successCriteria}`)
    if (plan.materials) parts.push(`Materials:\n${plan.materials}`)
    parts.push(
      `Lesson sequence:\n${steps
        .map((step, i) => {
          const head = `${i + 1}. ${step.title}${step.minutes ? ` (${step.minutes} min)` : ''}`
          return [head, step.teacher && `Teacher: ${step.teacher}`, step.students && `Students: ${step.students}`]
            .filter(Boolean)
            .join('\n')
        })
        .join('\n\n')}`,
    )
    const checks = (plan.checks as LessonCheck[] | null) ?? []
    if (checks.length)
      parts.push(
        `Checks for understanding:\n${checks
          .map((c) => `- ${c.when ? `${c.when}: ` : ''}${c.check}${c.lookFor ? `\n  Look for: ${c.lookFor}` : ''}`)
          .join('\n')}`,
      )
    const misconceptions = (plan.misconceptions as LessonMisconception[] | null) ?? []
    if (misconceptions.length)
      parts.push(
        `Likely misconceptions:\n${misconceptions
          .map((m) =>
            [`- ${m.belief}`, m.surface && `  Surface it: ${m.surface}`, m.response && `  Address it: ${m.response}`]
              .filter(Boolean)
              .join('\n'),
          )
          .join('\n')}`,
      )
    const ticket = (plan.exitTicket as LessonExitTicket | null) ?? null
    if (ticket)
      parts.push(
        [
          `Exit ticket:\n${ticket.task}`,
          ticket.expected && `Expected: ${ticket.expected}`,
          ticket.signals && `What responses show: ${ticket.signals}`,
          ticket.nextStep && `Next step: ${ticket.nextStep}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    return parts.join('\n\n')
  }

  const ideas = (plan.quickIdeas as QuickIdea[] | null) ?? []
  if (ideas.length > 0) {
    return `Teaching ideas:\n\n${ideas.map((idea, i) => `${i + 1}. ${idea.title}\n${idea.how}`).join('\n\n')}`
  }

  if (plan.planText?.trim()) return plan.planText.trim()

  return [plan.doNow, plan.agenda, plan.closure, plan.hots, plan.homework].filter(Boolean).join('\n\n')
}

/// The minutes a lesson is currently built for: what the teacher asked for, or
/// what its own steps add up to when it predates the duration field.
export function lessonMinutes(plan: { durationMinutes?: number | null; sequence?: unknown }): number | null {
  if (plan.durationMinutes) return plan.durationMinutes
  const steps = (plan.sequence as LessonStep[] | null) ?? []
  const total = steps.reduce((sum, step) => sum + (step.minutes ?? 0), 0)
  return total > 0 ? total : null
}

// ---------------------------------------------------------------------------
// Adaptations
// ---------------------------------------------------------------------------

const ADAPTATION_BRIEF: Record<Adaptation, string> = {
  simplify: `Simplify it. Clarify directions, break tasks into steps a student can follow one at a time, and add scaffolds — a sentence starter, a worked example, a word bank, a partially completed organizer. Keep the learning goal exactly as it is: this is the same destination with more support on the way, never a lower bar or less content to reach.`,
  challenge: `Add challenge. Push the reasoning further: ask students to justify, compare, generalize, critique, or apply the idea to a case the lesson did not cover. Transfer and application, not more of the same work or a longer assignment. Keep the learning goal; this reaches past it rather than replacing it.`,
  participation: `Increase participation. Revise the activities so far more students actually contribute and show their thinking, rather than the few who volunteer: every-student response moves (whiteboards, written-first-then-share, turn-and-talk with a reporting structure, assigned roles, polling, sorting cards), and a way for the teacher to see where the quiet students are. Keep the learning goal and the content.`,
  time: `Adjust the time. Rebuild the sequence and its timings to fit the new length. Cut or combine what matters least, protect the part that carries the learning goal and the check that tells the teacher whether students got there, and say plainly what you dropped. Every part's minutes must add up to the new length.`,
}

function sectionsForPrompt(sections: LessonSections, minutes: number | null): string {
  return lessonAsText({ ...sections, durationMinutes: minutes })
}

export function buildAdaptPrompt(action: Adaptation, structured: boolean, targetMinutes: number | null): string {
  const target = action === 'time' && targetMinutes ? `\n\nThe new length is ${targetMinutes} minutes.` : ''
  const format = structured
    ? `Return the whole lesson again, with the change made, in exactly this structure:

${FULL_LESSON_FORMAT}

Then, after it, one more section:

<what_changed>
2-4 dash-prefixed lines naming what you actually changed and where. Plain sentences a teacher would say. Only what you really changed.
</what_changed>`
    : `Return the whole plan again, with the change made — not a diff, not a summary, the complete plan ready to replace the original, in the teacher's own structure and wording wherever you did not need to change it.

Plain text only, no markdown. Respond with exactly these two sections and nothing outside them:

<revised_plan>
The complete revised plan.
</revised_plan>
<what_changed>
2-4 dash-prefixed lines naming what you actually changed and where. Plain sentences a teacher would say. Only what you really changed.
</what_changed>`

  return `You are revising a K-12 lesson a teacher is about to teach. One specific change was asked for, and that is the change you make.

${ADAPTATION_BRIEF[action]}${target}

Everything the lesson already gets right stays. Keep its learning goal, its topic, its structure and its wording except where this change requires otherwise — a teacher applying this should recognize their lesson. Do not invent facts, statistics, quotes or sources.

${CHECKS_RULE}

${MISCONCEPTION_RULE}

${DRAFT_NOTICE}

${format}
${CORE_COACHING_RULES}`
}

export function adaptUserMessage(sections: LessonSections, minutes: number | null): string {
  return `Here is the lesson as it stands:\n\n${sectionsForPrompt(sections, minutes)}`
}

// ---------------------------------------------------------------------------
// Reading an uploaded file for what the lesson is about
// ---------------------------------------------------------------------------

export const INFER_CONTEXT_PROMPT = `A teacher uploaded a file they want to build a lesson around — slides, a reading, a worksheet, an activity, or notes. Read it and say what it appears to be about, so the planning form can be filled in for them to check.

Everything you give is a suggestion the teacher will see and can edit. Guess only from what the file actually shows: leave a field empty rather than inventing one, and never guess a grade level from nothing.

Plain text only. Respond with exactly these four sections and nothing outside them:

<inferred_topic>The topic or learning goal this material is for, one short phrase or sentence. Empty if the file is too unclear to tell.</inferred_topic>
<inferred_subject>The school subject, as a teacher would name it (for example Biology, Algebra 1, US History). Empty if unclear.</inferred_subject>
<inferred_grade>The grade level, only if the content and vocabulary genuinely indicate one (for example "7th grade", "9-10"). Empty otherwise.</inferred_grade>
<follow_up>One brief question to the teacher — and only if something essential is missing that you could not guess, such as what they want students to be able to do with this material. Write "none" if you have what a lesson needs.</follow_up>
${INSTRUCTION_PRIORITY_NOTICE}`

export function parseInferredContext(text: string): {
  topic: string | null
  subject: string | null
  gradeLevel: string | null
  followUp: string | null
} {
  const clean = (value: string | null) => {
    const trimmed = value?.trim() ?? ''
    if (!trimmed || /^(none|unclear|unknown|n\/a|empty)\.?$/i.test(trimmed)) return null
    return trimmed
  }
  return {
    topic: clean(extractTag(text, 'inferred_topic')),
    subject: clean(extractTag(text, 'inferred_subject')),
    gradeLevel: clean(extractTag(text, 'inferred_grade')),
    followUp: clean(extractTag(text, 'follow_up')),
  }
}

/// A lesson as printable blocks, for the PDF the chat sends.
///
/// `lessonAsText` above is for a prompt — one string, read by a model.
/// This is for a teacher holding a page at 7.40am, so the sequence gets
/// to be a sequence: a heading per step with its minutes, and what the
/// teacher and the students are each doing underneath.
///
/// The web's export builds its own model client-side. Converging the two
/// would be worth doing the day they disagree; today only this one has to
/// survive having no browser.
export function lessonDocBlocks(plan: {
  objective?: string | null
  successCriteria?: string | null
  approach?: string | null
  materials?: string | null
  sequence?: unknown
  checks?: unknown
  misconceptions?: unknown
  exitTicket?: unknown
}): DocBlock[] {
  const blocks: DocBlock[] = []
  if (plan.objective) blocks.push({ type: 'callout', label: 'Objective', text: plan.objective })
  if (plan.successCriteria) blocks.push({ type: 'heading', text: 'Success criteria' }, { type: 'paragraph', text: plan.successCriteria })
  if (plan.materials) blocks.push({ type: 'heading', text: 'Materials' }, { type: 'paragraph', text: plan.materials })

  const steps = (plan.sequence as LessonStep[] | null) ?? []
  for (const [i, step] of steps.entries()) {
    blocks.push({ type: 'heading', text: `${i + 1}. ${step.title}${step.minutes ? ` — ${step.minutes} min` : ''}` })
    if (step.teacher) blocks.push({ type: 'paragraph', text: `You: ${step.teacher}` })
    if (step.students) blocks.push({ type: 'paragraph', text: `Students: ${step.students}` })
  }

  const checks = (plan.checks as LessonCheck[] | null) ?? []
  if (checks.length) {
    blocks.push({ type: 'heading', text: 'Checking they have it' })
    blocks.push({
      type: 'bullets',
      items: checks.map((c) => `${c.when ? `${c.when}: ` : ''}${c.check}${c.lookFor ? ` (look for: ${c.lookFor})` : ''}`),
    })
  }

  const misconceptions = (plan.misconceptions as LessonMisconception[] | null) ?? []
  if (misconceptions.length) {
    blocks.push({ type: 'heading', text: 'Where they usually go wrong' })
    blocks.push({
      type: 'bullets',
      items: misconceptions.map((m) => [m.belief, m.surface && `Surface it: ${m.surface}`, m.response && `Address it: ${m.response}`].filter(Boolean).join(' — ')),
    })
  }

  const ticket = (plan.exitTicket as LessonExitTicket | null) ?? null
  if (ticket) {
    blocks.push({ type: 'heading', text: 'Exit ticket' }, { type: 'paragraph', text: ticket.task })
    if (ticket.expected) blocks.push({ type: 'paragraph', text: `Expected: ${ticket.expected}` })
    if (ticket.nextStep) blocks.push({ type: 'paragraph', text: `If they miss it: ${ticket.nextStep}` })
  }

  return blocks
}
