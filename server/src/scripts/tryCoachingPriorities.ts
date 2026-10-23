// Dry run for Coaching Priorities: real model calls, printed, nothing stored.
// Builds a lesson and a Talk It Through reply with a school focus, once where
// it fits and once where it doesn't, so a person can read whether the idea is
// invitational, labelled, and absent when it doesn't fit.
//
//   tsx src/scripts/tryCoachingPriorities.ts
//
// Touches no database: DATABASE_URL is pointed at nothing before .env loads
// (dotenv never overrides a variable that is already set).

export {}

process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
await import('dotenv/config')

const { anthropic, CLAUDE_MODEL, SPOKEN_MODEL } = await import('../lib/anthropic.ts')
const { buildFullLessonPrompt, parseFullLesson } = await import('../lib/lessonPlanModel.ts')
const { matchSchoolFocusIdea, schoolFocusBlock } = await import('../lib/schoolFocusBlock.ts')
const { TALK_SYSTEM_PROMPT } = await import('../routes/debrief.ts')

const focus = {
  id: 'dry-run',
  name: 'Academic Discussions',
  purpose: "Students explain their reasoning, build on each other's ideas, and test claims with evidence.",
  looksLike: 'A question goes to pairs before anyone answers it.\nStudents respond to each other, not only to the teacher.',
  whenItFits: 'A question with more than one defensible answer.\nComparing sources, methods or solutions.',
  ideas: 'Two minutes of turn-and-talk before taking answers.\n"Who can add to what was just said?"',
  whenNotToUse: 'Introducing brand-new vocabulary or procedures.\nTimed practice, assessments, safety instructions.',
}

const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((b) => (b.type === 'text' ? b.text : '')).join('')

async function lesson(label: string, objective: string, subject: string) {
  const r = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 5000,
    thinking: { type: 'disabled' },
    system: buildFullLessonPrompt() + schoolFocusBlock([focus], 'planning'),
    messages: [{ role: 'user', content: `Learning objective: ${objective}\nSubject: ${subject}\nGrade level: 7th grade\nLesson length: 50 minutes` }],
  })
  const parsed = parseFullLesson(text(r))
  console.log(`\n=== Lesson, ${label}: ${parsed.sequence.length} steps`)
  const idea = matchSchoolFocusIdea(parsed.schoolFocusIdea, [focus], parsed.schoolFocusCheck)
  console.log(`CHECK: ${parsed.schoolFocusCheck?.replace(/\n/g, ' | ') ?? '(none)'}`)
    console.log(idea ? `IDEA: ${idea.text}` : 'IDEA: (none)')
}

async function talk(label: string, said: string) {
  const r = await anthropic.messages.create({
    model: SPOKEN_MODEL,
    max_tokens: 400,
    thinking: { type: 'disabled' },
    system: TALK_SYSTEM_PROMPT + schoolFocusBlock([focus], 'talk'),
    messages: [{ role: 'user', content: said }],
  })
  console.log(`\n=== Talk, ${label}\nTEACHER: ${said}\nCOACH: ${text(r)}`)
}

await lesson('fits (weighing causes)', 'Students will weigh which cause mattered most in the fall of the Mauryan Empire, using two sources', 'Social Studies')
await lesson("doesn't fit (new vocabulary)", 'Students will learn the names and functions of six cell organelles', 'Science')
await lesson("doesn't fit (new vocabulary), again", 'Students will learn the names and functions of six cell organelles', 'Science')
await lesson("doesn't fit (timed practice)", 'Students will build fluency multiplying fractions with timed practice', 'Math')
await lesson('fits (comparing methods), again', 'Students will compare two methods for solving a proportion and decide which is more efficient', 'Math')
await talk('fits', 'When I ask a question only the same three kids answer, and everyone else just waits for them.')
await talk("doesn't fit", "I'm exhausted. I've had back-to-back meetings all week and I haven't eaten lunch sitting down once.")
process.exit(0)
