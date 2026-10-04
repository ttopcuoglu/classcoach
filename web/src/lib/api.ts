// A follow-up coaching chat thread, appended below a one-shot result.
// Seeded with the original submission + first reply, grown by follow-up
// turns. Same shape as Audio Coaching's AudioReflectMessage.
export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  /// Set on an assistant turn where the coach signalled that another surface
  /// is the next useful move — 'rehearse' or 'document'. Absent on every turn
  /// written before offers existed, and on most turns since: the coach is
  /// told to default to silence.
  offer?: string
}

export type Scenario = {
  id: string
  text: string
  // One of the six focus areas (see lib/focusAreas.ts). Null on rows written
  // before the area axis existed — derive it from `category` in that case.
  focusArea: string | null
  category: string
  gradeBand: string
  subject: string | null
  /// 9-12 only — the course a subject splits into (Algebra 2, Chemistry).
  course: string | null
  /// What the teacher was teaching that week.
  topic: string | null
  /// AP | Honors | Regular.
  courseLevel: string | null
  /// "inclusion" | "english_learners" — who is in the room.
  classMakeup: string[]
  difficulty: string
  source: string
  createdAt: string
  // Only present on a generate response — true when Claude generation
  // failed and a curated scenario was served instead.
  fallback?: boolean
}

export type ScenarioAttempt = {
  id: string
  scenarioId: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  /// Practice's three-part feedback: what the move did, what it left on the
  /// table, and one line worth keeping. Null on attempts made before the
  /// three-part shape existed — those render from feedback/modelResponse,
  /// which are still written alongside this for the iOS app, the printable
  /// export and the Cheat Sheet.
  coachingParts: { did: string; left: string; keep: string | null } | null
  // Claude's private 1-5 self-assessment, for growth trends only — never
  // shown to the user as a literal score.
  rating: number | null
  saved: boolean
  createdAt: string
  scenario: Scenario
  conversation: ChatMessage[]
  triedAt: string | null
  reflectionNote: string | null
}

// Curated subset of Deepgram Aura-2's voice catalog for Talk It Through —
// see server/src/lib/talkVoices.ts. Same flat per-character billing
// regardless of voice, so this list is a UX choice, not a cost one.
export type TalkVoice = 'thalia' | 'andromeda' | 'helena' | 'apollo' | 'arcas' | 'aries'

export const TALK_VOICES: { value: TalkVoice; label: string; description: string }[] = [
  { value: 'thalia', label: 'Thalia', description: 'Clear, confident, energetic' },
  { value: 'andromeda', label: 'Andromeda', description: 'Casual and expressive' },
  { value: 'helena', label: 'Helena', description: 'Warm, caring, friendly' },
  { value: 'apollo', label: 'Apollo', description: 'Calm and confident' },
  { value: 'arcas', label: 'Arcas', description: 'Smooth and natural (default)' },
  { value: 'aries', label: 'Aries', description: 'Warm and energetic' },
]

export type FocusMetric =
  | 'talkRatio'
  | 'higherOrderPct'
  | 'avgWaitTime'
  | 'cfuCount'
  | 'followUpQuestionCount'
  | 'redirectionCount'
  | 'toneRatio'
  | 'directiveCount'
  | 'nameMentionCount'
  | 'feedbackSpecificity'

export type JobTitle =
  | 'Teacher'
  | 'Instructional Coach'
  | 'Assistant Principal'
  | 'Principal'
  | 'District Leader'
  | 'Other'

export type ExperienceLevel = 'first_year' | 'early' | 'established' | 'veteran'

export type UserProfile = {
  id: string
  email: string
  name: string | null
  role: 'teacher' | 'org_admin' | 'superadmin'
  jobTitle: JobTitle | null
  schoolName: string | null
  teachingGoal: string | null
  gradeLevels: string | null
  subjects: string | null
  experienceLevel: ExperienceLevel | null
  onboardingProgress: string | null
  onboardingCompletedAt: string | null
  termsAcceptedAt: string | null
  ageConfirmedAt: string | null
  audioRetentionDays: number | null
  talkVoice: TalkVoice | null
  focusMetric: FocusMetric | null
  coachMemory: string | null
  coachMemoryEnabled: boolean
  plan: 'free' | 'plus'
  planStatus: string | null
  // Why this account has Plus-level access, or null on the Free plan — covers
  // a school plan, admins and review accounts, not just a personal subscription.
  plusAccess?: 'subscription' | 'school' | 'admin' | 'demo' | null
  organizationId: string | null
  organization: { name: string } | null
  createdAt: string
  updatedAt: string
}

export type Organization = {
  id: string
  name: string
  joinCode: string
  adminEmails: string | null
  teacherCount: number
}

export type TallyEntry = { count: number; teachers: number }

// The one confidence bar used for every stat on the admin Dashboard/
// Analytics pages: 'none' (<3, don't show a number), 'limited' (3-4, show
// with a badge), 'full' (5+, no badge). See dataConfidence() in
// server/src/routes/admin.ts.
export type DataConfidence = 'none' | 'limited' | 'full'

export type InstructionalAverages = {
  totalAnalyzedSessions: number
  avgWaitTimeSec: number | null
  waitTimeSampleSize: number
  waitTimeConfidence: DataConfidence
  avgTeacherTalkPct: number | null
  avgStudentTalkPct: number | null
  talkSampleSize: number
  talkConfidence: DataConfidence
  higherOrderPct: number | null
  higherOrderSampleSize: number
  higherOrderConfidence: DataConfidence
  realLifeConnectionRatePct: number | null
  realLifeConnectionSampleSize: number
  realLifeConnectionConfidence: DataConfidence
  avgFollowUpPer10Min: number | null
  followUpSampleSize: number
  followUpConfidence: DataConfidence
  cfuRatePct: number | null
  cfuSampleSize: number
  cfuConfidence: DataConfidence
}

export type ClimateAverages = {
  avgRedirectionPer10Min: number | null
  redirectionFrequencySampleSize: number
  redirectionConfidence: DataConfidence
  zeroRedirectionRatePct: number | null
  redirectionMeasuredSampleSize: number
  redirectionMeasuredConfidence: DataConfidence
  avgTransitionPer10Min: number | null
  transitionSampleSize: number
  transitionConfidence: DataConfidence
  clearDirectivesRatePct: number | null
  directiveSampleSize: number
  directiveConfidence: DataConfidence
  positiveTonePct: number | null
  toneSampleSize: number
  toneConfidence: DataConfidence
}

export type Strength = { label: string; value: number; confidence: DataConfidence }

export type BreakdownHeadlineMetrics = {
  avgWaitTimeSec: number | null
  waitTimeSampleSize: number
  waitTimeConfidence: DataConfidence
  avgTeacherTalkPct: number | null
  talkSampleSize: number
  talkConfidence: DataConfidence
  higherOrderPct: number | null
  higherOrderSampleSize: number
  higherOrderConfidence: DataConfidence
  avgRedirectionPer10Min: number | null
  redirectionFrequencySampleSize: number
  redirectionConfidence: DataConfidence
  positiveTonePct: number | null
  toneSampleSize: number
  toneConfidence: DataConfidence
}

export type AdminBreakdownBucket =
  | { bucket: string; suppressed: true }
  | {
      bucket: string
      suppressed: false
      teacherCount: number
      // The smaller groups merged into this one because each had too few
      // teachers to show on its own, e.g. ["Grades 6-8", "Grades 9-12"].
      combined?: string[]
      metrics: BreakdownHeadlineMetrics
    }

export type AdminBreakdown = {
  by: 'gradeBand' | 'subject'
  minTeachers: number
  breakdown: AdminBreakdownBucket[]
}

export type AdminOverview = {
  scope: 'platform' | 'organization'
  organizationName: string | null
  totalTeachers: number
  activatedAccounts: number
  activeThisWeek: number
  returningUsers: number
  activitiesThisWeek: number
  activitiesPriorWeek: number
  periodStart: string
  periodEnd: string
  featureActivity: {
    lessonDebrief: number
    lessonPlanning: number
    communications: number
    practiceReflect: number
  }
  featureAdoption: {
    lessonDebrief: number
    lessonPlanning: number
    communications: number
    practiceReflect: number
  }
  categoryTally: Record<string, TallyEntry>
  challengeTally: Record<string, TallyEntry>
  messagePurposeTally: Record<string, TallyEntry>
  strengths: Strength[]
  priorityTally: Record<string, TallyEntry>
  instructionalAverages: InstructionalAverages
  climateAverages: ClimateAverages
  contentNoteTally: Record<string, TallyEntry>
  growth: {
    recentStrong: number
    recentTotal: number
    priorStrong: number
    priorTotal: number
  }
  weeklyActivity: { weekStart: string; activeCount: number }[]
}

export type OrgMember = {
  id: string
  name: string | null
  email: string
  jobTitle: JobTitle | null
  role: 'teacher' | 'org_admin' | 'superadmin'
  suspendedAt: string | null
  createdAt: string
  lastActiveAt: string | null
}

