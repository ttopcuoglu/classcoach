// The Summary headline: two or three sentences naming the ONE pattern that
// runs across the report's sections — "you opened a lot of doors today;
// students rarely got to walk through them" — rather than four summaries
// stacked.
//
// Written from the facts the sections themselves show, and checked before it
// is kept: every number in it must be one of those facts, it may not judge
// ("poor", "weak", "failed"), claim what students felt or understood, or name
// a rubric. A headline that fails twice is not shown; the lesson summary
// stands in.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { QuestionLogEntry } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { scoredDirections } from './routines.ts'

export type HeadlineFacts = {
  subject: string | null
  /// Share of the recording that came through as speech. Below half, the
  /// talk share says more about the microphone than the lesson and is left
  /// out.
  capturedPct: number | null
  talkPct: number | null
  invitations: number | null
  questionsTotal: number
  questionsBeyondRecall: number
  questionsReasoning: number
  answersHeard: number | null
  answersFollowedUp: number | null
  stages: string[]
  explanations: number | null
  keyTermsTotal: number
  keyTermsStudentsUsed: number
  directionsTotal: number
  directionsComplete: number
  redirectionsTotal: number
  redirectionsActionable: number
}

const KIND_TO_MIX: Record<string, 'recall' | 'explain' | 'reasoning'> = {
  recall: 'recall',
  explain: 'explain',
  justify: 'reasoning',
  compare: 'reasoning',
  evaluate: 'reasoning',
}

/// The facts, from the stored report, counted the way the page counts them.
export function headlineFacts(session: {
  durationSec: number | null
  teacherTalkPct: number | null
  questionLog: unknown
  teachingMoves: unknown
  metricsDetail: unknown
  lessonContent: unknown
}): HeadlineFacts {
  const moves = (session.teachingMoves ?? {}) as Record<string, any>
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>
  const content = (session.lessonContent ?? {}) as Record<string, any>
  const log = (Array.isArray(session.questionLog) ? session.questionLog : []) as QuestionLogEntry[]
  const kinds = (Array.isArray(moves.questionKinds) ? moves.questionKinds : []) as { timestampSec: number; kind: string }[]
  const mix = log.map((q) => {
    const k = kinds.find((x) => Math.abs(x.timestampSec - q.timestampSec) <= 4)?.kind
    return k ? (KIND_TO_MIX[k] ?? 'recall') : q.type === 'higher_order' ? 'explain' : 'recall'
  })
  // Only directions that start or change work are held to the four parts.
  const directions = scoredDirections(
    (Array.isArray(moves.directions) ? moves.directions : []) as { parts: string[]; timestampSec?: number }[],
    moves.routines?.directionTypes,
  )
  const redirections = (Array.isArray(moves.redirections) ? moves.redirections : []) as { clarity: string }[]
  const keyTerms = (Array.isArray(content.keyTerms) ? content.keyTerms : []) as { studentCount: number }[]
  const invites = moves.participation?.invitations ?? moves.invitations
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  // Counted as the coverage strip counts it (web lib/reportConfidence.ts).
  const recordedSec = session.durationSec ?? num(detail.totalDurationSec) ?? 0
  const spokenSec = (num(detail.teacherTalkSec) ?? 0) + (num(detail.studentTalkSec) ?? 0)
  return {
    subject: typeof content.subject === 'string' ? content.subject : null,
    capturedPct: recordedSec > 0 && spokenSec > 0 ? Math.round((spokenSec / recordedSec) * 100) : null,
    talkPct: session.teacherTalkPct != null ? Math.round(session.teacherTalkPct) : null,
    invitations: Array.isArray(invites) ? invites.length : null,
    questionsTotal: log.length,
    questionsBeyondRecall: mix.filter((m) => m !== 'recall').length,
    questionsReasoning: mix.filter((m) => m === 'reasoning').length,
    answersHeard: num(detail.answersHeardCount),
    answersFollowedUp: num(detail.answersFollowedUpCount),
    stages: Array.isArray(moves.arc) ? moves.arc.map((s: { title: string }) => s.title) : [],
    explanations: Array.isArray(moves.explanations) ? moves.explanations.length : null,
    keyTermsTotal: keyTerms.length,
    keyTermsStudentsUsed: keyTerms.filter((t) => t.studentCount > 0).length,
    directionsTotal: directions.length,
    directionsComplete: directions.filter((d) => d.parts.length === 4).length,
    redirectionsTotal: redirections.length,
    redirectionsActionable: redirections.filter((r) => r.clarity === 'actionable').length,
  }
}

