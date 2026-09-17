// Rubric Lens: the evidence a lesson recording already produced, organised
// under a teaching framework's components. Framework-neutral on purpose —
// the evidence below is gathered once from the session's existing logs, and
// a framework is only a list of components that evidence gets mapped onto,
// so adding Marzano or a state rubric later means adding one more entry to
// RUBRIC_FRAMEWORKS, not a second analysis.
//
// Never a rating. Component names are cited so a teacher can find their
// place in their own evaluation rubric; every description here is our own
// wording, never the framework's level descriptors.

import type {
  CfuLogEntry,
  DirectiveLogEntry,
  FeedbackLogEntry,
  QuestionLogEntry,
  RedirectionLogEntry,
  Segment,
  ToneLogEntry,
} from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'

export type RubricAudibility = 'strong' | 'partial'

export type RubricComponentDef = {
  code: string
  name: string
  domain: string
  audibility: RubricAudibility
  // What a recording can reasonably show for this component — handed to
  // Claude as the scope it's allowed to comment on.
  listensFor: string
}

export type RubricFramework = {
  id: string
  name: string
  components: RubricComponentDef[]
  // Components the framework has but audio can't speak to at all — shown to
  // the teacher as "not in a recording", never sent to Claude.
  notObservable: { code: string; name: string; domain: string; reason: string }[]
}

const LEARNING_ENVIRONMENTS = 'Domain 2: Learning Environments'
const LEARNING_EXPERIENCES = 'Domain 3: Learning Experiences'

export const RUBRIC_FRAMEWORKS: Record<string, RubricFramework> = {
  danielson_2022: {
    id: 'danielson_2022',
    name: 'Danielson Framework for Teaching (2022)',
    components: [
      {
        code: '2a',
        name: 'Cultivating Respectful and Affirming Environments',
        domain: LEARNING_ENVIRONMENTS,
        audibility: 'partial',
        listensFor: 'the tone of teacher language toward students, encouraging or corrective phrasing, and how students are addressed',
      },
      {
        code: '2b',
        name: 'Fostering a Culture for Learning',
        domain: LEARNING_ENVIRONMENTS,
        audibility: 'partial',
        listensFor: 'spoken expectations about effort, persistence and quality of work, and praise that names what a student did',
      },
      {
        code: '2c',
        name: 'Maintaining Purposeful Environments',
        domain: LEARNING_ENVIRONMENTS,
        audibility: 'partial',
        listensFor: 'task instructions, transitions between activities, and how directions are given',
      },
      {
        code: '2d',
        name: 'Supporting Positive Student Behavior',
        domain: LEARNING_ENVIRONMENTS,
        audibility: 'partial',
        listensFor: 'redirections: how often, how they were phrased, and whether they kept the lesson moving',
      },
      {
        code: '3a',
        name: 'Communicating About Purpose and Content',
        domain: LEARNING_EXPERIENCES,
        audibility: 'strong',
        listensFor: 'a stated learning goal, clear explanations, defined vocabulary, and connections to what students already know',
      },
      {
        code: '3b',
        name: 'Using Questioning and Discussion Techniques',
        domain: LEARNING_EXPERIENCES,
        audibility: 'strong',
        listensFor: 'the mix of recall and higher-order questions, wait time, follow-up questions, and how much students talked',
      },
      {
        code: '3c',
        name: 'Engaging Students in Learning',
        domain: LEARNING_EXPERIENCES,
        audibility: 'partial',
        listensFor: 'how much and how often students spoke, and what the spoken tasks asked them to do',
      },
      {
        code: '3d',
        name: 'Using Assessment for Learning',
        domain: LEARNING_EXPERIENCES,
        audibility: 'strong',
        listensFor: 'checks for understanding and how specific the feedback to students was',
      },
      {
        code: '3e',
        name: 'Responding Flexibly to Student Needs',
        domain: LEARNING_EXPERIENCES,
        audibility: 'partial',
        listensFor: 'moments where the teacher adjusted after a student response, such as a follow-up, a re-explanation, or a new example',
      },
    ],
    notObservable: [
      {
        code: '2e',
        name: 'Organizing Spaces for Learning',
        domain: LEARNING_ENVIRONMENTS,
        reason: 'Room arrangement and materials are visual, so a recording can\'t show them.',
      },
    ],
  },
}

export const DEFAULT_RUBRIC_FRAMEWORK = 'danielson_2022'

export type RubricEvidenceItem = {
  kind: string
  timestampSec: number
  text: string
}

export type RubricLensComponent = {
  code: string
  name: string
  domain: string
  audibility: RubricAudibility
  summary: string
  nextStep: string | null
  evidence: RubricEvidenceItem[]
}

export type RubricLensResult = {
  framework: string
  frameworkName: string
  generatedAt: string
  components: RubricLensComponent[]
  notObservable: RubricFramework['notObservable']
}

