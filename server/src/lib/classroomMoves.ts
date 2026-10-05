// The moves that make up Climate & Routines, read from the transcript by
// Claude rather than matched against phrase lists.
//
// The lists in `audioAnalysis.ts` hold ten phrases each — "open your", "eyes
// on me", "good job" — and teachers do not speak in fixed phrases. A real
// twenty-minute lesson that told students to "grab your Chromebooks", to put
// homework away, and that announced the move to the simulation came back as
// five zeros, because none of those is on a list. A section reporting zero
// directions for a lesson full of them is worse than no section.
//
// Every quote is verified against the teacher's own speech before it is kept,
// the same way `lessonObjective.ts` verifies the objective: the model points
// at a moment, the transcript decides whether it happened.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { AnalysisResult, Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import {
  flattenTeacherSpeech,
  normalizeForMatch,
  parseQuotedLines,
  startSecAtOffset,
  transcriptForModel,
  type Quoted,
} from './lessonObjective.ts'

/// Per kind. These are counts as well as evidence, so the cap has to sit
/// above what a real lesson holds or the number silently becomes "the cap" —
/// a twenty-minute lesson already returned twelve directions. The report
/// shows a handful of them and counts the rest.
const MAX_PER_KIND = 25

export type ClassroomMoves = {
  directions: Quoted[]
  transitions: Quoted[]
  redirections: Quoted[]
  positive: Quoted[]
  corrective: Quoted[]
  checks: Checked[]
  feedbackSpecific: Quoted[]
  feedbackGeneral: Quoted[]
  higherOrderQuestions: Quoted[]
  recallQuestions: Quoted[]
  thinkingTasks: Checked[]
}

/// A check carries what it was checking, because "thumbs up" on its own tells
/// a teacher nothing about which idea they were taking the room's temperature on.
export type Checked = Quoted & { whatItChecked: string }

const EMPTY: ClassroomMoves = {
  directions: [], transitions: [], redirections: [], positive: [], corrective: [],
  checks: [], feedbackSpecific: [], feedbackGeneral: [],
  higherOrderQuestions: [], recallQuestions: [], thinkingTasks: [],
}

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording. Find five kinds of moment. Copy the teacher's sentence EXACTLY as it appears, and give the timestamp of the line it came from.

DIRECTIONS — telling students what to do with the work: "go into the back and grab your Chromebooks", "answer one through six", "put your name at the top". Task instructions, not questions about content.

TRANSITIONS — marking a move from one part of the lesson to the next: "I'm gonna go over a few things before I turn the Chromebooks over to you", "alright, let's come back together". The sentence that signals the shift, not the whole stretch.

REDIRECTIONS — bringing attention or behaviour back: "eyes up here", "I need everyone quiet", "put that away". Brief and directed at the room or at behaviour, never a content question.

POSITIVE — naming something a student or the class did well, or genuine encouragement. Short counts: "that's a good question", "exactly", "nice thinking" are all a teacher telling a student their contribution was worth something. So do longer ones: "that's exactly the connection I wanted", "you're already most of the way there". What does NOT count is filler that keeps the conversation moving without appraising anything — "okay", "yep", "alright", "thank you" said while taking a handout.

CORRECTIVE — telling a student an answer or an approach is not right yet: "not quite", "let's rethink that", "close, but look at the second step".

HIGHER-ORDER QUESTIONS — questions that ask for reasoning, not recall: why something happens, how two things relate, what would happen if, what the evidence is, how to defend a claim. Phrasing doesn't decide it — "so what's going on there?" asked about a model is higher-order; "what's the date today" is not.

RECALL QUESTIONS — questions asking for a fact, a definition, a name, or a number the class already has.

THINKING TASKS — things students were asked to DO that require reasoning rather than following steps: predict what a model will show and check it, compare two cases, explain their reasoning to a partner, work out a quantity from something they know. The sentence that sets the task, plus what students had to think about after a pipe. Procedural instructions ("grab your Chromebooks", "write your name") are not thinking tasks.

CHECKS — a move that asks students to show what they understand, so the teacher can see where they are: "does that make sense so far?", "thumbs up if you're with me", "turn and talk about what you'd predict", "show me on your whiteboards", a cold call, an exit ticket. A question that genuinely probes understanding counts; rhetorical filler ("right?", "okay?") does not, and neither does a procedural question ("does everyone have a Chromebook?"). For each one, add what it was checking after a pipe.

FEEDBACK — the teacher responding to something a student said or did, judged two ways. SPECIFIC feedback names what was right or wrong and why, or points at the part of the thinking that mattered: "yes — you used the 29.5 days to get there". GENERAL feedback is appraisal with nothing to act on: "good", "nice", "not quite". Include it whether or not the student is audible in the transcript. Bare acknowledgement is NOT feedback — "okay", "yep", "mhm", "thank you" keep a conversation moving without appraising anything, and a lesson where the teacher only ever said those has no feedback in it.

These are counted and trended across a teacher's lessons, so be exhaustive, not representative: list EVERY instance you find of each kind, in the order they happen. A lesson with ten directions in it comes back with ten, not with the three clearest. Stop only when you run out.

