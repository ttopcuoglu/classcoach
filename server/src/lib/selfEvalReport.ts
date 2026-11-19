// The Self Evaluation report a teacher sends their supervisor, and the two optional
// pieces that feed it: "About This Lesson" (a paragraph from the transcript
// and, when attached, the plan) and Domain 1 from an attached lesson plan.
//
// What the supervisor reads is a snapshot (AudioSession.selfEvalReport),
// built by buildSupervisorReport from what is stored on the lesson and the
// teacher's choices in the preview. The preview and the share call the same
// function with the same choices, so the report the teacher previewed is the
// report that is sent. Changing anything afterwards changes nothing the
// supervisor sees until the teacher shares again.
//
// Never in the report: the recording, the transcript, the rest of the
// lesson report, Reflect. Student names: the About prompt forbids them, and
// lessons after 2026-11-04 carry Student-A stand-ins anyway.

import { extractTag } from './extractTag.ts'
import { RUBRIC_LEVEL_NAMES, type RubricEvidenceItem, type RubricLensComponent, type RubricLensResult, type RubricLevel } from './rubricLens.ts'

// ---------------------------------------------------------------------------
// The lesson plan, in referable sections
// ---------------------------------------------------------------------------

export type PlanSection = { ref: string; text: string }

export type SelfEvalPlan = {
  /// 'upload' | 'paste' | 'planning' (a Planning Coach plan)
  source: string
  /// What the teacher will recognise: a file name or a plan's title.
  label: string
  lessonPlanId?: string | null
  sections: PlanSection[]
  attachedAt: string
}

export const PLAN_TEXT_MAX = 30_000
const SECTION_TARGET_CHARS = 900

