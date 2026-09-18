// Adds Lesson Debrief recordings to an existing demo account, arranged to
// line up with its Talk It Through history: a class recorded before a
// conversation, then again after the teacher tried what came out of it.
//
// Two steps, so nothing reaches the database until someone has read it:
//
//   npx tsx --env-file=.env src/scripts/seedLessonDebriefDemo.ts generate <out.json>
//   npx tsx --env-file=.env src/scripts/seedLessonDebriefDemo.ts insert <in.json> <email>
//
// Claude writes each transcript from a brief; every number the teacher sees
// comes from the real analyzer (analyzeTranscript / detectLessonContent),
// run at insert time exactly as a real upload would be. Timing is built
// here, not by the model: speaking time from word count, and the silence
// after each question from the lesson's own wait-time range — that silence
// is what Lesson Debrief measures as wait time.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import {
  analyzeTranscript,
  CFU_PHRASES,
  CONNECTION_PHRASES,
  CORRECTIVE_PHRASES,
  detectLessonContent,
  DIRECTIVE_PHRASES,
  HIGHER_ORDER_STARTERS,
  OBJECTIVE_PHRASES,
  POSITIVE_PHRASES,
  RECALL_STARTERS,
  REDIRECTION_PHRASES,
  TRANSITION_PHRASES,
  VOCABULARY_PHRASES,
  type Segment,
} from '../lib/audioAnalysis.ts'

const WORDS_PER_SEC = 2.4
// My Growth opens on this metric — the teacher habit every lesson below
// shares, whichever class it is.
const FOCUS_METRIC = 'avgWaitTime'

type Lesson = {
  key: string
  // Eastern time the recording started.
  recordedAt: string
  classSubject: string
  gradeLevel: string
  period: string
  // Seconds of silence between a question and the student who answers it.
  waitRange: [number, number]
  brief: string
  // The teacher's own Reflect notes, on the lessons they already reflected
  // on. The newest lessons are left for the person trying the demo.
  notes?: { strengths: string; growthAreas: string; nextStep: string }
}

