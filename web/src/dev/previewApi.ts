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
  // `?admin=1` makes the preview an org admin, which is what the /admin route
  // guard checks — without it the page redirects home and cannot be looked at.
  role: new URLSearchParams(window.location.search).has('admin') ? 'org_admin' : 'teacher',
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
    metricsDetail: {
      teacherWordsPerMinute: 150 + ((days * 7) % 70),
      longestTeacherMonologueSec: 120 + ((days * 23) % 300),
      waitTime2Sec: Math.round((0.4 + ((days * 3) % 25) / 10) * 10) / 10,
      waitTime2SampleCount: 4 + (days % 9),
      higherOrderQuestionCount: (days * 3) % 9,
      followUpQuestionCount: days % 5,
      studentVoiceSegments: 8 + (days % 20),
    },
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

/// A whole analyzed lesson, rich enough that every Insights section has
/// something in it — including the two lenses and the student-talk focus card,
/// which are the parts whose placement is easiest to get wrong and impossible
/// to check from a list of sessions.
// The escalation read (server/src/lib/escalation.ts), with the real shape of
// a found spiral: a run of asks climbing from a named consequence to a student
// being separated, plus the teacher's own back-reference to an earlier ask.
// Numbers deliberately absent from the copy — only the moment and the rung.
function escalationFixture(): Json {
  const tools = homeTools()
  if (tools.has('escalation_unheard')) {
    return {
      state: 'not_measurable',
      reason:
        'Only about 15% of this recording came through as speech the microphone could resolve, so this can\u2019t tell you whether attention held. A quiet transcript here means the mic lost the room — group work, distance, voices over each other — not that the room was quiet.',
      peakRung: null,
      clusters: [],
      repeatedAsks: [],
      capturedSharePct: 15,
    }
  }
  if (tools.has('escalation_none')) {
    return { state: 'confirmed_none', reason: null, peakRung: null, clusters: [], repeatedAsks: [], capturedSharePct: 67 }
  }
  return {
    state: 'found',
    reason: null,
    peakRung: 'removal',
    clusters: [
      {
        startSec: 794,
        endSec: 835,
        bidCount: 5,
        fromRung: 'consequence',
        topRung: 'removal',
        climbed: true,
        quote: 'We\u2019re not working together today.',
      },
      // A second, milder run — stored but never shown, so this fixture also
      // proves the page shows one moment rather than the list.
      { startSec: 587, endSec: 598, bidCount: 3, fromRung: 'attention', topRung: 'behaviour', climbed: true, quote: null },
    ],
    repeatedAsks: [{ timestampSec: 587, quote: 'Excuse me? What did I say?' }],
    capturedSharePct: 48,
  }
}

