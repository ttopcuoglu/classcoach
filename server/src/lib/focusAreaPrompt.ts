import { FOCUS_AREAS, type FocusArea } from './focusAreas.ts'
import { COURSE_LEVEL_GUIDANCE, gradeBandLabel } from './teachingContext.ts'

// Composes the area-aware parts of the Ask / Practice system prompts.
//
// One prompt per concern with an injected area block, rather than four copies
// per concern: the coaching stance, the plain-text rule, and the tag contract
// are identical across all four areas — only the coach's domain, the standard
// being applied, and what counts as "something that happened" change. Four
// copies of each prompt would drift within a month.
//
// The scenario writer is the one genuine exception (see `scenarioAreaBlock`):
// what a practice scenario physically IS differs per area — an email, a piece
// of student work, a line a colleague said, a room that has stopped following
// an explanation — so that block carries real per-area instructions rather
// than a swapped noun.

/// Compact one-line-per-area reference, used when the teacher hasn't picked an
/// area and the coach has to work out which one this is.
const AREA_MENU = FOCUS_AREAS.map(
  (a) => `- ${a.value} (${a.label}): ${a.blurb} Judge against ${a.bestPractice}.`,
).join('\n')

const SUB_CATEGORY_MENU = FOCUS_AREAS.map(
  (a) => `- ${a.value}: ${a.subCategories.map((c) => c.value).join(', ')}`,
).join('\n')

/// Who the coach is and what they measure against, for the Ask and Practice
/// prompts alike.
export function coachIdentity(area: FocusArea | null): string {
  if (area) {
    return `You are a warm, practical ${area.coachRole}, working with K-12 teachers. Everything you say is judged against ${area.bestPractice}.`
  }
  return `You are a warm, practical instructional coach for K-12 teachers. Teachers bring you four different kinds of problem, and the right answer depends on which one this is:

${AREA_MENU}

Work out which area the teacher is actually in before you answer, and coach against that area's standard — not against classroom management by default.`
}

/// What "this already happened" looks like, for Ask's incident-vs-question fork.
export function incidentShape(area: FocusArea | null): string {
  if (area) return area.incidentShape
  return 'something that already happened — which, depending on the area, may be a moment in front of students, a lesson that fell flat, a grade they gave, an email they sent, or a conversation with a colleague'
}

/// The <focus_area> and <category> tag instructions. Ask always classifies,
/// even when the teacher picked an area, because the sub-category drives the
/// growth view and the practice suggestions.
export function classificationBlock(area: FocusArea | null): string {
  if (area) {
    return `<focus_area>
Output exactly: ${area.value}
</focus_area>
<category>
If this clearly fits one of these, output its exact value: ${area.subCategories.map((c) => c.value).join(', ')}. Otherwise output the literal word none. Output only the value, nothing else.
</category>`
  }
  return `<focus_area>
Which area this belongs to. Output exactly one of: ${FOCUS_AREAS.map((a) => a.value).join(', ')}. Output only the value, nothing else.
</focus_area>
<category>
The sub-category within that area, if one clearly fits — output its exact value from that area's list:
${SUB_CATEGORY_MENU}
If none of that area's sub-categories clearly fits (for example a general question), output the literal word none. Output only the value, nothing else.
</category>`
}

/// The standard the private 1-5 rating is scored against.
export function ratingStandard(area: FocusArea | null): string {
  return area ? area.bestPractice : "the best practice for whichever area you assigned above"
}

/// The per-area instructions for the scenario writer — the artifact shape, the
/// difficulty ladder, and the hard limits.
export function scenarioAreaBlock(area: FocusArea): string {
  return `Focus area: ${area.label}.

What a scenario in this area is:
${area.practiceArtifact}.

Difficulty:
${area.difficultyTiers}.

Hard limits for this area:
${area.safety}`
}

/// The teacher's room, so coaching and scenarios land somewhere real. Each
/// field narrows the one before it, and the level is the one that changes the
/// coaching most — the same Algebra 2 lesson in an honors section and in an
/// inclusion section are different problems.
export function teachingContextBlock(ctx: {
  gradeBand?: string | null
  subject?: string | null
  course?: string | null
  courseLevel?: string | null
}): string {
  const lines = [
    ctx.gradeBand ? `Grade band: ${gradeBandLabel(ctx.gradeBand)}` : null,
    ctx.subject ? `Subject: ${ctx.subject}` : null,
    ctx.course ? `Course: ${ctx.course}` : null,
    ctx.courseLevel ? `Level: ${ctx.courseLevel}` : null,
  ].filter(Boolean)
  if (lines.length === 0) return ''

  const levelNote = ctx.courseLevel ? COURSE_LEVEL_GUIDANCE[ctx.courseLevel] : null
  return `\n\nThis teacher's classroom:\n${lines.join('\n')}${
    levelNote ? `\n\nWhat that level means here: ${levelNote}` : ''
  }\nSet examples, analogies, and scenarios in this room — its content, its students, its constraints — rather than a generic classroom, and never contradict this context.`
}
