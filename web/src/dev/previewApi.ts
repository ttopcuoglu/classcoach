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
    if (!id) return []
    return id === 'preview-ideas' ? IDEAS : id === 'preview-feedback' ? FEEDBACK : lesson()
  }
  if (path.startsWith('/api/assignment-coach')) return []
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
