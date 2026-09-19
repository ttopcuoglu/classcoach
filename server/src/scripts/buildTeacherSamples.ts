// Builds the data behind the public teacher samples (the home page's
// Lesson Debrief, Talk It Through and Lesson Planning PDFs) from the demo
// teacher's generated content — the same invented classes the demo account
// shows. Nothing is read from or written to the database.
//
//   npx tsx --env-file=.env src/scripts/buildTeacherSamples.ts \
//     <debrief-demo.json> <talk-demo.json> <tools-demo.json> <out.json>
//
// The inputs are the files the demo seed scripts' generate steps wrote. The
// lesson is analyzed exactly as an upload would be; its class summary and
// Rubric Lens come from the production prompts. The output is what
// web/scripts/capture-teacher-samples.mjs answers the pages' API calls with.

import { readFileSync, writeFileSync } from 'node:fs'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { analyzeTranscript, buildContentExhibits, detectLessonContent } from '../lib/audioAnalysis.ts'
import { CORE_COACHING_RULES, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import { extractTag } from '../lib/extractTag.ts'
import {
  buildRubricEvidence,
  buildRubricLensSystemPrompt,
  DEFAULT_RUBRIC_FRAMEWORK,
  parseRubricLens,
  RUBRIC_FRAMEWORKS,
} from '../lib/rubricLens.ts'
import { buildClassSummarySystemPrompt } from '../routes/audioSessions.ts'
import { buildSegments, LESSONS, rawTags, type Line } from './seedLessonDebriefDemo.ts'

// The lesson, conversation and plan the home page shows.
const LESSON_KEY = 'g10_after'
const TALK_KEY = 'g7_calling_out'

// The teacher's own notes on the sample lesson, in the Reflect tab's fields.
const REFLECTION = {
  strengths: 'The half-sheet worked. Eleven students spoke, and every pair had something written before anyone talked.',
  growthAreas: 'I still jumped in to explain once or twice before pairs had finished. The exit ticket answers were short.',
  nextStep: "Keep the half-sheet for Friday's source, and give pairs a full two minutes before I call on anyone.",
}

async function claude(system: string, content: string, maxTokens: number): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content }],
  })
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

async function lessonSample(debriefFile: string) {
  const file = JSON.parse(readFileSync(debriefFile, 'utf8')) as { lessons: { key: string; lines: Line[] }[] }
  const lesson = LESSONS.find((l) => l.key === LESSON_KEY)!
  const lines = file.lessons.find((l) => l.key === LESSON_KEY)!.lines
  const segments = buildSegments(lesson, lines)
  const tags = rawTags(lines)
  const analysis = analyzeTranscript(segments)
  const lessonContent = detectLessonContent(segments, analysis.phases)
  const durationSec = Math.round(segments[segments.length - 1].endSec)
  const recordedAt = new Date(lesson.recordedAt).toISOString()

  const summaryText = await claude(buildClassSummarySystemPrompt(buildContentExhibits(segments), durationSec), 'Write the summary now.', 300)
  const classSummary = extractTag(summaryText, 'class_summary')

  const framework = RUBRIC_FRAMEWORKS[DEFAULT_RUBRIC_FRAMEWORK]
  const evidence = buildRubricEvidence({ ...analysis, durationSec, lessonContent, segments })
  const lensText = await claude(
    buildRubricLensSystemPrompt(framework, evidence, `${CORE_COACHING_RULES}\n${TRANSCRIPT_RELIABILITY_NOTICE}`),
    'Write the rubric lens now.',
    4000,
  )
  const components = parseRubricLens(lensText, framework, evidence.items)
  console.log(`lesson: ${Math.round(durationSec / 60)} min, class summary ${classSummary ? 'ok' : 'MISSING'}, rubric lens ${components.length}/${framework.components.length}`)

  return {
    id: 'sample-lesson',
    teacherName: null,
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
    reflectConversation: null,
    lessonContent,
    contentNotes: null,
    rubricLens: {
      framework: framework.id,
      frameworkName: framework.name,
      generatedAt: recordedAt,
      components,
      notObservable: framework.notObservable,
    },
    classSummary,
    ...REFLECTION,
    followUpDate: null,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    segments: segments.map((s, i) => ({ id: `seg-${i}`, rawSpeakerTag: tags[i], ...s })),
  }
}

function talkSample(talkFile: string) {
  const file = JSON.parse(readFileSync(talkFile, 'utf8')) as {
    sessions: {
      key: string
      createdAt: string
      incidentText: string
      conversation: unknown[]
      talkTakeaway: unknown
      triedAt: string | null
      reflectionNote: string | null
    }[]
  }
  const s = file.sessions.find((x) => x.key === TALK_KEY)!
  return {
    id: 'sample-talk',
    incidentText: s.incidentText,
    category: null,
    feedback: null,
    wordsToTry: null,
    followUp: null,
    rating: null,
    source: 'talk_to_me',
    saved: true,
    shareToken: null,
    createdAt: s.createdAt,
    conversation: s.conversation,
    talkTakeaway: s.talkTakeaway,
    triedAt: s.triedAt,
    reflectionNote: s.reflectionNote,
  }
}

// The plan's inputs are recovered from the prompt the feedback was written
// against: header lines, then "Lesson plan:" and the teacher's own text.
function planSample(toolsFile: string) {
  const file = JSON.parse(readFileSync(toolsFile, 'utf8')) as {
    lessonPlan: { content: string; feedback: string; rating: number | null }
  }
  const { content, feedback, rating } = file.lessonPlan
  const [header, planText] = content.split('\n\nLesson plan:\n')
  const field = (label: string) => header.split('\n').find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2) ?? null
  const createdAt = '2026-09-16T23:40:00.000Z'
  return {
    id: 'sample-plan',
    mode: 'feedback',
    objective: field('Objective'),
    unitName: field('Unit'),
    essentialQuestion: null,
    standard: field('Standard'),
    subject: field('Subject'),
    gradeLevel: field('Grade level'),
    planText,
    feedback,
    rating,
    doNow: null,
    agenda: null,
    closure: null,
    hots: null,
    homework: null,
    saved: true,
    shareToken: null,
    createdAt,
    conversation: [
      { role: 'user', text: content, createdAt },
      { role: 'assistant', text: feedback, createdAt },
    ],
    suggestedRevision: null,
    deliveryCoaching: null,
    fileName: null,
    slideCount: null,
    presentationReview: null,
  }
}

const [debriefFile, talkFile, toolsFile, outFile] = process.argv.slice(2)
if (!outFile) {
  console.error('Usage: <debrief-demo.json> <talk-demo.json> <tools-demo.json> <out.json>')
  process.exit(1)
}
const samples = { lesson: await lessonSample(debriefFile), talk: talkSample(talkFile), plan: planSample(toolsFile) }
writeFileSync(outFile, JSON.stringify(samples, null, 2))
console.log(`Wrote ${outFile}`)