// sessions/sharePct: the lessons in the snapshot's window and the share of
// them flagged with this theme. Missing on focus areas started before shares
// were tracked — those still show raw counts.
export type PdFocusAreaSnapshot = {
  count: number
  teachers: number
  confidence: DataConfidence
  capturedAt?: string
  sessions?: number
  sharePct?: number | null
}

export type PdFocusArea = {
  id: string
  themeKey: string
  title: string
  suggestedAction: string | null
  baselineSnapshot: PdFocusAreaSnapshot
  // null once archived — an archived row's story is already finished, no
  // further live recompute happens for it.
  currentSnapshot: Omit<PdFocusAreaSnapshot, 'capturedAt'> | null
  // Captured once at archive time — null while active.
  finalSnapshot: PdFocusAreaSnapshot | null
  status: 'active' | 'archived'
  createdAt: string
  archivedAt: string | null
}

export type AdminUser = {
  id: string
  name: string | null
  email: string
  role: 'teacher' | 'org_admin' | 'superadmin'
  jobTitle: JobTitle | null
  organizationId: string | null
  organizationName: string | null
  suspendedAt: string | null
  createdAt: string
}

export type DebriefSource = 'ask_tab' | 'talk_to_me'

export type TalkTakeaway = { explored: string; tryNext: string; notice: string }

export type Debrief = {
  id: string
  incidentText: string
  // The area this question belongs to — the teacher's pick, or the coach's
  // read when they didn't pick one. Null on Talk It Through rows and on rows
  // written before the area axis existed.
  focusArea: string | null
  category: string | null
  gradeBand: string | null
  subject: string | null
  course: string | null
  courseLevel: string | null
  feedback: string | null
  wordsToTry: string | null
  followUp: string | null
  rating: number | null
  source: DebriefSource | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
  talkTakeaway: TalkTakeaway | null
  triedAt: string | null
  reflectionNote: string | null
}

// tone values changed with the Communications redesign — old rows may have
// "informational"/"requesting_meeting" (requesting a meeting is now a
// `purpose`, not a tone); toneLabel() in communicationOptions.ts falls back
// to the raw value so old saved messages still render correctly.
export type ParentMessageTone = 'warm' | 'professional' | 'firm' | 'urgent'
export type StartingAction = 'new' | 'respond' | 'improve'

export type ParentMessage = {
  id: string
  startingAction: StartingAction | null
  incidentSummary: string | null
  receivedMessage: string | null
  existingDraft: string | null
  recipientType: string | null
  purpose: string | null
  format: string | null
  tone: ParentMessageTone
  draftText: string
  title: string | null
  saved: boolean
  createdAt: string
  conversation: ChatMessage[]
}

export type SharedAttempt = {
  type: 'attempt'
  scenario: Scenario
  responseText: string
  feedback: string | null
  modelResponse: string | null
  createdAt: string
}

export type SharedDebrief = {
  type: 'debrief'
  incidentText: string
  category: string | null
  feedback: string | null
  followUp: string | null
  createdAt: string
}

// mode is "feedback" (teacher's own plan + coaching), "generated" (a sample
// plan from just an objective), or "presentation" (review of an uploaded
// slide deck) — see server/prisma/schema.prisma.
export type LessonPlanMode = 'feedback' | 'generated' | 'presentation'

export type LessonPlan = {
  id: string
  mode: LessonPlanMode
  objective: string | null
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  subject: string | null
  gradeLevel: string | null
  planText: string | null
  feedback: string | null
  rating: number | null
  doNow: string | null
  agenda: string | null
  closure: string | null
  hots: string | null
  homework: string | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
  suggestedRevision: string | null
  deliveryCoaching: LessonPlanDeliveryCoaching | null
  fileName: string | null
  slideCount: number | null
  presentationReview: LessonPlanPresentationReview | null
}

export type LessonPlanDeliveryCoaching = {
  openingHook: string | null
  pacing: string | null
  engagementCheckpoints: string | null
  explainingTheHardPart: string | null
  closing: string | null
}

export type LessonPlanPresentationReview = {
  gradeLevelFit: string | null
  visuals: string | null
  ideas: string | null
  length: string | null
  implementation: string | null
}

export type SharedLessonPlan = {
  type: 'lesson-plan'
  mode: LessonPlanMode
  objective: string
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  subject: string | null
  gradeLevel: string | null
  planText: string | null
  feedback: string | null
  doNow: string | null
  agenda: string | null
  closure: string | null
  hots: string | null
  homework: string | null
  createdAt: string
}

// category holds the practice challenge type (see communicationOptions.ts
// CHALLENGE_TYPES); null for review rows, which have no category picker.
// Old rows may still have a legacy value (hostile_response/phone_call) —
// challengeLabel() falls back to the raw value.
export type ConversationPrepCategory = string

// "practice" = a generated hypothetical scenario; "review" = an actual
// received message + planned response (renamed from "real").
export type ConversationPrepSource = 'practice' | 'review'

export type CoachingReportDimension = { rating: string; feedback: string }
export type CoachingReport = {
  clarity: CoachingReportDimension
  empathy: CoachingReportDimension
  evidence: CoachingReportDimension
  boundaries: CoachingReportDimension
  collaboration: CoachingReportDimension
  resolution: CoachingReportDimension
  didWell: string
  priority: string
  strongerPhrase: string
  modelResponse: string
  nextStep: string
}

export type ConversationPrep = {
  id: string
  category: ConversationPrepCategory | null
  personType: string | null
  difficulty: string | null
  reviewMode: string | null
  source: ConversationPrepSource
  gradeBand: string | null
  situationText: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  rating: number | null
  coachingReport: CoachingReport | null
  title: string | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
}

export type SharedConversationPrep = {
  type: 'conversation-prep'
  category: ConversationPrepCategory | null
  gradeBand: string | null
  situationText: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  createdAt: string
}

export type ConversationPlanContent = {
  agenda: string
  opening: string
  mainConcern: string
  facts: string
  questions: string
  reactions: string
  recommendedResponses: string
  phrasesToAvoid: string
  boundaries: string
  closing: string
  modelResponse: string
  nextSteps: string
  adminInvolvement: string
}

export type ConversationPlan = {
  id: string
  recipientType: string | null
  meetingType: string | null
  attendees: string | null
  situationText: string
  desiredOutcome: string | null
  concerns: string | null
  background: string | null
  meetingFormat: string | null
  planContent: ConversationPlanContent | null
  title: string | null
  saved: boolean
  createdAt: string
  conversation: ChatMessage[]
}

// 'create'/'improve' are retired — kept in the union only so a pre-existing
// row's mode still typechecks; the workspace falls back to Review-style
// display for anything other than 'review'/'redesign_ai'.
export type AssignmentCoachMode = 'review' | 'redesign_ai' | 'create' | 'improve'
export type AssignmentAiUseLevel = 'thinking_partner' | 'limited' | 'no_ai'
export type AssignmentType = 'classwork' | 'homework' | 'project' | 'assessment' | 'group_task' | 'exit_ticket' | 'other'
export type AssignmentReviewSummary = {
  working: string | null
  needsAttention: string | null
  suggestions: string | null
}
export type AssignmentAiResistant = {
  aiRole: { level: AssignmentAiUseLevel | null; explanation: string | null; recommended: boolean } | null
  vulnerableSteps: string | null
  thinkingSafeguards: string | null
  guidelines: string | null
  revisedAssignment: string | null
  // Pre-existing sessions only stored this field, under this name — kept
  // for backward-compat reads (render `thinkingSafeguards ?? strategies`).
  strategies?: string | null
}
export type AssignmentFinalMaterials = {
  assignment: string | null
  rubric: string | null
  scaffolds: string | null
  aiUseStatement: string | null
}
// The Review path's richer structured output — replaces AssignmentReviewSummary
// for sessions created after the auto-detected-context redesign. A
// pre-existing session may have reviewSummary set and this null instead.
export type AssignmentReviewSnapshot = {
  purpose: string | null
  gradeFit: { rating: string | null; explanation: string | null }
  rigor: { label: string | null; explanation: string | null }
  meaningfulWork: { rating: string | null; explanation: string | null; suggestion: string | null }
  aiRisk: { rating: string | null; explanation: string | null; reasons: string | null }
  workloadSummary: string | null
  mainOpportunity: { title: string | null; description: string | null }
}
export type AssignmentClarifyingQuestion = { question: string; options: string[] }
export type AssignmentCoachSession = {
  id: string
  mode: AssignmentCoachMode
  aiUseLevel: AssignmentAiUseLevel | null
  assignmentType: AssignmentType | null
  typeDetails: Record<string, string> | null
  estimatedTime: string | null
  specificNeeds: string | null
  gradeLevel: string | null
  subject: string | null
  objective: string | null
  originalText: string | null
  liveAssignmentText: string | null
  status: 'draft' | 'completed'
  title: string | null
  conversation: ChatMessage[]
  reviewSummary: AssignmentReviewSummary | null
  reviewSnapshot: AssignmentReviewSnapshot | null
  clarifyingQuestion: AssignmentClarifyingQuestion | null
  aiResistant: AssignmentAiResistant | null
  finalMaterials: AssignmentFinalMaterials | null
  saved: boolean
  createdAt: string
  updatedAt: string
}

