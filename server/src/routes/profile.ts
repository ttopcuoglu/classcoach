import { Router } from 'express'
import { SAFE_USER_OMIT, SESSION_COOKIE, USER_INCLUDE_ORG } from '../lib/auth.ts'
import { resolveJoinCode } from '../lib/organization.ts'
import { prisma } from '../lib/prisma.ts'
import { isValidTalkVoice } from '../lib/talkVoices.ts'

export const profileRouter = Router()

profileRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    omit: SAFE_USER_OMIT,
    include: USER_INCLUDE_ORG,
  })
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  res.json(user)
})

// Self-service account deletion — Apple Guideline 5.1.1(v) requires any
// app that supports account creation to also support deleting that
// account from within the app, not just deactivating it. Cascades to
// every model owned by this user (ScenarioAttempt, Debrief,
// ParentMessage, UsageLog, AudioSession -> TranscriptSegment, LessonPlan,
// ConversationPrep, ConversationPlan) — all already onDelete: Cascade in
// the schema, same as the superadmin equivalent in admin.ts.
profileRouter.delete('/', async (req, res) => {
  await prisma.user.delete({ where: { id: req.user!.userId } })
  res.clearCookie(SESSION_COOKIE)
  res.json({ status: 'ok' })
})

const FOCUS_METRICS = new Set([
  'talkRatio',
  'higherOrderPct',
  'avgWaitTime',
  'cfuCount',
  'followUpQuestionCount',
  'redirectionCount',
  'toneRatio',
  'directiveCount',
  'nameMentionCount',
  'feedbackSpecificity',
])

profileRouter.put('/', async (req, res) => {
  const {
    name,
    gradeLevels,
    subjects,
    onboardingProgress,
    audioRetentionDays,
    focusMetric,
    talkVoice,
    jobTitle,
    schoolName,
    teachingGoal,
    completeOnboarding,
    joinCode,
    coachMemoryEnabled,
    clearCoachMemory,
  } = req.body ?? {}
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' })
    return
  }
  if (gradeLevels !== undefined && typeof gradeLevels !== 'string') {
    res.status(400).json({ error: 'gradeLevels must be a string' })
    return
  }
  if (subjects !== undefined && typeof subjects !== 'string') {
    res.status(400).json({ error: 'subjects must be a string' })
    return
  }
  if (onboardingProgress !== undefined && typeof onboardingProgress !== 'string') {
    res.status(400).json({ error: 'onboardingProgress must be a string' })
    return
  }
  if (audioRetentionDays !== undefined && audioRetentionDays !== null && typeof audioRetentionDays !== 'number') {
    res.status(400).json({ error: 'audioRetentionDays must be a number or null' })
    return
  }
  if (focusMetric !== undefined && focusMetric !== null && !FOCUS_METRICS.has(focusMetric)) {
    res.status(400).json({ error: 'focusMetric must be one of the supported focus metrics, or null' })
    return
  }
  if (talkVoice !== undefined && talkVoice !== null && !isValidTalkVoice(talkVoice)) {
    res.status(400).json({ error: 'talkVoice must be one of the supported voices, or null' })
    return
  }
  if (jobTitle !== undefined && jobTitle !== null && typeof jobTitle !== 'string') {
    res.status(400).json({ error: 'jobTitle must be a string or null' })
    return
  }
  if (schoolName !== undefined && typeof schoolName !== 'string') {
    res.status(400).json({ error: 'schoolName must be a string' })
    return
  }
  if (teachingGoal !== undefined && typeof teachingGoal !== 'string') {
    res.status(400).json({ error: 'teachingGoal must be a string' })
    return
  }
  if (joinCode !== undefined && (typeof joinCode !== 'string' || !joinCode.trim())) {
    res.status(400).json({ error: 'joinCode must be a non-empty string' })
    return
  }
  if (coachMemoryEnabled !== undefined && typeof coachMemoryEnabled !== 'boolean') {
    res.status(400).json({ error: 'coachMemoryEnabled must be a boolean' })
    return
  }
  if (clearCoachMemory !== undefined && clearCoachMemory !== true) {
    res.status(400).json({ error: 'clearCoachMemory must be true if present' })
    return
  }

  // Resolve the join code before writing anything else, so a bad code 400s
  // the whole request cleanly rather than partially saving other fields.
  let orgFields: { organizationId?: string; role?: string } = {}
  if (joinCode) {
    const currentUser = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!currentUser) {
      res.status(401).json({ error: 'Not signed in' })
      return
    }
    if (currentUser.role === 'superadmin') {
      res.status(400).json({ error: "Platform admins aren't assigned to a school." })
      return
    }
    const resolution = await resolveJoinCode(currentUser.email, joinCode)
    if ('error' in resolution) {
      res.status(400).json({ error: resolution.error })
      return
    }
    orgFields = resolution
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      name,
      gradeLevels,
      subjects,
      onboardingProgress,
      audioRetentionDays,
      focusMetric,
      talkVoice,
      jobTitle,
      schoolName,
      teachingGoal,
      coachMemoryEnabled,
      ...orgFields,
      // Never trust a client-supplied date — the server owns this signal.
      ...(completeOnboarding === true ? { onboardingCompletedAt: new Date() } : {}),
      ...(clearCoachMemory === true ? { coachMemory: null } : {}),
    },
    omit: SAFE_USER_OMIT,
    include: USER_INCLUDE_ORG,
  })
  res.json(updated)
})

// Clears the teacher's own data (saved scenarios, attempts, debriefs, parent
// messages, Q&A history) but leaves their account and the scenario bank
// (curated + previously generated scenario text) alone — that's shared
// prompt content, not "their" data.
profileRouter.post('/reset', async (req, res) => {
  const userId = req.user!.userId
  await prisma.scenarioAttempt.deleteMany({ where: { userId } })
  await prisma.debrief.deleteMany({ where: { userId } })
  await prisma.parentMessage.deleteMany({ where: { userId } })
  await prisma.audioSession.deleteMany({ where: { userId } })
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: null,
      gradeLevels: null,
      subjects: null,
      onboardingProgress: null,
      focusMetric: null,
      talkVoice: null,
      coachMemory: null,
      coachMemoryEnabled: true,
    },
    omit: SAFE_USER_OMIT,
  })
  res.json({ status: 'ok' })
})
