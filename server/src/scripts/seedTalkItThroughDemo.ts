// Builds a Talk It Through demo account: a few weeks of past conversations a
// teacher can open from Past conversations, two of them followed up by
// Coach's check-in, and one check-in waiting on Home.
//
// Two steps, so nothing reaches the database until someone has read it:
//
//   npx tsx --env-file=.env src/scripts/seedTalkItThroughDemo.ts generate <out.json>
//   npx tsx --env-file=.env src/scripts/seedTalkItThroughDemo.ts refresh <file.json>   (optional: re-date + redo notes)
//   npx tsx --env-file=.env src/scripts/seedTalkItThroughDemo.ts insert <in.json> <email> "<name>"
//
// Coach's side is the real thing — the production Talk It Through prompt,
// token limits, coach memory and check-in logic, imported rather than
// copied — so the demo shows what the product actually says. The teacher's
// side is voiced by a simulated teacher briefed per scenario, which answers
// whatever Coach actually said instead of following a fixed script.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import {
  applyMemoryUpdate,
  buildMemoryContextBlock,
  MEMORY_UPDATE_INSTRUCTION,
  MEMORY_UPDATE_TOKEN_BUFFER,
} from '../lib/coachMemory.ts'
import type { ChatMessage } from '../lib/coachingChat.ts'
import { buildExperienceContextBlock } from '../lib/experience.ts'
import { extractTag, stripTag } from '../lib/extractTag.ts'
import { buildFollowUpContextBlock, checkInQuestionFor, nextCheckInDate } from '../lib/followUps.ts'
import { TALK_SYSTEM_PROMPT, TALK_TAKEAWAY_SYSTEM_PROMPT, trimIfTruncated } from '../routes/debrief.ts'

const EXPERIENCE_LEVEL = 'established'
let truncatedCoachReplies = 0
const MAX_TEACHER_TURNS = 6
const MIN_TEACHER_TURNS = 4

type Scenario = {
  key: string
  // Eastern time, when the teacher opened the conversation.
  startedAt: string
  // What the simulated teacher knows and how the conversation should feel.
  brief: string
  // The teacher's first words — also the title on the Past conversations card.
  opening: string
  // Present on a check-in: answers the check-in scheduled by that session.
  checkInFor?: string
}

