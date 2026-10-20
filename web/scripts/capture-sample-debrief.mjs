// Regenerates public/samples/lesson-debrief.pdf, the home page's sample
// Lesson Debrief, from the real printable report (/audio-coaching/:id/export).
//
// The lesson is the invented biology class the home page hero shows
// (scripts/capture-hero.mjs): "Cellular respiration: where a cell's energy
// comes from", 9th grade, period 3. Its numbers are the dev preview's, so the
// sample and the hero agree, but every line of text here is written for this
// file. Nothing comes from the preview fixture, which is built from a real
// lesson transcript and must never reach the public site.
//
//   npm run dev -- --port 5180                       (in another terminal)
//   APP_URL=http://localhost:5180 node scripts/capture-sample-debrief.mjs
//
// The Plus card's thumbnail (lesson-debrief.png) is the PDF's first page.

import { withChrome } from './capture.mjs'

const lesson = {
  id: 'sample-respiration',
  teacherName: null,
  classSubject: 'Biology',
  period: '3',
  gradeLevel: '9th',
  sessionDate: '2026-10-14T14:05:00.000Z',
  consentConfirmed: true,
  status: 'analyzed',
  durationSec: 1358,
  teacherTalkPct: 34.3,
  studentTalkPct: 13.5,
  questionCount: 7,
  higherOrderPct: 57,
  avgWaitTimeSec: 3.88,
  cfuCount: 1,
  phases: null,
  highlights: null,
  segments: [],
  metricsDetail: {
    totalDurationSec: 1358,
    teacherTalkSec: 466,
    studentTalkSec: 183.6,
    studentVoiceSegments: 67,
    longestTeacherMonologueSec: 80,
    recallQuestionCount: 3,
    higherOrderQuestionCount: 4,
    followUpQuestionCount: 3,
    waitTimeSampleCount: 4,
    teacherWordsPerMinute: 214,
    waitTime2Sec: 2,
    waitTime2SampleCount: 24,
    firstWordSec: 270,
    redirectionCount: 3,
    positivePhraseCount: 2,
    correctivePhraseCount: 1,
    transitionCount: 4,
    directiveCount: 6,
    genericFeedbackCount: 2,
    specificFeedbackCount: 1,
    nameMentionCount: 6,
  },
  classSummary:
    'The lesson covers cellular respiration — how cells turn glucose and oxygen into usable energy — moving from a modelled walk through the equation to small groups predicting what happens when oxygen runs short.',
  lessonContent: {
    summary: 'Cellular respiration: where a cell’s energy comes from, through a modelled walk through the equation and a small-group prediction task.',
    vocabulary: [{ quote: 'Aerobic just means it needs oxygen — that’s the whole word.', timestampSec: 240 }],
    connections: [{ quote: 'Think about how your legs burn at the end of a sprint in gym.', timestampSec: 420 }],
  },
  escalation: {
    state: 'found',
    reason: null,
    clusters: [
      { startSec: 794, endSec: 835, fromRung: 'consequence', topRung: 'removal', climbed: true, quote: 'You two, take your packets to the back table, please.' },
    ],
    repeatedAsks: [{ timestampSec: 587, quote: 'I asked once already — eyes up here, please.' }],
  },
  contentNotes: {
    subject: 'biology',
    notes: [
      {
        id: 'n1',
        label: 'What worked',
        text: 'Building the equation up one molecule at a time — glucose in, oxygen in, then asking where the carbon goes — makes reactants and products something students track rather than copy down.',
        excerpt: 'So we’ve got glucose coming in, we’ve got oxygen coming in. Where does the carbon end up? Somebody tell me where the carbon goes.',
        timestampSec: 319,
      },
      {
        id: 'n2',
        label: 'What worked',
        text: 'Naming all three stages — glycolysis, the Krebs cycle, the electron transport chain — right before the group task gives students the whole map they are predicting across.',
        excerpt: 'Three stages: glycolysis, the Krebs cycle, the electron transport chain. Your group is going to decide which one stops first.',
        timestampSec: 454,
      },
      {
        id: 'n3',
        label: 'Where it could go further',
        text: 'The sprint example is a strong bridge to fermentation — next time you could have groups predict what a muscle cell does when oxygen runs short before you name lactic acid, so the idea comes from their reasoning rather than your explanation.',
        excerpt: 'When you sprint, your muscles can’t get oxygen fast enough. So what does the cell do? Hold that thought, because that’s what your groups are figuring out.',
        timestampSec: 545,
      },
      {
        id: 'n4',
        label: 'Where it could go further',
        text: 'Asking students to define “aerobic” is a good vocabulary check — you could extend it by asking why the electron transport chain is the step that needs oxygen, since that is where most students’ picture of respiration breaks down.',
        excerpt: 'Before you start, on the back of the sheet, define aerobic in your own words. You’ve got five minutes for the first part.',
        timestampSec: 780,
      },
      {
        id: 'n5',
        label: 'Where it could go further',
        text: 'When yeast comes up, tying it back to the bread-dough question from earlier would let the class see fermentation in a second organism, so it doesn’t feel like a one-off fact about muscles.',
        excerpt: 'And yeast does this too — same idea, no oxygen. We’ll come back to the bread.',
        timestampSec: 343,
      },
    ],
  },
  momentToRevisit: {
    status: 'found',
    headline: 'You asked why the cell needs oxygen, waited, and then explained it yourself.',
    quote: 'Why do you think the cell needs oxygen at the very end of the chain?',
    timestampSec: 547,
    whyItMatters: 'The group task that followed was built on an idea nobody in the room had yet had to explain.',
    tryNext: 'Ask it, give pairs thirty seconds to write a one-line guess, and take two answers before you explain.',
  },
  nextSteps: {
    talk: 'Before explaining the group task, ask pairs to predict which stage stops first without oxygen, then build your explanation around their answers.',
    questions: 'After the yeast question, add one follow-up — “why does that make the dough rise?” — before moving on.',
  },
  // The teacher's own words, from the Reflect tab.
  strengths: 'The sprint example landed — groups were arguing about muscle cells before I had said the word fermentation.',
  growthAreas: 'I took the first right answer and moved on. Most answers got no second question.',
  nextStep: 'After a student answers, ask one more “why?” before I move on.',
}

const FIXTURES = {
  '/api/auth/me': {
    id: 't1', email: 'teacher@mapleridge.example', name: 'Teacher', role: 'teacher', organizationId: null,
    organization: null, onboardingCompletedAt: '2026-08-10T00:00:00Z', termsAcceptedAt: '2026-08-10T00:00:00Z',
    plusAccess: 'subscription', coachMemoryEnabled: true,
  },
  [`/api/audio-sessions/${lesson.id}`]: lesson,
  '/api/audio-sessions': [lesson],
}

await withChrome({ fixtures: FIXTURES }, async ({ open, pdf }) => {
  await open(`/audio-coaching/${lesson.id}/export`)
  await pdf('lesson-debrief.pdf')
})