// status is one of: setup, recording, paused, transcribing, tagging,
// analyzed, locked
export type AudioSessionStatus =
  | 'setup'
  | 'recording'
  | 'paused'
  | 'transcribing'
  | 'tagging'
  | 'analyzed'
  // Transcription ended badly, or a restart killed it mid-flight. Carries a
  // `failureReason` the teacher can act on.
  | 'failed'
  | 'locked'

export type AudioHighlight = { label: string; timestampSec: number; excerpt: string; durationSec?: number }
export type AudioPhase = { label: string; startSec: number; endSec: number }
export type AudioQuote = { quote: string; timestampSec: number }
export type AudioQuestionLogEntry = {
  timestampSec: number
  type: 'recall' | 'higher_order'
  waitTimeSec: number | null
  text: string
  followUps: { timestampSec: number; text: string }[]
}
export type AudioCfuLogEntry = { timestampSec: number; text: string; whatItChecked: string }
export type AudioFeedbackLogEntry = { timestampSec: number; kind: 'generic' | 'specific'; text: string }
export type AudioDirectiveLogEntry = { timestampSec: number; text: string }
export type AudioToneLogEntry = { timestampSec: number; kind: 'positive' | 'corrective'; text: string }
export type AudioRedirectionLogEntry = { timestampSec: number; text: string }
export type AudioReflectMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

// Keyword/phrase-matched flags and quotes only — never scored.
export type AudioTopicTerm = { term: string; count: number }
export type AudioLessonContent = {
  // string[] is the shape stored by sessions analyzed before speaker-split
  // word clouds shipped — rendered as the old flat chip list, never crashes.
  topicTerms: string[] | { teacher: AudioTopicTerm[]; student: AudioTopicTerm[] }
  statedObjective: {
    found: boolean | null
    quote: string | null
    timestampSec: number | null
    // Absent on reports analyzed before Claude read the transcript for this.
    source?: 'phrase' | 'model'
  }
  // What the lesson covered. Absent on those same older reports.
  summary?: string | null
  connections: AudioQuote[]
  vocabulary: AudioQuote[]
  subject: string | null
}

export type AudioContentNote = {
  id: string
  label: 'Clarity' | 'Vocabulary' | 'Engagement with content' | 'Worth double-checking'
  text: string
  timestampSec: number
  excerpt: string
}
export type AudioContentNotes = { subject: string; notes: AudioContentNote[] }

// Rubric Lens — the session's evidence organised under a teaching
// framework's components. Evidence and next steps only, never a level.
export type AudioRubricEvidence = { kind: string; timestampSec: number; text: string }
export type AudioRubricComponent = {
  code: string
  name: string
  domain: string
  audibility: 'strong' | 'partial'
  summary: string
  nextStep: string | null
  evidence: AudioRubricEvidence[]
}
export type AudioRubricLens = {
  framework: string
  frameworkName: string
  generatedAt: string
  components: AudioRubricComponent[]
  notObservable: { code: string; name: string; domain: string; reason: string }[]
}

export type AudioSession = {
  id: string
  teacherName: string | null
  classSubject: string | null
  period: string | null
  gradeLevel: string | null
  sessionDate: string
  consentConfirmed: boolean
  status: AudioSessionStatus
  durationSec: number | null
  // Set when transcription is handed to the server; what a "Processing 41%"
  // row is drawn from on a device that never did the recording.
  // Written in the same model call as classSummary — see the Checks &
  // Feedback section. Absent on reports generated before it existed.
  checksNarrative?: string | null
  climateNarrative?: string | null
  contentNarrative?: string | null
  talkNarrative?: string | null
  questionsNarrative?: string | null
  transcribeStartedAt?: string | null
  failureReason?: string | null
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number | null
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  metricsDetail: Record<string, number | null> | null
  highlights: AudioHighlight[] | null
  phases: AudioPhase[] | null
  questionLog: AudioQuestionLogEntry[] | null
  cfuLog: AudioCfuLogEntry[] | null
  feedbackLog: AudioFeedbackLogEntry[] | null
  directiveLog: AudioDirectiveLogEntry[] | null
  toneLog: AudioToneLogEntry[] | null
  redirectionLog: AudioRedirectionLogEntry[] | null
  reflectConversation: AudioReflectMessage[] | null
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  rubricLens: AudioRubricLens | null
  /// The reviewed plan this lesson was taught from, when the teacher linked
  /// them. Null for the vast majority of recordings.
  reviewId?: string | null
  /// What the plan said against what the recording heard. Null when there is
  /// nothing honest to say: no linked plan, no timing estimate, a recording
  /// too short to compare, or a lesson that matched its plan.
  planComparison?: PlanComparison | null
  classSummary: string | null
  strengths: string | null
  growthAreas: string | null
  nextStep: string | null
  followUpDate: string | null
  createdAt: string
  updatedAt: string
}

export type TranscriptSegment = {
  id: string
  speakerLabel: string
  rawSpeakerTag: string
  startSec: number
  endSec: number
  text: string
}

export type AudioSessionWithSegments = AudioSession & { segments: TranscriptSegment[] }

export type SpeakerSample = { rawSpeakerTag: string; sample: string }

// Exported so the live-transcription socket can derive its own ws:// origin
// from the same setting rather than assuming the API is same-origin.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiError(body?.error ?? messageForStatus(res.status), res.status, body)
  }
  return res.json()
}

/// What to tell a teacher when a failure arrives with no message of its own.
///
/// Every route in this app answers a failure it chose with JSON — "Could not
/// read that file", "Could not reach your coach" — so a body-less response is
/// not the server talking at all. It is the platform in front of it, and on
/// this deployment that nearly always means the instance was restarting or
/// still waking up, which is worth saying plainly because the fix is simply
/// to try again. "Request failed with status 502" told a teacher none of
/// that, and reads as though their document broke something.
export function messageForStatus(status: number): string {
  // Split deliberately. "Try again in a moment" is good advice for a waking
  // instance and useless for a request that died the same way twice, so these
  // should not share a sentence — a teacher seeing the same words every time
  // learns the app does not know what went wrong.
  if (status === 503) return 'The server is waking up. Give it a few seconds and try again.'
  if (status === 504) {
    return 'That took too long to come back. A photo or a long document can do it — try a smaller file, or paste the text instead.'
  }
  if (status === 502) {
    return 'The server dropped that request. If it happens again, try pasting the text instead of the file.'
  }
  if (status === 408) return 'That took too long to answer. Please try again.'
  if (status === 413) return 'That file is too large — the limit is 25MB.'
  if (status === 429) return 'Too many requests just now. Give it a minute and try again.'
  if (status >= 500) return 'Something went wrong at our end. Please try again.'
  return `Request failed with status ${status}`
}

// An Error that remembers the HTTP status it came from. Most callers only
// ever show the message, and they keep working unchanged; the few that need
// to tell an expected refusal from a real failure — a full conversation
// (409) is not "something went wrong" — can read `status`.
export type ApiError = Error & {
  status?: number
  /// The whole parsed body, for the few refusals that carry something the UI
  /// has to act on rather than just show — a 409 naming what it found in the
  /// document, for instance. Undefined when the response had no JSON.
  details?: unknown
}

function apiError(message: string, status: number, details?: unknown): ApiError {
  return Object.assign(new Error(message), { status, details })
}

// "Forgot password" — always resolves, whether or not the address has an
// account, so the page can't be used to discover who is registered.
export function requestPasswordReset(email: string): Promise<{ ok: true }> {
  return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
}

// Sets the new password and signs the teacher straight in.
export function resetPassword(token: string, password: string): Promise<UserProfile> {
  return request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
}

export function signInWithGoogle(credential: string): Promise<UserProfile> {
  return request('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
}

export function signUp(data: {
  email: string
  password: string
  name: string
  termsAccepted: boolean
  ageConfirmed: boolean
}): Promise<UserProfile> {
  return request('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) })
}

export function logIn(data: { email: string; password: string }): Promise<UserProfile> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) })
}

export function getMe(): Promise<UserProfile> {
  return request('/api/auth/me')
}

export function logout(): Promise<{ status: string }> {
  return request('/api/auth/logout', { method: 'POST' })
}

export type AdminOverviewParams = {
  organizationId?: string
  startDate?: string
  endDate?: string
  gradeBand?: string
  subject?: string
}

function buildOverviewQuery(params?: AdminOverviewParams): URLSearchParams {
  const query = new URLSearchParams()
  if (params?.organizationId) query.set('organizationId', params.organizationId)
  if (params?.startDate) query.set('startDate', params.startDate)
  if (params?.endDate) query.set('endDate', params.endDate)
  if (params?.gradeBand) query.set('gradeBand', params.gradeBand)
  if (params?.subject) query.set('subject', params.subject)
  return query
}