function previewReport(): Json {
  const previewSoundTimeline = (): Json => {
    const words = [60, 120, 240, 300, 310, 340, 420, 505, 540, 620, 640, 700, 900, 980]
    let seconds = ''
    let wordsSec = 0
    let soundSec = 0
    let quietSec = 0
    for (let sec = 0; sec < 1380; sec++) {
      const c = words.some((w) => sec >= w && sec < w + 6)
        ? 'w'
        : sec < 60 || (sec >= 720 && sec < 900) || sec >= 1250
          ? 's'
          : 'q'
      seconds += c
      if (c === 'w') wordsSec++
      else if (c === 's') soundSec++
      else quietSec++
    }
    return {
      seconds,
      wordsSec,
      soundSec,
      quietSec,
      soundRuns: [
        { startSec: 0, endSec: 60 },
        { startSec: 720, endSec: 900 },
        { startSec: 1250, endSec: 1380 },
      ],
    }
  }
  const seg = (speakerLabel: 'Teacher' | 'Student', startSec: number, text: string): Json => ({
    id: `seg-${startSec}`,
    speakerLabel,
    startSec,
    endSec: startSec + 6,
    text,
  })
  return {
    ...(audioSession('preview-report', 22, 1, true) as Record<string, unknown>),
    teacherTalkPct: 48,
    studentTalkPct: 14,
    durationSec: 1380,
    status: 'analyzed',
    classSubject: 'World history',
    metricsDetail: {
      totalDurationSec: 1380,
      // The low-capture mode has to lower these too, not just the escalation
      // state: the header's trust line reads coverage from here, and a
      // fixture where the card says 15% while the header says nine of nine
      // metrics measured confidently is exactly the contradiction this whole
      // change exists to remove.
      ...(homeTools().has('escalation_unheard')
        ? { teacherTalkSec: 129, studentTalkSec: 73 }
        : { teacherTalkSec: 880, studentTalkSec: 300 }),
      studentVoiceSegments: 14,
      longestTeacherMonologueSec: 360,
      recallQuestionCount: 4,
      higherOrderQuestionCount: 3,
      followUpQuestionCount: 1,
      waitTimeSampleCount: 4,
      teacherWordsPerMinute: 214,
      waitTime2Sec: 0.4,
      waitTime2SampleCount: 11,
      // Median silence held after a question nobody answered aloud. The real
      // lessons this was built against sit at 3.9s across 65 such questions.
      heldSilenceSec: 3.9,
      heldSilenceSampleCount: 9,
      firstWordSec: 269,
      // `home=split` shows the quiet / could-not-make-out breakdown that a
      // recording with a loudness envelope produces. Without the flag the
      // fixture has no envelope, which is every lesson recorded before this
      // shipped — and that path must keep showing one combined slice.
      ...(homeTools().has('split') ? { quietSec: 200, unresolvedSec: 324 } : {}),
      // `home=imbalance` reproduces the real lesson that prompted this card:
      // six redirections and no detected encouragement. It is the case the
      // wording has to get right, because a zero here is a detector limit far
      // more often than it is a fact about the teacher.
      ...(homeTools().has('imbalance')
        ? { redirectionCount: 6, positivePhraseCount: 0, correctivePhraseCount: 1 }
        : { redirectionCount: 3, positivePhraseCount: 2, correctivePhraseCount: 1 }),
      firstRedirectionTimestampSec: 540,
      transitionCount: 3,
      directiveCount: 5,
      positiveToCorrectiveRatio: 2,
      genericFeedbackCount: 2,
      specificFeedbackCount: 1,
      nameMentionCount: 6,
      uniqueNameCount: 4,
    },
    questionLog: [
      { timestampSec: 300, type: 'higher_order', waitTimeSec: 3.1, text: 'Why do you think wages went up after the plague?', followUps: [] },
      { timestampSec: 620, type: 'recall', waitTimeSec: 0.4, text: 'What year did it reach England?', followUps: [] },
    ],
    cfuLog: [{ timestampSec: 700, text: 'Thumbs up if that makes sense so far', whatItChecked: 'whether the class followed the causal chain' }],
    feedbackLog: [
      { timestampSec: 340, kind: 'specific', text: 'Yes — you used the labour shortage to get there.' },
      { timestampSec: 900, kind: 'generic', text: 'Good work.' },
    ],
    directiveLog: [{ timestampSec: 120, text: 'Take out your packets and turn to page four.' }],
    toneLog: [{ timestampSec: 340, kind: 'positive', text: "That's exactly the connection I wanted." }],
    redirectionLog: [{ timestampSec: 540, text: 'Eyes up here for a second.' }],
    lessonContent: {
      topicTerms: { teacher: [], student: [] },
      statedObjective: { found: true, quote: 'By the end of today you will explain why the Black Death changed wages in Europe.', timestampSec: 60, source: 'model' },
      summary: 'The Black Death and its effects on labour and wages in medieval Europe.',
      connections: [{ quote: 'Remember what we said about supply and demand last week.', timestampSec: 420 }],
      vocabulary: [{ quote: 'Overgrazing just means too many animals on too little land.', timestampSec: 240 }],
      keyTerms: [
        { term: 'black death', teacherCount: 9, studentCount: 2 },
        { term: 'wages', teacherCount: 7, studentCount: 3 },
        { term: 'supply and demand', teacherCount: 5, studentCount: 0 },
        { term: 'feudalism', teacherCount: 3, studentCount: 0 },
        { term: 'serf', teacherCount: 2, studentCount: 1 },
      ],
      subject: 'world history',
    },
    contentNotes: {
      subject: 'world history',
      notes: [
        { id: 'n1', label: 'What worked', text: 'Tying the labour shortage to supply and demand gave students a tool they already had.', timestampSec: 420, excerpt: 'Remember what we said about supply and demand last week.' },
        { id: 'n2', label: 'Where it could go further', text: 'The step from higher wages to the end of serfdom was named but not explained.', timestampSec: 900, excerpt: 'And that is basically the end of serfdom.' },
        { id: 'n3', label: 'Worth double-checking', text: 'The death toll was given as one third; estimates range more widely.', timestampSec: 1100, excerpt: 'About a third of Europe.' },
      ],
    },
    nextSteps: {
      talk: 'After explaining why wages rose, have pairs retell the chain of causes to each other before you move on.',
      questions: "Follow your next recall question with 'what makes you say that?' and take a second student's view.",
    },
    momentToRevisit: {
      generatedAt: new Date().toISOString(),
      status: 'found',
      headline: 'You asked what overgrazing is, waited, and then explained it yourself.',
      quote: 'What is overgrazing?',
      timestampSec: 547,
      whyItMatters: 'The examples that followed were built on a term nobody in the room had yet had to explain.',
      tryNext: 'Ask it, give pairs thirty seconds to write a one-line guess, and take two answers before you explain.',
    },
    classSummary: 'The lesson traced the Black Death through to its effect on wages, opening with a stated objective and returning twice to prior work on supply and demand.',
    // Long on purpose, so the note's "Read more" has something to fold.
    talkNarrative: 'Your voice carried the explanatory weight of this lesson, particularly across one long stretch early on. Students were audible mainly in short answers to direct questions. There is a visible shift partway through, from explanation into the wage data, where two students offered reasons of their own before you summed up. The room microphone sat near you, so talk between students during the source work likely went unheard, and the low student share may say more about the microphone than the room.',
    questionsNarrative: 'Seven questions, leaning recall, with one followed up after a student answered.',
    checksNarrative: 'One spoken check landed mid-lesson, after the causal chain had been laid out.',
    climateNarrative: 'Three transitions and three redirections, all brief and directed at noise rather than individuals.',
    // All three escalation states, because the one that is easiest to get
    // wrong is the one that looks like good news. `home=escalation_none`
    // shows a lesson where the asking held; `home=escalation_unheard` shows
    // the recording the microphone lost, which must never read as calm.
    escalation: escalationFixture(),
    // Quotes taken from the real lessons this was built against, so the
    // layout is exercised by the kind of sentences teachers actually say
    // rather than tidy invented ones.
    teachingMoves: {
      selfAnswered: [
        { quote: 'So what does abandoned mean? It\u2019s abandoned in the definition of abandoned.', timestampSec: 892 },
      ],
      questionKinds: [
        { quote: 'What do you think abandoned means?', timestampSec: 877, kind: 'explain' },
        { quote: 'So what was the big one?', timestampSec: 780, kind: 'recall' },
        { quote: 'Why do you think wages went up after the plague?', timestampSec: 301, kind: 'evaluate' },
      ],
      directions: [
        { quote: 'I\u2019m gonna give you guys about five ish minutes. I want you guys to read over that and answer these two questions down here.', timestampSec: 766, parts: ['task', 'time'] },
        { quote: 'All you need to do is read through it.', timestampSec: 869, parts: ['task'] },
        { quote: 'Off you go.', timestampSec: 1180, parts: [] },
      ],
      explanations: [
        { quote: 'Waxing is like wax on, wax off \u2014 it grows the same way.', timestampSec: 300, kind: 'analogy' },
        { quote: 'So they created a number system that used zero as an actual number.', timestampSec: 319, kind: 'example' },
      ],
      revisionPrompts: [
        { quote: 'I\u2019m not the answer. Take a guess.', timestampSec: 364 },
        { quote: 'I mean, I\u2019m just having you figure out your own answer. That\u2019s all.', timestampSec: 1581 },
      ],
      invitations: [
        { quote: 'So does anybody wanna share some of the things that they noticed about their egg?', timestampSec: 952 },
        { quote: 'Who wants to read the paragraph for this one?', timestampSec: 1254 },
      ],
      redirections: [
        { quote: 'When I\u2019m talking, you are not.', timestampSec: 267, clarity: 'actionable' },
        { quote: 'Don\u2019t wanna hear any more conversation.', timestampSec: 598, clarity: 'vague' },
      ],
      connections: [
        { quote: 'We talked about the Indus River Valley, we\u2019ve talked about the Gupta.', timestampSec: 457, kind: 'prior' },
        { quote: 'Throughout history, different empires have risen and fallen.', timestampSec: 518, kind: 'purpose' },
      ],
    },
    studentTalkFocus: {
      generatedAt: new Date().toISOString(),
      classified: 14,
      sampled: false,
      onTopic: 9,
      procedural: 2,
      offTopic: 2,
      unclear: 1,
      examples: [
        { timestampSec: 310, text: 'Because there were fewer people left to do the work', kind: 'on_topic' },
        { timestampSec: 640, text: 'Do we need to write this part down', kind: 'procedural' },
        { timestampSec: 505, text: 'did you see the game last night', kind: 'off_topic' },
        { timestampSec: 980, text: "I'm not here. I don't have anything on this.", kind: 'off_topic' },
      ],
    },
    hardLook: {
      generatedAt: new Date().toISOString(),
      critiques: [
        {
          section: 'talk',
          headline: 'You held the floor for six straight minutes early on.',
          critique: 'The longest unbroken stretch of teacher talk ran about six minutes starting around 1:00, inside an overall 64% share. Whatever was in it, no student voice broke it.',
          likelyCost: 'Students who lost the thread early had no point to re-enter or ask something for six minutes.',
          nextStep: 'Break the opening explanation at three minutes and take one question before continuing.',
          evidence: [],
        },
        {
          section: 'questions',
          headline: 'A recall question got four tenths of a second before an answer.',
          critique: 'The average wait of 3.1 seconds is carried by one higher-order question; the recall check about the year got 0.4 seconds, which is not processing time.',
          likelyCost: 'Students who needed a beat to retrieve the date were likely passed over for whoever answered fastest.',
          nextStep: 'Ask the question, then count to five silently before taking a hand.',
          evidence: [{ kind: 'Recall question, about 0.4s before a student answered', timestampSec: 620, text: 'What year did it reach England?' }],
        },
        {
          section: 'questions',
          headline: 'Only one of seven questions was followed up.',
          critique: 'Six questions were asked and answered and then left there. The one follow-up came after the wages question, which is also the only place a student built on their own answer.',
          likelyCost: 'Partial answers stayed partial, and the class moved on with a shakier grasp than it looked.',
          nextStep: 'After any answer you accept, ask "what makes you say that?" before moving on.',
          evidence: [{ kind: 'Higher-order question', timestampSec: 300, text: 'Why do you think wages went up after the plague?' }],
        },
        {
          section: 'routines',
          headline: 'Three redirections, all about the same noise.',
          critique: 'All three addressed volume rather than content, which suggests the first one did not land.',
          likelyCost: 'Repeated redirection on one issue eats instructional time and signals the first request was optional.',
          nextStep: 'Pair the next redirection with what to do instead, not just what to stop.',
          evidence: [{ kind: 'Redirection', timestampSec: 540, text: 'Eyes up here for a second.' }],
        },
      ],
      cleared: [
        {
          section: 'content',
          reason: 'The objective was stated out loud, vocabulary was defined when introduced, and the lesson tied back to prior work twice — the audible evidence shows no clarity problem.',
        },
      ],
    },
    // `home=split` also carries the per-second timeline the server works out
    // from the envelope, laid out so the Talk flow strip shows all four kinds:
    // a lost opening minute, a lost stretch mid-lesson, a quiet work block.
    ...(homeTools().has('split') ? { soundTimeline: previewSoundTimeline() } : {}),
    segments: [
      seg('Teacher', 60, 'By the end of today you will explain why the Black Death changed wages in Europe.'),
      seg('Teacher', 120, 'Take out your packets and turn to page four.'),
      seg('Teacher', 240, 'Overgrazing just means too many animals on too little land.'),
      seg('Teacher', 300, 'Why do you think wages went up after the plague?'),
      seg('Student', 310, 'Because there were fewer people left to do the work'),
      seg('Teacher', 340, 'Yes — you used the labour shortage to get there.'),
      seg('Teacher', 420, 'Remember what we said about supply and demand last week.'),
      seg('Student', 505, 'did you see the game last night'),
      seg('Teacher', 540, 'Eyes up here for a second.'),
      seg('Teacher', 620, 'What year did it reach England?'),
      seg('Student', 640, 'Do we need to write this part down'),
      seg('Teacher', 700, 'Thumbs up if that makes sense so far'),
      seg('Teacher', 900, 'Good work.'),
      seg('Student', 980, "I'm not here. I don't have anything on this."),
    ],
  }
}

