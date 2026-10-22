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

import { focusLineKey } from '../lib/focusLine'

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
  // `?free=1` is a teacher on the Free plan, so the upgrade buttons, prices
  // and the sidebar's Plus card can be looked at before they ship.
  plan: new URLSearchParams(window.location.search).has('free') ? 'free' : 'plus',
  planStatus: 'active',
  plusAccess: new URLSearchParams(window.location.search).has('free') ? null : 'subscription',
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
    // Keeping learning on track. The second episode is the read of the real
    // lesson (13:14-13:55); the first is illustrative — on the real lesson
    // only 20:16 was confirmed as a break in the explanation, which on its
    // own is routine. `home=ontrack_routine` shows exactly that.
    episodes: [
      ...(tools.has('ontrack_routine')
        ? []
        : [
            {
              startSec: 1216, endSec: 1228, expectation: 'talking', interruptedExplanation: true, quickRepeats: false, climbed: false, backReference: false,
              lead: { quote: 'Gotta keep it down, everybody.', timestampSec: 1216 },
              more: [{ quote: 'Eyes forward, buddy.', timestampSec: 1228 }],
              title: 'Reminders about talking broke into your explanation',
              pattern: 'Between 20:16 and 20:28 you stopped your explanation more than once to address behavior (mostly talking), then picked it back up. Whether students settled each time can\u2019t be heard on the recording.',
              nextStep: 'Before the next explanation, set the voice level once and wait for it to hold before you start, so it doesn\u2019t need saying mid-sentence.',
            },
          ]),
      {
        startSec: 794, endSec: 835, expectation: null, interruptedExplanation: false, quickRepeats: true, climbed: true, backReference: false,
        lead: { quote: 'We\u2019re not working together today.', timestampSec: 825 },
        more: [
          { quote: 'Robert and Aramis, if I have to talk to you guys again, it\u2019s going to be a DBS.', timestampSec: 794 },
          { quote: 'Working alone on this one.', timestampSec: 827 },
          { quote: 'I don\u2019t wanna start giving out DPSs.', timestampSec: 835 },
        ],
        title: 'It took several asks to get the room back',
        pattern: 'Between 13:14 and 13:55 you asked several times in quick succession: the first ask didn\u2019t hold, and the asks grew firmer as they went. Whether students settled each time can\u2019t be heard on the recording.',
        nextStep: 'Decide ahead of time what follows a second reminder, so a third ask doesn\u2019t have to carry more force.',
      },
    ],
    interruptions: [{ timestampSec: 1216, quote: 'Gotta keep it down, everybody.' }, ...(tools.has('ontrack_routine') ? [] : [{ timestampSec: 1228, quote: null }])],
    // Repeated redirections, as the real read of this lesson returned it
    // (2026-10-20). `home=redirect_none` shows the empty state.
    repeatedRedirections: tools.has('redirect_none')
      ? {
          state: 'none',
          headline: 'No repeated redirection pattern detected in the captured speech.',
          coverageNote: 'Your voice was heard throughout this recording.',
          heardThroughout: true,
          silentStretches: [],
          findings: [],
          corrections: [{ quote: "Don't don't feel comfortable. Can you get your Chromebook up on your desk and get working on", timestampSec: 798, expectation: 'devices', label: 'Phones and devices' }],
        }
      : {
          state: 'found',
          headline: null,
          coverageNote: 'No speech was captured from 0:00 to 4:29.',
          heardThroughout: false,
          silentStretches: [{ startSec: 0, endSec: 269 }],
          findings: [
            {
              expectation: 'talking', kind: 'recurring', startSec: 587, endSec: 1216,
              title: 'Repeated reminders about talking',
              pattern: 'Across the lesson, from 9:47 to 20:16, you returned several times to asking students to stop talking.',
              lead: { quote: 'Robert and Aramis, if I have to talk to you guys again, it\u2019s going to be a DBS.', timestampSec: 794 },
              more: [
                { quote: 'I don\u2019t wanna start giving out DPSs.', timestampSec: 835 },
                { quote: 'Gotta keep it down, everybody.', timestampSec: 1216 },
              ],
            },
          ],
          corrections: [
            { quote: null, timestampSec: 587, expectation: 'talking', label: 'Talking' },
            { quote: 'Robert and Aramis, if I have to talk to you guys again, it\u2019s going to be a DBS.', timestampSec: 794, expectation: 'talking', label: 'Talking' },
            { quote: 'We\u2019re not working together today.', timestampSec: 825, expectation: 'work', label: 'Getting back to work' },
            { quote: 'I don\u2019t wanna start giving out DPSs.', timestampSec: 835, expectation: 'talking', label: 'Talking' },
            { quote: 'So, guys, why are we standing up and walking?', timestampSec: 1105, expectation: 'seats', label: 'Staying in seats' },
            { quote: 'Gotta keep it down, everybody.', timestampSec: 1216, expectation: 'talking', label: 'Talking' },
            { quote: 'Eyes up front, River.', timestampSec: 1336, expectation: 'attention', label: 'Attention' },
          ],
        },
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
  // The real transcript carries its own end time per segment. seg() forced a
  // uniform six seconds, which made anything derived from segment DURATION —
  // words a minute, a pause between turns — an artifact of the fixture rather
  // than a reading of a lesson.
  const realSeg = (speakerLabel: 'Teacher' | 'Student', startSec: number, endSec: number, text: string): Json => ({
    id: `seg-${startSec}`,
    speakerLabel,
    startSec,
    endSec,
    text,
  })
  return {
    ...(audioSession('preview-report', 22, 1, true) as Record<string, unknown>),
    teacherTalkPct: 34.3,
    studentTalkPct: 13.5,
    durationSec: 1358,
    status: 'analyzed',
    classSubject: 'World history',
    metricsDetail: {
      totalDurationSec: 1358,
      // The low-capture mode has to lower these too, not just the escalation
      // state: the header's trust line reads coverage from here, and a
      // fixture where the card says 15% while the header says nine of nine
      // metrics measured confidently is exactly the contradiction this whole
      // change exists to remove.
      ...(homeTools().has('escalation_unheard')
        ? { teacherTalkSec: 129, studentTalkSec: 73 }
        : { teacherTalkSec: 466, studentTalkSec: 183.6 }),
      // The envelope's split of the rest, as the server stores it. With
      // `home=split` the Summary shows Sound, no words and Quiet as two tiles.
      ...(homeTools().has('split') ? { quietSec: 480, unresolvedSec: 229 } : {}),
      studentVoiceSegments: 67,
      longestTeacherMonologueSec: 80,
      recallQuestionCount: 3,
      higherOrderQuestionCount: 4,
      followUpQuestionCount: 3,
      waitTimeSampleCount: 4,
      teacherWordsPerMinute: 214,
      waitTime2Sec: 2,
      waitTime2SampleCount: 24,
      // Median silence held after a question nobody answered aloud. The real
      // lessons this was built against sit at 3.9s across 65 such questions.
      heldSilenceSec: 3.9,
      heldSilenceSampleCount: 9,
      firstWordSec: 270,
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
      firstRedirectionTimestampSec: 588,
      transitionCount: 4,
      directiveCount: 6,
      positiveToCorrectiveRatio: 2,
      genericFeedbackCount: 2,
      specificFeedbackCount: 1,
      nameMentionCount: 6,
      answersHeardCount: 9,
      answersFollowedUpCount: 3,
      answerLog: [100, 240, 520, 705, 870, 1030, 1150, 1190, 1260].map((t, i) => ({ timestampSec: t, followed: i === 3 || i === 5 || i === 7 })) as never,
      followUpLog: [{ timestampSec: 712, text: 'Why do you think that happened?' }, { timestampSec: 1040, text: 'So what does abandoned mean' }, { timestampSec: 1196, text: 'Can you say more about the trade routes?' }] as never,
      uniqueNameCount: 4,
    },
    questionLog: [
      {
        "text": "So what was it? So which two?",
        "type": "recall",
        "followUps": [],
        "waitTimeSec": 0.32,
        "pauseSec": 0.6,
        "timestampSec": 1020.97003
      },
      {
        "text": "Based on the past, what do you think was the main cause for the fall of the bromine business?",
        "type": "higher_order",
        "followUps": [],
        "waitTimeSec": 14.39,
        "pauseSec": 4.2,
        "heldOpen": { "outcome": "closed", "questionType": "explain", "sec": 21.4, "closedBy": "Yes.", "closedAtSec": 1150, "how": "confirmed" },
        "timestampSec": 1127.2749
      },
      {
        "text": "So of the six right here, which one would you think would fall under earthquakes?",
        "type": "higher_order",
        "followUps": [],
        "waitTimeSec": null,
        "pauseSec": 3.1,
        "heldOpen": { "outcome": "closed", "questionType": "explain", "sec": 6.2, "closedBy": "Okay.", "closedAtSec": 1162, "how": "moved_on" },
        "timestampSec": 1154.435
      },
      {
        "text": "Shania, what do you think is the meaning of the word abandoned?",
        "type": "recall",
        "followUps": [],
        "waitTimeSec": 0.4,
        "pauseSec": 0.9,
        "timestampSec": 1181.355
      },
      {
        "text": "So with that in mind, what do you think happened to the Moroccan civilization, or what's the most likely thing that happened to them?",
        "type": "higher_order",
        "followUps": [],
        "waitTimeSec": 0.4,
        "pauseSec": 1.2,
        "heldOpen": { "outcome": "closed", "questionType": "explain", "sec": 1.2, "closedBy": "Natural climate change caused them to what?", "closedAtSec": 1198, "how": "gave_answer" },
        "timestampSec": 1184.395
      },
      {
        "text": "Yeah. Natural climate change caused them to what?",
        "type": "recall",
        "followUps": [],
        "waitTimeSec": null,
        "pauseSec": 5,
        "timestampSec": 1198.04
      },
      {
        "text": "So who here knows what a transitional phrase is?",
        "type": "higher_order",
        "followUps": [],
        "waitTimeSec": null,
        "pauseSec": 0.5,
        "heldOpen": { "outcome": "open", "questionType": "explain", "sec": null, "closedBy": null, "closedAtSec": null, "how": null },
        "timestampSec": 1322.595
      }
    ],
    cfuLog: [
      {
        "text": "So who here knows what a transitional phrase is?",
        "timestampSec": 1322.595,
        "whatItChecked": "whether students understood the term \"transitional phrase\""
      }
    ],
    feedbackLog: [
      {
        "kind": "specific",
        "text": "Yeah. Natural climate change. So the main problem they came across was one.",
        "timestampSec": 1161.235
      },
      {
        "kind": "generic",
        "text": "Being left behind. Very good.",
        "timestampSec": 1184.395
      }
    ],
    directiveLog: [
      {
        "text": "So what we got, I'm gonna give you guys about five ish minutes.",
        "timestampSec": 760.295
      },
      {
        "text": "I want you guys to read over that and answer these two questions down here.",
        "timestampSec": 769.73004
      },
      {
        "text": "Circle one of the reasons for the decline of the empire.",
        "timestampSec": 780.37
      },
      {
        "text": "Now you gotta take three different causes for decline.",
        "timestampSec": 1312.05
      },
      {
        "text": "Also, I want you guys in the passage to underline two to three transitional phrases used in the passage.",
        "timestampSec": 1315.73
      },
      {
        "text": "I'll give you another five minutes.",
        "timestampSec": 1351.9
      }
    ],
    toneLog: [
      {
        "kind": "corrective",
        "text": "No. Disease had nothing to do with it. It was just climate change.",
        "timestampSec": 1043.705
      }
    ],
    redirectionLog: [
      {
        "text": "Excuse me? What did I say?",
        "timestampSec": 587.99506
      },
      {
        "text": "Don't wanna hear any more conversation.",
        "timestampSec": 598.395
      },
      {
        "text": "Robert and Aramis, if I have to talk to you guys again, it's going to be a DBS.",
        "timestampSec": 794.39996
      },
      {
        "text": "We're not working together today. Working alone on this one.",
        "timestampSec": 825.08
      },
      {
        "text": "Gotta keep it down, everybody.",
        "timestampSec": 1216.535
      },
      {
        "text": "Eyes up front, River.",
        "timestampSec": 1336.195
      }
    ],
    lessonContent: {
      topicTerms: { teacher: [], student: [] },
      statedObjective: { found: true, quote: 'So what we got today, we\u2019re going to be doing another little simulation.', timestampSec: 60, source: 'model' },
      summary: 'The decline and fall of the ancient Indian empires, through reading passages and a two-day simulation.',
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
      "notes": [
        {
          "id": "1791892079418-0",
          "text": "Grounding the Gupta \"golden age\" in concrete, memorable examples—zero as a number and rust-resistant iron—gives students tangible evidence rather than just a label, which helps the achievement actually stick before you pivot to decline.",
          "label": "What worked",
          "excerpt": "an iron that was a meter. No. Resistance of rust. Very good. So they created a number system that used zero as an actual number, and they created metal that was persistent to us. Harlem? Oh, I actually also said the",
          "timestampSec": 319.79
        },
        {
          "id": "1791892079418-1",
          "text": "Explicitly naming all three empires (Indus Valley, Mauryan, Gupta) right before launching the simulation is a nice anchor—it reminds students of the full set they're choosing among, which should make the \"figure out which one\" task more solvable.",
          "label": "What worked",
          "excerpt": "that simulated the fall of one of the major",
          "timestampSec": 454.435
        },
        {
          "id": "1791892079418-2",
          "text": "The framing of internal bad choices versus external forces is a strong organizing lens for comparing why empires fall—next time you could have students sort the specific causes (climate shift, earthquakes, river course changes, leadership decisions) into those two buckets for each empire before the simulation starts, so the categories are active tools rather than background narration.",
          "label": "Where it could go further",
          "excerpt": "Empires fall for a variety of reasons. Sometimes leaders just make bad choices. Sometimes forces from outside the empire's control causes the empire to collapse. And in the case of the Indus River civilization, the Mauryans and the Gupta,",
          "timestampSec": 545.13995
        },
        {
          "id": "1791892079418-3",
          "text": "Having students define \"abandoned\" is a good vocabulary check for the Harappan passage—you could extend it by asking whether the evidence suggests a sudden abandonment or a slow decline, since that distinction is central to how historians actually debate the Indus Valley's end.",
          "label": "Where it could go further",
          "excerpt": "me. Circle one of the reasons for the decline of the empire. So what was the big one? And from the next part, a one two two essentially define the word abandoned. I'm gonna give you guys five minutes to just work on the Harappan part.",
          "timestampSec": 780.37
        },
        {
          "id": "1791892079419-4",
          "text": "When poetry comes up as a Gupta achievement, naming a specific example or figure could help it land alongside the more concrete items like zero and the iron pillar, so literature doesn't feel like a thinner category by comparison.",
          "label": "Where it could go further",
          "excerpt": "But about literature, I meant, like, mainly poetry. Yep. So you made a lot of poetry. We'll do Willow then.",
          "timestampSec": 343
        }
      ],
      "subject": "world history",
      "misconceptions": [
        "Students often assume the Indus Valley decline was a single dramatic event (like an invasion) rather than a gradual process involving multiple environmental factors, so emphasizing the combination of causes over time helps correct that.",
        "Learners can conflate \"decline\" with \"disappearance,\" missing that Harappan culture and people likely persisted and dispersed rather than vanishing, which is worth distinguishing explicitly.",
        "Students sometimes assume all three empires fell the same way, so contrasting the specific mix of causes for each (climate/river shift for Indus, administrative overextension for Mauryan, invasions/fragmentation for Gupta) prevents a one-size-fits-all explanation."
      ]
    },
    nextSteps: {
      "talk": "Before explaining the simulation setup, ask pairs to predict one rule from the empires studied, then build your explanation around their answers.",
      "questions": "After the transitional-phrases question, add one follow-up \"why does that phrase signal a cause?\" before moving on."
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
    questionCount: 7,
    higherOrderPct: 57,
    avgWaitTimeSec: 3.88,
    cfuCount: 1,
    classSummary: "The lesson covers the decline and fall of ancient Indian empires—the Harappan (Indus River Valley), Mauryan, and Gupta civilizations—examining causes such as natural climate change, earthquakes, and rivers changing course, through reading passages and a simulation activity.",
    // Long on purpose, so the note's "Read more" has something to fold.
    talkNarrative: "Teacher talk ran well ahead of student talk in what the microphone caught, with several extended stretches of you explaining the simulation’s setup, task, and empires involved — explanatory talk rather than rapid-fire pacing. Students got the floor mainly through a couple of read-aloud moments and brief responses to direct questions; what else was said in partner work during the five-minute reading task is likely underrepresented here, since paired talk is hardest for a single microphone to pick up. This doesn’t tell us whether the room was quiet or simply out of the mic’s reach — only you know which.",
    questionsNarrative: "Of the 33 questions asked, several were invitations to read or volunteer rather than probes into content, and at least one placed the thinking back on you rather than leaving it with students — after asking “So what was it? So which two?” you supplied the answer yourself rather than waiting it out. With wait time averaging under three seconds, there’s limited room for a student to gather a fuller response before the question moves on or gets answered by you. It’s not clear from the recording how many of the 33 pushed into reasoning versus simply directing attention or inviting a reader.",
    checksNarrative: "No spoken checks for understanding were picked up, so there’s no pattern of when they happened to point to. The feedback that is visible is mixed: some moments named something specific a student said, like tying their answer to zero as a number and a durable metal, while others were brief acknowledgments (“Alright,” “So”) that don’t show what was being affirmed. It’s worth asking whether understanding was being checked silently — by eye contact or circulating during the reading task — since that leaves no trace here.",
    climateNarrative: "Transitions were handled directly: when conversation got out of hand during partner work, you named it plainly (“Don’t wanna hear any more conversation”) and moved the group along rather than letting it stall the lesson. Directions were layered clearly, naming the task, steps, and timeframe together for the simulation. You called on students by name repeatedly and opened the floor for volunteers to read aloud, which invites participation beyond just the loudest voices. Quieter encouragement or a settling look wouldn’t show up here, so this is only what carried to the mic.",
    // All three escalation states, because the one that is easiest to get
    // wrong is the one that looks like good news. `home=escalation_none`
    // shows a lesson where the asking held; `home=escalation_unheard` shows
    // the recording the microphone lost, which must never read as calm.
    escalation: escalationFixture(),
    // Quotes taken from the real lessons this was built against, so the
    // layout is exercised by the kind of sentences teachers actually say
    // rather than tidy invented ones.
    teachingMoves: {
      headline: {
        text: 'These counts come from part of the lesson. You explained the empires with care and 3 of 5 key terms came back from students; the open question is whether students got to use those terms to reason about why the empires fell.',
        section: 'content',
        generatedAt: new Date().toISOString(),
      },
      "directions": [
        {
          "parts": [
            "task",
            "steps",
            "time"
          ],
          "quote": "So what we're gonna do, we're gonna have a little simulation. I'm gonna explain the rules in a bit. So, basically, just go over how all three of these empires fell. Then for today and tomorrow, we're gonna play a little game and see if you guys can run a simulation with one of the empires on how they fall and figure out which one it is.",
          "timestampSec": 474.575
        }
      ],
      "invitations": [
        {
          "quote": "Does anybody here wanna read, like, this little sentence up here real quick?",
          "timestampSec": 518.32
        }
      ],
      arc: [
        { role: 'opened', title: 'Reviewing prior empire topics', startSec: 0, endSec: 429 },
        { role: 'built', title: 'Introducing the fall-of-empires simulation', startSec: 429, endSec: 648 },
        { role: 'applied', title: 'Harappan decline reading and questions', startSec: 648, endSec: 1358 },
      ] as never,
      participation: {
        invitations: [
          { quote: 'Does anybody here wanna read, like, this little sentence up here real quick?', timestampSec: 518.32, format: 'hands' },
          { quote: 'Turn to your neighbor and tell them which empire you think fell first.', timestampSec: 700, format: 'turn_and_talk' },
        ],
        extending: [{ quote: 'So with that in mind, what do you think happened to the Moroccan civilization?', timestampSec: 1184, kind: 'reasoning' }],
        widening: [{ quote: "Let's hear from someone who hasn't shared yet.", timestampSec: 1210 }],
      } as never,
      "explanations": [
        {
          "kind": "example",
          "quote": "So they created a number system that used zero as an actual number, and they created metal that was persistent to us.",
          "timestampSec": 319.79
        }
      ],
      "redirections": [
        {
          "quote": "Excuse me? What did I say? We're working You said something else. And quiet.",
          "clarity": "vague",
          "timestampSec": 587.99506
        }
      ],
      "selfAnswered": [
        {
          "quote": "So what was it? So which two?",
          "timestampSec": 1020.97003
        }
      ],
      "questionKinds": [
        {
          "kind": "recall",
          "quote": "What do you think abandoned means?",
          "timestampSec": 877.325
        }
      ],
      "revisionPrompts": []
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
      realSeg('Student', 269.95, 271.88, "That's such a good dance. Know."),
      realSeg('Student', 272.6, 276.75, "What are you doing? You did it. It's"),
      realSeg('Student', 276.75, 279.31, "just right here. Hey. Right here. I know. Yeah. It's like"),
      realSeg('Student', 280.12, 283.95, "Alright. No. Good job. I bet she wasn't even finished. No. I know."),
      realSeg('Student', 314.91, 318.99, "Create a decimal set and say zero as an actual number, and they also made"),
      realSeg('Teacher', 319.79, 331.55, "an iron that was a meter. No. Resistance of rust. Very good. So they created a number system that used zero as an actual number, and they created metal that was persistent to us. Harlem? Oh, I actually also said the"),
      realSeg('Student', 331.94, 332.91, "numerical"),
      realSeg('Student', 333.06, 334.43, "decimal system,"),
      realSeg('Student', 334.75, 336.19, "but I also said"),
      realSeg('Student', 337.38, 339.38, "it could also be the..."),
      realSeg('Student', 339.96, 341.32, "Either the roads"),
      realSeg('Student', 341.48, 342.92, "or the literature."),
      realSeg('Teacher', 343, 349.48, "But about literature, I meant, like, mainly poetry. Yep. So you made a lot of poetry. We'll do Willow then."),
      realSeg('Student', 349.88, 351, "Oh, trading."),
      realSeg('Student', 351.16, 351.8, "Antonio."),
      realSeg('Student', 353.16, 365.38, "Hey. Here, miss. Knock it off. Trading. Trading what specifically? What's going on? We're not. They were like... They have, like, these things where basically, like... I think it was like, you could, like, sleep sleep, like, eat,"),
      realSeg('Student', 365.62, 372.84, "and, like, you could, like, go there for, like, a day or two and, like, freshen up before you go back to trading there. Alright. Very good. Anaya?"),
      realSeg('Student', 373.56, 375.64, "They have, like, the golden age,"),
      realSeg('Student', 375.8, 378.44, "and they also have the, like, the..."),
      realSeg('Student', 379.16, 382.84, "Don't"),
      realSeg('Teacher', 382.84, 383.64, "know. Let me see."),
      realSeg('Student', 386.45, 389.34, "Just wanna make sure it's so good for you."),
      realSeg('Teacher', 389.81, 390.77, "Fuck up in."),
      realSeg('Teacher', 392.54, 394.46, "Fuck up in. Fuck"),
      realSeg('Teacher', 395.5, 397.42, "up in. We'll say that. Alright."),
      realSeg('Teacher', 397.57, 398.45, "We'll do one more."),
      realSeg('Teacher', 416.2, 418.61, "System. Very good. Alright, guys. So"),
      realSeg('Teacher', 419.25, 420.52, "what we got today? Hey, Jordan."),
      realSeg('Student', 420.93, 421.49, "Hey."),
      realSeg('Student', 422.44, 427.25, "I'm not here. I don't have anything on this. Yo. There's no question. Why are people talking?"),
      realSeg('Teacher', 428.22, 429.18, "So"),
      realSeg('Teacher', 429.18, 430.46, "what we got today,"),
      realSeg('Teacher', 431.58, 436.94, "we're going to be doing another little simulation. This is going to be a two day thing. So"),
      realSeg('Teacher', 437.58, 444.27, "this will take A day? Two day. I got it. Can pass out... Tell you what. You can pass out Can I pass out some?"),
      realSeg('Teacher', 445.07, 454.28, "This half of the room. So Not right now. So what we got... This will probably be done both today and tomorrow. What we're gonna do is that we're actually gonna look at a simulation"),
      realSeg('Teacher', 454.44, 456.75, "that simulated the fall of one of the major"),
      realSeg('Teacher', 457.24, 459.5, "Indian empires we talked about. We"),
      realSeg('Teacher', 459.98, 465.42, "talked about the Indus... Snow River Valley. We've talked about the Gupta, and we've talked about the Morians."),
      realSeg('Teacher', 465.58, 467.34, "So what we're gonna do Ow."),
      realSeg('Teacher', 467.66, 471.5, "Wait. Don't They're getting rid tires. Say he was kidding me. My Hell. Was this."),
      realSeg('Teacher', 474.57, 486.33, "So what we're gonna do, we're gonna have a little simulation. I'm gonna explain the rules in a bit. So, basically, just go over how all three of these empires fell. Then for today and tomorrow, we're gonna play a little game and see if you guys can"),
      realSeg('Teacher', 486.98, 489.46, "run a simulation with one of the"),
      realSeg('Teacher', 490.9, 501.3, "empires on how they fall and figure out which one it is. We'll go through the first part first, and then we will... Thank you. And then we will go through the simulation game. So first things first,"),
      realSeg('Teacher', 503.44, 504.96, "What you guys should have"),
      realSeg('Teacher', 505.92, 509.75, "is a packet that goes over the simulation. The front page should be a"),
      realSeg('Teacher', 511.44, 515.36, "series of passages. So here are the rules. Oh my gosh."),
      realSeg('Teacher', 516.72, 518, "So first off,"),
      realSeg('Teacher', 518.32, 524, "we're going to set the stage. Does anybody here wanna read, like, this little sentence up here real quick? Let's go. Hunter, go ahead. Throughout"),
      realSeg('Student', 525.52, 535.15, "history, empires have risen and fallen. Each empire and leader often believes that their empire will last forever. Very good. So so throughout"),
      realSeg('Teacher', 535.24, 537.96, "history, different empires have risen and fallen."),
      realSeg('Teacher', 538.27, 544.43, "Numerous times, many empires thought they'd be the ones that would last forever, and rulers thought their empire would last forever. It basically never happened."),
      realSeg('Teacher', 545.14, 557.14, "Empires fall for a variety of reasons. Sometimes leaders just make bad choices. Sometimes forces from outside the empire's control causes the empire to collapse. And in the case of the Indus River civilization, the Mauryans and the Gupta,"),
      realSeg('Teacher', 557.74, 561.98, "all of them had eventually developed problems that caused their empires to fall."),
      realSeg('Teacher', 562.77, 564.62, "So in the simulation,"),
      realSeg('Teacher', 564.94, 580.94, "you are going to experience the forces that contribute to the climb of one of the major empires that we talked about. Hang on, Malaysia. You're going to work with your partner to try to keep your empire alive and determine which empire you're simulating the fall of. So we're actually going to simulate the fall of one of the empires that we've talked about,"),
      realSeg('Teacher', 582.14, 587.44, "and you guys will be working in partners... Fly by us. You guys will be working in partners just to figure out which one..."),
      realSeg('Teacher', 588.0, 592.15, "Excuse me? What did I say? We're working You said something else. And quiet."),
      realSeg('Student', 592.48, 594.96, "So you can hear We didn't hear that."),
      realSeg('Teacher', 598.39, 602.54, "Don't wanna hear any more conversation. So I am so. Okay."),
      realSeg('Student', 603.42, 606.94, "We'll play this game. What do I do? I didn't say nothing."),
      realSeg('Student', 607.1, 610.78, "This is... I didn't say anything to start with. Damn. Already? Yo."),
      realSeg('Student', 611.34, 614.3, "Watch your mom. Well, smart. You wanna go with them? Why is your one? Hey. Yo."),
      realSeg('Teacher', 627.95, 635.15, "Alright. What did I do? What did I even do to start with? That's right. We're just gonna take them out the hallway real quick with this board just so. Alright,"),
      realSeg('Teacher', 635.63, 637.23, "guys. So, like I said,"),
      realSeg('Teacher', 637.95, 642.26, "I'll be simulating the fall of one of the major Indian empires I'm talking about as"),
      realSeg('Teacher', 642.66, 648.66, "well as just going over a little game for today and tomorrow. So first thing we're going to do is think that I borrow yours. No."),
      realSeg('Teacher', 648.99, 655.78, "No. It's not. Good. It's got being arranged for no reason. So on the front page, I have a couple reading passages for you. Yo. Three months."),
      realSeg('Teacher', 656.56, 658.64, "Four three two..."),
      realSeg('Teacher', 660.96, 668.24, "Alright. I'm being sensitive. So This is going to go over a couple of a couple of the empires that we talked about. Specifically,"),
      realSeg('Teacher', 669.6, 671.44, "Indian empire. I got it, Antonio. Thank you."),
      realSeg('Teacher', 672.6, 673.15, "So"),
      realSeg('Student', 673.71, 675.15, "I didn't do anything. Alright."),
      realSeg('Teacher', 676.19, 677.24, "So A"),
      realSeg('Student', 677.55, 679.95, "free mom. What we're going to do I didn't do anything."),
      realSeg('Teacher', 680.91, 682.67, "Is going with him. So first"),
      realSeg('Teacher', 683.15, 683.63, "things first."),
      realSeg('Teacher', 685.07, 693.87, "We're gonna go over the Harappan empire. So first things first, does anybody wanna read the passage up here for me? Reading passage. Adya, go ahead. No."),
      realSeg('Student', 694.43, 696.75, "What is lying? I didn't do shit."),
      realSeg('Student', 699.49, 705.8, "Anyone who loves goes with it. Can I read it from my thing? Yes. Okay. I am. The Harp Con"),
      realSeg('Student', 705.96, 706.76, "civilization"),
      realSeg('Student', 707.49, 708.45, "Harlem. Is"),
      realSeg('Student', 708.92, 710.68, "I'm trying to get my things out. Around"),
      realSeg('Student', 727.26, 729.67, "are unsure of the causes."),
      realSeg('Student', 729.75, 734.07, "Theories include massive earthquakes of a valley or vast"),
      realSeg('Student', 734.23, 736.3, "navy rivers"),
      realSeg('Student', 736.3, 737.35, "changing"),
      realSeg('Student', 738.14, 740.35, "changing court course."),
      realSeg('Student', 740.75, 742.27, "Whatever the cause"),
      realSeg('Student', 742.91, 743.79, "through"),
      realSeg('Student', 743.87, 747.55, "the... Well, whatever the cause, though, her her"),
      realSeg('Student', 747.63, 748.59, "puns"),
      realSeg('Student', 748.83, 750.03, "were fortune,"),
      realSeg('Student', 750.03, 752.27, "and they just broke it. Alright."),
      realSeg('Teacher', 754.11, 759.1, "So thank you for that, Anaya. What we got? Hang on one sec. Can I can I use the doctor?"),
      realSeg('Teacher', 760.29, 766.05, "For me to call on you before asking you a question. But as the line went down, we'll be later than you. So what we got,"),
      realSeg('Teacher', 766.62, 769.58, "I'm gonna give you guys about five ish minutes."),
      realSeg('Teacher', 769.73, 774.21, "I want you guys to read over that and answer these two questions down here. One,"),
      realSeg('Teacher', 774.77, 775.49, "what was..."),
      realSeg('Teacher', 775.81, 779.81, "So for the first part, it'll be circle one of the... Excuse"),
      realSeg('Teacher', 780.37, 792.83, "me. Circle one of the reasons for the decline of the empire. So what was the big one? And from the next part, a one two two essentially define the word abandoned. I'm gonna give you guys five minutes to just work on the Harappan part."),
      realSeg('Teacher', 794.4, 801.76, "Just go over that real quick. Alright. Robert and Aramis, if I have to talk to you guys again, it's going to be a DBS. Oh, Harley."),
      realSeg('Student', 801.84, 803.28, "It's too good to be asked."),
      realSeg('Teacher', 804.48, 805.28, "Alright."),
      realSeg('Teacher', 806.16, 808.4, "Robert, you have something to do? There"),
      realSeg('Student', 808.48, 809.2, "you go. Alright."),
      realSeg('Teacher', 825.08, 826.6, "We're not working together today."),
      realSeg('Teacher', 827.08, 830.92, "Working alone on this one. Did y'all say partners? Did y'all partners? Not yet."),
      realSeg('Student', 831.24, 834.04, "Oh, I get it. Did you specify that?"),
      realSeg('Student', 834.76, 835.64, "Both"),
      realSeg('Teacher', 835.96, 840.04, "of you. I don't wanna start giving out DPSs. Alright. So who's behaving so far? What's up?"),
      realSeg('Student', 855.1, 860.94, "What don't you understand? I do... I... My brain can't develop this amount of So here's what you need to do. --."),
      realSeg('Teacher', 861.58, 863.34, "Hey. Let's find our business. So,"),
      realSeg('Teacher', 863.9, 868.46, "basically, this passage right here. This talks about how the Harappan civilization fell. Right?"),
      realSeg('Teacher', 869.57, 871.17, "All you need to do is read through it."),
      realSeg('Teacher', 871.64, 875.88, "Circle which one of these was the fall... Cause of the fall of the Harappans,"),
      realSeg('Teacher', 876.45, 877.0, "and"),
      realSeg('Teacher', 877.33, 888.41, "it mentions this word abandoned. So it says right here, whatever the cause, though, the were forced to move, and their cities were abandoned. So So do I underline that? Nope. You were just right. What do you think abandoned means?"),
      realSeg('Student', 888.57, 892.09, "What is the Getting abandoned and left behind. Okay."),
      realSeg('Teacher', 892.41, 899.46, "So what does abandoned mean? It's abandoned in the definition of abandoned. There you go. What's up? So we're alright."),
      realSeg('Teacher', 901.45, 905.7, "Partners are going to be late, and it will be something nice. Bye."),
      realSeg('Teacher', 906.1, 907.45, "We'll go over it when we get over."),
      realSeg('Teacher', 968.45, 972.61, "Okay. Level number one. What's the cause of the decline of the Harappans? We circle one. Do"),
      realSeg('Student', 974.93, 977.89, "I... Can I circle up the whole center to check one word? So"),
      realSeg('Student', 1007.83, 1009.02, "So mister Hey,."),
      realSeg('Student', 1009.5, 1010.54, "What's"),
      realSeg('Student', 1010.54, 1017.9, "up? Oh, so what I what I just read, it looks like both of these are the only two reasons"),
      realSeg('Student', 1017.99, 1020.38, "of what was causing the earthquakes."),
      realSeg('Teacher', 1020.97, 1022.89, "So what was it? So which two?"),
      realSeg('Student', 1023.21, 1026.33, "These two are... The only reason why there's two"),
      realSeg('Student', 1026.97, 1031.29, "two, like, options because it's the only two options"),
      realSeg('Student', 1031.29, 1032.89, "that we can cause the earthquakes."),
      realSeg('Teacher', 1034.11, 1034.74, "So"),
      realSeg('Teacher', 1034.9, 1039.07, "think about it. What causes earthquakes or what causes rivers to There"),
      realSeg('Teacher', 1039.22, 1039.86, "you go."),
      realSeg('Student', 1040.59, 1043.22, "You got it. You're No. No. I'm a serve a disease."),
      realSeg('Teacher', 1043.7, 1046.03, "No. Disease had nothing to do with it. It was just climate change."),
      realSeg('Teacher', 1105.85, 1114.01, "Alright. So, guys, why are we standing up and walking? Shut up. Is real quick. He asked you. I was like Okay. You can set up your seat and wait for that. Alright. Here you go, Harlem."),
      realSeg('Teacher', 1117.37, 1120.87, "Yeah. Can't get up till I get your So let's go for"),
      realSeg('Teacher', 1121.84, 1122.79, "Caleb."),
      realSeg('Teacher', 1122.79, 1125.99, "Can I go to the bathroom? Let's answer this question first. See."),
      realSeg('Teacher', 1127.27, 1135.96, "And I don't even know how to answer that. I don't know how to answer that. So, Caleb, what do you think? Based on the past, what do you think was the main cause for the fall of the bromine business?"),
      realSeg('Student', 1150.36, 1151.63, "Okay."),
      realSeg('Teacher', 1154.43, 1158.12, "So of the six right here, which one would you think would fall under earthquakes?"),
      realSeg('Student', 1159.08, 1161.23, "Natural climate change."),
      realSeg('Teacher', 1161.23, 1165.47, "Very good. Yeah. Natural climate change. So the main problem they came across was"),
      realSeg('Teacher', 1165.47, 1165.88, "one."),
      realSeg('Teacher', 1167.9, 1171.18, "Well, actually, to the list. So the main problems for that one --."),
      realSeg('Teacher', 1174.14, 1176.3, "Earthquakes, you haven't seen in the area."),
      realSeg('Teacher', 1176.7, 1180.95, "Okay. Two, the rivers change course. The rivers change direction. So for number two,"),
      realSeg('Teacher', 1181.36, 1184.39, "Shania, what do you think is the meaning of the word abandoned?"),
      realSeg('Teacher', 1184.39, 1189.12, "Being left behind. Being left behind. Very good. So with that in mind,"),
      realSeg('Teacher', 1189.6, 1194.44, "what do you think happened to the Moroccan civilization, or what's the most likely thing that happened to them?"),
      realSeg('Student', 1194.84, 1197.56, "Margaret? Just natural climate change."),
      realSeg('Teacher', 1198.04, 1200.92, "Yeah. Natural climate change caused them to what?"),
      realSeg('Student', 1201.24, 1202.44, "The earthquake."),
      realSeg('Student', 1203.16, 1203.88, "Okay."),
      realSeg('Teacher', 1205.08, 1207.64, "Anaya? They caused them to move. Yep."),
      realSeg('Teacher', 1208.7, 1214.78, "So, yeah, basically, the best idea we have is that climate change basically caused the people who live here to move."),
      realSeg('Teacher', 1216.54, 1220.13, "Gotta keep it down, everybody. So climate change basically caused the people to move."),
      realSeg('Teacher', 1220.97, 1227.21, "The river changing torture earthquakes, the best idea we have is that that actually caused people to move away from their home."),
      realSeg('Teacher', 1227.85, 1228.57, "Alright."),
      realSeg('Teacher', 1228.65, 1237.2, "River, ice forward, buddy. Alright. Next up. So natural climate change, and left behind. So the best idea we have is"),
      realSeg('Teacher', 1238.16, 1240.09, "essentially that... Excuse"),
      realSeg('Teacher', 1240.97, 1252.75, "me. Because of natural climate change, like, river changed directions and people didn't have water anymore and because of the earthquakes, people had to get up and leave. Willis, do have a question? Oh, I was gonna say what I put in front of me."),
      realSeg('Teacher', 1254.11, 1258.99, "So here's the next one. We'll do the Morians. Who wants to read the paragraph for this one? Me."),
      realSeg('Student', 1259.95, 1264.75, "Let's go with... Go go ahead. No. The two hundred year region"),
      realSeg('Student', 1264.83, 1266.35, "of the block that"),
      realSeg('Teacher', 1309.57, 1311.49, "Very good. So this time..."),
      realSeg('Teacher', 1312.05, 1315.73, "For this one, we'll give you guys another five minutes. Now you gotta take three"),
      realSeg('Teacher', 1315.73, 1322.05, "different causes for decline. So Morians had three causes for their decline. So circle which tree you think they are. Also,"),
      realSeg('Teacher', 1322.6, 1331.79, "I want you guys in the passage to underline two to three transitional phrases used in the passage. So who here knows what a transitional phrase is? Me."),
      realSeg('Student', 1331.88, 1335.47, "Margaret? No. No. I don't what that was. Anyone got any ideas?"),
      realSeg('Teacher', 1336.19, 1339.1, "Eyes up front, River. Anaia, what do you got? Like"),
      realSeg('Teacher', 1339.42, 1351.9, "like, to go on to the next, you know, the sentence to go on to Yeah. So a sentence to go on to another topic or a sentence to go on to something else. So I want you guys to try to underline in the little passage two or three transitional phrases."),
      realSeg('Teacher', 1351.9, 1353.18, "I'll give you another five minutes."),
      realSeg('Teacher', 1354.09, 1355.68, "Once I find the timer..."),
      realSeg('Teacher', 1355.92, 1358.01, "Oh, it's too much. My bad. My bad."),
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
      questionMix: { recall: 254, explain: 102, reasoning: 54 },
      beyondRecallPct: 38,
      questionMixQuestions: 410,
      questionMixLessons: 66,
      questionMixConfidence: 'full',
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
    beyondRecallPct: 34,
    questionMixQuestions: 140,
    questionMixLessons: 22,
    questionMixConfidence: 'full',
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
/// "Not right?" flags left in this preview, kept for the page's lifetime.
const previewQuoteFlags: Json[] = []

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
  // The rest of a brought plan's cycle stays a brought plan, so Improve a
  // Lesson can be clicked through without turning into a built lesson.
  if (path.includes('preview-feedback') && method !== 'GET') {
    if (path.endsWith('/apply-adaptation')) {
      return {
        ...FEEDBACK,
        planText:
          'Do Now: three questions on the board.\n\nGroup work: the dialysis bag lab — predict first, in writing.\n\nMini-lesson: name what they saw. Diffusion, then the membrane.\n\nExit: in two sentences, why can a cell not survive without a membrane?',
        versionHistory: [{ label: 'Original', savedAt: new Date().toISOString(), sections: { planText: FEEDBACK.planText }, durationMinutes: null }],
      }
    }
    if (path.endsWith('/presentation-feedback')) {
      return {
        ...FEEDBACK,
        deliveryCoaching: {
          openingHook: 'Start with the bag in the beaker before the mini-lesson.',
          pacing: 'Give the lab the most time; the Do Now can be five minutes.',
          engagementCheckpoints: 'Predictions on whiteboards before the lab.',
          explainingTheHardPart: 'Name selectivity after they have seen it.',
          closing: 'An exit ticket that asks why, not what.',
        },
      }
    }
    return FEEDBACK
  }
  if (path.endsWith('/apply-adaptation')) {
    return lesson({
      durationMinutes: 30,
      sequence: ADAPTED_SEQUENCE,
      versionHistory: [{ label: 'Original', savedAt: new Date().toISOString(), sections: { sequence: SEQUENCE }, durationMinutes: 45 }],
    })
  }
  if (path.endsWith('/presentation-feedback')) {
    return lesson({
      deliveryCoaching: {
        openingHook: 'Hold the bag up before you say a word and ask what will happen.',
        pacing: 'Protect the 12 minutes of sense-making; cut the launch short before you cut that.',
        engagementCheckpoints: 'Whiteboards after the prediction; two pairs report what their data rules out.',
        explainingTheHardPart: 'Name "selectively permeable" only after students have argued for it.',
        closing: 'Exit ticket on their own, collected at the door.',
      },
    })
  }
  if (path.endsWith('/discard-adaptation') || path.endsWith('/revert') || path.endsWith('/undo-adaptation')) return lesson()
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
  // The v3 coach notes. The real ones are written by a model on the server;
  // this stands in with a note per section built from the findings sent, so
  // the layout and the before -> after can be looked at without one.
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/insights-notes$/.test(path) && method === 'POST') {
    type Ev = { id: string; polarity: string; quote: string }
    type Fi = { key: string; label: string; state: string; value: string | null; evidence: Ev[] }
    const sections: Record<string, Json> = {}
    for (const sec of (body.sections ?? []) as { key: string; findings: Fi[] }[]) {
      const measured = sec.findings.filter((f) => f.state === 'measured' && f.value)
      if (measured.length === 0) {
        sections[sec.key] = { lead: null, more: [], findingRefs: [], keep: null, try: null, source: 'unavailable' }
        continue
      }
      const all = sec.findings.flatMap((f) => f.evidence)
      const keep = all.find((e) => e.polarity !== 'growth')
      const growth = all.find((e) => e.polarity === 'growth')
      sections[sec.key] = {
        lead: `${measured[0].label}: ${measured[0].value}. (Preview note — the real one is written on the server.)`,
        more: ['A second paragraph would sit here, behind Read more.'],
        findingRefs: [measured[0].key],
        keep: keep ? { evidenceId: keep.id, text: 'This line is worth keeping.' } : null,
        try: growth ? { evidenceId: growth.id, text: 'Try a pause before the big idea.', rewrite: 'Here is the key idea. (pause) ' + growth.quote.split(' ').slice(0, 8).join(' ') } : null,
        // The first stuck item linked to the first Take it further line.
        guidanceLinks:
          sec.key === 'content_lens' && (sec as { stuck?: string[] }).stuck?.length
            ? (sec.findings.find((f) => f.key === 'take_it_further')?.evidence ?? []).slice(0, 1).map((e) => ({ stuckIndex: 0, evidenceId: e.id }))
            : [],
        source: 'model',
      }
    }
    return { version: 1, inputHash: 'preview', generatedAt: new Date().toISOString(), sections }
  }
  // The focus loop. A made-up focus "from last lesson" so the check-in card
  // shows, and whatever is picked here kept for the page's lifetime.
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/lesson-focus\/previous$/.test(path)) {
    return {
      previous: {
        sessionId: 'preview-a1',
        sessionDate: daysAgo(7),
        next: {
          findingKey: 'directions',
          findingLabel: 'Directions',
          text: 'Name the time and the product in every set of directions.',
          value: '0 of 3 complete',
          line: null,
          rewrite: null,
          pickedAt: daysAgo(6),
        },
      },
    }
  }
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/lesson-focus\/next$/.test(path) && method === 'PUT') {
    return { next: { ...body, pickedAt: new Date().toISOString() } }
  }
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/lesson-focus\/check-in$/.test(path)) {
    return { checkIn: { ...body, checkedAt: new Date().toISOString() } }
  }
  // "Not right?" flags, kept for the page's lifetime only.
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/quote-flags$/.test(path)) {
    if (method === 'POST') {
      const flag = { findingKey: String(body.findingKey), segmentId: String(body.segmentId), createdAt: new Date().toISOString() }
      previewQuoteFlags.push(flag)
      return flag
    }
    return previewQuoteFlags
  }
  // The focus said simply. The real line is written by a model on the server
  // (lib/focusLine.ts); this stands in so the card can be looked at.
  if (/^\/api\/audio-sessions\/[A-Za-z0-9-]+\/focus-line$/.test(path) && method === 'POST') {
    return {
      key: focusLineKey(String(body.text ?? '')),
      line: {
        well: 'Your “bad choices vs. outside forces” framing gave students a strong lens.',
        try: 'Have pairs sort the causes into those two groups before the simulation starts.',
      },
    }
  }
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