// Builds the download URL for the CSV export rather than fetching it —
// the caller opens this directly (window.open / an <a> click) so the
// browser handles the Content-Disposition: attachment response itself,
// same-origin cookies included automatically.
export function getAdminExportUrl(params?: AdminOverviewParams): string {
  const queryString = buildOverviewQuery(params).toString()
  return `${API_BASE_URL}/api/admin/overview/export${queryString ? `?${queryString}` : ''}`
}

export function getAdminOverview(params?: AdminOverviewParams): Promise<AdminOverview> {
  const queryString = buildOverviewQuery(params).toString()
  return request(`/api/admin/overview${queryString ? `?${queryString}` : ''}`)
}

export function getAdminBreakdown(params: {
  by: 'gradeBand' | 'subject'
  organizationId?: string
}): Promise<AdminBreakdown> {
  const query = new URLSearchParams({ by: params.by })
  if (params.organizationId) query.set('organizationId', params.organizationId)
  return request(`/api/admin/overview/breakdown?${query.toString()}`)
}

// How many teachers picked each My Growth focus (see /overview/focus-areas).
export type AdminFocusAreas =
  | { suppressed: true; minTeachers: number }
  | {
      suppressed: false
      minTeachers: number
      totalTeachers: number
      areas: { metric: FocusMetric; count: number }[]
      otherCount: number
    }

export function getAdminFocusAreas(organizationId?: string): Promise<AdminFocusAreas> {
  return request(
    `/api/admin/overview/focus-areas${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`,
  )
}

export function getOrganizationMembers(organizationId?: string): Promise<OrgMember[]> {
  return request(`/api/admin/members${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`)
}

// A superadmin acts on a member only within the organization they've
// selected, so it rides along as a query param; a school admin's own
// school is resolved server-side and needs none.
function memberPath(id: string, organizationId?: string, suffix = ''): string {
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
  return `/api/admin/members/${id}${suffix}${query}`
}

export type MemberEdits = { name?: string | null; jobTitle?: JobTitle | null; role?: 'teacher' | 'org_admin' }

// Removes a teacher from their org (org_admin's own scoped power, or a
// superadmin acting within a selected org) — un-enrolls them, no data lost.
export function removeMember(id: string, organizationId?: string): Promise<{ status: string }> {
  return request(memberPath(id, organizationId), { method: 'DELETE' })
}

export function updateMember(id: string, edits: MemberEdits, organizationId?: string): Promise<{ status: string }> {
  return request(memberPath(id, organizationId), { method: 'PATCH', body: JSON.stringify(edits) })
}

export function suspendMember(id: string, suspended: boolean, organizationId?: string): Promise<{ status: string }> {
  return request(memberPath(id, organizationId, '/suspend'), { method: 'POST', body: JSON.stringify({ suspended }) })
}

// The remaining three are superadmin-only.
export function getAdminUsers(): Promise<AdminUser[]> {
  return request('/api/admin/users')
}

export function suspendUser(id: string, suspended: boolean): Promise<AdminUser> {
  return request(`/api/admin/users/${id}/suspend`, { method: 'POST', body: JSON.stringify({ suspended }) })
}

export function updateUser(id: string, edits: MemberEdits & { organizationId?: string | null }): Promise<AdminUser> {
  return request(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(edits) })
}

export function deleteUser(id: string): Promise<{ status: string }> {
  return request(`/api/admin/users/${id}`, { method: 'DELETE' })
}

export function getOrganizations(): Promise<Organization[]> {
  return request('/api/admin/organizations')
}

export function createOrganization(data: { name: string; joinCode?: string; adminEmails?: string }): Promise<Organization> {
  return request('/api/admin/organizations', { method: 'POST', body: JSON.stringify(data) })
}

export function getPdFocusAreas(
  organizationId?: string,
): Promise<{ items: PdFocusArea[]; themeCounts: Record<string, TallyEntry> }> {
  return request(`/api/admin/pd-focus-areas${organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''}`)
}

export function createPdFocusArea(data: {
  themeKey: string
  title: string
  suggestedAction: string | null
  organizationId?: string
}): Promise<PdFocusArea> {
  const query = data.organizationId ? `?organizationId=${encodeURIComponent(data.organizationId)}` : ''
  return request(`/api/admin/pd-focus-areas${query}`, {
    method: 'POST',
    body: JSON.stringify({ themeKey: data.themeKey, title: data.title, suggestedAction: data.suggestedAction }),
  })
}

export function archivePdFocusArea(id: string, organizationId?: string): Promise<PdFocusArea> {
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
  return request(`/api/admin/pd-focus-areas/${id}${query}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'archived' }),
  })
}

export function updateOrganization(
  id: string,
  data: { name?: string; joinCode?: string; adminEmails?: string | null },
): Promise<Organization> {
  return request(`/api/admin/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteOrganization(id: string): Promise<{ status: string }> {
  return request(`/api/admin/organizations/${id}`, { method: 'DELETE' })
}

/// `focusArea` carries the TOPIC value and `category` the KIND — the request
/// field names predate the rename and are kept because the iOS app sends them.
/// `topic` here is the unrelated, older field: what the teacher is teaching
/// right now, which is why the taxonomy could not reuse that name.
export type ScenarioRequest = {
  focusArea?: string
  category?: string
  gradeBand?: string
  difficulty?: string
  subject?: string
  course?: string
  topic?: string
  courseLevel?: string
  classMakeup?: string[]
}

export function generateScenario(opts: ScenarioRequest): Promise<Scenario> {
  return request('/api/scenarios/generate', { method: 'POST', body: JSON.stringify(opts) })
}

/// "Describe my own" — the teacher's own situation, stored as a scenario so
/// feedback, history and the one-notch-harder re-run all work unchanged. No
/// model call: these are their words about their own room.
export function createOwnScenario(opts: ScenarioRequest & { text: string }): Promise<Scenario> {
  return request('/api/scenarios/custom', { method: 'POST', body: JSON.stringify(opts) })
}

export function getAttempts(params?: { saved?: boolean }): Promise<ScenarioAttempt[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/attempts${query}`)
}

export function submitAttempt(scenarioId: string, responseText: string): Promise<ScenarioAttempt> {
  return request('/api/attempts', { method: 'POST', body: JSON.stringify({ scenarioId, responseText }) })
}

export function sendAttemptChat(id: string, message: string): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setAttemptSaved(id: string, saved: boolean): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function markAttemptTried(id: string): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ markTried: true }) })
}

export function saveAttemptReflection(id: string, reflectionNote: string): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ reflectionNote }) })
}

export function shareAttempt(id: string): Promise<{ shareToken: string }> {
  return request(`/api/attempts/${id}/share`, { method: 'POST' })
}

export function getProfile(): Promise<UserProfile> {
  return request('/api/profile')
}

// Everything Coach can draw on about this teacher, in the words it is given
// them in. digestPreview is the most a question could ever surface, not what
// any particular one did.
export type CoachKnowledge = {
  memory: string | null
  /// Whether there is an earlier version to go back to.
  hasPreviousMemory: boolean
  memoryEnabled: boolean
  digestEnabled: boolean
  digestPreview: string | null
  digestAvailable: boolean
}

export function getCoachKnowledge(): Promise<CoachKnowledge> {
  return request('/api/profile/coach-knowledge')
}

// One step back. Swaps the current note with the one it replaced, so undoing
// an undo works too.
export function restoreCoachMemory(): Promise<UserProfile> {
  return request('/api/profile/coach-memory/restore', { method: 'POST' })
}

export function updateProfile(data: {
  name?: string
  gradeLevels?: string
  subjects?: string
  experienceLevel?: ExperienceLevel | null
  onboardingProgress?: string
  audioRetentionDays?: number | null
  focusMetric?: FocusMetric | null
  talkVoice?: TalkVoice | null
  jobTitle?: JobTitle | null
  schoolName?: string
  teachingGoal?: string
  completeOnboarding?: true
  joinCode?: string
  coachMemoryEnabled?: boolean
  coachDigestEnabled?: boolean
  clearCoachMemory?: true
}): Promise<UserProfile> {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export function resetData(): Promise<{ status: string }> {
  return request('/api/profile/reset', { method: 'POST' })
}

// Permanently deletes the signed-in user's account and everything tied
// to it — required by Apple Guideline 5.1.1(v) for any app that supports
// account creation, and offered here on web too for consistency.
export function deleteAccount(): Promise<{ status: string }> {
  return request('/api/profile', { method: 'DELETE' })
}

export function createCheckoutSession(): Promise<{ url: string }> {
  return request('/api/billing/checkout', { method: 'POST' })
}

export function createBillingPortalSession(): Promise<{ url: string }> {
  return request('/api/billing/portal', { method: 'POST' })
}

// Onboarding's live "read this aloud" demo — same multipart pattern as
// transcribeAudioSession. Purely ephemeral: nothing here is persisted.
export type DemoAnalysisTag = 'higher_order_question' | 'positive_language'
export type DemoAnalysisResult = { transcript: string; highlightedText: string | null; tag: DemoAnalysisTag | null }

export async function analyzeDemoClip(audioBlob: Blob): Promise<DemoAnalysisResult> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'demo-audio')
  const res = await fetch(`${API_BASE_URL}/api/onboarding/demo-analysis`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export function getDebriefs(params?: {
  saved?: boolean
  source?: DebriefSource
  focusArea?: string
}): Promise<Debrief[]> {
  const query = new URLSearchParams()
  if (params?.saved) query.set('saved', 'true')
  if (params?.source) query.set('source', params.source)
  if (params?.focusArea) query.set('focusArea', params.focusArea)
  const queryString = query.toString()
  return request(`/api/debriefs${queryString ? `?${queryString}` : ''}`)
}

export function submitDebrief(
  incidentText: string,
  opts?: {
    focusArea?: string
    gradeBand?: string
    subject?: string
    course?: string
    topic?: string
    courseLevel?: string
    classMakeup?: string[]
  },
): Promise<Debrief> {
  return request('/api/debriefs', {
    method: 'POST',
    body: JSON.stringify({ incidentText, ...opts }),
  })
}

export function sendDebriefChat(id: string, message: string): Promise<Debrief> {
  return request(`/api/debriefs/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

// Streams a spoken coaching reply sentence by sentence (see the NDJSON
// contract in server/src/routes/debrief.ts). `onSentence` fires the moment
// each sentence is complete, so speech synthesis can start on sentence one
// while Claude is still writing the rest; the promise resolves with the
// saved Debrief once the whole reply has been generated and persisted.
//
// Pass no `id` to start a new Talk It Through; pass one to continue it.
// `message` is null only when Coach opens the conversation: the server reads
// a missing message as "greet them first", which is why it has to be left out
// of the body rather than sent as an empty string.
export async function streamCoachReply(
  id: string | null,
  message: string | null,
  onSentence: (sentence: string) => void,
  followUpId?: string | null,
  /// The topic chip the teacher tapped before saying anything, if any. Only
  /// meaningful on the opening turn — later turns read it back off the stored
  /// conversation, so it is not sent again.
  topic?: string | null,
  /// Facts the teacher arrived with from another surface (a lesson report, a
  /// document review). Opening turn only.
  context?: string | null,
  /// The kind of moment within the topic, when the teacher narrowed it.
  /// Opening turn only, for the same reason the topic is.
  kind?: string | null,
): Promise<Debrief> {
  const path = id ? `/api/debriefs/${id}/chat/stream` : '/api/debriefs/talk/stream'
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(
      id
        ? { message }
        : {
            ...(message == null ? {} : { message }),
            followUpId: followUpId ?? undefined,
            topic: topic ?? undefined,
            context: context ?? undefined,
            kind: kind ?? undefined,
          },
    ),
  })
  // Everything the caller can act on (turn cap, daily limit) is rejected
  // before the stream starts, so it still arrives as a normal status code.
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiError(body?.error ?? `Request failed with status ${res.status}`, res.status)
  }
  if (!res.body) throw new Error('Could not reach Coach. Please try again.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let debrief: Debrief | null = null

  // Frames are newline-delimited, and a chunk can split one anywhere, so
  // only whole lines are parsed and the remainder carries to the next read.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      const frame = JSON.parse(line) as
        | { type: 'sentence'; text: string }
        | { type: 'done'; debrief: Debrief }
        | { type: 'error'; error: string }
      if (frame.type === 'sentence') onSentence(frame.text)
      else if (frame.type === 'done') debrief = frame.debrief
      else throw new Error(frame.error)
    }
  }

  if (!debrief) throw new Error('Could not reach Coach. Please try again.')
  return debrief
}

