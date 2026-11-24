// Dry run of the lesson plan review on a sample plan, with a sample school
// format. Calls Claude only; never touches the database.
//
//   npx tsx --env-file=.env src/scripts/tryPlanReview.ts

import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { INSTRUCTION_PRIORITY_NOTICE, PRIVACY_NOTICE } from '../lib/coachPersona.ts'
import { buildPlanReviewPrompt, parsePlanReview } from '../lib/planReview.ts'
import { buildPlanningPrompt, parsePlanning, planSections } from '../lib/selfEvalReport.ts'

const PLAN = `Objective
Students will be able to explain why some solutions conduct electricity, using evidence from their own tests.

Do Now (5 min)
Predict which of four cups will light the bulb: tap water, salt water, sugar water, distilled water. Write one reason.

Lab (20 min)
Pairs test the four solutions with conductivity testers and record results in the data table.

Discussion (10 min)
Pairs compare results and explain the pattern. Teacher asks: Why did salt water conduct but sugar water did not?

Exit ticket
Explain in two sentences why salt water conducts and sugar water does not.`

const format = { name: 'Maple Ridge Daily Plan', sections: [{ title: 'Objective', prompt: 'What students will be able to do' }, { title: 'Do Now', prompt: null }, { title: 'Differentiation', prompt: 'Supports and extensions' }, { title: 'Exit Ticket', prompt: null }] }
const sections = planSections(PLAN)
const rules = `${INSTRUCTION_PRIORITY_NOTICE}\n${PRIVACY_NOTICE}`
const read = (system: string, ask: string, max: number) =>
  anthropic.messages.create({ model: CLAUDE_MODEL, max_tokens: max, system, messages: [{ role: 'user', content: ask }] }).then((r) => r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'))
const started = Date.now()
const [d1, rest] = await Promise.all([
  read(buildPlanningPrompt(sections, { subject: 'Science', grade: '8' }, rules, 'review'), 'Read the plan for Domain 1 now.', 3000),
  read(buildPlanReviewPrompt({ sections, context: { lessonTitle: 'Conductivity', grade: '8' }, format, sharedRules: rules }), 'Write the review now.', 2500),
])
const planning = parsePlanning(d1, sections)
const report = parsePlanReview(rest, { planning: planning.length >= 5 ? planning : null, format })
console.log(`${Math.round((Date.now() - started) / 1000)}s`)
if (!report) {
  console.log('PARSE FAILED\n', rest.slice(0, 1500))
  process.exit(1)
}
console.log('ABOUT:', report.about)
console.log('STRENGTHS:', report.strengths)
console.log('NEXT:', report.nextSteps)
console.log('FORMAT:', report.format?.sections.map((s) => `${s.title}=${s.status}${s.note ? ` (${s.note})` : ''}`).join(' | '))
console.log('DOMAIN 1:', report.planning?.map((c) => `${c.code} L${c.level ?? '-'} q${c.excerpts.length}`).join(', '))