// A heading is a short line on its own ("Objective", "Do Now:", "LESSON
// SEQUENCE") or a "Label: text" opening. It names the section a quote came
// from, which a teacher can find in their own plan; a page number from a
// converted file is less reliable than the plan's own headings.
const HEADING_LINE = /^([A-Z][A-Za-z0-9 /&()'’-]{1,48}?)\s*:?\s*$/
const LABEL_OPENING = /^([A-Z][A-Za-z0-9 /&()'’-]{1,40}?):\s*(?=\S)/

export function planSections(raw: string): PlanSection[] {
  const text = raw.replace(/\r\n?/g, '\n').slice(0, PLAN_TEXT_MAX).trim()
  if (!text) return []
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const sections: { heading: string | null; text: string }[] = []
  let pendingHeading: string | null = null
  for (const block of blocks) {
    const lines = block.split('\n')
    const first = lines[0].trim()
    const headingOnly = HEADING_LINE.exec(first)
    let heading: string | null = null
    let body = block
    if (headingOnly && lines.length === 1 && first.split(/\s+/).length <= 6) {
      pendingHeading = headingOnly[1].trim()
      continue
    }
    if (headingOnly && lines.length > 1 && first.split(/\s+/).length <= 6) {
      heading = headingOnly[1].trim()
      body = lines.slice(1).join('\n').trim()
    } else {
      const opening = LABEL_OPENING.exec(first)
      if (opening && opening[1].split(/\s+/).length <= 5) heading = opening[1].trim()
    }
    heading = heading ?? pendingHeading
    pendingHeading = null
    const last = sections[sections.length - 1]
    // Small headless blocks join the section before them, so a list of short
    // lines under one heading stays one section.
    if (last && !heading && last.text.length + body.length < SECTION_TARGET_CHARS) {
      last.text = `${last.text}\n\n${body}`
    } else {
      sections.push({ heading, text: body })
    }
  }
  const seen = new Map<string, number>()
  return sections.map((s, i) => {
    let ref = s.heading ? titleCase(s.heading) : `Part ${i + 1}`
    const n = (seen.get(ref) ?? 0) + 1
    seen.set(ref, n)
    if (n > 1) ref = `${ref} (${n})`
    return { ref, text: s.text }
  })
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Domain 1 from the plan
// ---------------------------------------------------------------------------

const PLANNING_DOMAIN = 'Domain 1: Planning and Preparation'

export const PLANNING_COMPONENTS: { code: string; name: string; readsFor: string }[] = [
  {
    code: '1a',
    name: 'Applying Knowledge of Content and Pedagogy',
    readsFor: 'how accurately and coherently the content is laid out, and whether the teaching approach fits this content',
  },
  {
    code: '1b',
    name: 'Knowing and Valuing Students',
    readsFor: "anything in the plan that takes these students into account: prior knowledge, needs, interests, language, supports or extensions",
  },
  {
    code: '1c',
    name: 'Setting Instructional Outcomes',
    readsFor: 'stated learning outcomes or objectives: how clear and measurable they are, and whether they ask for thinking as well as recall',
  },
  {
    code: '1d',
    name: 'Using Resources Effectively',
    readsFor: 'the materials, texts, tools and other resources named, and how they serve the outcomes',
  },
  {
    code: '1e',
    name: 'Planning Coherent Instruction',
    readsFor: 'the sequence of activities, grouping and timing, and whether they build toward the outcomes',
  },
  {
    code: '1f',
    name: 'Designing and Analyzing Assessments',
    readsFor: 'checks for understanding, exit tickets or other assessments, what counts as success, and how results would be used',
  },
]

export type PlanExcerpt = { ref: string; text: string }

export type PlanningComponent = {
  code: string
  name: string
  domain: string
  /// Null = the plan gives too little to place it ("not enough evidence").
  level: RubricLevel | null
  /// How the cited excerpts support the level, or what the plan doesn't say.
  explanation: string
  excerpts: PlanExcerpt[]
  teacherNote?: string | null
}

export type SelfEvalPlanning = {
  generatedAt: string
  components: PlanningComponent[]
}

export function buildPlanningPrompt(sections: PlanSection[], context: { subject: string | null; grade: string | null }, sharedRules: string): string {
  const levelWords = Object.values(RUBRIC_LEVEL_NAMES).map((w) => w.toLowerCase()).join(', ')
  return `You are a fair, practical instructional coach reading a teacher's own lesson plan through Domain 1 (Planning and Preparation) of the Danielson Framework for Teaching (2022). The teacher attached this plan to their own Self Evaluation and asked for a suggested level on each Domain 1 component. They see every level first and decide whether to share it.
${context.subject || context.grade ? `\nThe lesson: ${[context.grade ? `grade ${context.grade}` : null, context.subject].filter(Boolean).join(' ')}.\n` : ''}
The levels, judged on this one plan as written:
1 ${RUBRIC_LEVEL_NAMES[1]}: what the plan says works against the component (for example, outcomes that are only activities, content that is inaccurate, no assessment at all where one is clearly needed).
2 ${RUBRIC_LEVEL_NAMES[2]}: the component is addressed, but thinly or unevenly (an objective that names a topic but not what students will be able to do, a sequence without a clear build).
3 ${RUBRIC_LEVEL_NAMES[3]}: the component is clearly and consistently addressed (measurable outcomes, a sequence that builds toward them, checks tied to the outcomes).
4 ${RUBRIC_LEVEL_NAMES[4]}: everything in 3, and the plan deliberately gives students a role in it (choice, self-assessment, students setting or checking criteria) or plans for different students specifically.

What to read for each component:
${PLANNING_COMPONENTS.map((c) => `${c.code} ${c.name}: ${c.readsFor}.`).join('\n')}

Rules:
- Use only what the plan says. A plan is a document, not the lesson: never guess what happened in class.
- Every level needs at least one exact quote from the plan, copied word for word (at most 30 words each) from one numbered section below. If you can't quote anything that bears on a component, the level is not_enough: say in the explanation what the plan would need to show. That is better than a guess.
- Short plans are common. A plan that simply doesn't mention something gets not_enough for that component, not a low level.
- In <explanation>, say how the quoted words support the level, in 2 sentences and at most 45 words. Never write a level number or any level word (${levelWords}, unsatisfactory, basic, proficient, distinguished) there.

The plan, in numbered sections:
${sections.map((s, i) => `[${i + 1}] (${s.ref})\n${s.text}`).join('\n\n')}

For every component, in order 1a to 1f, write exactly one block:
<component>
<code>1a</code>
<level>1, 2, 3, 4, or not_enough</level>
<quote section="section number">exact words from that section</quote>
<quote section="section number">optional second quote</quote>
<explanation>how the quotes support the level, or what the plan would need to show</explanation>
</component>

Plain text only, no markdown.
${sharedRules}`
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/// A quote that isn't word for word in the section it names is dropped, and a
/// level with no quote left is "not enough evidence" — the same fail-closed
/// rule as the recording's levels.
export function parsePlanning(text: string, sections: PlanSection[]): PlanningComponent[] {
  const blocks = new Map<string, string>()
  for (const block of text.match(/<component>[\s\S]*?<\/component>/g) ?? []) {
    const code = extractTag(block, 'code')?.toLowerCase().trim()
    if (code && !blocks.has(code)) blocks.set(code, block)
  }
  return PLANNING_COMPONENTS.flatMap((def) => {
    const block = blocks.get(def.code)
    if (!block) return []
    const excerpts: PlanExcerpt[] = []
    for (const m of block.matchAll(/<quote\s+section="?(\d+)"?\s*>([\s\S]*?)<\/quote>/g)) {
      const section = sections[Number(m[1]) - 1]
      const quote = m[2].trim().replace(/^["“]|["”]$/g, '').trim()
      if (!section || quote.length < 4) continue
      if (!normalise(section.text).includes(normalise(quote))) continue
      if (excerpts.some((e) => normalise(e.text) === normalise(quote))) continue
      excerpts.push({ ref: section.ref, text: quote.replace(/\s+/g, ' ') })
      if (excerpts.length >= 2) break
    }
    const levelRaw = extractTag(block, 'level')?.trim()
    const level = excerpts.length > 0 && levelRaw && /^[1-4]\b/.test(levelRaw) ? (Number(levelRaw[0]) as RubricLevel) : null
    const explanation = extractTag(block, 'explanation')?.trim() ?? ''
    return [
      {
        code: def.code,
        name: def.name,
        domain: PLANNING_DOMAIN,
        level,
        explanation: explanation || (level == null ? 'The plan does not say enough about this to place it.' : ''),
        excerpts,
      },
    ]
  })
}

// ---------------------------------------------------------------------------
// About This Lesson
// ---------------------------------------------------------------------------

export type SelfEvalAbout = {
  heading: string | null
  text: string
  generatedAt: string
  usedPlan: boolean
  editedByTeacher?: boolean
}

export const ABOUT_TEXT_MAX = 1500

/// "Grade 8 Science", from what the teacher entered, else what the
/// transcript suggested. Null when neither is known.
export function aboutHeading(gradeLevel: string | null, subject: string | null): string | null {
  const grade = gradeLevel?.trim().replace(/(st|nd|rd|th)$/i, '')
  const parts = [grade ? (/^\d+$/.test(grade) ? `Grade ${grade}` : grade) : null, subject?.trim().replace(/_/g, ' ') || null].filter(Boolean)
  return parts.length ? parts.join(' ').replace(/\b\w/, (c) => c.toUpperCase()) : null
}

type LessonLine = { speakerLabel: string; startSec: number; text: string }

// The transcript is long; the paragraph needs its shape, not every word.
// Every teacher line is kept up to the cap (spread evenly beyond it), and
// student lines are always kept, since they are the only evidence of what
// students did with the task.
export function aboutTranscript(lines: LessonLine[], maxChars = 14_000): string {
  const clean = lines.filter((l) => l.text.trim())
  const render = (l: LessonLine) => `${l.speakerLabel === 'Teacher' ? 'Teacher' : 'Student'}: ${l.text.trim().replace(/\s+/g, ' ')}`
  const all = clean.map(render)
  if (all.join('\n').length <= maxChars) return all.join('\n')
  const students = new Set(clean.filter((l) => l.speakerLabel !== 'Teacher'))
  const studentChars = clean.filter((l) => students.has(l)).reduce((n, l) => n + render(l).length + 1, 0)
  const teacherLines = clean.filter((l) => !students.has(l))
  const room = Math.max(2000, maxChars - Math.min(studentChars, maxChars / 2))
  const avg = teacherLines.reduce((n, l) => n + render(l).length + 1, 0) / Math.max(1, teacherLines.length)
  const keep = Math.max(1, Math.floor(room / Math.max(1, avg)))
  const step = teacherLines.length / keep
  const kept = new Set(teacherLines.length <= keep ? teacherLines : Array.from({ length: keep }, (_, i) => teacherLines[Math.floor(i * step)]))
  let out = ''
  for (const l of clean) {
    if (!students.has(l) && !kept.has(l)) continue
    const line = render(l)
    if (out.length + line.length + 1 > maxChars) break
    out += `${line}\n`
  }
  return out.trim()
}

export function buildAboutPrompt(input: {
  heading: string | null
  summary: string | null
  transcript: string
  plan: PlanSection[] | null
  sharedRules: string
}): string {
  return `You are writing the opening paragraph of a short report a teacher is sending to their supervisor, "About This Lesson". The supervisor did not see the lesson. Give them a plain overview before they read any ratings.
${input.heading ? `\nThe class: ${input.heading}.` : ''}${input.summary ? `\nA one-line summary already made from this transcript: ${input.summary}` : ''}

Write one paragraph of 80 to 140 words that covers:
- what the lesson was about (the topic or content),
- the main task or question students worked on,
- what students were asked to do, in the order it happened when that is clear.
Only if student lines below show it, add what students said or produced, with a short exact quote (at most 15 words) from a Student line. Never claim what students learned or understood without such a quote; if there is no student evidence, say nothing about learning at all.

Rules:
- Third person, about the lesson ("The lesson...", "Students were asked to..."). Neutral and factual: no praise, no criticism, no ratings, no level words, no advice.
- Never use any student's name or any detail that identifies a student. Say "a student" or "students".
- The transcript is automatic and only part of the lesson's audio was captured. Do not describe what you can't hear (the board, slides, student work on paper) unless the plan states it, and then say "the plan".
- No quotes from the teacher's lines; describe what the teacher did instead.
${input.plan?.length ? `\nThe teacher's lesson plan (use it for the topic, task and sequence; the transcript says what actually happened):\n${input.plan.map((s) => `(${s.ref}) ${s.text}`).join('\n\n').slice(0, 8000)}\n` : ''}
The transcript (Teacher and Student lines):
${input.transcript || '(very little was captured)'}

Respond with only:
<about>the paragraph</about>
Plain text only, no markdown.
${input.sharedRules}`
}

export function parseAbout(text: string): string | null {
  const about = extractTag(text, 'about')?.trim().replace(/\s+/g, ' ')
  if (!about || about.length < 40) return null
  return about.slice(0, ABOUT_TEXT_MAX)
}

// ---------------------------------------------------------------------------
// Content Specialist notes beside the levels
// ---------------------------------------------------------------------------

export type ContentNoteRef = { id: string; label: string; text: string; excerpt: string; timestampSec: number }

/// How close a note's excerpt has to be to a moment cited for a level to
/// count as explaining that level.
const NOTE_NEAR_SEC = 30

/// The Content Specialist notes that sit beside a level: a note about the
/// same moment of the lesson as one of the moments the level cites. Each
/// note goes beside at most one component (the nearest). "Worth
/// double-checking" notes never attach on their own: a possible content slip
/// goes to a supervisor only if the teacher adds the extra feedback.
export function notesByComponent(components: RubricLensComponent[], notes: ContentNoteRef[]): Map<string, ContentNoteRef[]> {
  const out = new Map<string, ContentNoteRef[]>()
  for (const note of notes) {
    if (note.label === 'Worth double-checking') continue
    let best: { code: string; gap: number } | null = null
    for (const c of components) {
      if (c.level == null) continue
      for (const e of c.evidence) {
        const gap = Math.abs(e.timestampSec - note.timestampSec)
        if (gap <= NOTE_NEAR_SEC && (!best || gap < best.gap)) best = { code: c.code, gap }
      }
    }
    if (best) out.set(best.code, [...(out.get(best.code) ?? []), note])
  }
  return out
}

// ---------------------------------------------------------------------------
// The report itself
// ---------------------------------------------------------------------------

export type SelfEvalReportComponent = {
  code: string
  name: string
  domain: string
  level: RubricLevel | null
  summary: string
  evidence: RubricEvidenceItem[]
  nextStep: string | null
  teacherNote: string | null
  contentNotes: ContentNoteRef[]
}

export type SharedSelfEvalReport = {
  version: 1
  builtAt: string
  frameworkName: string
  about: { heading: string | null; text: string } | null
  planning: {
    label: string
    components: PlanningComponent[]
    /// The whole plan, only when the teacher chose to include it.
    fullPlan: PlanSection[] | null
  } | null
  components: SelfEvalReportComponent[]
  notObservable: RubricLensResult['notObservable']
  /// The rest of the Content Specialist's coaching (notes not beside a level,
  /// and ways in). Always sent with a previewed share since 2026-11-19 (the
  /// user's call); never changes a level or its explanation.
  additionalContent: { notes: ContentNoteRef[]; waysIn: string[] } | null
  /// What the teacher asked the supervisor to give feedback on, if anything.
  /// Absent on reports sent before 2026-11-19.
  feedbackRequest?: string | null
}

// Since 2026-11-19 the teacher no longer chooses what goes in (the user's
// call): a previewed share always carries the whole attached plan and every
// Content Specialist note. The only choice left is their question.
export type ReportChoices = {
  /// The teacher's one optional question for the supervisor.
  feedbackRequest: string | null
  /// False for a share made without the preview (an older iPhone app): such
  /// a share carries only what the old share did, the levels and notes.
  previewed: boolean
}

export const DEFAULT_CHOICES: ReportChoices = { feedbackRequest: null, previewed: false }

export const FEEDBACK_REQUEST_MAX = 500

export function readChoices(body: unknown): ReportChoices {
  const b = (body ?? {}) as Record<string, unknown>
  return {
    feedbackRequest: typeof b.feedbackRequest === 'string' && b.feedbackRequest.trim() ? b.feedbackRequest.trim().slice(0, FEEDBACK_REQUEST_MAX) : null,
    previewed: b.previewed === true,
  }
}

export type SelfEvalLens = RubricLensResult & {
  about?: SelfEvalAbout | null
  plan?: SelfEvalPlan | null
  planning?: SelfEvalPlanning | null
}

export function buildSupervisorReport(
  lens: SelfEvalLens,
  contentNotes: { notes?: ContentNoteRef[]; connectionIdeas?: string[] } | null,
  waysIn: string[],
  choices: ReportChoices,
  now = new Date(),
): SharedSelfEvalReport {
  const notes = choices.previewed ? (contentNotes?.notes ?? []) : []
  const beside = notesByComponent(lens.components, notes)
  const attached = new Set([...beside.values()].flat().map((n) => n.id))
  const plan = choices.previewed ? lens.plan : null
  const planning = choices.previewed ? lens.planning : null
  return {
    version: 1,
    builtAt: now.toISOString(),
    frameworkName: lens.frameworkName,
    about: choices.previewed && lens.about ? { heading: lens.about.heading, text: lens.about.text } : null,
    planning:
      plan && planning
        ? {
            label: plan.label,
            components: planning.components,
            fullPlan: plan.sections,
          }
        : null,
    components: lens.components.map((c) => ({
      code: c.code,
      name: c.name,
      domain: c.domain,
      level: c.level ?? null,
      summary: c.summary,
      evidence: c.evidence,
      nextStep: c.nextStep,
      teacherNote: c.teacherNote ?? null,
      contentNotes: beside.get(c.code) ?? [],
    })),
    notObservable: lens.notObservable,
    additionalContent:
      choices.previewed
        ? { notes: notes.filter((n) => !attached.has(n.id)), waysIn: waysIn.slice(0, 3) }
        : null,
    feedbackRequest: choices.previewed ? choices.feedbackRequest : null,
  }
}

/// A share made before snapshots existed: the live lens, read the way the
/// supervisor always read it.
export function reportFromLiveLens(lens: SelfEvalLens): SharedSelfEvalReport {
  return buildSupervisorReport(lens, null, [], DEFAULT_CHOICES)
}

/// Every placed component in a report, Domain 1 included, for the counts.
export function reportLevels(report: SharedSelfEvalReport): { code: string; name: string; domain: string; level: RubricLevel | null; hasNote: boolean }[] {
  return [
    ...(report.planning?.components ?? []).map((c) => ({ code: c.code, name: c.name, domain: c.domain, level: c.level, hasNote: !!c.teacherNote })),
    ...report.components.map((c) => ({ code: c.code, name: c.name, domain: c.domain, level: c.level, hasNote: !!c.teacherNote })),
  ]
}

/// One component of a shared report as the supervisor's workspace reports
/// read it: its level and the first piece of evidence behind it (a moment of
/// the recording, or a line of the plan for Domain 1).
export type WorkspaceComponent = {
  code: string
  name: string
  domain: string
  level: RubricLevel | null
  evidence: { text: string; timestampSec: number | null; source: 'recording' | 'plan'; ref: string | null } | null
}

export function workspaceComponents(report: SharedSelfEvalReport): WorkspaceComponent[] {
  return [
    ...(report.planning?.components ?? []).map((c) => ({
      code: c.code,
      name: c.name,
      domain: c.domain,
      level: c.level,
      evidence: c.excerpts[0] ? { text: c.excerpts[0].text, timestampSec: null, source: 'plan' as const, ref: c.excerpts[0].ref } : null,
    })),
    ...report.components.map((c) => ({
      code: c.code,
      name: c.name,
      domain: c.domain,
      level: c.level ?? null,
      evidence: c.evidence[0] ? { text: c.evidence[0].text, timestampSec: c.evidence[0].timestampSec, source: 'recording' as const, ref: null } : null,
    })),
  ]
}

/// Every Content Specialist note a shared report carries, each with the
/// component it sits beside (null for the rest), in lesson order.
export function workspaceNotes(report: SharedSelfEvalReport): (ContentNoteRef & { code: string | null })[] {
  return [
    ...report.components.flatMap((c) => c.contentNotes.map((n) => ({ ...n, code: c.code as string | null }))),
    ...(report.additionalContent?.notes ?? []).map((n) => ({ ...n, code: null })),
  ].sort((a, b) => a.timestampSec - b.timestampSec)
}