export function startTalkToMe(
  message: string,
  followUpId?: string | null,
  topic?: string | null,
  kind?: string | null,
): Promise<Debrief> {
  return request('/api/debriefs/talk', {
    method: 'POST',
    body: JSON.stringify({
      message,
      followUpId: followUpId ?? undefined,
      topic: topic ?? undefined,
      kind: kind ?? undefined,
    }),
  })
}

// Coach's check-in on a step the teacher planned in Talk It Through.
export type CoachFollowUp = {
  id: string
  plan: string
  checkInQuestion: string
  dueAt: string
  status: 'pending' | 'talked' | 'dismissed'
  createdAt: string
  sourceDebriefId: string
}

export function getDueFollowUps(): Promise<CoachFollowUp[]> {
  return request('/api/follow-ups/due')
}

export function getFollowUp(id: string): Promise<CoachFollowUp> {
  return request(`/api/follow-ups/${id}`)
}

// "Don't check in on this" on a Talk It Through takeaway.
export function dismissFollowUpForDebrief(debriefId: string): Promise<{ count: number }> {
  return request(`/api/follow-ups/by-debrief/${debriefId}/dismiss`, { method: 'POST' })
}

// Superadmin testing only — see POST /api/follow-ups/test/due-now.
export function makeFollowUpsDueNow(): Promise<{ count: number }> {
  return request('/api/follow-ups/test/due-now', { method: 'POST' })
}

export function updateFollowUp(id: string, action: 'snooze' | 'dismiss'): Promise<CoachFollowUp> {
  return request(`/api/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
}

// Talk It Through over Telegram — see server/src/routes/telegram.ts.
// `available` is false when the server has no bot configured.
export type TelegramStatus = { available: boolean; linked: boolean; linkedAt: string | null }

export function getTelegramStatus(): Promise<TelegramStatus> {
  return request('/api/telegram')
}

// A one-time t.me link (valid 15 minutes) that connects the chat it's opened
// in, plus the same link as a QR code image (data URL) to scan from a computer.
export function createTelegramLink(): Promise<{ url: string; qr: string }> {
  return request('/api/telegram/link', { method: 'POST' })
}

export function disconnectTelegram(): Promise<{ linked: false }> {
  return request('/api/telegram/link', { method: 'DELETE' })
}

// Removes one conversation for good, along with any check-in scheduled from it.
export function deleteDebrief(id: string): Promise<{ deleted: true }> {
  return request(`/api/debriefs/${id}`, { method: 'DELETE' })
}

export function generateTalkTakeaway(id: string): Promise<Debrief> {
  return request(`/api/debriefs/${id}/takeaway`, { method: 'POST' })
}

// Same multipart pattern as analyzeDemoClip — records audio client-side via
// MediaRecorder and transcribes it server-side, since iOS Safari never
// implements the Web Speech API this used to rely on.
export async function transcribeTalkToMeAudio(audioBlob: Blob): Promise<{ transcript: string }> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'talk-audio')
  const res = await fetch(`${API_BASE_URL}/api/debriefs/transcribe`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

// A URL, not a fetch call — pointing an <audio> element's src directly at
// this lets the browser stream Deepgram's response natively (playback can
// start from the first byte) instead of buffering the whole clip via
// fetch().blob() first.
export function buildSpeechUrl(text: string, voice?: TalkVoice | null): string {
  const query = new URLSearchParams({ text })
  if (voice) query.set('voice', voice)
  return `${API_BASE_URL}/api/tts?${query.toString()}`
}

export function setDebriefSaved(id: string, saved: boolean): Promise<Debrief> {
  return request(`/api/debriefs/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function markDebriefTried(id: string): Promise<Debrief> {
  return request(`/api/debriefs/${id}`, { method: 'PATCH', body: JSON.stringify({ markTried: true }) })
}

export function saveDebriefReflection(id: string, reflectionNote: string): Promise<Debrief> {
  return request(`/api/debriefs/${id}`, { method: 'PATCH', body: JSON.stringify({ reflectionNote }) })
}

export function shareDebrief(id: string): Promise<{ shareToken: string }> {
  return request(`/api/debriefs/${id}/share`, { method: 'POST' })
}

export function getParentMessages(params?: { saved?: boolean }): Promise<ParentMessage[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/parent-messages${query}`)
}

export type DraftMessageInput = {
  startingAction: StartingAction
  incidentSummary?: string
  receivedMessage?: string
  contextNotes?: string
  existingDraft?: string
  recipientType?: string
  purpose?: string
  format?: string
  tone: ParentMessageTone
}

export function draftParentMessage(input: DraftMessageInput): Promise<ParentMessage> {
  return request('/api/parent-messages', { method: 'POST', body: JSON.stringify(input) })
}

export function sendParentMessageChat(id: string, message: string): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setParentMessageSaved(id: string, saved: boolean): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameParentMessage(id: string, title: string): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteParentMessage(id: string): Promise<void> {
  return request(`/api/parent-messages/${id}`, { method: 'DELETE' })
}

export function getSharedAttempt(token: string): Promise<SharedAttempt> {
  return request(`/api/share/attempt/${token}`)
}

export function getSharedDebrief(token: string): Promise<SharedDebrief> {
  return request(`/api/share/debrief/${token}`)
}

export function getSharedLessonPlan(token: string): Promise<SharedLessonPlan> {
  return request(`/api/share/lesson-plan/${token}`)
}

export function getSharedConversationPrep(token: string): Promise<SharedConversationPrep> {
  return request(`/api/share/conversation-prep/${token}`)
}

export function getConversationPreps(params?: { saved?: boolean; source?: ConversationPrepSource }): Promise<ConversationPrep[]> {
  const query = new URLSearchParams()
  if (params?.saved) query.set('saved', 'true')
  if (params?.source) query.set('source', params.source)
  const qs = query.toString()
  return request(`/api/conversation-prep${qs ? `?${qs}` : ''}`)
}

export type SubmitConversationPrepInput = {
  situationText: string
  responseText: string
  source: ConversationPrepSource
  category?: string
  gradeBand?: string
  personType?: string
  difficulty?: string
  reviewMode?: string
}

export function submitConversationPrep(input: SubmitConversationPrepInput): Promise<ConversationPrep> {
  return request('/api/conversation-prep', { method: 'POST', body: JSON.stringify(input) })
}

export function sendConversationPrepChat(id: string, message: string): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function generateConversationScenario(input: {
  category: string
  gradeBand?: string
  personType?: string
  difficulty?: string
}): Promise<{ situationText: string; gradeBand: string }> {
  return request('/api/conversation-prep/generate-scenario', { method: 'POST', body: JSON.stringify(input) })
}

export function setConversationPrepSaved(id: string, saved: boolean): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameConversationPrep(id: string, title: string): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteConversationPrep(id: string): Promise<void> {
  return request(`/api/conversation-prep/${id}`, { method: 'DELETE' })
}

export function shareConversationPrep(id: string): Promise<{ shareToken: string }> {
  return request(`/api/conversation-prep/${id}/share`, { method: 'POST' })
}

export type SubmitConversationPlanInput = {
  situationText: string
  recipientType?: string
  meetingType?: string
  attendees?: string
  desiredOutcome?: string
  concerns?: string
  background?: string
  meetingFormat?: string
}

export function getConversationPlans(params?: { saved?: boolean }): Promise<ConversationPlan[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/conversation-plans${query}`)
}

export function submitConversationPlan(input: SubmitConversationPlanInput): Promise<ConversationPlan> {
  return request('/api/conversation-plans', { method: 'POST', body: JSON.stringify(input) })
}

export function sendConversationPlanChat(id: string, message: string): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setConversationPlanSaved(id: string, saved: boolean): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameConversationPlan(id: string, title: string): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteConversationPlan(id: string): Promise<void> {
  return request(`/api/conversation-plans/${id}`, { method: 'DELETE' })
}

export function getAssignmentCoachSessions(params?: { saved?: boolean }): Promise<AssignmentCoachSession[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/assignment-coach${query}`)
}

export function getAssignmentCoachSession(id: string): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}`)
}