type SessionEvidenceSource = {
  durationSec: number | null
  teacherTalkPct: number | null
  studentTalkPct: number | null
  metricsDetail: unknown
  questionLog: unknown
  cfuLog: unknown
  feedbackLog: unknown
  directiveLog: unknown
  toneLog: unknown
  redirectionLog: unknown
  lessonContent: unknown
  segments: Segment[]
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = items.length / max
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)])
}

function clip(text: string, maxChars = 240): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed
}

// Numbered moments Claude may cite, plus plain counts it may mention. Every
// quote a teacher later sees comes from this list by number, so nothing in
// the finished lens can be a paraphrase passed off as a quote.
export function buildRubricEvidence(session: SessionEvidenceSource): { items: RubricEvidenceItem[]; facts: string[] } {
  const items: RubricEvidenceItem[] = []
  const push = (kind: string, timestampSec: number, text: string) => {
    if (text.trim()) items.push({ kind, timestampSec, text: clip(text) })
  }

  const questions = asArray<QuestionLogEntry>(session.questionLog)
  const higherOrder = questions.filter((q) => q.type === 'higher_order')
  const recall = questions.filter((q) => q.type === 'recall')
  for (const q of spread(higherOrder, 6)) {
    const wait = q.waitTimeSec != null ? `, about ${q.waitTimeSec.toFixed(1)}s before a student answered` : ''
    push(`Higher-order question${wait}`, q.timestampSec, q.text)
  }
  for (const q of spread(recall, 4)) {
    const wait = q.waitTimeSec != null ? `, about ${q.waitTimeSec.toFixed(1)}s before a student answered` : ''
    push(`Recall question${wait}`, q.timestampSec, q.text)
  }
  for (const q of spread(questions.filter((q) => q.followUps?.length), 3)) {
    const followUp = q.followUps[0]
    push('Follow-up question after a student response', followUp.timestampSec, followUp.text)
  }

  for (const c of spread(asArray<CfuLogEntry>(session.cfuLog), 5)) {
    push(`Check for understanding (${c.whatItChecked})`, c.timestampSec, c.text)
  }

  const feedback = asArray<FeedbackLogEntry>(session.feedbackLog)
  for (const f of spread(feedback.filter((f) => f.kind === 'specific'), 4)) push('Specific feedback', f.timestampSec, f.text)
  for (const f of spread(feedback.filter((f) => f.kind === 'generic'), 2)) push('General praise', f.timestampSec, f.text)

  for (const d of spread(asArray<DirectiveLogEntry>(session.directiveLog), 4)) push('Task instruction', d.timestampSec, d.text)

  const tone = asArray<ToneLogEntry>(session.toneLog)
  for (const t of spread(tone.filter((t) => t.kind === 'positive'), 3)) push('Encouraging language', t.timestampSec, t.text)
  for (const t of spread(tone.filter((t) => t.kind === 'corrective'), 3)) push('Corrective language', t.timestampSec, t.text)

  for (const r of spread(asArray<RedirectionLogEntry>(session.redirectionLog), 4)) push('Redirection', r.timestampSec, r.text)

  const content = session.lessonContent as {
    statedObjective?: { found: boolean | null; quote: string | null; timestampSec: number | null }
    connections?: { quote: string; timestampSec: number }[]
    vocabulary?: { quote: string; timestampSec: number }[]
  } | null
  if (content?.statedObjective?.found && content.statedObjective.quote) {
    push('Stated learning goal', content.statedObjective.timestampSec ?? 0, content.statedObjective.quote)
  }
  for (const c of spread(content?.connections ?? [], 3)) push('Connection to prior knowledge or the real world', c.timestampSec, c.quote)
  for (const v of spread(content?.vocabulary ?? [], 3)) push('Vocabulary defined', v.timestampSec, v.quote)

  // The longest student turns — the best audio proxy for what students were
  // actually asked to think and talk about.
  const studentTurns = session.segments
    .filter((s) => s.speakerLabel === 'Student' && s.text.trim().split(/\s+/).length >= 6)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 4)
  for (const s of studentTurns) push('Student response', s.startSec, s.text)

  // The same line can land in two logs (praise that is also encouraging
  // language) — one moment, both labels, so Claude can't cite it twice.
  const merged = new Map<string, RubricEvidenceItem>()
  for (const item of items) {
    const key = `${item.timestampSec}|${item.text}`
    const existing = merged.get(key)
    if (existing) existing.kind = `${existing.kind} · ${item.kind}`
    else merged.set(key, { ...item })
  }
  const moments = [...merged.values()].sort((a, b) => a.timestampSec - b.timestampSec)

  const detail = (session.metricsDetail ?? {}) as Record<string, number | null | undefined>
  const facts: string[] = []
  if (session.durationSec) facts.push(`Recording length: about ${Math.round(session.durationSec / 60)} minutes.`)
  if (session.teacherTalkPct != null && session.studentTalkPct != null && (detail.studentVoiceSegments ?? 0) > 0) {
    facts.push(
      `Estimated talk time: teacher about ${Math.round(session.teacherTalkPct)}%, students about ${Math.round(session.studentTalkPct)}% (students far from the microphone are often under-counted).`,
    )
  }
  if (questions.length > 0) {
    facts.push(`Questions detected: ${questions.length} (${higherOrder.length} higher-order, ${recall.length} recall).`)
  }
  if ((detail.waitTimeSampleCount ?? 0) >= 3) {
    const waits = questions.map((q) => q.waitTimeSec).filter((w): w is number => w != null)
    if (waits.length > 0) {
      const avg = waits.reduce((sum, w) => sum + w, 0) / waits.length
      facts.push(`Average wait time after a question: about ${avg.toFixed(1)}s across ${waits.length} questions.`)
    }
  }
  if (detail.followUpQuestionCount != null) facts.push(`Follow-up questions after student responses: ${detail.followUpQuestionCount}.`)
  if (detail.specificFeedbackCount != null && detail.genericFeedbackCount != null) {
    facts.push(`Feedback moments: ${detail.specificFeedbackCount} specific, ${detail.genericFeedbackCount} general praise.`)
  }
  if (detail.transitionCount != null) facts.push(`Spoken transitions between activities: ${detail.transitionCount}.`)
  if (detail.redirectionCount != null) facts.push(`Redirections detected: ${detail.redirectionCount}.`)
  if (detail.longestTeacherMonologueSec != null && detail.longestTeacherMonologueSec >= 60) {
    facts.push(`Longest stretch of uninterrupted teacher talk: about ${Math.round(detail.longestTeacherMonologueSec / 60)} minutes.`)
  }

  return { items: moments, facts }
}

