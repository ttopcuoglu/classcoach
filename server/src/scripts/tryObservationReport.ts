// Dry run of the observation report prompt on a saved demo transcript, with
// sample answers and notes. Calls Claude only; never touches the database.
//
//   npx tsx --env-file=.env src/scripts/tryObservationReport.ts

import { readFileSync } from 'node:fs'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { INSTRUCTION_PRIORITY_NOTICE, PRIVACY_NOTICE, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import { buildObservationPrompt, observationEvidence, parseObservationReport, type ObservationUtterance } from '../lib/observationReport.ts'
import { buildSegments, TEACHER2_LESSONS, type Line } from './seedLessonDebriefDemo.ts'

const file = JSON.parse(readFileSync(new URL('../../../demo-seed/lesson-debrief-teacher2.json', import.meta.url), 'utf8')) as { lessons: { key: string; lines: Line[] }[] }
const lesson = TEACHER2_LESSONS.find((l) => l.key === 't2_reactions')!
const lines = file.lessons.find((l) => l.key === lesson.key)!.lines
const segments = buildSegments(lesson, lines)
const utterances: ObservationUtterance[] = segments.map((s, i) => ({ speaker: lines[i].s === 'T' ? 0 : Number(lines[i].s.slice(1)), startSec: s.startSec, endSec: s.endSec, text: s.text }))
const evidence = observationEvidence(utterances)
const answers = { management: 'some', climate: 'warm', understanding: 'some', physical: 'yes', engagement: 'most' }
const notes = [
  { atSec: 60, text: 'Objective on the board; vinegar and baking soda trays already on each table.', code: '2c' },
  { atSec: 400, text: '5 of 7 tables recording observations; back table chatting about weekend.', code: '3c' },
  { atSec: 650, text: 'Word wall has physical/chemical change vocabulary.', code: '2e' },
]
const started = Date.now()
const response = await anthropic.messages.create({
  model: CLAUDE_MODEL,
  max_tokens: 6000,
  system: buildObservationPrompt({
    evidence,
    answers,
    notes,
    closingNote: 'Two students finished early and helped others without being asked.',
    plan: null,
    context: { subject: 'Science', grade: '8th', lessonTitle: 'Physical vs chemical changes', durationSec: 700 },
    sharedRules: `${INSTRUCTION_PRIORITY_NOTICE}\n${PRIVACY_NOTICE}\n${TRANSCRIPT_RELIABILITY_NOTICE}`,
  }),
  messages: [{ role: 'user', content: 'Write the observation draft now.' }],
})
const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
const report = parseObservationReport(text, { items: evidence.items, answers, notes, recordingMissing: false, planning: null })
console.log(`moments ${evidence.items.length}, facts ${evidence.facts.length}, ${Math.round((Date.now() - started) / 1000)}s, stop ${response.stop_reason}`)
if (!report) {
  console.log('PARSE FAILED\n', text.slice(0, 2000))
  process.exit(1)
}
console.log('ABOUT:', report.about)
for (const c of report.components) {
  console.log(`${c.code} L${c.level ?? '-'} | rec ${c.recording.length} notes ${c.notes.length} obs ${c.observed?.answer ?? '-'} | ${c.reason}${c.disagreement ? ` || DIFF: ${c.disagreement}` : ''}`)
}