// Grade level, subject, assignment type, estimated time, and objective are
// no longer sent here — Wivoza detects them from originalText itself in
// the same call that produces the review/redesign. aiUseLevel is the one
// real exception: it's a policy choice, not a fact to infer.
export function startAssignmentCoach(input: {
  mode: 'review' | 'redesign_ai'
  aiUseLevel?: AssignmentAiUseLevel
  letWivozaChooseAiUseLevel?: boolean
  originalText: string
  extraNote?: string
}): Promise<AssignmentCoachSession> {
  return request('/api/assignment-coach', { method: 'POST', body: JSON.stringify(input) })
}

// Answers the one optional clarifying question from the initial analysis —
// never blocks the review/redesign, which is always already showing.
export function refineAssignmentCoach(id: string, answer: string): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}/refine`, { method: 'POST', body: JSON.stringify({ answer }) })
}

export function sendAssignmentCoachChat(id: string, message: string): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function reviewAssignmentCoach(id: string): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}/review`, { method: 'POST' })
}

export function reviseAssignmentCoach(id: string): Promise<AssignmentCoachSession & { revisionSummary?: string[] }> {
  return request(`/api/assignment-coach/${id}/revise`, { method: 'POST' })
}

export type ExportImage = { url: string; width: number; height: number; credit: string; original?: boolean }
export type ExportDocBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'callout'; label: string; text: string }
  | { type: 'image'; image: ExportImage }
export type ExportDoc = { title: string; subtitle: string | null; blocks: ExportDocBlock[] }

export type ExportSlideLayout = 'title' | 'cards' | 'split' | 'keyterm' | 'prompt' | 'steps' | 'compare' | 'visual'
export type ExportSlide = {
  title: string
  bullets: string[]
  notes: string | null
  layout: ExportSlideLayout
  icon: string | null
  visual: string | null
  imageQuery: string | null
  // A real, openly licensed picture found for a 'visual' slide.
  image: ExportImage | null
  sourceSlide: number | null
}

export type ExportTheme = 'wivoza' | 'history' | 'science' | 'math' | 'ela' | 'arts' | 'early' | 'wellness'
export type ExportDeck = { theme: ExportTheme; variant: number; slides: ExportSlide[]; changes: string[] }

export type ExportKind = 'document' | 'slides'
export type ExportFormat = 'docx' | 'pdf' | 'pptx'

// Step 1: Claude lays `text` out as a document or slide deck to preview. With
// the teacher's original file attached, its own pictures are carried into the
// layout — read for this one request and never stored.
export function getExportPreview(id: string, kind: 'document', text: string, originalFile?: File | null): Promise<{ kind: 'document'; model: ExportDoc }>
export function getExportPreview(id: string, kind: 'slides', text: string, originalFile?: File | null): Promise<{ kind: 'slides'; model: ExportDeck }>
export async function getExportPreview(id: string, kind: ExportKind, text: string, originalFile?: File | null) {
  if (!originalFile) return request(`/api/assignment-coach/${id}/export-preview`, { method: 'POST', body: JSON.stringify({ kind, text }) })
  const formData = new FormData()
  formData.append('kind', kind)
  formData.append('text', text)
  formData.append('file', originalFile)
  const res = await fetch(`${API_BASE_URL}/api/assignment-coach/${id}/export-preview`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiError(body?.error ?? `Request failed with status ${res.status}`, res.status)
  }
  return res.json()
}

// Step 2: render the previewed model to a real file and save it. No Claude
// call, so downloading several formats from one preview is free.
export async function downloadExportFile(format: ExportFormat, model: ExportDoc | ExportDeck): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/assignment-coach/export-file`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, model }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiError(body?.error ?? `Request failed with status ${res.status}`, res.status)
  }
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = format === 'pptx' ? 'wivoza-slides.pptx' : `wivoza-assignment.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// Builds an improved, themed deck from a saved presentation review (applying
// every recommendation). Preview it, then download through downloadExportFile.
export async function generatePresentation(planId: string, originalFile?: File): Promise<{ kind: 'slides'; model: ExportDeck }> {
  if (!originalFile) return request(`/api/lesson-plans/${planId}/presentation-generate`, { method: 'POST' })
  // With the teacher's original file attached, their own pictures are copied
  // into the new deck. It's read for this one request and never stored.
  const formData = new FormData()
  formData.append('file', originalFile)
  const res = await fetch(`${API_BASE_URL}/api/lesson-plans/${planId}/presentation-generate`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw apiError(body?.error ?? `Request failed with status ${res.status}`, res.status)
  }
  return res.json()
}

// Builds a classroom-ready lesson deck from a plan and its delivery coaching.
export function generateLessonDeck(planId: string): Promise<{ kind: 'slides'; model: ExportDeck }> {
  return request(`/api/lesson-plans/${planId}/lesson-deck`, { method: 'POST' })
}

export function runAiResistant(id: string): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}/ai-resistant`, { method: 'POST' })
}

// Multipart upload for the "Upload a file" intake path — same convention
// as analyzeDemoClip: bypasses the JSON-only request() helper.
export async function extractAssignmentText(file: File): Promise<{ text: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE_URL}/api/assignment-coach/extract-text`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export function updateAssignmentCoachSession(
  id: string,
  data: {
    saved?: boolean
    title?: string
    liveAssignmentText?: string
    status?: 'draft' | 'completed'
    assignmentType?: AssignmentType
    gradeLevel?: string
    subject?: string
    estimatedTime?: string
  },
): Promise<AssignmentCoachSession> {
  return request(`/api/assignment-coach/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteAssignmentCoachSession(id: string): Promise<void> {
  return request(`/api/assignment-coach/${id}`, { method: 'DELETE' })
}

export type LessonPlanContext = {
  objective: string
  unitName?: string
  essentialQuestion?: string
  standard?: string
  subject?: string
  gradeLevel?: string
}

export function getLessonPlans(params?: { saved?: boolean; mode?: LessonPlanMode }): Promise<LessonPlan[]> {
  const query = new URLSearchParams()
  if (params?.saved) query.set('saved', 'true')
  if (params?.mode) query.set('mode', params.mode)
  const qs = query.toString()
  return request(`/api/lesson-plans${qs ? `?${qs}` : ''}`)
}

export function getLessonPlan(id: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}`)
}

export function submitLessonPlanFeedback(context: LessonPlanContext, planText: string): Promise<LessonPlan> {
  return request('/api/lesson-plans/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...context, planText }),
  })
}

