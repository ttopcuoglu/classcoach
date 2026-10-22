import 'dotenv/config'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { parseSlidesOutput } from '../lib/exportModels.ts'
import { buildLessonDeckPrompt, finishDeck, lessonDeckContext } from '../lib/lessonDeck.ts'
import { lessonAsText } from '../lib/lessonPlanModel.ts'
import { buildPptx, type SlideDeck } from '../lib/slidesPptx.ts'

// Builds the same lesson deck with Claude and with one or more Gemini models,
// from the exact prompt production uses, and writes each as a .pptx beside a
// report of tokens, cost and time. Nothing here touches the database: the
// lesson comes from the built-in sample or a JSON file.
//
//   npx tsx src/scripts/compareDecks.ts
//   npx tsx src/scripts/compareDecks.ts --gemini gemini-2.5-flash,gemini-3-flash
//   npx tsx src/scripts/compareDecks.ts --lesson my-lesson.json
//   npx tsx src/scripts/compareDecks.ts --list-gemini
//
// Needs GEMINI_API_KEY in server/.env (and ANTHROPIC_API_KEY, already there).
// Output lands in server/deck-compare/<time>/, which git ignores.

// USD per million tokens, [input, output]. Gemini's thinking tokens are
// billed as output. Check these against the providers' pricing pages before
// trusting the totals — they were not verified when this was written.
const PRICES: Record<string, [number, number]> = {
  [CLAUDE_MODEL]: [2, 10],
  'gemini-3.1-pro-preview': [2, 12],
  'gemini-3-flash': [0.5, 3],
  'gemini-3-flash-preview': [0.5, 3],
  'gemini-2.5-pro': [1.25, 10],
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
}

type Lesson = {
  subject: string | null
  gradeLevel: string | null
  objective: string | null
  essentialQuestion: string | null
  deliveryCoaching: Record<string, string | null>
  [key: string]: unknown
}

// The preview app's sample lesson, with delivery coaching, so a run works
// with no setup.
const SAMPLE: Lesson = {
  subject: 'Science',
  gradeLevel: '7th',
  objective: 'Students will be able to explain why a cell membrane lets some things through and not others.',
  essentialQuestion: 'What makes something alive?',
  approach: 'Inquiry, then naming the idea',
  durationMinutes: 45,
  successCriteria: '- I can name two things a membrane does\n- I can explain what would happen without one',
  materials: '- Dialysis tubing, iodine, starch solution\n- One beaker per pair',
  sequence: [
    { minutes: 7, title: 'Launch: the bag that leaks', teacher: 'Hold up the dialysis bag. Ask what they expect to happen to the iodine and why.', students: 'Write one prediction and one reason in their notebooks, then share with a partner.' },
    { minutes: 18, title: 'Investigation', teacher: 'Circulate. Ask each pair what their evidence rules out, not just what they saw.', students: 'Run the test in pairs and record what changes colour and what does not.' },
    { minutes: 12, title: 'Make sense of it together', teacher: 'Collect what pairs noticed. Ask: if the membrane blocked everything, what would we have seen?', students: 'Argue for one explanation using their own data.' },
    { minutes: 8, title: 'Name the idea, then exit ticket', teacher: 'Introduce "selectively permeable". Connect it back to the predictions on the board.', students: 'Write the exit ticket on their own.' },
  ],
  checks: [
    { when: 'After the prediction', check: 'Pairs hold up a whiteboard with their prediction and one reason.', lookFor: 'A reason that names what crosses the barrier, not just "it leaks".' },
    { when: 'During the sense-making discussion', check: 'Ask two pairs to say what their data rules out.', lookFor: 'Students using their own observation as evidence.' },
  ],
  misconceptions: [
    { belief: 'Students often think the membrane is a solid wall that blocks everything.', surface: 'Ask whether water gets in, and how they know.', response: 'Compare it to a screen door rather than a brick wall.' },
  ],
  exitTicket: {
    task: 'In two sentences, explain why a cell without a membrane could not survive.',
    expected: 'Names control of what enters and leaves the cell.',
    signals: null,
    nextStep: null,
  },
  deliveryCoaching: {
    openingHook: 'Hold the bag up before you say a word and ask what will happen.',
    pacing: 'Protect the 12 minutes of sense-making; cut the launch short before you cut that.',
    engagementCheckpoints: 'Whiteboards after the prediction; two pairs report what their data rules out.',
    explainingTheHardPart: 'Name "selectively permeable" only after students have argued for it — a screen door, not a brick wall.',
    closing: 'Exit ticket on their own, collected at the door.',
  },
}

const USER_TURN = 'Build the lesson presentation now.'

type Run = {
  label: string
  model: string
  ms: number
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  text: string
  error?: string
}

async function runClaude(system: string): Promise<Run> {
  const started = Date.now()
  // The same call the lesson-deck route makes.
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content: USER_TURN }],
  })
  return {
    label: 'claude',
    model: CLAUDE_MODEL,
    ms: Date.now() - started,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    thinkingTokens: 0,
    text: response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n'),
  }
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  error?: { message?: string }
}