const SCENARIOS: Scenario[] = [
  {
    key: 'g7_calling_out',
    startedAt: '2026-08-23T19:40:00-04:00',
    brief: `You teach 7th grade social studies. Your 4th period (right after lunch, 28 students) has about five students who call out answers and comments constantly — while you're teaching and while classmates are talking. Reminding them to raise hands works for two minutes. What bothers you most: the quieter kids have stopped even trying to answer. You tried a points chart for hand-raising last year and it felt babyish for 7th graders — push back once if Coach suggests anything like rewards or charts. You want something that keeps the energy but gives everyone a turn.`,
    opening: `So my fourth period seventh graders — I've got about five kids who just call out constantly, even when someone else is answering. I remind them, it works for two minutes, and honestly the quiet kids have just stopped trying.`,
  },
  {
    key: 'g7_calling_out_checkin',
    startedAt: '2026-08-27T15:55:00-04:00',
    checkInFor: 'g7_calling_out',
    brief: `This is a check-in: a few days ago you and Coach made a plan for your 7th grade 4th period, where about five students call out constantly. You tried it for three days. What happened: during the lesson opener it clearly worked — calling out dropped a lot and three students who never talk raised their hands, which honestly made your day. But during open discussion two of the same students still blurt out, and one of them grumbled that waiting for classmates to finish is "slow". You want to keep what worked and figure out the discussion part. Sound genuinely encouraged but practical.`,
    opening: `Actually, better than I expected! The quiet kids started talking — three of them raised their hands on the first day. But two of my callers still blurt out during discussion, so that part's not fixed yet.`,
  },
  {
    key: 'g6_math_anxiety',
    startedAt: '2026-08-31T16:10:00-04:00',
    brief: `You teach 6th grade math, 1st period, and just started the ratios unit. Several students say "I'm not good at math" before they even read the problem. One student puts the pencil down and stops the moment she's stuck. You tell them mistakes are okay all the time and they don't buy it — push back on that if Coach goes there. You care a lot about these kids and you're a little worried you'll push too hard. You want something small you can do in the first five minutes of class.`,
    opening: `I've got a bunch of sixth graders who say "I'm not good at math" before they even read the problem. One girl just puts her pencil down the second she's stuck. I keep saying mistakes are fine and they don't believe me.`,
  },
  {
    key: 'apcalc_frq',
    startedAt: '2026-09-02T17:20:00-04:00',
    brief: `You teach AP Calculus AB (7th period) and you're grading a set of practice free-response questions tonight. The calculations are mostly right, but students keep losing justification points — they write "f is increasing" without ever saying f-prime is positive, or they give an answer with no connection to the question. They seem to think the math speaks for itself. You already showed them the official scoring guidelines; they nodded and did the same thing on the next one — push back once with that. Class time is tight before the exam, so anything you try has to fit in about ten minutes.`,
    opening: `I'm grading AP Calc free-response right now and it's the same thing again. The math is right, but they never justify anything — they'll write "f is increasing" and just stop. They're throwing away points.`,
  },
  {
    key: 'g9_ela_summary',
    startedAt: '2026-09-03T15:30:00-04:00',
    brief: `You teach 9th grade English, 2nd period. You're reading Of Mice and Men. When you ask students to analyze how Steinbeck develops a character or theme, most of them just retell what happened. You spend weekends writing "analyze, don't summarize" in the margins and nothing changes — say that, you're a bit worn out by it. You want students to explain why the author made a choice, not what happened. You'd like something you can model in one class period.`,
    opening: `My ninth graders cannot stop summarizing. I ask how Steinbeck develops George and I get a plot retelling. I spend my weekends writing "analyze, don't summarize" in the margins and nothing changes.`,
  },
  {
    key: 'g9_ela_summary_checkin',
    startedAt: '2026-09-09T16:00:00-04:00',
    checkInFor: 'g9_ela_summary',
    brief: `This is a check-in: last week you and Coach planned a way to get your 2nd period 9th graders analyzing instead of summarizing in their Of Mice and Men paragraphs. You tried it. What happened: it worked — you think roughly two thirds of the paragraphs had real analysis this time, the most you've seen all year. The new problem: many of those analysis sentences sound formulaic, like everyone copied the same frame. You want them to start sounding like their own thinking. Sound pleased and a little proud, then curious about the next step.`,
    opening: `It worked! I'd say two thirds of the paragraphs actually had analysis this time — that's the most I've seen all year. The only thing is, a lot of them sound the same, like they're all filling in the same frame.`,
  },
  {
    key: 'g8_science_labs',
    startedAt: '2026-09-10T15:45:00-04:00',
    brief: `You teach 8th grade science, 3rd period. You just ran a density lab and the kids loved it — lots of energy, everyone involved. Then you read the lab reports: they followed the steps like a recipe and most conclusions say something like "the lab was fun and we learned about density". They can't explain why things floated or sank. You don't want to kill the fun of labs. You want the lab to actually produce understanding.`,
    opening: `We did a density lab today and the kids loved it. Then I read the lab reports and most of them basically say "the lab was fun and we learned about density." They followed the steps but they don't get why anything happened.`,
  },
  {
    key: 'g8_directions',
    startedAt: '2026-09-11T16:05:00-04:00',
    brief: `You teach 8th grade, and it's worst in 6th period right after lunch. When you give a direction, a lot of students keep talking and only respond after you've repeated it three or four times, getting louder each time. You've caught yourself raising your voice every day and you hate it — you feel like a drill sergeant, and it's not who you want to be. You want to reset expectations next week without being punitive. You sound tired but honest about it.`,
    opening: `I feel like I'm raising my voice every single day. I give a direction, half the class keeps talking, and they only listen after I've said it three or four times, louder each time. That's not the teacher I want to be.`,
  },
  {
    key: 'apbio_apply',
    startedAt: '2026-09-14T16:30:00-04:00',
    brief: `You teach AP Biology (5th period), currently on cellular respiration. Your students aced the vocabulary quiz. Then you asked "what would happen if a poison blocked the electron transport chain?" and got blank stares. They memorize but can't apply. The unit test is in two weeks and you don't have time for projects — push back once if Coach suggests something big. You want something that fits into the lessons you already have.`,
    opening: `My AP Bio kids aced the cellular respiration vocab quiz. Then I asked what would happen if a poison blocked the electron transport chain, and I got blank stares. They memorize everything, but they can't apply any of it.`,
  },
  {
    key: 'g10_passive',
    startedAt: '2026-09-16T15:35:00-04:00',
    brief: `You teach 10th grade world history. Your 8th period, the last of the day, isn't disruptive at all — it's silent. The same three students answer every question and everyone else waits them out. Cold calling makes some kids visibly anxious and you don't want to embarrass anyone. You tried think-pair-share and the pairs just chatted about other things — push back with that once. You want more students actually thinking, not just the same three.`,
    opening: `My last period isn't disruptive — it's the opposite. It's silent. The same three kids answer everything and everybody else just waits them out. Cold calling makes some of them really anxious, and I don't want to embarrass anyone.`,
  },
]