export function sendLessonPlanChat(id: string, message: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function applyLessonPlanRevision(id: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}/apply-revision`, { method: 'POST' })
}

export function getPresentationFeedback(id: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}/presentation-feedback`, { method: 'POST' })
}

// Multipart upload, same convention as extractAssignmentText — bypasses
// the JSON-only request() helper.
export async function extractPresentationText(
  file: File,
): Promise<{ text: string; slideCount: number; fileName: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE_URL}/api/lesson-plans/extract-presentation`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export function submitPresentationReview(data: {
  text: string
  fileName?: string
  slideCount?: number
  gradeLevel?: string
  subject?: string
  objective?: string
}): Promise<LessonPlan> {
  return request('/api/lesson-plans/presentation-review', { method: 'POST', body: JSON.stringify(data) })
}

export function generateLessonPlan(context: LessonPlanContext): Promise<LessonPlan> {
  return request('/api/lesson-plans/generate', { method: 'POST', body: JSON.stringify(context) })
}

export function setLessonPlanSaved(id: string, saved: boolean): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function shareLessonPlan(id: string): Promise<{ shareToken: string }> {
  return request(`/api/lesson-plans/${id}/share`, { method: 'POST' })
}

export function getAudioSessions(): Promise<AudioSession[]> {
  return request('/api/audio-sessions')
}

export function getAudioSession(id: string): Promise<AudioSessionWithSegments> {
  return request(`/api/audio-sessions/${id}`)
}

export function createAudioSession(data: {
  teacherName?: string
  classSubject?: string
  period?: string
  gradeLevel?: string
  sessionDate?: string
  consentConfirmed: boolean
}): Promise<AudioSession> {
  return request('/api/audio-sessions', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAudioSession(
  id: string,
  data: Partial<{
    teacherName: string
    classSubject: string
    period: string
    gradeLevel: string
    sessionDate: string
    status: AudioSessionStatus
    strengths: string
    growthAreas: string
    nextStep: string
    followUpDate: string | null
    phases: AudioPhase[]
    durationSec: number
  }>,
): Promise<AudioSession> {
  return request(`/api/audio-sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

// Uses fetch directly rather than the JSON-only request() helper, since it
// needs to send FormData (the recorded audio blob), not a JSON body.
/// Hands the audio over and returns as soon as the server has it. Deepgram
/// takes roughly 0.15x the recording's length — eight minutes for a fifty
/// minute class — and the teacher is not made to watch that: the session goes
/// on transcribing server-side and the list row reports it.
///
/// `durationSec` is sent so the row can draw a progress estimate on a device
/// that never did the recording.
export async function startTranscription(
  id: string,
  audioBlob: Blob,
  durationSec: number,
): Promise<void> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'session-audio')
  formData.append('mode', 'async')
  formData.append('durationSec', String(Math.round(durationSec)))
  const res = await fetch(`${API_BASE_URL}/api/audio-sessions/${id}/transcribe`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
}

/// The speaker cards, once transcription has finished. Separate from the
/// upload now that the upload no longer waits around to return them.
export function getSpeakerSamples(id: string): Promise<{ speakers: SpeakerSample[] }> {
  return request(`/api/audio-sessions/${id}/speakers`)
}

export function tagSpeakers(id: string, rawSpeakerTags: string[]): Promise<AudioSessionWithSegments> {
  return request(`/api/audio-sessions/${id}/tag-speaker`, {
    method: 'POST',
    body: JSON.stringify({ rawSpeakerTags }),
  })
}

export function deleteAudioSession(id: string): Promise<{ status: string }> {
  return request(`/api/audio-sessions/${id}`, { method: 'DELETE' })
}

export type ReflectChatErrorKind = 'locked' | 'turn_cap' | 'daily_limit' | 'other'

