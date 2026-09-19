// Regenerates the home page's teacher samples from the real report pages:
//   public/samples/lesson-debrief.pdf / .png   a recorded lesson, with Rubric Lens
//   public/samples/talk-it-through.pdf         a Talk It Through conversation
//   public/samples/lesson-plan-feedback.pdf    feedback on a teacher's plan
//
//   npm run dev                                   (in another terminal)
//   node scripts/capture-teacher-samples.mjs
//
// The data is teacher-sample-fixtures.json, built by the server's
// buildTeacherSamples script from the demo teacher's invented classes.

import { readFileSync } from 'node:fs'
import { withChrome } from './capture.mjs'

const samples = JSON.parse(readFileSync(new URL('./teacher-sample-fixtures.json', import.meta.url), 'utf8'))

const FIXTURES = {
  '/api/auth/me': {
    id: 't1', email: 'teacher@mapleridge.example', name: 'Teacher', role: 'teacher', organizationId: null,
    organization: null, onboardingCompletedAt: '2026-08-10T00:00:00Z', termsAcceptedAt: '2026-08-10T00:00:00Z',
    plusAccess: 'subscription', coachMemoryEnabled: true,
  },
  [`/api/audio-sessions/${samples.lesson.id}`]: samples.lesson,
  '/api/audio-sessions': [samples.lesson],
  '/api/debriefs': [samples.talk],
  [`/api/lesson-plans/${samples.plan.id}`]: samples.plan,
  '/api/lesson-plans': [samples.plan],
}

await withChrome({ fixtures: FIXTURES }, async ({ open, pdf, shoot }) => {
  await open(`/audio-coaching/${samples.lesson.id}/export`)
  await pdf('lesson-debrief.pdf')
  await shoot('lesson-debrief.png', `() => {
    const sections = [...document.querySelectorAll('section')];
    return [document.querySelector('header'), sections[0]];
  }`)

  await open(`/talk-to-me/${samples.talk.id}/export`)
  await pdf('talk-it-through.pdf')

  await open(`/lesson-planning/${samples.plan.id}/export`)
  await pdf('lesson-plan-feedback.pdf')
})