async function runGemini(model: string, system: string, key: string): Promise<Run> {
  const started = Date.now()
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: USER_TURN }] }],
      // Room for thinking on top of the deck itself, which Claude gets 8192 for.
      generationConfig: { maxOutputTokens: 16384 },
    }),
  })
  const body = (await response.json()) as GeminiResponse
  const usage = body.usageMetadata ?? {}
  const candidate = body.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('')
  return {
    label: model,
    model,
    ms: Date.now() - started,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    thinkingTokens: usage.thoughtsTokenCount ?? 0,
    text,
    error: !response.ok
      ? `${response.status}: ${body.error?.message ?? 'request failed'}`
      : !text
        ? `no text came back (finish reason: ${candidate?.finishReason ?? 'unknown'})`
        : undefined,
  }
}

async function listGeminiModels(key: string): Promise<void> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  })
  const body = (await response.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  for (const model of body.models ?? []) {
    if (model.supportedGenerationMethods?.includes('generateContent')) console.log(model.name.replace(/^models\//, ''))
  }
}

function cost(run: Run): number | null {
  const price = PRICES[run.model]
  if (!price) return null
  return (run.inputTokens * price[0] + (run.outputTokens + run.thinkingTokens) * price[1]) / 1_000_000
}

function describe(deck: SlideDeck): { layouts: string; visuals: number; pictures: number; withNotes: number } {
  const counts = new Map<string, number>()
  for (const slide of deck.slides) counts.set(slide.layout, (counts.get(slide.layout) ?? 0) + 1)
  return {
    layouts: [...counts].map(([layout, n]) => `${layout} ${n}`).join(', '),
    visuals: deck.slides.filter((slide) => slide.layout === 'visual').length,
    pictures: deck.slides.filter((slide) => slide.image).length,
    withNotes: deck.slides.filter((slide) => slide.notes?.trim()).length,
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const geminiKey = process.env.GEMINI_API_KEY
if (!geminiKey) {
  console.error('Add GEMINI_API_KEY=... to server/.env first.')
  process.exit(1)
}
if (process.argv.includes('--list-gemini')) {
  await listGeminiModels(geminiKey)
  process.exit(0)
}

const lessonFile = arg('--lesson')
const lesson: Lesson = lessonFile ? JSON.parse(readFileSync(lessonFile, 'utf8')) : SAMPLE
const geminiModels = (arg('--gemini') ?? process.env.GEMINI_MODELS ?? 'gemini-2.5-flash')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

const system = buildLessonDeckPrompt(lessonDeckContext(lesson, lessonAsText(lesson), lesson.deliveryCoaching))
const outDir = join('deck-compare', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'prompt.txt'), system)

console.log(`Building "${lesson.objective}" with ${CLAUDE_MODEL} and ${geminiModels.join(', ')}…`)
const runs = await Promise.all([
  runClaude(system).catch((e): Run => ({ label: 'claude', model: CLAUDE_MODEL, ms: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, text: '', error: String(e) })),
  ...geminiModels.map((model) =>
    runGemini(model, system, geminiKey).catch((e): Run => ({ label: model, model, ms: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, text: '', error: String(e) })),
  ),
])

const rows: string[] = []
for (const run of runs) {
  writeFileSync(join(outDir, `${run.label}.txt`), run.text || run.error || '')
  const price = cost(run)
  const money = price == null ? 'price unknown' : `$${price.toFixed(4)}`
  const tokens = `${run.inputTokens} in / ${run.outputTokens} out${run.thinkingTokens ? ` + ${run.thinkingTokens} thinking` : ''}`
  if (run.error) {
    rows.push(`## ${run.label}\n\nFailed: ${run.error}\n`)
    console.log(`✗ ${run.label}: ${run.error}`)
    continue
  }
  const deck = parseSlidesOutput(run.text)
  if (!deck) {
    rows.push(`## ${run.label}\n\n${(run.ms / 1000).toFixed(1)}s · ${tokens} · ${money}\n\nThe reply did not parse into a deck — Wivoza would have shown "Could not build the presentation". Raw reply in ${run.label}.txt.\n`)
    console.log(`✗ ${run.label}: reply did not parse (${money})`)
    continue
  }
  // The route's own finishing: subject theme, then Wikimedia pictures.
  await finishDeck(deck, lesson.subject, lesson.gradeLevel)
  const file = `${run.label}.pptx`
  writeFileSync(join(outDir, file), await buildPptx(deck.slides[0]?.title ?? 'Lesson', deck))
  const facts = describe(deck)
  rows.push(
    `## ${run.label}\n\n` +
      `- ${(run.ms / 1000).toFixed(1)}s · ${tokens} · **${money}**\n` +
      `- ${deck.slides.length} slides, theme ${deck.theme}; layouts: ${facts.layouts}\n` +
      `- ${facts.visuals} picture slides, ${facts.pictures} pictures found; speaker notes on ${facts.withNotes} slides\n` +
      `- File: ${file}\n\n` +
      `What it says it built in:\n${deck.changes.map((c) => `- ${c}`).join('\n')}\n`,
  )
  console.log(`✓ ${run.label}: ${deck.slides.length} slides, ${(run.ms / 1000).toFixed(1)}s, ${money} → ${join(outDir, file)}`)
}

writeFileSync(
  join(outDir, 'report.md'),
  `# Lesson deck comparison\n\n${lesson.objective}\n\nSame prompt for every model (prompt.txt). Prices in compareDecks.ts are unverified estimates.\n\n${rows.join('\n')}`,
)
console.log(`\nReport: ${join(outDir, 'report.md')}`)
