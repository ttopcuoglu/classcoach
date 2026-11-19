// Adds Lesson Debrief recordings to an existing demo account, arranged to
// line up with its Talk It Through history: a class recorded before a
// conversation, then again after the teacher tried what came out of it.
//
// Two steps, so nothing reaches the database until someone has read it:
//
//   npx tsx --env-file=.env src/scripts/seedLessonDebriefDemo.ts generate <out.json>
//   npx tsx --env-file=.env src/scripts/seedLessonDebriefDemo.ts insert <in.json> <email>
//
// --set=teacher2 or --set=teacher3 uses those lesson sets instead (default demo).
//
// Afterwards, refreshDemoDates.ts moves the whole demo story up to today.
//
// Claude writes each transcript from a brief; every number the teacher sees
// comes from the real analyzer (analyzeTranscript / detectLessonContent),
// run at insert time exactly as a real upload would be. Timing is built
// here, not by the model: speaking time from word count, and the silence
// after each question from the lesson's own wait-time range — that silence
// is what Lesson Debrief measures as wait time.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
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
const FOCUS_METRIC = 'avgWaitTime' // the default (demo) set's focus; see LESSON_SETS

export type Lesson = {
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

export const LESSONS: Lesson[] = [
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
- Only 3 distinct students speak. About 110 lines, ~2,400 words — a full class period, at least 12 minutes of speech; the teacher says roughly 88% of the words.`,
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

// Two more demo teachers at Maple Ridge (demo.teacher2 / demo.teacher3), so a
// supervisor demo has two different classrooms to look at. Dated in November
// so the default "this semester" filter shows them; no Reflect notes, and
// Self Evaluation is left for the person trying the demo.
export const TEACHER2_LESSONS: Lesson[] = [
  {
    key: 't2_forces',
    recordedAt: '2026-11-04T10:15:00-05:00',
    classSubject: 'Science 8',
    gradeLevel: '8th',
    period: '3rd period',
    waitRange: [1.0, 2.2],
    brief: `8th grade physical science, 3rd period, 26 students. Lesson: balanced and unbalanced forces, with a quick cart-and-spring-scale demo. A capable, organized teacher whose explanations are clear but who does most of the thinking out loud.
- States the objective with "By the end of class".
- Runs the demo while narrating; asks mostly recall questions ("What is a force?", "Which way did the cart move?", "How many newtons does the scale read?").
- About 15 questions, about 3 higher-order ("Why do you think the cart didn't move when both of you pulled?", "What would happen if...").
- Students answer in 2-8 words; about 6 distinct students speak, two of them often.
- Defines "net force is defined as..." and "an unbalanced force means...".
- Two checks: "Thumbs up if that makes sense" and "Does everyone understand?" — moves on quickly after both.
- Mixed feedback: some generic ("Good", "Nice") and one specific ("I like how you said the forces cancel out instead of just 'they're equal'").
- Two mild redirections ("Eyes up here", "I need everyone") during the demo.
- One short independent task: "Draw the force arrows for the picture on your sheet" (work time 120s, own line).
- About 105 lines, ~2,300 words; the teacher says roughly 78% of the words.`,
  },
  {
    key: 't2_reactions',
    recordedAt: '2026-11-10T10:15:00-05:00',
    classSubject: 'Science 8',
    gradeLevel: '8th',
    period: '3rd period',
    waitRange: [1.8, 3.2],
    brief: `Same 8th grade science class, 3rd period. Lesson: physical vs chemical changes, with a baking soda and vinegar observation in table groups. The teacher is deliberately asking more "how do you know" questions.
- States the goal with "Today we're going to".
- Group observation: "With your table, record three things you notice" (work time 150s, own line).
- Groups report; the teacher asks follow-ups: "What makes you say that?", "How do you know it's a new substance?", "What evidence did you see?"
- About 13 questions, about 6 higher-order ("Why do you think...", "Explain how...", "Compare melting ice to the fizzing — what's different?").
- One misconception surfaces (a student says dissolving sugar is chemical); the teacher asks another student to respond rather than correcting it straight away, then clarifies.
- Specific feedback twice. One redirection.
- Check: "Fist to five, how confident are you sorting these on your own?"
- 9 distinct students; answers 6-20 words. About 95 lines, ~2,000 words; students say roughly 28% of the words.`,
  },
  {
    key: 't2_energy',
    recordedAt: '2026-11-16T10:15:00-05:00',
    classSubject: 'Science 8',
    gradeLevel: '8th',
    period: '3rd period',
    waitRange: [2.4, 3.8],
    brief: `Same 8th grade science class, 3rd period. Lesson: kinetic and potential energy on a roller coaster model. The teacher uses a claim-evidence-reasoning routine and students do more of the explaining.
- States the objective with "Our goal for today".
- Shows a coaster track diagram; asks "Where is the car moving fastest, and why?" then "Write your claim and one piece of evidence" (work time 60s, own line) → "Share with your partner" (work time 45s, own line) → calls on pairs by name.
- About 12 questions, about 7 higher-order ("Why...", "What would happen if the first hill were lower?", "How would you justify...", "Compare...").
- Students build on each other a few times ("I agree with Jordan but...", "Adding to what Sam said...").
- Specific feedback; corrects one misunderstanding about energy "disappearing" by asking where it went.
- Uses "in real life" once (playground swing). Defines "potential energy means...".
- Exit ticket: "Before you leave, write where the energy goes when the car stops at the end."
- No redirections. 11 distinct students; answers 10-30 words. About 90 lines, ~1,900 words; students say roughly 35% of the words.`,
  },
]

export const TEACHER3_LESSONS: Lesson[] = [
  {
    key: 't3_ratios',
    recordedAt: '2026-11-05T08:50:00-05:00',
    classSubject: 'Math 6',
    gradeLevel: '6th',
    period: '1st period',
    waitRange: [0.8, 1.8],
    brief: `6th grade math, 1st period, 24 students. Lesson: introduction to ratios using a recipe (cups of flour to cups of sugar). A warm, energetic teacher who moves fast; lots of choral and quick-answer questions.
- States the objective with "Today we're going to".
- Mostly recall and procedure: "What is a ratio?", "How many cups of flour?", "What do we write first?" About 16 questions, about 3 higher-order ("Why does the order matter in a ratio?").
- Several choral answers prompted by "Everyone, what's the answer?" — the transcript shows one student (S1) answering for the room.
- Guided practice on whiteboards: "Write the ratio on your whiteboard" (work time 40s, own line), repeated twice, then "Hold them up" — the teacher says "Most of you have it" and moves on.
- Encouraging, generic praise ("Awesome", "Good job", "Perfect").
- Two redirections ("Whiteboards down, eyes up here", "Quiet please").
- Defines "a ratio is defined as...". One "Have you ever..." connection (making lemonade).
- 6 distinct students; answers 1-6 words. About 110 lines, ~2,200 words; the teacher says roughly 80% of the words.`,
  },
  {
    key: 't3_rates',
    recordedAt: '2026-11-11T08:50:00-05:00',
    classSubject: 'Math 6',
    gradeLevel: '6th',
    period: '1st period',
    waitRange: [1.6, 3.0],
    brief: `Same 6th grade math class, 1st period. Lesson: unit rates — which store has the better deal on granola bars. The teacher tries having students explain their method before the answer.
- States the goal with "Our goal for today is".
- Problem posed; "Solve it on your own first" (work time 120s, own line) → "Compare with your partner — did you do it the same way?" (work time 60s, own line).
- Calls on two students who used different methods (dividing vs a ratio table) and asks "How is your way like Ava's way?"
- About 13 questions, about 5 higher-order ("Why did you divide?", "Explain how you know...", "What would happen if the bigger box cost more?").
- One student gives a wrong answer; the teacher says "Not quite — walk me through your first step" and the student finds the error.
- Specific feedback twice. One redirection.
- Check: "Show me on your fingers, how many stores did you check?" and an exit ticket "Before you leave, write the unit price for one more store."
- 9 distinct students; answers 5-18 words. About 95 lines, ~1,900 words; students say roughly 27% of the words.`,
  },
  {
    key: 't3_percent',
    recordedAt: '2026-11-17T08:50:00-05:00',
    classSubject: 'Math 6',
    gradeLevel: '6th',
    period: '1st period',
    waitRange: [2.0, 3.4],
    brief: `Same 6th grade math class, 1st period. Lesson: percent as a rate per 100, using a 10x10 grid and a "which is the better test score, 18 out of 20 or 43 out of 50?" problem.
- States the objective with "By the end of class".
- Grid task: "Shade 35 percent of your grid" (work time 45s, own line). Then the score problem: "Work with your table group and decide which is better — you need a reason" (work time 150s, own line).
- Groups present; the teacher asks other students to respond ("Do you agree with table 3? Why?").
- About 12 questions, about 6 higher-order ("Why...", "How do you know...", "Justify...", "Compare...").
- One student confuses 18 out of 20 with 18 percent; a classmate explains using the grid.
- Specific feedback; one corrective ("Not quite, check what the whole is").
- Uses "in real life" once (store discounts). Defines "percent means per hundred".
- One quick redirection while groups transition ("Let's come back together").
- Exit ticket: "Before you leave, write 3 out of 4 as a percent and show how you know."
- 10 distinct students; answers 8-25 words. About 90 lines, ~1,900 words; students say roughly 32% of the words.`,
  },
]

// Which lessons a run uses, and the My Growth focus it sets: --set=<name>.
const LESSON_SETS: Record<string, { lessons: Lesson[]; focusMetric: string }> = {
  demo: { lessons: LESSONS, focusMetric: FOCUS_METRIC },
  teacher2: { lessons: TEACHER2_LESSONS, focusMetric: 'higherOrderPct' },
  teacher3: { lessons: TEACHER3_LESSONS, focusMetric: 'talkRatio' },
}

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

export type Line = { s: string; t: string; work?: number }

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
export function buildSegments(lesson: Lesson, lines: Line[]): Segment[] {
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
export function rawTags(lines: Line[]): string[] {
  const ids = new Map<string, number>([['T', 0]])
  return lines.map((l) => {
    if (!ids.has(l.s)) ids.set(l.s, ids.size)
    return `Speaker ${ids.get(l.s)}`
  })
}

// The loudness envelope a phone records alongside a lesson (one RMS sample a
// second, see lib/settleTime.ts), so the report can tell quiet from sound the
// microphone heard but could not turn into words. Built from the lesson's own
// timeline: voices are loud, pair and group talk is a murmur with no words,
// silent work and the wait after a question are quiet. A room that runs on
// calling out (the 7th grade baseline) keeps a murmur between turns too.
const CHATTY_ROOMS = new Set(['g7_baseline'])
const PAIR_TALK = /turn and talk|partner|pair|neighbor|group|talk to|discuss/i

export function buildLevelTrace(lesson: Lesson, lines: Line[], segments: Segment[]): number[] {
  const rand = seeded(`${lesson.key}-trace`)
  const jitter = (base: number, spread: number) => Math.min(1, Math.max(0, base + (rand() - 0.5) * 2 * spread))
  const total = Math.ceil(segments[segments.length - 1].endSec) + 1
  const trace: number[] = Array.from({ length: total }, () => jitter(0.04, 0.02))
  const chatty = CHATTY_ROOMS.has(lesson.key)
  segments.forEach((seg, i) => {
    const level = seg.speakerLabel === 'Teacher' ? 0.3 : 0.2
    // Whole seconds only, the way the report reads them: a second counts as
    // speech when it starts inside the turn.
    for (let sec = Math.ceil(seg.startSec); sec < seg.endSec && sec < total; sec++) trace[sec] = jitter(level, 0.06)
    const next = segments[i + 1]
    if (!next) return
    const line = lines[i]
    const murmur = (line.work != null && PAIR_TALK.test(line.t)) || (chatty && rand() < 0.6)
    for (let sec = Math.ceil(seg.endSec); sec < next.startSec && sec < total; sec++) trace[sec] = murmur ? jitter(0.17, 0.05) : jitter(0.04, 0.02)
  })
  return trace.map((v) => Math.round(v * 100) / 100)
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
async function generate(outPath: string, lessons: Lesson[]) {
  const file: DemoFile = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')) as DemoFile)
    : { generatedAt: new Date().toISOString(), lessons: [] }
  for (const lesson of lessons) {
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

async function insert(inPath: string, email: string, lessons: Lesson[], focusMetric: string) {
  const { prisma } = await import('../lib/prisma.ts')
  // The full pipeline a real upload gets — the Claude reads, the headline and
  // the Summary prose — so the demo report has every section a teacher's
  // own would. Loaded here so generate never needs the database.
  const { runAnalysis } = await import('../routes/audioSessions.ts')
  const file = JSON.parse(readFileSync(inPath, 'utf8')) as DemoFile
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) throw new Error(`No account for ${email} — create it first.`)
  const existing = await prisma.audioSession.count({ where: { userId: user.id } })
  if (existing > 0) throw new Error(`${email} already has ${existing} Lesson Debrief sessions — not adding a second set.`)

  for (const lesson of lessons) {
    const generated = file.lessons.find((l) => l.key === lesson.key)
    if (!generated) throw new Error(`${lesson.key} missing from ${inPath}`)
    const segments = buildSegments(lesson, generated.lines)
    const tags = rawTags(generated.lines)
    const analysis = analyzeTranscript(segments)
    const lessonContent = detectLessonContent(segments, analysis.phases)
    const recordedAt = new Date(lesson.recordedAt)
    const durationSec = Math.round(segments[segments.length - 1].endSec)
    const levelTrace = buildLevelTrace(lesson, generated.lines, segments)
    // Analysis finishes a few minutes after the recording ends.
    const analyzedAt = new Date(recordedAt.getTime() + (durationSec + 240) * 1000)

    const session = await prisma.audioSession.create({
      data: {
        userId: user.id,
        classSubject: lesson.classSubject,
        period: lesson.period,
        gradeLevel: lesson.gradeLevel,
        sessionDate: recordedAt,
        consentConfirmed: true,
        status: 'analyzed',
        durationSec,
        levelTrace,
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
    await runAnalysis(session.id, user.id, segments, { awaitSummary: true })
    console.log(summarize(lesson, generated.lines))
  }

  await prisma.user.update({ where: { id: user.id }, data: { focusMetric } })
  console.log(`\nAdded ${lessons.length} Lesson Debrief sessions to ${email}; My Growth focus set to ${focusMetric}.`)
  await prisma.$disconnect()
}

// Gives sessions inserted before the trace existed their envelope, and the
// quiet / sound-with-no-words split runAnalysis derives from it — without
// re-running the model reads or touching the prose.
async function addTraces(inPath: string, email: string) {
  const { prisma } = await import('../lib/prisma.ts')
  const { splitNonSpeech, teacherIntervals } = await import('../lib/settleTime.ts')
  const file = JSON.parse(readFileSync(inPath, 'utf8')) as DemoFile
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) throw new Error(`No account for ${email}.`)
  const sessions = await prisma.audioSession.findMany({ where: { userId: user.id }, orderBy: { sessionDate: 'asc' } })
  if (sessions.length !== LESSONS.length) throw new Error(`${email} has ${sessions.length} sessions, expected ${LESSONS.length}.`)
  // Dates move with refreshDemoDates, but the order never changes.
  for (const [i, lesson] of LESSONS.entries()) {
    const session = sessions[i]
    if (session.classSubject !== lesson.classSubject) throw new Error(`Session ${i} is ${session.classSubject}, expected ${lesson.classSubject}.`)
    const generated = file.lessons.find((l) => l.key === lesson.key)!
    const segments = buildSegments(lesson, generated.lines)
    const levelTrace = buildLevelTrace(lesson, generated.lines, segments)
    const split = splitNonSpeech(levelTrace, teacherIntervals(segments), session.durationSec ?? levelTrace.length, segments)
    const metricsDetail = { ...(session.metricsDetail as Record<string, unknown>), ...(split ?? {}) }
    await prisma.audioSession.update({ where: { id: session.id }, data: { levelTrace, metricsDetail } })
    console.log(`${lesson.key.padEnd(13)} quiet ${split?.quietSec ?? '—'}s, sound with no words ${split?.unresolvedSec ?? '—'}s`)
  }
  await prisma.$disconnect()
}

// Only when run directly — buildTeacherSamples imports the lesson timing above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const setFlag = process.argv.find((a) => a.startsWith('--set='))
  const set = LESSON_SETS[setFlag ? setFlag.slice(6) : 'demo']
  if (!set) throw new Error(`Unknown --set; use one of ${Object.keys(LESSON_SETS).join(', ')}`)
  const [command, ...args] = process.argv.slice(2).filter((a) => !a.startsWith('--set='))
  if (command === 'generate' && args[0]) {
    await generate(args[0], set.lessons)
  } else if (command === 'insert' && args.length >= 2) {
    await insert(args[0], args[1], set.lessons, set.focusMetric)
  } else if (command === 'add-traces' && args.length >= 2) {
    await addTraces(args[0], args[1])
  } else {
    console.error('Usage: generate <out.json> | insert <in.json> <email> | add-traces <in.json> <email>')
    process.exit(1)
  }
}
