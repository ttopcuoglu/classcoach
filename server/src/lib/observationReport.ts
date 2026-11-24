// A supervisor's classroom observation, written up (2026-11-24): the
// recording, the supervisor's answers to ten Danielson questions, the notes
// they took while observing, and the lesson plan when attached, combined into
// one draft. The supervisor sets every final level; Wivoza only suggests.
//
// Each source covers what the others can't: the recording hears questions,
// explanations and feedback; the supervisor sees the room, behavior, student
// work and the pair talk a microphone misses. Where they disagree the report
// says so rather than averaging them.

import { analyzeTranscript, detectLessonContent, type Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { buildRubricEvidence, RUBRIC_FRAMEWORKS, RUBRIC_LEVEL_NAMES, stripMomentReferences, type RubricEvidenceItem, type RubricLevel } from './rubricLens.ts'
import type { PlanSection, PlanningComponent } from './selfEvalReport.ts'

// ---- the five questions ----
// The user's five (2026-11-24), each about what a recording can't capture,
// every one with "Not observed". A question can speak to more than one
// component (classroom management is 2c and 2d). What they leave out (2b,
// 3a, 3b, 3e) comes from the recording and the observer's notes. Mirrored in
// web/src/lib/observationQuestions.ts.

export type ObservationOption = { key: string; label: string; /** Saw nothing to judge: no evidence from this answer. */ noEvidence?: boolean }
export type ObservationQuestion = { id: string; codes: string[]; title: string; text: string; options: ObservationOption[] }

const NOT_OBSERVED: ObservationOption = { key: 'not_observed', label: 'Not observed', noEvidence: true }

export const OBSERVATION_QUESTIONS: ObservationQuestion[] = [
  {
    id: 'management',
    codes: ['2c', '2d'],
    title: 'Classroom management',
    text: 'How smoothly did routines, transitions, and student behavior support learning?',
    options: [{ key: 'smooth', label: 'Smoothly' }, { key: 'some', label: 'Some interruptions' }, { key: 'frequent', label: 'Frequent interruptions' }, NOT_OBSERVED],
  },
  {
    id: 'climate',
    codes: ['2a'],
    title: 'Classroom climate',
    text: 'How respectful and supportive were interactions among students and with the teacher?',
    options: [{ key: 'warm', label: 'Warm and respectful' }, { key: 'mostly', label: 'Mostly respectful' }, { key: 'unkind', label: 'Some unkind or dismissive interactions' }, NOT_OBSERVED],
  },
  {
    id: 'understanding',
    codes: ['3d'],
    title: 'Student understanding',
    text: 'Among the students whose work or responses you checked, how many showed understanding of the lesson?',
    options: [{ key: 'most', label: 'Most' }, { key: 'some', label: 'Some' }, { key: 'few', label: 'Few' }, NOT_OBSERVED],
  },
  {
    id: 'physical',
    codes: ['2e'],
    title: 'Physical organization',
    text: 'Did the room layout, visibility, and access to materials support student participation?',
    options: [{ key: 'yes', label: 'Yes' }, { key: 'partly', label: 'Partly' }, { key: 'no', label: 'No' }, NOT_OBSERVED],
  },
  {
    id: 'engagement',
    codes: ['3c'],
    title: 'Student engagement',
    text: 'About how many students were actively participating in the learning task?',
    options: [{ key: 'all', label: 'All or almost all' }, { key: 'most', label: 'Most' }, { key: 'half', label: 'About half' }, { key: 'few', label: 'Few' }, NOT_OBSERVED],
  },
]

/// The question that speaks to a component, if any.
export function questionFor(code: string): ObservationQuestion | null {
  return OBSERVATION_QUESTIONS.find((q) => q.codes.includes(code)) ?? null
}

export const OBSERVATION_NOTE_MAX = 600
export const OBSERVATION_NOTES_MAX = 60
export const OBSERVATION_CLOSING_MAX = 1500
export const OBSERVATION_COMMENTS_MAX = 3000

/// Only answers to the five questions (keyed by question id), each one of its own options.
export function readAnswers(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const q of OBSERVATION_QUESTIONS) {
    const v = (raw as Record<string, unknown>)[q.id]
    if (typeof v === 'string' && q.options.some((o) => o.key === v)) out[q.id] = v
  }
  return out
}

export type ObservationNote = { atSec: number; text: string; code: string | null }

// Notes can be tagged with any component of Domains 2 and 3, asked about or not.
const CODES = new Set(['2a', '2b', '2c', '2d', '2e', '3a', '3b', '3c', '3d', '3e'])