const LESSONS: Lesson[] = [
  {
    key: 'g7_baseline',
    recordedAt: '2026-08-21T12:35:00-04:00',
    classSubject: 'Social Studies 7',
    gradeLevel: '7th',
    period: '4th period',
    waitRange: [0.4, 1.3],
    brief: `7th grade social studies, 4th period right after lunch, 28 students. Lesson: the Stamp Act and "no taxation without representation". This is a BEFORE recording of a real problem, not a bad teacher — warm, knows the content, but the room runs on speed.
- Teacher explains in long stretches (several turns of 4-6 sentences) and asks mostly quick recall questions ("What was the Stamp Act?", "Who had to pay it?", "When did Parliament pass it?", "How many colonies...").
- About 14 teacher questions, only 2 higher-order ("Why do you think the colonists were so angry about a tax on paper?").
- The same four students (S1-S4) answer everything instantly, often before the question is finished; they call out over each other and over classmates. Once a quiet student (S5) starts to answer and S1 talks over them — the teacher lets it go and takes S1's answer.
- The teacher usually accepts the called-out answer with quick generic praise ("Good job", "Nice work", "Right") and moves on.
- Redirections as the room gets loud: "Eyes up here", "I need everyone", "Quiet please", "Stop talking, guys" — four or five across the lesson.
- One check: "Thumbs up if that makes sense" (the teacher notes only some thumbs go up and moves on anyway).
- States the objective near the start with "Today we're going to...".
- One silent reading stretch of a short primary source (mark it as work time, 90 seconds).
- Student answers are 1-6 words. Only 5 distinct students speak.
- About 115 lines, ~2,400 words — a full class period, at least 12 minutes of speech; the teacher says roughly 80% of the words.`,
    notes: {
      strengths: `I know this content and the room had energy. The kids who answered were really engaged.`,
      growthAreas: `The same four kids answered everything, usually before I finished the question. My wait time was basically zero. The quiet kids didn't get a chance — one tried and got talked over.`,
      nextStep: `Talk this through with Coach this weekend. I need a way to slow the callers down without killing the energy.`,
    },
  },
  {
    key: 'g7_after',
    recordedAt: '2026-08-28T12:35:00-04:00',
    classSubject: 'Social Studies 7',
    gradeLevel: '7th',
    period: '4th period',
    waitRange: [2.2, 3.8],
    brief: `Same 7th grade social studies class a week later, 4th period. Lesson: colonial boycotts and the Boston Tea Party — was it protest or vandalism? This is the AFTER recording: the teacher is using a new routine and it mostly works.
- Opens by naming it: "I love that you all know this stuff, but I want to hear from more voices, so here's how questions work now."
- Before the first discussion the teacher states the new rule plainly: if you call out, you lose your turn, and I'll come back to you later.
- Routine for each big question: ask it → "Take thirty seconds and write down your answer" (work time 30s, on its own teacher line, never on the question line) → "Turn and talk with your neighbor for ten seconds" (work time 10s, own line) → then call on a student by name to read what they wrote.
- Calls on quiet students by name (S5, S6, S7, S8), who read their written answers. Student answers are 8-25 words and actually reason.
- S1 calls out once; the teacher calmly says "Hold that thought — I want to hear from Maya first" and does not acknowledge S1's answer. Later the teacher does come back to S1.
- About 13 questions, about 6 higher-order ("Why do you think...", "How would a loyalist see this?", "What evidence...", "What would happen if..."), with real follow-ups on student answers ("What makes you say that?").
- Specific feedback ("I like how you used the word boycott to explain why the merchants lost money").
- One redirection at most. States the objective with "Our goal for today". Uses "boycott means that..." and "Have you ever...".
- Ends with an exit ticket: "Before you leave, write one reason the Tea Party was protest and one reason it wasn't."
- 9 distinct students speak. About 90 lines, ~1,900 words; students say roughly 30% of the words.`,
    notes: {
      strengths: `Write-then-talk-then-call worked. Three kids who never talk read their answers out loud, and their answers were good.`,
      growthAreas: `Two callers still jump in when discussion opens up. The "lose your turn" rule helped, but I have to be consistent with it.`,
      nextStep: `Keep the routine every day for two weeks, then record again to see if the talk balance holds.`,
    },
  },
  {
    key: 'g9_ela',
    recordedAt: '2026-09-08T09:40:00-04:00',
    classSubject: 'English 9',
    gradeLevel: '9th',
    period: '2nd period',
    waitRange: [2.6, 4.2],
    brief: `9th grade English, 2nd period. Of Mice and Men, chapter 3: Candy's dog. The teacher is using a new frame from a coaching conversation — a claim is given, and students must fill in "this is shown when ___ because ___". The "because" is what matters.
- States the goal with "Our goal for today is...".
- Puts up a claim ("Steinbeck shows that in this world, anything that stops being useful is thrown away") and asks students to find where it's shown and explain because.
- Pair work: "Talk to your partner and find your 'shown when'" (work time 180s, own line).
- Students share. Several analysis sentences start the same way ("This shows that...") — realistic, it's a new frame.
- The teacher pushes for the because every time with follow-ups ("Okay, but why does that matter?", "How does that connect to George and Lennie?").
- About 12 questions, about 8 higher-order ("Why do you think Steinbeck...", "What evidence...", "How does...", "What would happen if Candy had said no?").
- Defines a term: "foreshadowing is defined as...".
- Confidence check: "Fist to five, how ready are you to write this on your own?"
- Specific, warm feedback. No redirections needed.
- 8 distinct students; answers 10-30 words, some genuinely insightful. About 85 lines, ~1,900 words; students say roughly 35% of the words.`,
  },
  {
    key: 'g10_baseline',
    recordedAt: '2026-09-15T14:20:00-04:00',
    classSubject: 'World History 10',
    gradeLevel: '10th',
    period: '8th period',
    waitRange: [1.8, 3.2],
    brief: `10th grade world history, 8th period — the last period of the day. Lesson: causes of the Industrial Revolution. This is a BEFORE recording: the class isn't disruptive, it's silent.
- The teacher asks whole-class questions and waits, but only the same three students (S1, S2, S3) ever answer, with short answers (1-8 words).
- Several times nobody answers and the teacher answers their own question after a pause (the teacher's next line comes right after the question, with no student in between).
- Long explanation stretches from the teacher.
- About 13 questions, about 4 higher-order ("Why do you think Britain industrialized first?", "What would happen if..."), mostly answered by the same three or by the teacher.
- One check: "Raise your hand if you've heard of the spinning jenny" — the teacher says "Just a few of you, okay."
- States the objective with "By the end of class".
- Generic praise ("Good", "Nice work"). No redirections — the room is quiet, not loud.
- Uses "the definition of" once, and "You might have seen" once.
- Only 3 distinct students speak. About 80 lines, ~1,800 words; the teacher says roughly 88% of the words.`,
    notes: {
      strengths: `My explanations were clear and organized, and the three kids who answered were thoughtful.`,
      growthAreas: `Only three students spoke all period. When nobody answered I answered my own questions — I didn't notice how often until I read the transcript.`,
      nextStep: `Talk it through with Coach — think-pair-share flopped with this group before, so I need something with more structure.`,
    },
  },
  {
    key: 'g10_after',
    recordedAt: '2026-09-17T14:20:00-04:00',
    classSubject: 'World History 10',
    gradeLevel: '10th',
    period: '8th period',
    waitRange: [2.8, 4.2],
    brief: `Same 10th grade world history class, 8th period, two days later. Lesson: factory working conditions, using a short excerpt of a factory worker's testimony. This is the AFTER recording: the teacher is trying a half-sheet routine from a coaching conversation.
- Explains the half-sheet: each pair writes one claim and one piece of evidence from the testimony.
- "Thirty seconds on your own first — write down one thing that stands out to you" (work time 30s, own line) → "Now work with your partner and agree on one claim and one piece of evidence" (work time 150s, own line).
- Then calls on pairs, not individuals: "What did your pair put down?" Pairs read their claim and evidence (answers 12-30 words).
- New voices: at least 8 students who were silent before speak. One says "We weren't sure about ours" and the teacher says "That's fine, read what you have" — and it turns out to be a good point.
- Follow-ups: "What evidence in the testimony backs that up?", "How would a factory owner have answered that?", "Why do you think children were hired?"
- About 12 questions, about 6 higher-order.
- Specific feedback ("I like how you pointed to the fourteen-hour day as evidence, not just said it was bad").
- States the objective with "Today we're going to". Defines "the factory system is defined as...". Uses "in real life" once.
- Exit ticket: "Before you leave, write down one thing you heard from another pair that changed your mind."
- 11 distinct students speak. About 85 lines, ~1,800 words; students say roughly 30% of the words.`,
  },
]