// ---- The simulated teacher ----

const TEACHER_SIM_PROMPT = `You are role-playing a real K-12 teacher who is talking OUT LOUD to a voice coaching app after school. Everything you write is transcribed speech.

About you and this conversation:
{brief}

How to speak:
- 1 to 3 sentences, first person, the way people actually talk — contractions, plain words, no lists, no markdown.
- Use concrete classroom details consistent with the brief (which period, what a student said or did). Never use a student's name — say "one boy", "a student in the back", "a couple of them".
- Respond to what Coach just said. If it's useful, say how it would work (or not) in your class. If you'd need more detail to use it, ask for it.
- Be a real, busy teacher: open, but not a cheerleader. Don't thank Coach every turn and don't gush.
- When a concrete plan you would genuinely try has come together, and this is at least your {minTurns}th line, say plainly what you'll do and when (e.g. "Okay, I'll try that with 4th period tomorrow."), then write <end/> on its own at the very end.

Write only your next line.`

async function teacherLine(scenario: Scenario, conversation: ChatMessage[]): Promise<{ text: string; ended: boolean }> {
  const transcript = conversation.map((m) => `${m.role === 'user' ? 'Teacher' : 'Coach'}: ${m.text}`).join('\n')
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    system: TEACHER_SIM_PROMPT.replace('{brief}', scenario.brief).replace('{minTurns}', String(MIN_TEACHER_TURNS)),
    messages: [{ role: 'user', content: `Conversation so far:\n${transcript}\n\nWrite the teacher's next line.` }],
  })
  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  const ended = raw.includes('<end/>')
  const text = raw.replace('<end/>', '').replace(/^Teacher:\s*/i, '').trim()
  return { text, ended }
}

// ---- Coach, exactly as the /talk and /:id/chat routes run it ----

async function coachReply(
  conversation: ChatMessage[],
  newMessage: string,
  memory: string | null,
  checkIn: { plan: string; checkInQuestion: string } | null,
): Promise<{ reply: string; memory: string | null }> {
  // The follow-up block is only on a check-in's opening turn, same as /talk;
  // /:id/chat never adds it. Its "N days ago" is computed from now, so it's
  // handed a createdAt a few days back — what the teacher would have seen.
  const followUpBlock =
    checkIn && conversation.length === 0
      ? buildFollowUpContextBlock({ ...checkIn, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })
      : ''
  const system = `${TALK_SYSTEM_PROMPT}${buildExperienceContextBlock(EXPERIENCE_LEVEL)}${followUpBlock}${buildMemoryContextBlock(memory)}${MEMORY_UPDATE_INSTRUCTION}`
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 110 + MEMORY_UPDATE_TOKEN_BUFFER,
    thinking: { type: 'disabled' },
    system,
    messages: [
      ...conversation.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: newMessage },
    ],
  })
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  if (response.stop_reason === 'max_tokens') truncatedCoachReplies += 1
  const reply = trimIfTruncated(stripTag(text, 'memory_update'), response.stop_reason)
  return { reply, memory: applyMemoryUpdate(extractTag(text, 'memory_update'), memory) }
}

// The note a teacher jots under "My Next Step" after trying the plan — written
// from the check-in's brief (what actually happened) and the real plan.
async function reflectionNoteFor(checkInBrief: string, plan: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    system: `You are a teacher writing a quick private note to yourself in a coaching app, right after trying a plan in class. The plan was: "${plan}". What happened: ${checkInBrief}\n\nWrite 1-2 short sentences in first person, under 40 words total: what you'll keep doing and what you noticed. Plain text, no names of students, no quotation marks around the whole thing.`,
    messages: [{ role: 'user', content: 'Write the note.' }],
  })
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim()
}