/// A school's admin overview, with numbers taken from the seeded demo school
/// rather than invented — so the page is looked at against roughly what a
/// real one produces.
///
/// Deliberately mixed confidence: wait time and talk are 'full', the two
/// newest metrics 'limited', and one metric has none at all. A fixture where
/// everything is confident would never show the suppression and badge paths,
/// which are most of what makes this page honest.
function adminOverview(): Json {
  const tally = (count: number, teachers: number) => ({ count, teachers })
  return {
    scope: 'organization',
    organizationName: 'Preview Middle School',
    totalTeachers: 34,
    activatedAccounts: 27,
    activeThisWeek: 14,
    returningUsers: 11,
    activitiesThisWeek: 96,
    activitiesPriorWeek: 78,
    periodStart: daysAgo(7),
    periodEnd: daysAgo(0),
    featureActivity: { lessonDebrief: 38, talkItThrough: 24, lessonPlanning: 19, communications: 9, practiceReflect: 6 },
    featureAdoption: { lessonDebrief: 12, talkItThrough: 9, lessonPlanning: 7, communications: 4, practiceReflect: 3 },
    communicationsByTool: {
      write: { activity: 5, teachers: 3 },
      prepare: { activity: 3, teachers: 2 },
      review: { activity: 1, teachers: 1 },
    },
    planningByTool: {
      build: { activity: 9, teachers: 5 },
      improve: { activity: 5, teachers: 3 },
      slides: { activity: 3, teachers: 2 },
      assignment: { activity: 2, teachers: 2 },
    },
    categoryTally: { disruption: tally(14, 6), engagement: tally(9, 5), pacing: tally(4, 3) },
    challengeTally: { 'off-task talk': tally(11, 5), 'low participation': tally(7, 4) },
    messagePurposeTally: { 'progress update': tally(6, 4), concern: tally(3, 2) },
    strengths: [
      { label: 'Clear directions', value: 18, confidence: 'full' },
      { label: 'Encouraging tone', value: 11, confidence: 'full' },
      { label: 'Checks for understanding', value: 4, confidence: 'limited' },
    ],
    priorityTally: { 'wait time': tally(12, 7), 'student talk': tally(8, 5) },
    // What the seeded demo school's plan reports: 3 of its 71 lessons fall
    // under the coverage bar.
    audioCoverage: { analyzedLessons: 71, countedLessons: 68, lowAudioLessons: 3 },
    instructionalAverages: {
      totalAnalyzedSessions: 68,
      // Taken from the seeded demo school's own backfilled values.
      avgWaitTimeSec: 2.9,
      waitTimeSampleSize: 71,
      waitTimeConfidence: 'full',
      avgWaitTime2Sec: 0.8,
      waitTime2SampleSize: 4,
      waitTime2Confidence: 'limited',
      avgTeacherPaceWpm: 142,
      paceSampleSize: 71,
      paceConfidence: 'full',
      avgTeacherTalkPct: 68,
      avgStudentTalkPct: 14,
      talkSampleSize: 71,
      talkConfidence: 'full',
      higherOrderPct: 24,
      higherOrderSampleSize: 410,
      higherOrderConfidence: 'full',
      realLifeConnectionRatePct: 38,
      realLifeConnectionSampleSize: 66,
      realLifeConnectionConfidence: 'full',
      avgFollowUpPer10Min: 0.6,
      followUpSampleSize: 71,
      followUpConfidence: 'full',
      cfuRatePct: 41,
      cfuSampleSize: 64,
      cfuConfidence: 'full',
    },
    climateAverages: {
      avgRedirectionPer10Min: 1.4,
      redirectionFrequencySampleSize: 71,
      redirectionConfidence: 'full',
      zeroRedirectionRatePct: 31,
      redirectionMeasuredSampleSize: 71,
      redirectionMeasuredConfidence: 'full',
      avgTransitionPer10Min: 1.1,
      transitionSampleSize: 71,
      transitionConfidence: 'full',
      clearDirectivesRatePct: 72,
      directiveSampleSize: 71,
      directiveConfidence: 'full',
      positiveTonePct: 64,
      toneSampleSize: 55,
      toneConfidence: 'full',
    },
    contentNoteTally: { 'Where it could go further': tally(21, 9), 'What worked': tally(19, 9) },
    growth: { recentStrong: 9, recentTotal: 22, priorStrong: 5, priorTotal: 20 },
    weeklyActivity: Array.from({ length: 8 }, (_, i) => ({
      weekStart: daysAgo((7 - i) * 7),
      activeCount: 6 + ((i * 3) % 9),
    })),
  }
}