export async function sendReflectMessage(
  id: string,
  // `spoken` tells the coach it is being heard rather than read, which changes
  // how it writes: one or two sentences, one question, no lists.
  data: { message?: string; context: string[]; spoken?: boolean },
): Promise<AudioSession> {
  const res = await fetch(`${API_BASE_URL}/api/audio-sessions/${id}/reflect-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const kind: ReflectChatErrorKind =
      res.status === 403 ? 'locked' : res.status === 409 ? 'turn_cap' : res.status === 429 ? 'daily_limit' : 'other'
    throw Object.assign(new Error(body?.error ?? `Request failed with status ${res.status}`), { kind })
  }
  return res.json()
}

export function summarizeReflectConversation(
  id: string,
): Promise<{ strengths: string | null; growthAreas: string | null; nextStep: string | null }> {
  return request(`/api/audio-sessions/${id}/reflect-summary`, { method: 'POST' })
}

export function generateContentNotes(id: string): Promise<AudioSession> {
  return request(`/api/audio-sessions/${id}/content-notes`, { method: 'POST' })
}

export function generateRubricLens(id: string): Promise<AudioSessionWithSegments> {
  return request(`/api/audio-sessions/${id}/rubric-lens`, { method: 'POST' })
}

export function generateClassSummary(id: string): Promise<AudioSession> {
  return request(`/api/audio-sessions/${id}/class-summary`, { method: 'POST' })
}

export type SupportTurn = { role: 'user' | 'assistant'; text: string }

// The website chatbot's endpoint is public (no session) and deliberately
// never throws: a rate limit or a Claude outage still returns a usable
// `reply` pointing the visitor at the contact email, so the widget can show
// one thing in every case instead of branching on status codes.
export async function sendSupportChat(message: string, history: SupportTurn[]): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/support/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })
  const data = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null
  return (
    data?.reply ??
    data?.error ??
    'Sorry — something went wrong. Email hello@wivoza.com and a person will reply.'
  )
}

// Public /for-schools form, and the superadmin inbox that reads it.
export type SchoolInquiryInput = {
  name: string
  email: string
  role: string
  organizationName: string
  organizationType: 'school' | 'district' | 'network' | 'other'
  teacherCount?: '1-25' | '26-100' | '101-500' | '500+'
  message?: string
  // Honeypot — always empty from a real visitor.
  website?: string
}

export type SchoolInquiry = Omit<SchoolInquiryInput, 'website' | 'teacherCount' | 'message'> & {
  id: string
  state: string | null
  teacherCount: string | null
  interests: string | null
  message: string | null
  status: 'new' | 'contacted' | 'closed'
  createdAt: string
  updatedAt: string
}

export function submitSchoolInquiry(data: SchoolInquiryInput): Promise<{ ok: true }> {
  return request('/api/school-inquiries', { method: 'POST', body: JSON.stringify(data) })
}

export function getSchoolInquiries(): Promise<SchoolInquiry[]> {
  return request('/api/school-inquiries')
}

export function updateSchoolInquiryStatus(id: string, status: SchoolInquiry['status']): Promise<SchoolInquiry> {
  return request(`/api/school-inquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
}

// --- class context ---

/// One of the teacher's preps. Most teachers have two or three; one is the
/// default that every surface starts from.
///
/// `line` is built on the server so the web app, the iOS app and any export
/// can never disagree about how a room reads. `confirmed` is false while the
/// row is still a guess nobody has agreed to, and `needsConfirmation` folds in
/// the new-school-year rule on top of that.
export type ClassContext = {
  id: string
  label: string | null
  gradeBand: string
  subject: string | null
  course: string | null
  courseLevel: string | null
  classMakeup: string[]
  isDefault: boolean
  confirmed: boolean
  inferred: boolean
  schoolYear: string | null
  /// "Grades 9–12 · Biology · Honors · ELs in the room"
  line: string
  needsConfirmation: boolean
}

export type ClassContextInput = {
  label?: string | null
  gradeBand: string
  subject?: string | null
  course?: string | null
  courseLevel?: string | null
  classMakeup?: string[]
  isDefault?: boolean
}

/// The teacher's preps, default first. Seeds one by inference on the server's
/// first read, so an existing teacher never retypes what the app already
/// knows. An empty list is a normal answer — nothing may block on it.
export function getClassProfiles(): Promise<ClassContext[]> {
  return request('/api/class-profiles')
}

export function createClassProfile(data: ClassContextInput): Promise<ClassContext> {
  return request('/api/class-profiles', { method: 'POST', body: JSON.stringify(data) })
}

/// Edit one prep, or confirm it with `confirm: true`.
///
/// The response carries `previous` — the row as it was before this call — so
/// an inline save can offer a real undo ("Saved to your class — not quite?")
/// without the server holding any undo state.
export function updateClassProfile(
  id: string,
  data: Partial<ClassContextInput> & { confirm?: boolean },
): Promise<ClassContext & { previous: ClassContext }> {
  return request(`/api/class-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

/// Deletes a prep and returns the list that remains — the default moves to the
/// oldest survivor, so a teacher is never left with preps and no default.
export function deleteClassProfile(id: string): Promise<ClassContext[]> {
  return request(`/api/class-profiles/${id}`, { method: 'DELETE' })
}

// --- Look It Over ---

export type ReviewEdit = {
  /// Where in the document, as a teacher would point at it: "ITEM 7 ·
  /// MULTIPLE CHOICE". Absent on edits made before the result page had
  /// location labels, where the card falls back to the lens name.
  where?: string
  /// The kind of problem, in three or four words.
  tag?: string
  severity?: 'high' | 'medium' | 'low'
  section?: string
  id: string
  anchor: string
  original: string
  revision: string
  why: string
  lens: string
  status: 'pending' | 'accepted' | 'kept_mine'
}

/// The basis for a number the result shows. Every figure on the page traces
/// to one of these — a number whose basis is not shown is a number nobody can
/// check.
export type Assumption = { label: string; value: string; calibratable?: boolean }

export type ReviewScope = { mode: string; label: string | null }

export type ReviewLens = {
  key: string
  label: string
  blurb: string
  on: boolean
  /// The old single-blob finding. Still populated, and still what the card
  /// falls back to for a review run before the contract had parts.
  finding?: string | null
  /// Three to six words naming what was found — not the lens's own name.
  title?: string | null
  body?: string | null
  /// "low" when the document did not give this lens enough to judge. The card
  /// says so rather than presenting a guess at full strength.
  confidence?: 'high' | 'low' | null
  evidence?: string[]
  section?: string | null
}

export type TimingBasis = { minutes: [number, number]; assumption: string }

export type Review = {
  id: string
  docType: string
  docTypeLabel: string
  /// What in the document points at this type, strongest first, at most two.
  detectionEvidence: string[]
  /// What detection guessed, kept even after the teacher corrects it.
  detectedType: string | null
  docTypeConfirmed: boolean
  sourceKind: string
  fileName: string | null
  pageCount: number | null
  originalText: string
  focusArea: string | null
  classProfileId: string | null
  /// The room this was judged against, as stored on the review — not
  /// whichever class is selected now.
  classLine?: string | null
  /// Every document in the review, in the order they were added. Empty on a
  /// review made before one review could hold several.
  files?: ReviewFile[]
  /// "An assignment and a rubric — I'll check them against each other."
  /// Only on the create response, and only when there was more than one.
  fileSetSummary?: string | null
  lenses: ReviewLens[]
  oneThing: string | null
  oneThingDetail?: string | null
  assumptions?: Assumption[]
  notVisible?: string[]
  scope?: ReviewScope | null
  edits: ReviewEdit[]
  /// Edits quoting text that is not in the document. Surfaced rather than
  /// hidden — the one failure that could attribute an invented sentence to
  /// the teacher.
  unanchoredEditIds: string[]
  acceptedCount: number
  /// "Export my original" until something is accepted, then
  /// "Export with N changes". Computed server-side so no client can
  /// overstate what was accepted.
  exportLabel: string
  timingBasis: TimingBasis | null
  status: string
  saved: boolean
  createdAt: string
  /// The plainly-stated limits, shown in the result footer.
  limits: string
}

export type Detection = { docType: string; confident: boolean; evidence: string[] }

export type ExtractedDocument = Detection & {
  text: string
  truncated: boolean
  fileName: string
  pageCount: number | null
}

/// Text and a type guess out of an uploaded file. Nothing is stored yet, so a
/// file that turns out to be unreadable leaves no empty review behind.
export async function extractReviewDocument(file: File): Promise<ExtractedDocument> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`${API_BASE_URL}/api/reviews/extract`, {
    method: 'POST',
    credentials: 'include',
    body,
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null)
    throw apiError(payload?.error ?? messageForStatus(res.status), res.status)
  }
  return res.json()
}

/// The same type guess for pasted text, so the confirmation strip reads
/// identically however the document arrived.
export function detectReviewType(text: string): Promise<Detection> {
  return request('/api/reviews/detect', { method: 'POST', body: JSON.stringify({ text }) })
}

/// One document inside a review.
export type ReviewFile = {
  id: string
  fileName: string | null
  sourceKind: string
  pageCount: number | null
  docType: string | null
}

/// A file on its way in, before the review exists.
export type PendingFile = {
  text: string
  fileName: string | null
  sourceKind: 'file' | 'paste' | 'photo'
  pageCount: number | null
  docType?: string | null
}

export function createReview(opts: {
  /// A single document, which is what a paste is. Ignored when `files` is
  /// given.
  text?: string
  /// Several, read as one review. An assignment plus its rubric is one
  /// review, not two.
  files?: PendingFile[]
  docType?: string
  sourceKind?: 'file' | 'paste' | 'photo'
  fileName?: string | null
  pageCount?: number | null
  classProfileId?: string | null
}): Promise<Review & { detectionConfident: boolean; fileSetSummary?: string | null }> {
  return request('/api/reviews', { method: 'POST', body: JSON.stringify(opts) })
}

export function getReviews(params?: { saved?: boolean }): Promise<Review[]> {
  return request(`/api/reviews${params?.saved ? '?saved=true' : ''}`)
}

export function getReview(id: string): Promise<Review> {
  return request(`/api/reviews/${id}`)
}

/// Confirming or correcting the type, toggling lenses, saving. Correcting the
/// type swaps in that type's own lenses and clears the previous result.
export function updateReview(
  id: string,
  data: { docType?: string; lenses?: { key: string; on: boolean }[]; saved?: boolean },
): Promise<Review> {
  return request(`/api/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

/// What the server answers with when the document looks like it has student
/// names in it and the teacher has not said what to do about that.
export type StudentNamesFound = { reason: string; lineCount: number }

/// What the server answers with when the document is long enough that one
/// pass would be a summary rather than a review. Minutes are a range, said
/// before it starts rather than after.
export type ScopeChoice = {
  pages: number
  whole: { label: string; minutes: [number, number] }
  sections: { label: string; minutes: [number, number] }[]
}

export function runReview(
  id: string,
  opts?: { namesHandled?: 'strip' | 'keep'; scope?: string },
): Promise<Review> {
  return request(`/api/reviews/${id}/run`, {
    method: 'POST',
    body: JSON.stringify({ namesHandled: opts?.namesHandled, scope: opts?.scope }),
  })
}

/// "Keep mine" / "Use this" on one edit.
export function setReviewEditStatus(
  id: string,
  editId: string,
  status: ReviewEdit['status'],
): Promise<Review> {
  return request(`/api/reviews/${id}/edits/${editId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

/// The document as it stands — the original with accepted edits applied.
export function getReviewDocument(id: string): Promise<{
  text: string
  acceptedCount: number
  label: string
}> {
  return request(`/api/reviews/${id}/document`)
}

/// Hands off to the existing Assignment Coach redesign workspace, pre-seeded
/// with this document.
export function redesignReviewForAi(id: string): Promise<{ assignmentCoachSessionId: string }> {
  return request(`/api/reviews/${id}/redesign-ai`, { method: 'POST' })
}

export function deleteReview(id: string): Promise<{ ok: true }> {
  return request(`/api/reviews/${id}`, { method: 'DELETE' })
}

// --- Look It Over (plan) <-> Lesson Debrief (recording) ---

/// What the plan said and what the recording heard, when a teacher linked
/// them. Computed server-side so the report, the printed export and any
/// later client agree.
export type PlanComparison = {
  planned: string
  actual: string
  line: string
  /// Why the gap might be the right call. Always present — a plan is a
  /// prediction, and a lesson that diverges from it is frequently a teacher
  /// reading the room correctly.
  caveat: string
}

export type LinkableReview = {
  id: string
  docType: string
  fileName: string | null
  createdAt: string
  /// False when the review produced no timing estimate, so it cannot ground
  /// a comparison. Shown as unavailable rather than offered as if it would.
  comparable: boolean
}

/// Reviewed plans this recording could be linked to.
export function getLinkableReviews(sessionId: string): Promise<LinkableReview[]> {
  return request(`/api/audio-sessions/${sessionId}/linkable-reviews`)
}

/// Links a recording to the plan it was taught from, or unlinks it with null.
export function linkRecordingToReview(sessionId: string, reviewId: string | null): Promise<{ ok: true }> {
  return request(`/api/audio-sessions/${sessionId}/review-link`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewId }),
  })
}

// --- My Work ---

export type WorkItem = {
  id: string
  surface: string
  /// What kind of thing this is, in a teacher's words.
  kind: string
  title: string
  topic: string | null
  topicLabel: string | null
  saved: boolean
  createdAt: string
  /// Where tapping it goes. A legacy item opens its original result page,
  /// which still exists for exactly this reason.
  href: string
}

export type WorkFeed = {
  items: WorkItem[]
  total: number
  /// Counts over everything, not the filtered set — a chip reading 0 is how a
  /// teacher learns the filter is why the list looks empty.
  bySurface: Record<string, number>
  byTopic: { value: string; label: string; count: number }[]
}

export function getWork(params?: {
  surface?: string | null
  topic?: string | null
  saved?: boolean
}): Promise<WorkFeed> {
  const query = new URLSearchParams()
  if (params?.surface) query.set('surface', params.surface)
  if (params?.topic) query.set('topic', params.topic)
  if (params?.saved) query.set('saved', 'true')
  const suffix = query.toString()
  return request(`/api/work${suffix ? `?${suffix}` : ''}`)
}