const TRANSCRIPT_PROMPT = `You write realistic classroom audio transcripts for a teacher-coaching app's demo account. A teacher reads them back as their own recorded lesson, so they must sound like a real classroom: natural spoken language, occasional "um" or restarts, students who sound their age, and a teacher who is competent and caring even when the lesson shows a problem.

The app detects teaching moves by phrase, so use these naturally when the brief calls for them (never force them):
- Recall question starters: ${RECALL_STARTERS.join(', ')}
- Higher-order question starters: ${HIGHER_ORDER_STARTERS.join(', ')}, and sentences opening with Why / Explain / Compare / Justify
- Checks for understanding: ${CFU_PHRASES.slice(0, 8).join(', ')}, exit ticket, "before you leave, write"
- Redirections: ${REDIRECTION_PHRASES.join(', ')}
- Transitions: ${TRANSITION_PHRASES.join(', ')}
- Task directions: ${DIRECTIVE_PHRASES.join(', ')}
- Encouraging: ${POSITIVE_PHRASES.join(', ')}; corrective: ${CORRECTIVE_PHRASES.join(', ')}
- Stated objective: ${OBJECTIVE_PHRASES.join(', ')}
- Connections: ${CONNECTION_PHRASES.join(', ')}; vocabulary: ${VOCABULARY_PHRASES.join(', ')}

Rules:
- Every teacher question ends with "?".
- Speakers: "T" for the teacher; students "S1", "S2", ... — the same id is the same student throughout.
- Students may be addressed by common first names; keep them consistent with their ids.
- Silent work time (reading, writing, pair talk the recorder wouldn't pick up) is marked at the end of the teacher line that starts it: [work 30] for thirty seconds. The line after a work line is always the teacher.
- Never mark work on a line that asks a question.

Output only the transcript, one spoken turn per line, nothing before or after it:
T: Okay everyone, eyes up here.
S1: Is this on the test?
T: Take thirty seconds and write down your answer. [work 30]`