export function buildRubricLensSystemPrompt(
  framework: RubricFramework,
  evidence: { items: RubricEvidenceItem[]; facts: string[] },
  sharedRules: string,
): string {
  const componentLines = framework.components
    .map((c) => `${c.code} ${c.name}: from audio, look only at ${c.listensFor}.`)
    .join('\n')

  return `You are a warm, practical instructional coach helping a teacher see their own recorded lesson through the ${framework.name}, the framework their school uses for evaluation. This is for the teacher's own reflection only. Nobody else sees it.

You are organizing evidence, not evaluating. Never assign, suggest, or hint at a performance level for any component, and never use the framework's level names (such as unsatisfactory, basic, proficient, distinguished, or effective) in any form.

You only have an automatic audio transcript. You can't see the room, the board, student work, or anything nonverbal, and phrase-based detection misses things. When evidence for a component is thin, say plainly what the recording could and couldn't show, and never treat missing evidence as a sign that something didn't happen.

The components, and what a recording can show for each:
${componentLines}

Automatic counts from this recording (estimates, safe to mention):
${evidence.facts.length > 0 ? evidence.facts.map((f) => `- ${f}`).join('\n') : '- None available.'}

Numbered moments from the recording, each an exact quote:
${evidence.items.map((item, i) => `[${i + 1}] (${item.kind}) ${item.text}`).join('\n')}

For every component listed above, in the same order, write exactly one block:
<component>
<code>the component code, e.g. 3b</code>
<evidence>up to 3 moment numbers that best show this component, comma-separated, or none</evidence>
<summary>1-2 sentences describing what the recording shows for this component, grounded in the cited moments and counts. If there is little or no evidence, say what audio couldn't capture here.</summary>
<next_step>One concrete, small practice to try in a future lesson that builds on what was heard. Write none if the evidence is too thin to suggest anything specific.</next_step>
</component>

Refer to moments only by number inside <evidence>. Don't quote or restate them in the summary, and don't invent a moment, number, or detail. The same moment may support more than one component.

Write in plain text only, no markdown.
${sharedRules}`
}

export function parseRubricLens(
  text: string,
  framework: RubricFramework,
  items: RubricEvidenceItem[],
): RubricLensComponent[] {
  const byCode = new Map<string, { summary: string; nextStep: string | null; evidence: RubricEvidenceItem[] }>()
  for (const block of text.match(/<component>[\s\S]*?<\/component>/g) ?? []) {
    const code = extractTag(block, 'code')?.toLowerCase()
    const summary = extractTag(block, 'summary')
    if (!code || !summary || byCode.has(code)) continue
    const evidenceStr = extractTag(block, 'evidence') ?? ''
    const seen = new Set<number>()
    const evidence: RubricEvidenceItem[] = []
    for (const match of evidenceStr.matchAll(/\d+/g)) {
      const index = Number.parseInt(match[0], 10) - 1
      if (seen.has(index) || !items[index]) continue
      seen.add(index)
      evidence.push(items[index])
      if (evidence.length >= 3) break
    }
    const nextStep = extractTag(block, 'next_step')
    byCode.set(code, {
      summary,
      nextStep: nextStep && nextStep.toLowerCase() !== 'none' ? nextStep : null,
      evidence,
    })
  }

  return framework.components.flatMap((def) => {
    const parsed = byCode.get(def.code)
    if (!parsed) return []
    return [{ code: def.code, name: def.name, domain: def.domain, audibility: def.audibility, ...parsed }]
  })
}