/// Grade and subject buckets, including a suppressed one and a combined one —
/// the two paths that keep an individual teacher from being identifiable, and
/// the ones a fixture where every bucket is full would never exercise.
function adminBreakdown(): Json {
  const metrics = (wait: number | null, wait2: number | null, pace: number | null) => ({
    avgWaitTimeSec: wait,
    waitTimeSampleSize: wait == null ? 0 : 24,
    waitTimeConfidence: wait == null ? 'none' : 'full',
    avgWaitTime2Sec: wait2,
    waitTime2SampleSize: wait2 == null ? 0 : 4,
    waitTime2Confidence: wait2 == null ? 'none' : 'limited',
    avgTeacherPaceWpm: pace,
    paceSampleSize: pace == null ? 0 : 24,
    paceConfidence: pace == null ? 'none' : 'full',
    avgTeacherTalkPct: 66,
    talkSampleSize: 24,
    talkConfidence: 'full',
    higherOrderPct: 22,
    higherOrderSampleSize: 140,
    higherOrderConfidence: 'full',
    avgRedirectionPer10Min: 1.2,
    redirectionFrequencySampleSize: 24,
    redirectionConfidence: 'full',
    positiveTonePct: 61,
    toneSampleSize: 20,
    toneConfidence: 'full',
  })
  return {
    minTeachers: 3,
    countedLessons: 68,
    lowAudioLessons: 3,
    breakdown: [
      { bucket: '7th grade', suppressed: false, metrics: metrics(3.1, 0.9, 138) },
      { bucket: '8th grade', suppressed: false, metrics: metrics(2.4, 0.6, 151) },
      { bucket: 'Science + Math', suppressed: false, combined: ['Science', 'Math'], metrics: metrics(2.8, null, 144) },
      { bucket: 'Art', suppressed: true, metrics: metrics(null, null, null) },
    ],
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

  if (path.startsWith('/api/admin/overview/breakdown')) return adminBreakdown()
  // Which My Growth focus teachers picked. Worth a real fixture rather than an
  // empty one: this is the surface that shows whether the seven metrics the
  // trend redesign kept are the ones teachers actually choose.
  if (path.startsWith('/api/admin/overview/focus-areas')) {
    return {
      suppressed: false,
      minTeachers: 3,
      totalTeachers: 27,
      areas: [
        { metric: 'talkRatio', count: 7 },
        { metric: 'waitTime2', count: 5 },
        { metric: 'teacherPace', count: 4 },
        { metric: 'higherOrderPct', count: 3 },
        // A teacher who chose a metric before it was retired. It still has to
        // render, which is why retired members were kept in the type.
        { metric: 'avgWaitTime', count: 2 },
      ],
      otherCount: 6,
    }
  }
  // A DIFFERENT endpoint with a different shape — the card reads `.items`, and
  // returning a bare array here took the whole page to a blank screen rather
  // than failing one card.
  if (path.startsWith('/api/admin/pd-focus-areas')) return { items: [], themeCounts: {} }
  if (path.startsWith('/api/admin/members')) return []
  if (path.startsWith('/api/admin/overview')) return adminOverview()
  if (path.startsWith('/api/admin/')) return []

  // --- Home ---
  const tools = homeTools()
  if (path.startsWith('/api/follow-ups/due')) {
    return tools.has('checkin')
      ? [{ id: 'preview-followup', checkInQuestion: 'How did the seating change go with 3rd period?', createdAt: daysAgo(2) }]
      : []
  }
  // One finished report, so the Lesson Debrief page itself can be opened and
  // clicked through — the list fixture below only ever fed Home's cards, which
  // is why a layout change inside the report could not be looked at before it
  // shipped. `?preview=1` at /audio-coaching/preview-report opens it.
  const reportMatch = path.match(/^\/api\/audio-sessions\/(preview-report)$/)
  if (reportMatch) return previewReport()
  // Any OTHER session id fetched on its own. Without this the request fell
  // through to the list handler below and answered with an ARRAY, so opening
  // any row but the first handed the report page a session with no segments
  // and the whole page went blank on `segments is not iterable`.
  const anySession = path.match(/^\/api\/audio-sessions\/([A-Za-z0-9-]+)$/)
  if (anySession && method === 'GET') {
    return { ...(audioSession(anySession[1], 20, 7, true) as Record<string, unknown>), segments: [] }
  }
  // Creating a session has to answer with ONE session in 'setup', not the
  // list. Returning the list here meant pressing Record handed the page an
  // array, which fell through to an "Untitled lesson / Invalid Date" report
  // and made the recording panel itself unreachable in preview — so the live
  // mic meter, the quiet warning and the thin-capture notice could not be
  // looked at before they shipped.
  if (path === '/api/audio-sessions' && method === 'POST') {
    return {
      ...(audioSession('preview-new', 0, 0, false) as Record<string, unknown>),
      status: 'setup',
      durationSec: null,
      teacherTalkPct: null,
      studentTalkPct: null,
      sessionDate: new Date().toISOString(),
      classSubject: 'World history',
      period: '3',
    }
  }
  if (path.startsWith('/api/audio-sessions')) {
    if (!tools.has('debrief')) return []
    // Five analyzed lessons so the sparkline draws, with the newest either
    // reflected on or not depending on whether the reflect rule is wanted.
    const reflected = !tools.has('unreflected')
    return [
      // Newest, and the only one with a full report behind it — opening this
      // row is how the report page itself gets looked at.
      previewReport(),
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
          // Planning Coach is the quietest tool in this fixture, so it is what
          // the all-tools-used card names. `freshplan` makes it the newest
          // instead, which is how that card is shown to rotate.
          createdAt: tools.has('freshplan') ? daysAgo(0) : daysAgo(7),
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
