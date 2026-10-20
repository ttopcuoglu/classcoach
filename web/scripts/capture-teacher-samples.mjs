// Regenerates the home page's teacher samples from the real report pages:
//   public/samples/talk-it-through.pdf         a Talk It Through conversation
//   public/samples/lesson-plan-feedback.pdf    feedback on a teacher's plan
//
// The sample Lesson Debrief is made by capture-sample-debrief.mjs instead.
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

await withChrome({ fixtures: FIXTURES }, async ({ open, pdf }) => {
  await open(`/talk-to-me/${samples.talk.id}/export`)
  await pdf('talk-it-through.pdf')

  await open(`/lesson-planning/${samples.plan.id}/export`)
  await pdf('lesson-plan-feedback.pdf')
})