async function takeaway(conversation: ChatMessage[], checkIn: { plan: string; checkInQuestion: string } | null) {
  const checkInContext = checkIn
    ? `Context: this conversation was a check-in. The teacher had planned to try: "${checkIn.plan}". Coach opened by asking: "${checkIn.checkInQuestion}"\n\n`
    : ''
  const transcript = checkInContext + conversation.map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`).join('\n')
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 380,
      system: TALK_TAKEAWAY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    const explored = extractTag(text, 'explored')
    const tryNext = extractTag(text, 'try_next')
    const notice = extractTag(text, 'notice')
    if (explored && tryNext && notice) {
      return { explored, tryNext, notice, checkInQuestion: checkInQuestionFor(extractTag(text, 'check_in'), tryNext) }
    }
  }
  throw new Error('takeaway came back incomplete twice')
}

// ---- generate ----

type GeneratedSession = {
  key: string
  createdAt: string
  incidentText: string
  conversation: ChatMessage[]
  talkTakeaway: { explored: string; tryNext: string; notice: string }
  checkInQuestion: string
  checkInFor: string | null
  triedAt: string | null
  reflectionNote: string | null
}

type DemoFile = { generatedAt: string; experienceLevel: string; coachMemory: string | null; sessions: GeneratedSession[] }

async function generate(outPath: string) {
  const sessions: GeneratedSession[] = []
  let memory: string | null = null

  for (const scenario of SCENARIOS) {
    const source = scenario.checkInFor ? sessions.find((s) => s.key === scenario.checkInFor) : undefined
    const checkIn = source ? { plan: source.talkTakeaway.tryNext, checkInQuestion: source.checkInQuestion } : null
    const start = new Date(scenario.startedAt).getTime()
    const at = (turn: number) => new Date(start + turn * 45_000).toISOString()

    const conversation: ChatMessage[] = []
    let teacher = scenario.opening
    for (let turn = 1; turn <= MAX_TEACHER_TURNS; turn++) {
      const coach = await coachReply(conversation, teacher, memory, checkIn)
      memory = coach.memory
      conversation.push({ role: 'user', text: teacher, createdAt: at(turn * 2 - 1) })
      conversation.push({ role: 'assistant', text: coach.reply, createdAt: at(turn * 2) })
      if (turn === MAX_TEACHER_TURNS) break
      const next = await teacherLine(scenario, conversation)
      teacher = next.text
      if (next.ended && turn + 1 >= MIN_TEACHER_TURNS) {
        // The teacher's closing commitment still gets Coach's reply.
        const closing = await coachReply(conversation, teacher, memory, checkIn)
        memory = closing.memory
        conversation.push({ role: 'user', text: teacher, createdAt: at(turn * 2 + 1) })
        conversation.push({ role: 'assistant', text: closing.reply, createdAt: at(turn * 2 + 2) })
        break
      }
    }

    const summary = await takeaway(conversation, checkIn)
    sessions.push({
      key: scenario.key,
      createdAt: new Date(start).toISOString(),
      incidentText: scenario.opening,
      conversation,
      talkTakeaway: { explored: summary.explored, tryNext: summary.tryNext, notice: summary.notice },
      checkInQuestion: summary.checkInQuestion,
      checkInFor: scenario.checkInFor ?? null,
      triedAt: null,
      reflectionNote: null,
    })
    // A check-in means its source plan was tried, and the teacher noted
    // what they'll keep doing.
    if (source) {
      source.triedAt = new Date(start - 60 * 60 * 1000).toISOString()
      source.reflectionNote = await reflectionNoteFor(scenario.brief, source.talkTakeaway.tryNext)
    }
    console.log(`✓ ${scenario.key}: ${conversation.length / 2} exchanges`)
  }

  const file: DemoFile = { generatedAt: new Date().toISOString(), experienceLevel: EXPERIENCE_LEVEL, coachMemory: memory, sessions }
  writeFileSync(outPath, JSON.stringify(file, null, 2))
  console.log(`\nCoach replies cut off by max_tokens (memory update lost): ${truncatedCoachReplies}`)
  console.log(`Wrote ${outPath}`)
}

// ---- insert ----

async function insert(inPath: string, email: string, name: string) {
  const { prisma } = await import('../lib/prisma.ts')
  const file = JSON.parse(readFileSync(inPath, 'utf8')) as DemoFile
  file.sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const normalizedEmail = email.trim().toLowerCase()

  if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) {
    throw new Error(`${normalizedEmail} already exists — pick another email or delete that account first.`)
  }

  // Letters and digits only, so it can be read out or typed without mistakes.
  const password = randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 14)
  const firstSessionAt = new Date(file.sessions[0].createdAt)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash: await bcrypt.hash(password, 10),
        jobTitle: 'Teacher',
        experienceLevel: file.experienceLevel,
        // Lands on Home instead of the setup wizard; the teacher can still
        // edit all of this in Profile.
        onboardingCompletedAt: firstSessionAt,
        // Plus through the user row, so Coach memory and check-ins work
        // without adding this email to DEMO_ACCOUNT_EMAILS on Render.
        plan: 'plus',
        planStatus: 'active',
        coachMemory: file.coachMemory,
        coachMemoryEnabled: true,
        createdAt: new Date(firstSessionAt.getTime() - 24 * 60 * 60 * 1000),
      },
    })

    const ids = new Map<string, string>()
    for (const s of file.sessions) {
      const debrief = await tx.debrief.create({
        data: {
          userId: user.id,
          incidentText: s.incidentText,
          source: 'talk_to_me',
          saved: true,
          conversation: s.conversation,
          talkTakeaway: s.talkTakeaway,
          triedAt: s.triedAt ? new Date(s.triedAt) : null,
          reflectionNote: s.reflectionNote,
          createdAt: new Date(s.createdAt),
        },
      })
      ids.set(s.key, debrief.id)
    }

    // Replays what finishing each session did: every takeaway scheduled a
    // check-in, a newer one replaced any still waiting, and the two
    // check-in conversations answered theirs. The newest is left pending and
    // due now, so it greets the teacher on Home.
    const answeredBy = new Map(file.sessions.filter((s) => s.checkInFor).map((s) => [s.checkInFor!, s.key]))
    const last = file.sessions[file.sessions.length - 1]
    for (const s of file.sessions) {
      const finishedAt = new Date(s.conversation[s.conversation.length - 1].createdAt)
      const responder = answeredBy.get(s.key)
      const isLast = s.key === last.key
      await tx.coachFollowUp.create({
        data: {
          userId: user.id,
          sourceDebriefId: ids.get(s.key)!,
          plan: s.talkTakeaway.tryNext,
          checkInQuestion: s.checkInQuestion,
          dueAt: isLast ? new Date() : nextCheckInDate(finishedAt),
          status: responder ? 'talked' : isLast ? 'pending' : 'replaced',
          respondedDebriefId: responder ? ids.get(responder)! : null,
          createdAt: finishedAt,
        },
      })
    }
  })

  console.log(`Created ${normalizedEmail} with ${file.sessions.length} Talk It Through conversations.`)
  console.log(`Password: ${password}`)
  await prisma.$disconnect()
}

// Re-dates an already-reviewed file to the scenarios' current start times and
// rewrites its reflection notes from its own plans, so fixing a date or a
// note doesn't mean regenerating (and re-reviewing) every conversation.
async function refresh(path: string) {
  const file = JSON.parse(readFileSync(path, 'utf8')) as DemoFile
  for (const s of file.sessions) {
    const scenario = SCENARIOS.find((sc) => sc.key === s.key)
    if (!scenario) continue
    const shift = new Date(scenario.startedAt).getTime() - new Date(s.createdAt).getTime()
    s.createdAt = new Date(scenario.startedAt).toISOString()
    s.conversation = s.conversation.map((m) => ({ ...m, createdAt: new Date(new Date(m.createdAt).getTime() + shift).toISOString() }))
  }
  file.sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const s of file.sessions) {
    if (!s.checkInFor) continue
    const source = file.sessions.find((x) => x.key === s.checkInFor)!
    const scenario = SCENARIOS.find((sc) => sc.key === s.key)!
    source.triedAt = new Date(new Date(s.createdAt).getTime() - 60 * 60 * 1000).toISOString()
    source.reflectionNote = await reflectionNoteFor(scenario.brief, source.talkTakeaway.tryNext)
  }
  writeFileSync(path, JSON.stringify(file, null, 2))
  console.log(`Refreshed ${path}`)
}

const [command, ...args] = process.argv.slice(2)
if (command === 'generate' && args[0]) {
  await generate(args[0])
} else if (command === 'refresh' && args[0]) {
  await refresh(args[0])
} else if (command === 'insert' && args.length >= 3) {
  await insert(args[0], args[1], args.slice(2).join(' '))
} else {
  console.error('Usage: generate <out.json> | refresh <file.json> | insert <in.json> <email> <name>')
  process.exit(1)
}
