// Development only. Answers /api/* from canned data so the real pages can be
// opened and clicked through on a laptop without a backend.
//
// This exists because the local server's .env points at the production
// database, so it is never run here — which used to mean the only way to see a
// page was a standalone mock outside the real Layout, and a standalone mock
// cannot catch anything about the page's actual shell, routing, or the forms
// as they are really wired. So the preview is turned on at the real address
// instead: /lesson-planning?preview=1 renders the real route, inside the real
// Layout, through the real components, and only the network is fake.
//
// Never reaches production: main.tsx imports this dynamically behind
// `import.meta.env.DEV`, which the build replaces with `false`.

type Json = Record<string, unknown>

const PROFILE: Json = {
  id: 'preview',
  email: 'preview.teacher@wivoza.com',
  name: 'Preview Teacher',
  role: 'teacher',
  jobTitle: 'Teacher',
  schoolName: 'Preview Middle School',
  teachingGoal: null,
  // Two grades and two subjects, so the "pick the one this lesson is for"
  // chips actually appear.
  gradeLevels: '7th,8th',
  subjects: 'Science,Math',
  experienceLevel: 'early',
  onboardingProgress: null,
  onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
  termsAcceptedAt: '2026-01-01T00:00:00.000Z',
  ageConfirmedAt: '2026-01-01T00:00:00.000Z',
  audioRetentionDays: null,
  talkVoice: null,
  focusMetric: null,
  coachMemory: null,
  coachMemoryEnabled: true,
  plan: 'plus',
  planStatus: 'active',
  plusAccess: 'subscription',
  organizationId: null,
  organization: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const SEQUENCE = [
  {
    minutes: 7,
    title: 'Launch: the bag that leaks',
    teacher: 'Hold up the dialysis bag. Ask what they expect to happen to the iodine and why.',
    students: 'Write one prediction and one reason in their notebooks, then share with a partner.',
  },
  {
    minutes: 18,
    title: 'Investigation',
    teacher: 'Circulate. Ask each pair what their evidence rules out, not just what they saw.',
    students: 'Run the test in pairs and record what changes colour and what does not.',
  },
  {
    minutes: 12,
    title: 'Make sense of it together',
    teacher: 'Collect what pairs noticed. Ask: if the membrane blocked everything, what would we have seen?',
    students: 'Argue for one explanation using their own data.',
  },
  {
    minutes: 8,
    title: 'Name the idea, then exit ticket',
    teacher: 'Introduce "selectively permeable". Connect it back to the predictions on the board.',
    students: 'Write the exit ticket on their own.',
  },
]

function lesson(overrides: Json = {}): Json {
  return {
    id: 'preview-lesson',
    mode: 'generated',
    objective: 'Students will be able to explain why a cell membrane lets some things through and not others.',
    unitName: 'Cells & Systems',
    essentialQuestion: 'What makes something alive?',
    standard: 'MS-LS1-2',
    subject: 'Science',
    gradeLevel: '7th',
    planText: null,
    feedback: null,
    rating: null,
    doNow: null,
    agenda: null,
    closure: null,
    hots: null,
    homework: null,
    saved: false,
    shareToken: null,
    createdAt: new Date().toISOString(),
    conversation: [],
    suggestedRevision: null,
    deliveryCoaching: null,
    fileName: null,
    slideCount: null,
    presentationReview: null,
    planKind: 'full',
    durationMinutes: 45,
    additionalContext: null,
    sourceMaterial: null,
    approach: 'Inquiry, then naming the idea',
    successCriteria: '- I can name two things a membrane does\n- I can explain what would happen without one',
    materials: '- Dialysis tubing, iodine, starch solution\n- One beaker per pair',
    sequence: SEQUENCE,
    checks: [
      {
        when: 'After the prediction',
        check: 'Pairs hold up a whiteboard with their prediction and one reason.',
        lookFor: 'A reason that names what crosses the barrier, not just "it leaks".',
      },
      {
        when: 'During the sense-making discussion',
        check: 'Ask two pairs to say what their data rules out.',
        lookFor: 'Students using their own observation as evidence rather than repeating the textbook phrase.',
      },
    ],
    misconceptions: [
      {
        belief: 'Students often think the membrane is a solid wall that blocks everything.',
        surface: 'Ask whether water gets in, and how they know from today’s results.',
        response: 'Compare it to a screen door rather than a brick wall, then point back to the iodine.',
      },
      {
        belief: 'Students often treat "semi-permeable" as a property of the liquid rather than the membrane.',
        surface: 'Swap the liquids in a hypothetical and ask what changes.',
        response: 'Keep the liquid fixed and change the barrier, so the variable is visible.',
      },
    ],
    exitTicket: {
      task: 'In two sentences, explain why a cell without a membrane could not survive.',
      expected: 'Names control of what enters and leaves the cell.',
      signals: 'A strong answer names selectivity. A partial one says "it holds things in". A confused one describes the membrane as a wall.',
      nextStep: 'If most answers stop at "it holds things in", open tomorrow with the screen-door comparison.',
    },
    quickIdeas: null,
    pendingAdaptation: null,
    versionHistory: null,
    ...overrides,
  }
}

const IDEAS: Json = lesson({
  id: 'preview-ideas',
  planKind: 'ideas',
  approach: null,
  successCriteria: null,
  materials: null,
  sequence: null,
  checks: null,
  misconceptions: null,
  exitTicket: null,
  quickIdeas: [
    { title: 'The bag that leaks', how: 'Set up dialysis tubing with starch and drop it in iodine before you say anything. Students predict, then watch. You get the whole idea of selective permeability from one demo they argued about first.' },
    { title: 'Screen door, not brick wall', how: 'Give pairs two pictures and ask which one a membrane is more like, and why. The wrong answer is the common misconception, so you hear it early rather than on the test.' },
    { title: 'Sort the molecules', how: 'Cards with oxygen, water, glucose, starch, sodium. Pairs sort them into "gets through" and "needs help", then defend one borderline card to the class.' },
  ],
})

const ADAPTED_SEQUENCE = [
  { minutes: 5, title: 'Launch: the bag that leaks', teacher: 'Hold up the bag. One question: what will happen, and why?', students: 'Write a prediction and one reason.' },
  { minutes: 13, title: 'Investigation', teacher: 'Circulate. Ask what their evidence rules out.', students: 'Run the test in pairs and record what changes.' },
  { minutes: 8, title: 'Name the idea, then exit ticket', teacher: 'Introduce "selectively permeable" and tie it to the board.', students: 'Write the exit ticket.' },
  { minutes: 4, title: 'Exit ticket', teacher: 'Collect at the door.', students: 'Two sentences, on their own.' },
]

const FEEDBACK: Json = lesson({
  id: 'preview-feedback',
  mode: 'feedback',
  planKind: null,
  approach: null,
  durationMinutes: null,
  successCriteria: null,
  materials: null,
  sequence: null,
  checks: null,
  misconceptions: null,
  exitTicket: null,
  objective: null,
  planText: 'Do Now: three questions on the board.\n\nMini-lesson: explain diffusion, then the membrane.\n\nGroup work: the dialysis bag lab.\n\nExit: what did you learn?',
  feedback:
    'The lab is doing real work here — students see the thing before they are asked to name it, and that order is right.\n\nTwo places it will wobble. The mini-lesson gives away the answer before the bag goes in the beaker, so the lab becomes confirmation rather than investigation. And "what did you learn?" will get you a sentence about the colour, not about selectivity.',
  conversation: [
    { role: 'user', text: 'my plan' },
    { role: 'assistant', text: 'Here is my read of it.' },
  ],
})

// Home's "Your next step" is a priority list, and only one rule fires at a
// time, so a single fixture can only ever show one of them. `?home=` names
// which tools the preview teacher has already used, and everything Home reads
// answers from that — `?preview=1&home=talk,planning` is a teacher who has
// used those two and nothing else. Empty means a brand-new teacher.
function homeTools(): Set<string> {
  const raw = new URLSearchParams(window.location.search).get('home')
  return new Set((raw ?? '').split(',').map((t) => t.trim()).filter(Boolean))
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

// A recorded lesson that finished analysis. `reflect` is what Home's
// "reflect on your last lesson" rule looks for.
function audioSession(id: string, studentTalkPct: number, days: number, reflected: boolean): Json {
  return {
    id,
    teacherName: 'Preview Teacher',
    classSubject: 'Science',
    period: '3',
    gradeLevel: '7th',
    sessionDate: daysAgo(days),
    consentConfirmed: true,
    status: 'analyzed',
    durationSec: 2700,
    teacherTalkPct: 100 - studentTalkPct,
    studentTalkPct,
    questionCount: 14,
    higherOrderPct: 36,
    avgWaitTimeSec: 2.4,
    cfuCount: 5,
    metricsDetail: null,
    highlights: null,
    phases: null,
    questionLog: null,
    cfuLog: null,
    feedbackLog: null,
    reflectConversation: reflected ? [{ role: 'coach', text: 'What stood out?' }] : [],
    createdAt: daysAgo(days),
    updatedAt: daysAgo(days),
  }
}

function debrief(id: string, source: string, text: string, days: number): Json {
  return {
    id,
    incidentText: text,
    focusArea: null,
    category: null,
    gradeBand: null,
    subject: null,
    course: null,
    source,
    saved: false,
    createdAt: daysAgo(days),
    updatedAt: daysAgo(days),
  }
}

// Canned answers, matched longest-path-first so '/api/lesson-plans/x/adapt'
// does not get answered by '/api/lesson-plans'.
function answer(path: string, method: string, body: Json): Json | Json[] | null {
  if (path.startsWith('/api/auth/me') || path.startsWith('/api/profile')) return PROFILE
  if (path.endsWith('/adapt')) {
    const action = String(body.action ?? 'simplify')
    // A plan the teacher brought themselves is revised as prose, not as the
    // structured sections — same split the real route makes.
    if (path.includes('preview-feedback')) {
      return {
        ...FEEDBACK,
        pendingAdaptation: {
          action,
          label: action === 'simplify' ? 'Simplify' : 'Add Challenge',
          minutes: null,
          summary: '- Moved the mini-lesson after the lab so the bag is the first thing they meet\n- Replaced the exit question with one that asks for selectivity by name',
          sections: {
            planText:
              'Do Now: three questions on the board.\n\nGroup work: the dialysis bag lab — predict first, in writing.\n\nMini-lesson: name what they saw. Diffusion, then the membrane.\n\nExit: in two sentences, why can a cell not survive without a membrane?',
          },
        },
      }
    }
    const minutes = Number(body.targetMinutes) || null
    const label =
      action === 'simplify' ? 'Simplify' : action === 'challenge' ? 'Add Challenge' : action === 'participation' ? 'Increase Participation' : 'Adjust Time'
    return lesson({
      pendingAdaptation: {
        action,
        label,
        minutes,
        summary:
          action === 'time'
            ? `- Cut the sense-making discussion and folded its question into the naming step\n- Retimed every part to add up to ${minutes ?? 30} minutes\n- Protected the investigation and the exit ticket`
            : '- Broke the investigation directions into four numbered steps\n- Added a sentence starter for the prediction\n- Kept the learning goal and the exit ticket as they were',
        sections: {
          objective: 'Students will be able to explain why a cell membrane lets some things through and not others.',
          successCriteria: '- I can name two things a membrane does\n- I can explain what would happen without one',
          approach: 'Inquiry, then naming the idea',
          sequence: action === 'time' ? ADAPTED_SEQUENCE : SEQUENCE,
          exitTicket: {
            task: 'In two sentences, explain why a cell without a membrane could not survive.',
            expected: 'Names control of what enters and leaves the cell.',
            signals: null,
            nextStep: null,
          },
        },
      },
    })
  }
  if (path.endsWith('/apply-adaptation')) {
    return lesson({
      durationMinutes: 30,
      sequence: ADAPTED_SEQUENCE,
      versionHistory: [{ label: 'Original', savedAt: new Date().toISOString(), sections: { sequence: SEQUENCE }, durationMinutes: 45 }],
    })
  }
  if (path.endsWith('/discard-adaptation') || path.endsWith('/revert')) return lesson()
  if (path.endsWith('/infer-context')) {
    return { topic: 'Cell membranes and diffusion', subject: 'Science', gradeLevel: '7th grade', followUp: 'What do you want students to be able to do with this reading by the end?' }
  }
  if (path.endsWith('/lesson-plans/generate')) return body.kind === 'ideas' ? IDEAS : lesson()
  if (path.endsWith('/lesson-plans/feedback')) return FEEDBACK
  if (path.startsWith('/api/lesson-plans')) {
    if (method !== 'GET') return lesson()
    // A GET with an id is one plan (the printable report); without one it is
    // the history list.
    const id = path.replace('/api/lesson-plans', '').split('?')[0].replace(/^\//, '')
    if (!id) return homeTools().has('planning') ? [lesson({ createdAt: daysAgo(8) })] : []
    return id === 'preview-ideas' ? IDEAS : id === 'preview-feedback' ? FEEDBACK : lesson()
  }

  // --- Home ---
  const tools = homeTools()
  if (path.startsWith('/api/follow-ups/due')) {
    return tools.has('checkin')
      ? [{ id: 'preview-followup', checkInQuestion: 'How did the seating change go with 3rd period?', createdAt: daysAgo(2) }]
      : []
  }
  if (path.startsWith('/api/audio-sessions')) {
    if (!tools.has('debrief')) return []
    // Five analyzed lessons so the sparkline draws, with the newest either
    // reflected on or not depending on whether the reflect rule is wanted.
    const reflected = !tools.has('unreflected')
    return [
      audioSession('preview-a1', 18, 40, true),
      audioSession('preview-a2', 21, 31, true),
      audioSession('preview-a3', 19, 24, true),
      audioSession('preview-a4', 26, 11, true),
      audioSession('preview-a5', 29, 4, reflected),
    ]
  }
  if (path.startsWith('/api/attempts')) {
    return tools.has('practice')
      ? [{
          id: 'preview-attempt',
          scenario: { id: 'preview-scenario', text: 'A student refuses to put their phone away and the class is watching.', category: 'disruption' },
          rating: 4,
          createdAt: daysAgo(6),
        }]
      : []
  }
  if (path.startsWith('/api/debriefs')) {
    const rows: Json[] = []
    // A busy Talk It Through week on purpose: four rows close together is the
    // case that used to fill every slot in the list.
    if (tools.has('talk')) {
      rows.push(debrief('preview-talk-1', 'talk_to_me', 'A student told me to remove the grades from my grading book and I said no.', 1))
      rows.push(debrief('preview-talk-2', 'talk_to_me', 'I have a parent who keeps complaining no matter how much support I offer.', 2))
      rows.push(debrief('preview-talk-3', 'talk_to_me', 'A student cursed at a classmate and I had to take him out of class.', 3))
      rows.push(debrief('preview-talk-4', 'talk_to_me', 'A co-teacher keeps telling me what to do and I don\u2019t want to hurt his feelings.', 12))
    }
    if (tools.has('ask')) rows.push(debrief('preview-ask', 'ask_tab', 'What do I do about a student who will not start the work?', 9))
    return rows
  }
  if (path.startsWith('/api/conversation-plans')) {
    return tools.has('communication')
      ? [{
          id: 'preview-conv-plan',
          recipientType: 'parent',
          situationText: 'A parent has asked for a meeting about their child\u2019s grade in my class.',
          title: null,
          planContent: null,
          saved: false,
          conversation: [],
          createdAt: daysAgo(5),
        }]
      : []
  }
  if (path.startsWith('/api/assignment-coach')) {
    // The whole point of the Planning Coach fix: assignment rows alone mean
    // the tool has been opened.
    // No title, so Recent work falls through to the objective — the fallback
    // chain is the point of showing this one here.
    return tools.has('assignment')
      ? [{
          id: 'preview-assignment',
          mode: 'review',
          title: null,
          objective: 'A lab write-up on diffusion that students can\u2019t finish with a chatbot.',
          originalText: null,
          status: 'completed',
          conversation: [],
          saved: false,
          createdAt: daysAgo(7),
        }]
      : []
  }
  return null
}

export function installPreviewApi() {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const path = url.startsWith('http') ? new URL(url).pathname : url
    if (!path.startsWith('/api/')) return real(input, init)

    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')) || 'GET'
    let body: Json = {}
    try {
      body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}
    } catch {
      body = {}
    }

    const result = answer(path, method, body)
    // A deliberate pause, so the progress rings and disabled states are
    // visible rather than flashing past.
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (result == null) return new Response(JSON.stringify({ error: `No preview answer for ${method} ${path}` }), { status: 501 })
    return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  console.info('[preview] /api/* is answering from canned data (dev only)')
}