Rules that matter more than finding things:
- Copy sentences verbatim. A sentence the teacher did not say is dropped, and a quote that has been tidied up is a quote that gets dropped.
- A moment belongs to ONE kind. If it could be two, choose the one it most plainly is.
- NONE is a real answer for any kind, and is the right answer for most lessons in at least one of them. Never stretch a sentence to fill a category.
- Ignore anything a student said. You are reading the teacher only.

Write nothing outside these tags. Inside each, one sentence per line, each followed by " @ m:ss", or NONE:
<directions>
</directions>
<transitions>
</transitions>
<redirections>
</redirections>
<positive>
</positive>
<corrective>
</corrective>
<questions_higher_order>
</questions_higher_order>
<questions_recall>
</questions_recall>
<thinking_tasks>
one per line as: sentence @ m:ss | what students had to think about
</thinking_tasks>
<checks>
one per line as: sentence @ m:ss | what it checked
</checks>
<feedback_specific>
</feedback_specific>
<feedback_general>
</feedback_general>`

/// Best-effort, like every other model read in the analysis path: a failure
/// returns nothing and the caller keeps the phrase scan's answer.
///
/// One retry, because that fallback is the thing this exists to fix — a read
/// that comes back empty on a lesson full of directions hands the teacher the
/// five zeros again, and an empty read was seen once in testing.
export async function readClassroomMoves(segments: Segment[]): Promise<ClassroomMoves> {
  const first = await readOnce(segments)
  if (countMoves(first) > 0) return first
  return readOnce(segments)
}

export function countMoves(moves: ClassroomMoves): number {
  return moves.directions.length + moves.transitions.length + moves.redirections.length
    + moves.positive.length + moves.corrective.length + moves.checks.length
    + moves.feedbackSpecific.length + moves.feedbackGeneral.length
    + moves.higherOrderQuestions.length + moves.recallQuestions.length + moves.thinkingTasks.length
}

/// "sentence @ m:ss | what it checked" — the quote verified against the
/// teacher's speech like every other, the gloss taken as written since it is
/// the model describing, not quoting.
function readChecks(raw: string | null, flat: string, offsets: { at: number; startSec: number }[]): Checked[] {
  if (!raw || raw.toUpperCase().includes('NONE')) return []
  const out: Checked[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^(.*?)\s*@\s*(\d+):(\d{1,2})\s*(?:\|\s*(.*))?$/)
    if (!match) continue
    const quote = match[1].trim().replace(/^["']|["']$/g, '')
    if (quote.length < 12) continue
    const offset = flat.indexOf(normalizeForMatch(quote))
    if (offset === -1) continue
    const claimed = Number(match[2]) * 60 + Number(match[3])
    out.push({
      quote,
      timestampSec: startSecAtOffset(offsets, offset) ?? claimed,
      whatItChecked: (match[4] ?? '').trim() || 'A spoken check for understanding.',
    })
    if (out.length >= MAX_PER_KIND) break
  }
  return out
}

async function readOnce(segments: Segment[]): Promise<ClassroomMoves> {
  const transcript = transcriptForModel(segments)
  if (transcript.length < 200) return EMPTY

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      // Same reason as lessonObjective's: adaptive thinking draws from this
      // budget and can return a reply with no text blocks at all.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const { flat, offsets } = flattenTeacherSpeech(segments)
    const read = (tag: string) => parseQuotedLines(extractTag(text, tag), flat, offsets, MAX_PER_KIND)
    return {
      directions: read('directions'),
      transitions: read('transitions'),
      redirections: read('redirections'),
      positive: read('positive'),
      corrective: read('corrective'),
      checks: readChecks(extractTag(text, 'checks'), flat, offsets),
      higherOrderQuestions: read('questions_higher_order'),
      recallQuestions: read('questions_recall'),
      thinkingTasks: readChecks(extractTag(text, 'thinking_tasks'), flat, offsets),
      feedbackSpecific: read('feedback_specific'),
      feedbackGeneral: read('feedback_general'),
    }
  } catch (error) {
    console.error('[classroomMoves] failed:', error)
    return EMPTY
  }
}

function sortedLog(quotes: Quoted[]): { timestampSec: number; text: string }[] {
  return quotes
    .slice()
    .sort((a, b) => a.timestampSec - b.timestampSec)
    .map((q) => ({ timestampSec: q.timestampSec, text: q.quote }))
}

/// Folds what the model heard into the analysis the phrase scan produced.
/// Per kind, not wholesale: a model that found directions and no redirections
/// should not wipe out redirections the phrase scan did find.
export async function enrichClassroomMoves(analysis: AnalysisResult, segments: Segment[]): Promise<AnalysisResult> {
  const moves = await readClassroomMoves(segments)
  if (countMoves(moves) === 0) return analysis

  const directiveLog = moves.directions.length > 0 ? sortedLog(moves.directions) : analysis.directiveLog
  const redirectionLog = moves.redirections.length > 0 ? sortedLog(moves.redirections) : analysis.redirectionLog
  const toneFromModel = [
    ...moves.positive.map((q) => ({ timestampSec: q.timestampSec, text: q.quote, kind: 'positive' as const })),
    ...moves.corrective.map((q) => ({ timestampSec: q.timestampSec, text: q.quote, kind: 'corrective' as const })),
  ].sort((a, b) => a.timestampSec - b.timestampSec)
  const toneLog = toneFromModel.length > 0 ? toneFromModel : analysis.toneLog

  // Checks and feedback the phrase scan could only find by its eight CFU
  // phrases, and by a teacher turn happening to follow a transcribed student
  // turn — on a recording where nine student utterances came through, that
  // judged the feedback of a whole lesson on three moments.
  const cfuLog = moves.checks.length > 0
    ? moves.checks
        .slice()
        .sort((a, b) => a.timestampSec - b.timestampSec)
        .map((c) => ({ timestampSec: c.timestampSec, text: c.quote, whatItChecked: c.whatItChecked }))
    : analysis.cfuLog
  const feedbackFromModel = [
    ...moves.feedbackSpecific.map((q) => ({ timestampSec: q.timestampSec, text: q.quote, kind: 'specific' as const })),
    ...moves.feedbackGeneral.map((q) => ({ timestampSec: q.timestampSec, text: q.quote, kind: 'generic' as const })),
  ].sort((a, b) => a.timestampSec - b.timestampSec)
  const feedbackLog = feedbackFromModel.length > 0 ? feedbackFromModel : analysis.feedbackLog

  // Questions came from a "?" the transcriber guessed at plus a list of
  // openers, which logged "Can you get the light for me, please" and a bare
  // "What" as questions and called a genuine reasoning question recall. A
  // question the teacher asked keeps whatever wait time was measured for the
  // moment it was asked at — that timing is the transcript's, not the
  // model's, and only the deterministic scan can see it.
  const scannedWaits = analysis.questionLog.filter((q) => q.waitTimeSec != null)
  const waitAt = (sec: number): number | null =>
    scannedWaits.find((q) => Math.abs(q.timestampSec - sec) <= 6)?.waitTimeSec ?? null
  const modelQuestions = [
    ...moves.higherOrderQuestions.map((q) => ({ ...q, type: 'higher_order' as const })),
    ...moves.recallQuestions.map((q) => ({ ...q, type: 'recall' as const })),
  ].sort((a, b) => a.timestampSec - b.timestampSec)
  const questionLog = modelQuestions.length > 0
    ? modelQuestions.map((q) => ({
        timestampSec: q.timestampSec,
        type: q.type,
        waitTimeSec: waitAt(q.timestampSec),
        text: q.quote,
        followUps: [],
      }))
    : analysis.questionLog
  const higherOrderQuestionCount = modelQuestions.length > 0
    ? moves.higherOrderQuestions.length
    : analysis.metricsDetail.higherOrderQuestionCount
  const recallQuestionCount = modelQuestions.length > 0
    ? moves.recallQuestions.length
    : analysis.metricsDetail.recallQuestionCount
  const questionCount = higherOrderQuestionCount + recallQuestionCount
  const measuredWaits = questionLog.map((q) => q.waitTimeSec).filter((w): w is number => w != null)

  const positivePhraseCount = toneLog.filter((t) => t.kind === 'positive').length
  const correctivePhraseCount = toneLog.filter((t) => t.kind === 'corrective').length
  const transitionCount = moves.transitions.length > 0 ? moves.transitions.length : analysis.metricsDetail.transitionCount

  return {
    ...analysis,
    directiveLog,
    redirectionLog,
    toneLog,
    cfuLog,
    feedbackLog,
    questionLog,
    cfuCount: cfuLog.length,
    questionCount,
    higherOrderPct: questionCount > 0 ? Math.round((higherOrderQuestionCount / questionCount) * 100) : null,
    avgWaitTimeSec: measuredWaits.length
      ? Math.round((measuredWaits.reduce((sum, w) => sum + w, 0) / measuredWaits.length) * 100) / 100
      : null,
    metricsDetail: {
      ...analysis.metricsDetail,
      higherOrderQuestionCount,
      recallQuestionCount,
      waitTimeSampleCount: measuredWaits.length,
      // Reasoning students were asked to DO, not just answer — a lesson can
      // be built on one and contain no higher-order question at all.
      thinkingTaskCount: moves.thinkingTasks.length,
      genericFeedbackCount: feedbackLog.filter((f) => f.kind === 'generic').length,
      specificFeedbackCount: feedbackLog.filter((f) => f.kind === 'specific').length,
      directiveCount: directiveLog.length,
      redirectionCount: redirectionLog.length,
      firstRedirectionTimestampSec: redirectionLog[0]?.timestampSec ?? analysis.metricsDetail.firstRedirectionTimestampSec,
      transitionCount,
      positivePhraseCount,
      correctivePhraseCount,
      positiveToCorrectiveRatio:
        correctivePhraseCount > 0 ? Math.round((positivePhraseCount / correctivePhraseCount) * 100) / 100 : null,
    },
  }
}
