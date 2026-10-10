// What the audible student talk was ABOUT.
//
// Every other student-talk number in this report is a duration, and a duration
// cannot answer the question a teacher actually has. A hard discussion and a
// room talking over itself produce the same high student share and the same
// many short turns, and the pipeline cannot separate them: Deepgram's
// diarization assigns each slice of time to exactly one speaker, so
// simultaneous speech comes out as tidy alternating turns — measured across
// five real lessons, overlapping segments came to 0, 4, 0, 1 and 0. The
// crosstalk signal is gone before anything is stored, and the audio is not
// kept, so it cannot be recovered later.
//
// What does survive is the words. Whether students were talking about the
// lesson is the real difference between the two rooms, and it is answerable
// from the transcript and the objective we already store.
//
// Three deliberate choices about what this is NOT:
//
// It is not a verdict on students. Off-topic talk can be the task's fault, the
// teacher's, or a tangent that turned out to be worth having, so this reports
// a proportion and never scores it.
//
// Procedural talk is its own category, not off-topic. "Do we need a pencil?"
// is a student engaging with the lesson's logistics, and filing it with
// genuinely unrelated talk would make an organised class look chaotic.
//
// And a turn the transcriber mangled is `unclear`, never off-topic. Automatic
// transcription garbles distant voices most of all, which is to say student
// voices, and reading that as off-task would punish a teacher for where the
// phone was sitting.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'

/// Below this many audible student turns there is no proportion worth
/// reporting — three turns cannot characterise a lesson, and a single
/// off-topic aside out of three would read as 33% off-task.
const MIN_STUDENT_TURNS = 5

/// A turn this short is a noise, an acknowledgement or a fragment, not a
/// contribution anyone can classify.
const MIN_TURN_CHARS = 8

/// Caps the call. A lesson with more audible student turns than this gets an
/// evenly spread sample, and the proportions are reported as a sample.
const MAX_TURNS = 60

export type StudentTurnFocusKind = 'on_topic' | 'procedural' | 'off_topic' | 'unclear'

export type StudentTurnFocus = {
  timestampSec: number
  text: string
  kind: StudentTurnFocusKind
}

export type StudentTalkFocusResult = {
  generatedAt: string
  /// How many turns were classified — the denominator for everything below,
  /// and not the same as how many times a student spoke.
  classified: number
  /// True when more turns were audible than could be sent, so the counts
  /// below describe a sample rather than the lesson.
  sampled: boolean
  onTopic: number
  procedural: number
  offTopic: number
  unclear: number
  /// A few real turns per kind, so the number is inspectable rather than
  /// asserted.
  examples: StudentTurnFocus[]
}

const SYSTEM_PROMPT = `You are reading the student turns from a classroom recording and deciding, for each one, what it was about. Nothing more: you are not judging the students, the teacher, or the lesson.

You will be given what the lesson was about, then numbered student turns.

For each turn, choose exactly one:

ON_TOPIC — it engages with the lesson's content or the thinking the lesson asked for: an answer, a question about the material, a wrong answer offered in good faith, reasoning aloud, a connection to something else they know, or a follow-up to another student. A confused or incorrect answer about the content is ON_TOPIC; being wrong is not being off-task.

PROCEDURAL — it engages with the lesson's logistics rather than its content: what page, whether to use pen, is this due today, can I get a Chromebook, did you say three or four. Students sorting out how to do the work are not off-task, and this is kept separate for that reason.

OFF_TOPIC — it is plainly about something else: another class, the weekend, a joke unrelated to the material, a side conversation with another student, a complaint unrelated to the work. Choose this only when the words themselves make it clear.

UNCLEAR — you cannot tell. This includes a turn the transcriber mangled into something that is not readable English, a fragment with too little in it to place, and a bare acknowledgement like "yeah", "okay", "mhm" or "what?". It also includes anything you would otherwise be guessing at. Automatic transcription hears distant voices worst, which in a classroom means student voices, so UNCLEAR is expected to be common and choosing it is not a failure.

When torn between ON_TOPIC and OFF_TOPIC, and the words do not settle it, choose UNCLEAR. A teacher reading that their students were off-task deserves that claim to be certain.

Answer with one line per turn, in order, nothing else:

<focus>
1 ON_TOPIC
2 UNCLEAR
3 PROCEDURAL
</focus>

Every turn number you were given must appear exactly once.`

