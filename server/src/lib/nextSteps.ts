// "Try next time" for a report that was summarized before those lines existed.
//
// New reports get one line per Insights section from the class summary's own
// call (see buildClassSummarySystemPrompt). Older reports have the section
// notes and no lines, and rewriting a summary a teacher has already read just
// to add three sentences would change the words under them. So this reads the
// notes that are already stored — not the transcript — and writes only the
// lines. Each one has to follow from its note, which is the same rule the
// summary's call works under, and a note with nothing to act on gets none.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { CORE_COACHING_RULES } from './coachPersona.ts'
import { extractTag } from './extractTag.ts'

export type NextSteps = { talk?: string; questions?: string; climate?: string }

export type SectionNotes = {
  lessonSummary: string | null
  talk: string | null
  questions: string | null
  checks: string | null
  climate: string | null
}

/// One "next time" line, or null. NONE is the model declining, and anything
/// that ran long is a paragraph that wandered into a slot meant for a line.
export function nextStepLine(raw: string | null): string | null {
  const line = raw?.replace(/\s+/g, ' ').trim()
  if (!line || /^NONE\.?$/i.test(line) || line.length > 320) return null
  return line
}

export function parseNextSteps(text: string): NextSteps {
  const steps: NextSteps = {}
  for (const key of ['talk', 'questions', 'climate'] as const) {
    const line = nextStepLine(extractTag(text, `${key}_next`))
    if (line) steps[key] = line
  }
  return steps
}

const SYSTEM_PROMPT = `You are an instructional coach. A teacher has already read the notes below about three parts of one of their own lessons. For each part, write ONE concrete thing to do in the next lesson.

Each line follows directly from what that part's note says — the words to say or the task to set, specific to this lesson's material, 30 words at most, starting with a verb. "After your next 'why' question, give pairs thirty seconds before taking an answer." Not a principle, not "consider", and not a repeat of another part's line.

You have only the notes, not the lesson. Do not add facts the notes do not contain. Where a note says too little was heard, or describes nothing that needs changing, or is missing, write NONE: a made-up suggestion is worse than none, and most lessons will not earn all three.

Write nothing outside these tags:
<talk_next>one line, or NONE</talk_next>
<questions_next>one line, or NONE</questions_next>
<climate_next>one line, or NONE</climate_next>
${CORE_COACHING_RULES}`

export function buildNextStepsUserMessage(notes: SectionNotes): string {
  const part = (title: string, body: string | null) => `${title}:\n${body?.trim() || '(no note)'}`
  return [
    notes.lessonSummary ? `What the lesson covered: ${notes.lessonSummary.trim()}` : null,
    part('TALK & PARTICIPATION', notes.talk),
    part('QUESTIONING & CHECKING', [notes.questions, notes.checks].filter((n) => n?.trim()).join('\n\n') || null),
    part('CLIMATE & ROUTINES', notes.climate),
  ]
    .filter(Boolean)
    .join('\n\n')
}

/// Null when the call failed, so nothing is stored and a later view tries
/// again. An empty object is an answer — "nothing worth suggesting" — and is
/// stored, so the lesson is not read twice hoping for a different one.
export async function writeNextStepsFromNotes(notes: SectionNotes): Promise<NextSteps | null> {
  if (!notes.talk?.trim() && !notes.questions?.trim() && !notes.checks?.trim() && !notes.climate?.trim()) return {}
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      // Adaptive thinking draws on the same budget; left on, a short reply
      // can come back with no text blocks at all.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildNextStepsUserMessage(notes) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    if (!/<(talk|questions|climate)_next>/.test(text)) return null
    return parseNextSteps(text)
  } catch (error) {
    console.error('[nextSteps] failed:', error)
    return null
  }
}