type Line = { s: string; t: string; work?: number }

async function writeTranscript(lesson: Lesson): Promise<Line[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: TRANSCRIPT_PROMPT,
      messages: [{ role: 'user', content: `Write this lesson.\n\n${lesson.brief}` }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const lines = parseTranscript(text)
    if (lines.length > 30) return lines
    console.warn(`${lesson.key}: only ${lines.length} usable lines (stop_reason ${response.stop_reason}), retrying`)
  }
  throw new Error(`${lesson.key}: transcript came back unusable twice`)
}

// "T: text" / "S3: text", with an optional trailing [work 30]. Anything else
// (a stray heading, a blank line) is dropped rather than guessed at.
function parseTranscript(text: string): Line[] {
  const lines: Line[] = []
  for (const raw of text.split('\n')) {
    const match = raw.trim().match(/^(T|S\d{1,2})\s*:\s*(.+)$/)
    if (!match) continue
    const work = match[2].match(/\[work (\d+)\]\s*$/i)
    const t = match[2].replace(/\[work \d+\]\s*$/i, '').trim()
    if (!t) continue
    lines.push(work ? { s: match[1], t, work: Number(work[1]) } : { s: match[1], t })
  }
  return lines
}

// Small deterministic generator, so rebuilding timing from the same lines
// gives the same numbers.
function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