const KINDS: Record<string, StudentTurnFocusKind> = {
  ON_TOPIC: 'on_topic',
  PROCEDURAL: 'procedural',
  OFF_TOPIC: 'off_topic',
  UNCLEAR: 'unclear',
}

/// The audible student turns worth classifying, evenly spread when there are
/// more than the cap so the sample covers the whole lesson rather than its
/// opening.
export function studentTurnsForFocus(segments: Segment[]): Segment[] {
  const turns = segments.filter(
    (s) => s.speakerLabel === 'Student' && s.text.trim().length >= MIN_TURN_CHARS,
  )
  if (turns.length <= MAX_TURNS) return turns
  const step = turns.length / MAX_TURNS
  return Array.from({ length: MAX_TURNS }, (_, i) => turns[Math.floor(i * step)])
}

export function buildFocusUserMessage(
  turns: Segment[],
  lesson: { objective: string | null; summary: string | null; subject: string | null },
): string {
  const about =
    [
      lesson.objective ? `Stated objective: "${lesson.objective}"` : null,
      lesson.subject ? `Subject: ${lesson.subject}` : null,
      lesson.summary ? `What the lesson covered: ${lesson.summary}` : null,
    ]
      .filter(Boolean)
      .join('\n') || 'The lesson topic could not be determined from the recording.'

  return `What the lesson was about:
${about}

Student turns:
${turns.map((t, i) => `${i + 1}. ${t.text.trim()}`).join('\n')}`
}

export function parseFocus(text: string, turns: Segment[]): StudentTalkFocusResult | null {
  const body = extractTag(text, 'focus') ?? text
  const kinds = new Map<number, StudentTurnFocusKind>()
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*(\d+)\s*[.):]?\s*([A-Z_]+)\s*$/)
    if (!match) continue
    const index = Number.parseInt(match[1], 10) - 1
    const kind = KINDS[match[2]]
    if (!turns[index] || kind == null || kinds.has(index)) continue
    kinds.set(index, kind)
  }

  // A partial read would quietly change the denominator and with it every
  // proportion, so most of the turns have to come back before this is shown
  // at all.
  if (kinds.size < Math.ceil(turns.length * 0.8)) return null

  const classified: StudentTurnFocus[] = [...kinds.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, kind]) => ({
      timestampSec: turns[index].startSec,
      text: turns[index].text.trim(),
      kind,
    }))

  const count = (kind: StudentTurnFocusKind) => classified.filter((t) => t.kind === kind).length
  // Up to two real turns per kind: enough that a teacher can check the number
  // against the lesson they remember, few enough that the page stays readable.
  const examples = (['on_topic', 'procedural', 'off_topic', 'unclear'] as StudentTurnFocusKind[]).flatMap(
    (kind) => classified.filter((t) => t.kind === kind).slice(0, 2),
  )

  return {
    generatedAt: new Date().toISOString(),
    classified: classified.length,
    sampled: false,
    onTopic: count('on_topic'),
    procedural: count('procedural'),
    offTopic: count('off_topic'),
    unclear: count('unclear'),
    examples,
  }
}

/// Null whenever the answer would not be trustworthy: too few audible student
/// turns, a failed call, or a partial read. Every caller treats null as "not
/// measured" rather than as zero — the distinction this whole report is
/// built on.
export async function readStudentTalkFocus(
  segments: Segment[],
  lesson: { objective: string | null; summary: string | null; subject: string | null },
): Promise<StudentTalkFocusResult | null> {
  const allTurns = segments.filter(
    (s) => s.speakerLabel === 'Student' && s.text.trim().length >= MIN_TURN_CHARS,
  )
  if (allTurns.length < MIN_STUDENT_TURNS) return null
  const turns = studentTurnsForFocus(segments)

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      // Same reason as classroomMoves' and lessonObjective's: adaptive
      // thinking draws from this budget and can return no text blocks at all.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildFocusUserMessage(turns, lesson) }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const parsed = parseFocus(text, turns)
    return parsed ? { ...parsed, sampled: allTurns.length > turns.length } : null
  } catch (error) {
    console.error('[student-talk-focus] read failed:', error)
    return null
  }
}