export function readNotes(raw: unknown): ObservationNote[] {
  if (!Array.isArray(raw)) return []
  const out: ObservationNote[] = []
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue
    const text = typeof (n as { text?: unknown }).text === 'string' ? (n as { text: string }).text.trim().slice(0, OBSERVATION_NOTE_MAX) : ''
    if (!text) continue
    const at = Number((n as { atSec?: unknown }).atSec)
    const code = (n as { code?: unknown }).code
    out.push({ atSec: Number.isFinite(at) && at >= 0 ? Math.round(at) : 0, text, code: typeof code === 'string' && CODES.has(code) ? code : null })
    if (out.length >= OBSERVATION_NOTES_MAX) break
  }
  return out.sort((a, b) => a.atSec - b.atSec)
}

// ---- the recording ----

export type ObservationUtterance = { speaker: number; startSec: number; endSec: number; text: string }

/// The supervisor's phone can't be told who the teacher is, so the voice
/// that spoke the most words is taken as the teacher. Speaker-dependent
/// counts (talk share, follow-ups) are then left out of the prompt: on a
/// phone at the back of the room that guess is the first thing to fail.
export function observationSegments(utterances: ObservationUtterance[]): Segment[] {
  const words = new Map<number, number>()
  for (const u of utterances) words.set(u.speaker, (words.get(u.speaker) ?? 0) + u.text.split(/\s+/).filter(Boolean).length)
  const teacher = [...words.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return utterances.map((u) => ({ speakerLabel: u.speaker === teacher ? 'Teacher' : 'Student', startSec: u.startSec, endSec: u.endSec, text: u.text }))
}

const SAFE_FACT = /^(Recording length|Questions left with students|Checks for understanding|Responses to students|Activities set up|Redirections)/

export function observationEvidence(utterances: ObservationUtterance[] | null): { items: RubricEvidenceItem[]; facts: string[] } {
  if (!utterances || utterances.length === 0) return { items: [], facts: [] }
  const segments = observationSegments(utterances)
  const analysis = analyzeTranscript(segments)
  const durationSec = Math.round(Math.max(...segments.map((s) => s.endSec)))
  const evidence = buildRubricEvidence({
    ...analysis,
    durationSec,
    lessonContent: detectLessonContent(segments, analysis.phases),
    segments,
  } as Parameters<typeof buildRubricEvidence>[0])
  return { items: evidence.items.slice(0, 45), facts: evidence.facts.filter((f) => SAFE_FACT.test(f)) }
}

// ---- the report ----

export type ObservationSource = 'observed' | 'note' | 'recording' | 'plan'

export type ObservationComponent = {
  code: string
  name: string
  domain: string
  /// What Wivoza suggested. Null = not enough evidence from any source.
  suggestedLevel: RubricLevel | null
  /// The supervisor's level; starts as the suggestion.
  level: RubricLevel | null
  reason: string
  /// The supervisor's answer to this component's question, as shown.
  observed: { question: string; answer: string } | null
  notes: ObservationNote[]
  recording: RubricEvidenceItem[]
  /// Where the recording and what was seen point different ways.
  disagreement: string | null
  nextStep: string | null
}

export type ObservationReport = {
  version: 1
  generatedAt: string
  frameworkName: string
  about: string
  planVsLesson: string | null
  planning: PlanningComponent[] | null
  components: ObservationComponent[]
  /// The supervisor's overall comments, written before sending.
  comments: string | null
  /// No usable recording: the report rests on what was seen and the plan.
  recordingMissing: boolean
}

export function componentDefs(): { code: string; name: string; domain: string; listensFor: string }[] {
  const framework = RUBRIC_FRAMEWORKS.danielson_2022
  const all = [
    ...framework.components.map((c) => ({ code: c.code, name: c.name, domain: c.domain, listensFor: c.listensFor })),
    ...framework.notObservable.map((c) => ({ code: c.code, name: c.name, domain: c.domain, listensFor: 'nothing: only the observer can see this' })),
  ]
  return all.sort((a, b) => a.code.localeCompare(b.code))
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export function buildObservationPrompt(input: {
  evidence: { items: RubricEvidenceItem[]; facts: string[] }
  answers: Record<string, string>
  notes: ObservationNote[]
  closingNote: string | null
  plan: PlanSection[] | null
  context: { subject: string | null; grade: string | null; lessonTitle: string | null; durationSec: number | null }
  sharedRules: string
}): string {
  const defs = componentDefs()
  const levelWords = Object.values(RUBRIC_LEVEL_NAMES).map((w) => w.toLowerCase()).join(', ')
  const answerLines = OBSERVATION_QUESTIONS.map((q) => {
    const key = input.answers[q.id]
    const option = q.options.find((o) => o.key === key)
    return `${q.codes.join(' and ')} (${q.title}) — "${q.text}" Observer's answer: ${option ? option.label : 'not answered'}`
  }).join('\n')
  const noteLines = input.notes.map((n, i) => `N${i + 1} (${clock(n.atSec)}${n.code ? `, tagged ${n.code}` : ''}) ${n.text}`).join('\n')
  const lesson = [input.context.grade ? `grade ${input.context.grade}` : null, input.context.subject, input.context.lessonTitle ? `"${input.context.lessonTitle}"` : null].filter(Boolean).join(' ')

  return `You are a fair, practical instructional coach helping a school supervisor write up a classroom observation through Domains 2 and 3 of the Danielson Framework for Teaching (2022). The supervisor was in the room; Wivoza recorded the audio. You combine both into a draft. The supervisor reviews every level, changes any they disagree with, and decides what the teacher receives.
${lesson ? `\nThe lesson: ${lesson}${input.context.durationSec ? `, observed for about ${Math.max(1, Math.round(input.context.durationSec / 60))} minutes` : ''}.\n` : ''}
Your sources, and what each can show:
- RECORDING: numbered moments [1], [2]... are exact quotes from an automatic transcript. They show what was said: questions, explanations, directions, feedback, redirections. The recorder was the supervisor's device, so quiet students and pair talk are often missing, and who is the teacher was guessed from the most frequent voice.
- OBSERVED: the supervisor's answers to five questions about what audio can't capture. Classroom management speaks to both 2c and 2d. 2b, 3a, 3b and 3e have no question: for those, rely on the recording and the notes.
- NOTES: what the supervisor wrote while observing, numbered N1, N2..., with the minute they were written.
- CLOSING NOTE: anything else the supervisor saw.
${input.plan ? '- PLAN: the teacher\'s lesson plan, used here only to compare what was planned with what happened.\n' : ''}
How to weigh them:
- For what can only be seen (2a body language and peer interactions, 2c routines and materials, 2d nonverbal behavior, 2e the room, 3c who was working, 3d student work), the supervisor's answer and notes carry the most weight.
- For what can be heard (3a explanations, 3b questioning, 3d spoken checks and feedback), the recording carries the most weight, with the supervisor's answer adding what audio missed.
- When the recording and what the supervisor saw point different ways, do not average them. Say so in <disagreement> in one sentence, and lean the level toward the source that can actually see or hear that part of the component.
- "Not observed" is not evidence either way.
- For 3b, pair and group talk rarely reaches the microphone: a quiet recording is not evidence that students weren't discussing. Use the notes when they describe it.

The levels, judged on this one lesson:
1 ${RUBRIC_LEVEL_NAMES[1]}: what was seen or heard works against this component.
2 ${RUBRIC_LEVEL_NAMES[2]}: the component is attempted, but unevenly or only in part.
3 ${RUBRIC_LEVEL_NAMES[3]}: the component is consistently and clearly present.
4 ${RUBRIC_LEVEL_NAMES[4]}: everything in 3, and students themselves carry part of it (they run routines, build on each other's ideas, check their own work).
Rules:
- Give a level only when at least one source bears on the component (a cited moment, a cited note, or an answer that is evidence). Otherwise the level is not_enough. That is better than a guess.
- Never put a level number or a level word (${levelWords}, unsatisfactory, basic, proficient, distinguished, effective) in <reason>, <disagreement> or <next_step>.
- <reason> names its sources plainly, for example "From the recording, most questions asked students to explain; you noted pairs stayed on task."
- Write to the supervisor about the teacher, in the third person ("the teacher"). Never name or describe an individual student.

The components:
${defs.map((d) => `${d.code} ${d.name}: from audio, look only at ${d.listensFor}.`).join('\n')}

OBSERVED (the five questions):
${answerLines}

NOTES:
${noteLines || '- None.'}

CLOSING NOTE:
${input.closingNote?.trim() || '- None.'}

RECORDING, automatic counts (estimates):
${input.evidence.facts.length ? input.evidence.facts.map((f) => `- ${f}`).join('\n') : '- None available.'}

RECORDING, numbered moments:
${input.evidence.items.length ? input.evidence.items.map((m, i) => `[${i + 1}] (${clock(m.timestampSec)}, ${m.kind}) ${m.text}`).join('\n') : '- No usable recording. Rely on what the supervisor saw; never invent anything that might have been said.'}
${
  input.plan
    ? `\nPLAN, in numbered sections:\n${input.plan.map((s, i) => `(${i + 1}) ${s.ref}: ${s.text.slice(0, 1200)}`).join('\n')}\n`
    : ''
}
Write, in this order:
<about>2-3 sentences (60 words at most) on what the lesson was about and how it was organised, from the sources only.</about>
<plan_vs_lesson>${input.plan ? '2-3 sentences (60 words at most): where the lesson followed the plan and where it changed, including whether the plan\'s goal showed up in what students said or in the supervisor\'s answer to 3a. Never guess what happened outside the sources.' : 'none'}</plan_vs_lesson>
Then for every component above, in order, exactly one block:
<component>
<code>2a</code>
<recording>up to 3 moment numbers, comma-separated, or none</recording>
<notes>note numbers such as N2, N5, or none</notes>
<level>1, 2, 3, 4, or not_enough</level>
<reason>1-2 sentences (45 words at most) naming the sources behind the level.</reason>
<disagreement>one sentence, or none</disagreement>
<next_step>one small, concrete practice for the teacher to try (30 words at most), or none if the evidence is too thin</next_step>
</component>

Use moment and note numbers only inside <recording> and <notes>; never write them anywhere else. Don't invent a moment, a note or a detail. Plain text only, no markdown.
${input.sharedRules}`
}

function parseRefs(raw: string | null, prefix: '' | 'N', max: number): number[] {
  const out: number[] = []
  for (const m of (raw ?? '').matchAll(prefix ? /N\s*(\d+)/gi : /\d+/g)) {
    const i = Number(m[1] ?? m[0]) - 1
    if (i >= 0 && i < max && !out.includes(i)) out.push(i)
    if (out.length >= 3) break
  }
  return out
}

function noneToNull(text: string | null): string | null {
  const t = text?.trim()
  return t && !/^none\.?$/i.test(t) ? stripMomentReferences(t.replace(/\bN\d+\b/g, '').replace(/\s{2,}/g, ' ').trim()) : null
}

/// Fail closed: a level needs a cited moment, a cited note, or an answer that
/// is evidence. Whatever the model wrote, a level with none of them is "not
/// enough evidence".
export function parseObservationReport(
  text: string,
  input: { items: RubricEvidenceItem[]; answers: Record<string, string>; notes: ObservationNote[]; recordingMissing: boolean; planning: PlanningComponent[] | null },
): ObservationReport | null {
  const blocks = new Map<string, string>()
  for (const block of text.match(/<component>[\s\S]*?<\/component>/g) ?? []) {
    const code = extractTag(block, 'code')?.toLowerCase().trim()
    if (code && !blocks.has(code)) blocks.set(code, block)
  }
  const components: ObservationComponent[] = []
  for (const def of componentDefs()) {
    const block = blocks.get(def.code)
    const question = questionFor(def.code)
    const option = question?.options.find((o) => o.key === input.answers[question.id])
    const recording = block ? parseRefs(extractTag(block, 'recording'), '', input.items.length).map((i) => input.items[i]) : []
    const notes = block ? parseRefs(extractTag(block, 'notes'), 'N', input.notes.length).map((i) => input.notes[i]) : []
    // A note the supervisor tagged with this component always sits with it.
    for (const n of input.notes) if (n.code === def.code && !notes.includes(n)) notes.push(n)
    notes.sort((a, b) => a.atSec - b.atSec)
    const hasEvidence = recording.length > 0 || notes.length > 0 || (option != null && !option.noEvidence)
    const raw = block ? extractTag(block, 'level')?.trim().match(/^[1-4]\b/) : null
    const level = hasEvidence && raw ? (Number(raw[0]) as RubricLevel) : null
    components.push({
      code: def.code,
      name: def.name,
      domain: def.domain,
      suggestedLevel: level,
      level,
      reason: noneToNull(block ? extractTag(block, 'reason') : null) ?? 'There was too little from the recording, your answers or your notes to judge this component.',
      observed: question && option ? { question: question.text, answer: option.label } : null,
      notes,
      recording,
      disagreement: block ? noneToNull(extractTag(block, 'disagreement')) : null,
      nextStep: block ? noneToNull(extractTag(block, 'next_step')) : null,
    })
  }
  if (blocks.size < 7) return null
  const about = noneToNull(extractTag(text, 'about'))
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    frameworkName: RUBRIC_FRAMEWORKS.danielson_2022.name,
    about: about ?? '',
    planVsLesson: noneToNull(extractTag(text, 'plan_vs_lesson')),
    planning: input.planning,
    components,
    comments: null,
    recordingMissing: input.recordingMissing,
  }
}