// Speaking time from word count; silence from the lesson's wait range after
// a question a student answers, the marked work time, or a normal beat
// between turns. A work line followed by a student (which the prompt rules
// out) gets a normal wait rather than inflating wait time by minutes.
function buildSegments(lesson: Lesson, lines: Line[]): Segment[] {
  const rand = seeded(lesson.key)
  const between = (lo: number, hi: number) => lo + (hi - lo) * rand()
  const segments: Segment[] = []
  let t = between(1, 3)
  lines.forEach((line, i) => {
    const words = line.t.trim().split(/\s+/).filter(Boolean).length
    const duration = Math.max(0.8, words / WORDS_PER_SEC) * between(0.92, 1.1)
    const isTeacher = line.s === 'T'
    segments.push({ speakerLabel: isTeacher ? 'Teacher' : 'Student', startSec: round(t), endSec: round(t + duration), text: line.t.trim() })
    t += duration
    const next = lines[i + 1]
    if (!next) return
    const nextIsStudent = next.s !== 'T'
    if (isTeacher && nextIsStudent && line.t.trim().endsWith('?')) t += between(...lesson.waitRange)
    else if (line.work && !nextIsStudent) t += line.work
    else if (isTeacher && nextIsStudent) t += between(...lesson.waitRange)
    else t += between(0.4, 1.1)
  })
  return segments
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

// Speaker tags as diarization would produce them: one per voice.
function rawTags(lines: Line[]): string[] {
  const ids = new Map<string, number>([['T', 0]])
  return lines.map((l) => {
    if (!ids.has(l.s)) ids.set(l.s, ids.size)
    return `Speaker ${ids.get(l.s)}`
  })
}

type GeneratedLesson = { key: string; lines: Line[] }
type DemoFile = { generatedAt: string; lessons: GeneratedLesson[] }

function summarize(lesson: Lesson, lines: Line[]) {
  const segments = buildSegments(lesson, lines)
  const a = analyzeTranscript(segments)
  const minutes = (segments[segments.length - 1].endSec / 60).toFixed(1)
  const voices = new Set(lines.filter((l) => l.s !== 'T').map((l) => l.s)).size
  return `${lesson.key.padEnd(13)} ${minutes}min  teacher ${a.teacherTalkPct?.toFixed(0)}% / students ${a.studentTalkPct?.toFixed(0)}%  voices ${voices}  questions ${a.questionCount} (higher-order ${a.higherOrderPct?.toFixed(0)}%)  wait ${a.avgWaitTimeSec?.toFixed(1)}s over ${a.metricsDetail.waitTimeSampleCount}  checks ${a.cfuCount}  redirections ${a.metricsDetail.redirectionCount}  specific feedback ${a.metricsDetail.specificFeedbackCount}/${a.metricsDetail.specificFeedbackCount + a.metricsDetail.genericFeedbackCount}`
}

// Saves after every lesson and skips lessons already in the file, so one
// failed transcript costs one rerun of that lesson, not all five.
async function generate(outPath: string) {
  const file: DemoFile = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')) as DemoFile)
    : { generatedAt: new Date().toISOString(), lessons: [] }
  for (const lesson of LESSONS) {
    const done = file.lessons.find((l) => l.key === lesson.key)
    if (done) {
      console.log(`${summarize(lesson, done.lines)}  (kept)`)
      continue
    }
    const lines = await writeTranscript(lesson)
    file.lessons.push({ key: lesson.key, lines })
    writeFileSync(outPath, JSON.stringify(file, null, 2))
    console.log(summarize(lesson, lines))
  }
  console.log(`\nWrote ${outPath}`)
}

async function insert(inPath: string, email: string) {
  const { prisma } = await import('../lib/prisma.ts')
  const file = JSON.parse(readFileSync(inPath, 'utf8')) as DemoFile
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) throw new Error(`No account for ${email} — create it first.`)
  const existing = await prisma.audioSession.count({ where: { userId: user.id } })
  if (existing > 0) throw new Error(`${email} already has ${existing} Lesson Debrief sessions — not adding a second set.`)

  for (const lesson of LESSONS) {
    const generated = file.lessons.find((l) => l.key === lesson.key)
    if (!generated) throw new Error(`${lesson.key} missing from ${inPath}`)
    const segments = buildSegments(lesson, generated.lines)
    const tags = rawTags(generated.lines)
    const analysis = analyzeTranscript(segments)
    const lessonContent = detectLessonContent(segments, analysis.phases)
    const recordedAt = new Date(lesson.recordedAt)
    const durationSec = Math.round(segments[segments.length - 1].endSec)
    // Analysis finishes a few minutes after the recording ends.
    const analyzedAt = new Date(recordedAt.getTime() + (durationSec + 240) * 1000)

    await prisma.audioSession.create({
      data: {
        userId: user.id,
        classSubject: lesson.classSubject,
        period: lesson.period,
        gradeLevel: lesson.gradeLevel,
        sessionDate: recordedAt,
        consentConfirmed: true,
        status: 'analyzed',
        durationSec,
        teacherTalkPct: analysis.teacherTalkPct,
        studentTalkPct: analysis.studentTalkPct,
        questionCount: analysis.questionCount,
        higherOrderPct: analysis.higherOrderPct,
        avgWaitTimeSec: analysis.avgWaitTimeSec,
        cfuCount: analysis.cfuCount,
        metricsDetail: analysis.metricsDetail,
        highlights: analysis.highlights,
        phases: analysis.phases,
        questionLog: analysis.questionLog,
        cfuLog: analysis.cfuLog,
        feedbackLog: analysis.feedbackLog,
        directiveLog: analysis.directiveLog,
        toneLog: analysis.toneLog,
        redirectionLog: analysis.redirectionLog,
        lessonContent,
        strengths: lesson.notes?.strengths ?? null,
        growthAreas: lesson.notes?.growthAreas ?? null,
        nextStep: lesson.notes?.nextStep ?? null,
        createdAt: recordedAt,
        updatedAt: analyzedAt,
        segments: {
          create: segments.map((s, i) => ({
            speakerLabel: s.speakerLabel,
            rawSpeakerTag: tags[i],
            startSec: s.startSec,
            endSec: s.endSec,
            text: s.text,
            createdAt: analyzedAt,
          })),
        },
      },
    })
    console.log(summarize(lesson, generated.lines))
  }

  await prisma.user.update({ where: { id: user.id }, data: { focusMetric: FOCUS_METRIC } })
  console.log(`\nAdded ${LESSONS.length} Lesson Debrief sessions to ${email}; My Growth focus set to ${FOCUS_METRIC}.`)
  await prisma.$disconnect()
}

const [command, ...args] = process.argv.slice(2)
if (command === 'generate' && args[0]) {
  await generate(args[0])
} else if (command === 'insert' && args.length >= 2) {
  await insert(args[0], args[1])
} else {
  console.error('Usage: generate <out.json> | insert <in.json> <email>')
  process.exit(1)
}