/// The facts as the model sees them — only what was measured.
export function factsText(f: HeadlineFacts): string {
  const lines: string[] = []
  if (f.subject) lines.push(`Subject: ${f.subject}`)
  if (f.stages.length) lines.push(`How the lesson moved: ${f.stages.join(' → ')}`)
  const lowCapture = f.capturedPct != null && f.capturedPct < 50
  if (lowCapture) lines.push(`Coverage: ${f.capturedPct}% of the recording came through as speech, so these counts describe that part of the lesson`)
  else if (f.talkPct != null) lines.push(`Talk: the teacher's voice was ${f.talkPct}% of the recording (a low share means students were talking or working, not that the teacher held back)`)
  if (f.invitations != null) lines.push(`Invitations to participate: ${f.invitations}`)
  if (f.questionsTotal) lines.push(`Questions: ${f.questionsBeyondRecall} of ${f.questionsTotal} went beyond recall; ${f.questionsReasoning} asked students to justify, compare or judge`)
  if (f.answersHeard != null && f.answersFollowedUp != null && f.answersHeard >= 3) {
    lines.push(`Follow-ups: the teacher followed up on ${f.answersFollowedUp} of ${f.answersHeard} student answers the recording could hear`)
  }
  if (f.explanations != null) lines.push(`Examples, analogies and meanings given: ${f.explanations}`)
  if (f.keyTermsTotal) lines.push(`Key terms: ${f.keyTermsStudentsUsed} of ${f.keyTermsTotal} were heard from students`)
  if (f.directionsTotal) lines.push(`Directions: ${f.directionsComplete} of ${f.directionsTotal} named all four parts (task, steps, time, product)`)
  if (f.redirectionsTotal) lines.push(`Redirections: ${f.redirectionsActionable} of ${f.redirectionsTotal} told students what to do`)
  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a warm, plain-spoken instructional coach writing the opening of a lesson report for the teacher who taught it. From the FACTS, write 2 or 3 sentences that name the ONE pattern running across them — something true in more than one part of the lesson — and what it suggests next. The pattern is what links two or three facts from different parts — for example, questions that asked for thinking alongside answers that were seldom followed up; or clear directions alongside few chances for students to speak; or a lot of explaining alongside key terms students did not use yet. Say it in your own plain words, specific to this lesson and its subject; no metaphors.

Rules:
- Speak to the teacher as "you". Under 70 words.
- Use only numbers that appear in the FACTS, written exactly as they appear ("1 of 7", "34%"). Never compute a new number or a percentage.
- Never judge: no "poor", "weak", "failed", "should have", "lacked", "struggled".
- Never claim what students felt, thought, understood, learned, or how engaged they were.
- No rubric codes or framework names.
- Do not list every fact. Pick the pattern. Name one thing that went well where the facts show one.
- Do not put "only" or "just" in front of a number.
- If a Coverage line is present, start by saying the counts come from part of the lesson.

Then name the ONE section where the teacher's next step lies — the part of the lesson the pattern points to changing: talk (who talks and how students are brought in), questions (questions and follow-ups), content (explanations and key terms) or routines (directions and redirections).

Write nothing outside these tags:
<headline>
the sentences
</headline>
<section>talk, questions, content or routines</section>`

const BANNED = /\b(poor|poorly|weak|weakness|failed|fail(?:s|ing)?|should have|ineffective|lacked|lacking|struggled|struggling)\b/i
const STUDENT_STATE = /\bstudents?\s+(?:were|was|felt|feel|seemed|seem|understood|understand|engaged|enjoyed|learned|grasped|loved|were confused|were bored)\b/i
const MINIMISING = /\b(?:only|just|mere(?:ly)?)\s+\d/i
const METAPHOR = /\bdoors?\b|\bwalk through\b/i
const RUBRIC = /\b(?:domain|component)\s+\d|\bdanielson\b|\b[1-4][a-f]\b/i

/// Why a headline cannot be shown, or null when it can.
export function checkHeadline(text: string, facts: string): string | null {
  const words = text.trim().split(/\s+/).length
  if (words < 12 || words > 80) return `length ${words} words`
  if (!/[.!?]["”]?$/.test(text.trim())) return 'does not end as a sentence'
  if (BANNED.test(text)) return `banned word "${text.match(BANNED)![0]}"`
  if (STUDENT_STATE.test(text)) return `claim about students: "${text.match(STUDENT_STATE)![0]}"`
  if (RUBRIC.test(text)) return 'rubric reference'
  if (MINIMISING.test(text)) return `"${text.match(MINIMISING)![0]}" belittles a number`
  if (METAPHOR.test(text)) return 'metaphor'
  const allowed = new Set(facts.match(/\d+/g) ?? [])
  for (const n of text.match(/\d+/g) ?? []) if (!allowed.has(n)) return `number ${n} is not in the facts`
  return null
}

export const HEADLINE_SECTIONS = ['talk', 'questions', 'content', 'routines'] as const
export type HeadlineSection = (typeof HEADLINE_SECTIONS)[number]

/// `section` is where the pattern points the teacher's next step — the
/// Summary's default one focus. Absent on headlines written before it.
export type SummaryHeadline = { text: string; section?: HeadlineSection; generatedAt: string }

/// Null when there is too little to say, or both tries fail the checks.
export async function writeHeadline(facts: HeadlineFacts): Promise<SummaryHeadline | null> {
  const text = factsText(facts)
  if (text.split('\n').length < 3) return null
  let refusal: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        thinking: { type: 'disabled' },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `FACTS:\n${text}${refusal ? `\n\nYour last version could not be used: ${refusal}. Write it again within the rules.` : ''}`,
          },
        ],
      })
      const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      const headline = (extractTag(out, 'headline') ?? '').trim().replace(/\s+/g, ' ')
      refusal = checkHeadline(headline, text)
      const section = (extractTag(out, 'section') ?? '').trim().toLowerCase() as HeadlineSection
      if (!refusal) {
        return {
          text: headline,
          ...(HEADLINE_SECTIONS.includes(section) ? { section } : {}),
          generatedAt: new Date().toISOString(),
        }
      }
    } catch (error) {
      console.error('[summaryHeadline] read failed:', error)
      return null
    }
  }
  console.warn(`[summaryHeadline] not shown: ${refusal}`)
  return null
}
