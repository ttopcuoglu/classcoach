import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookIcon,
  BrainIcon,
  ChatBubbleIcon,
  HeadsetIcon,
  LessonPlanIcon,
  MailIcon,
  MicIcon,
  PlayIcon,
} from '../components/icons'
import {
  getAssignmentCoachSessions,
  getAttempts,
  getAudioSessions,
  getConversationPlans,
  getDebriefs,
  getDueFollowUps,
  getLessonPlans,
  getProfile,
  updateFollowUp,
  type AssignmentCoachSession,
  type AudioSession,
  type CoachFollowUp,
  type ConversationPlan,
  type LessonPlan,
  type ExperienceLevel,
  type Debrief,
  type ScenarioAttempt,
} from '../lib/api'
import { pickDailyTip, type Mood } from '../lib/dailyTips'
import { isExperienced } from '../lib/experience'
import { ACCENTS, ACCENT_CYCLE } from '../components/report'

type IconComponent = (props: { className?: string }) => React.ReactElement

type NextStep = {
  icon: IconComponent
  title: string
  description: string
  linkLabel: string
  to: string
}

const DAY_MS = 24 * 60 * 60 * 1000
// Below this many days of total inactivity, the "Next" card still shows
// whichever step would otherwise apply — just with a "welcome back" framing
// instead of pretending nothing happened.
const WELCOME_BACK_THRESHOLD_DAYS = 14

type Activity =
  | { type: 'scenario'; id: string; createdAt: string; attempt: ScenarioAttempt }
  | { type: 'ask'; id: string; createdAt: string; debrief: Debrief }
  | { type: 'lessonPlan'; id: string; createdAt: string; plan: LessonPlan }
  | { type: 'assignment'; id: string; createdAt: string; session: AssignmentCoachSession }
  | { type: 'conversationPlan'; id: string; createdAt: string; plan: ConversationPlan }

// How many rows "Pick up where you left off" shows. Six rather than four
// because the list draws on five tools now, and four slots were filled by a
// single busy week in one of them.
const RECENT_WORK_LIMIT = 6

// Ask and Talk It Through conversations are both Debrief rows; only the
// source says which feature a teacher would expect to land back in.
function isTalkItThrough(item: Activity): boolean {
  return item.type === 'ask' && item.debrief.source === 'talk_to_me'
}

// Straight to the thing itself, not the feature's start screen. Practice and
// Talk It Through reopen in place; the rest have no "open this one" parameter
// on their tool page, so they go to the same saved report their own history
// lists link to.
function activityLink(item: Activity): string {
  switch (item.type) {
    case 'scenario':
      return `/coach-chat?tab=practice&open=${item.id}`
    // Ask is gone as a surface, but the answers a teacher saved under it are
    // still theirs. Their report page still loads them, so Recent work opens
    // that rather than a tab that no longer exists.
    case 'ask':
      return isTalkItThrough(item) ? `/talk-to-me?open=${item.id}` : `/ask-practice/ask/${item.id}/export`
    case 'lessonPlan':
      return `/lesson-planning/${item.id}/export`
    case 'assignment':
      return `/assignment-coach/${item.id}/export`
    case 'conversationPlan':
      return `/communications/meeting/${item.id}/export`
  }
}

// The tool as the nav names it. Review an Assignment is a tab of Planning
// Coach, so it says Planning Coach; the old ask flow is not a tool any more,
// so its rows say what they are instead of naming a surface that is gone.
function activityTool(item: Activity): string {
  switch (item.type) {
    case 'scenario':
      return 'Practice'
    case 'ask':
      return isTalkItThrough(item) ? 'Talk It Through' : 'Saved answer'
    case 'lessonPlan':
    case 'assignment':
      return 'Planning Coach'
    case 'conversationPlan':
      return 'Communication Coach'
  }
}

function activityIcon(item: Activity): IconComponent {
  switch (item.type) {
    case 'scenario':
      return BrainIcon
    case 'ask':
      return isTalkItThrough(item) ? MicIcon : ChatBubbleIcon
    case 'lessonPlan':
      return LessonPlanIcon
    case 'assignment':
      return BookIcon
    case 'conversationPlan':
      return MailIcon
  }
}

// Every row needs a line a teacher recognizes. The plan tools store their own
// title inconsistently — a lesson plan has an objective, an assignment or a
// meeting may carry a title the teacher typed — so each falls back through
// what it has before settling for naming the kind of thing it is.
function activityText(item: Activity): string {
  switch (item.type) {
    case 'scenario':
      return item.attempt.scenario.text
    case 'ask':
      return item.debrief.incidentText
    case 'lessonPlan':
      return (
        item.plan.objective ||
        item.plan.unitName ||
        item.plan.essentialQuestion ||
        [item.plan.gradeLevel, item.plan.subject].filter(Boolean).join(' · ') ||
        'A lesson you worked on'
      )
    case 'assignment':
      return item.session.title || item.session.objective || item.session.originalText || 'An assignment you reviewed'
    case 'conversationPlan':
      return item.plan.title || item.plan.situationText
  }
}

const MOODS: { label: string; value: Mood }[] = [
  { label: 'Good', value: 'good' },
  { label: 'Okay', value: 'okay' },
  { label: 'Stressed', value: 'stressed' },
  { label: 'Overwhelmed', value: 'overwhelmed' },
]

// What the card says back. Asking how someone is and then changing only a
// tip further down felt like being asked for no reason; on the hard days
// the answer points to Talk It Through, whose coach is there for exactly
// that, not just classroom management.
const MOOD_RESPONSES: Record<Mood, { text: string; talk: boolean }> = {
  good: { text: "Love that. The tip below is one to keep the good day going.", talk: false },
  okay: { text: 'Fair enough. The tip below is something small for today.', talk: false },
  stressed: { text: "That's a lot to carry. Want to talk it through? Coach is there for the hard days too.", talk: true },
  overwhelmed: { text: "You don't have to sort it all out alone. A few minutes with Coach can help you find the one next thing.", talk: true },
}

const MOOD_SUGGESTED_CATEGORY: Partial<Record<Mood, string>> = {
  stressed: 'disruption',
  overwhelmed: 'transitions',
}

const ACTION_CARDS = [
  {
    to: '/audio-coaching',
    icon: MicIcon,
    accent: ACCENTS.terracotta,
    tag: 'Lesson reflection',
    title: 'Lesson Debrief',
    description: 'Record a class and turn classroom talk into focused, judgment-free feedback.',
    linkLabel: 'Record a lesson',
  },
  {
    to: '/talk-to-me',
    icon: HeadsetIcon,
    accent: ACCENTS.forest,
    tag: 'Live coach',
    title: 'Talk It Through',
    description: 'Think out loud. Your coach listens, asks, and helps you find a next step.',
    linkLabel: 'Start voice coaching',
  },
  {
    to: '/coach-chat',
    icon: ChatBubbleIcon,
    accent: ACCENTS.gold,
    tag: 'Safe practice',
    title: 'Practice',
    description:
      'Rehearse a real classroom moment — behavior, a parent, a hard conversation — and get coaching on the words you used.',
    linkLabel: 'Practice a scenario',
  },
]

// The Plan group, in the nav's order and with the nav's own subtitles, so the
// two pages Home never had a door to are named the same way in both places.
const PLAN_CARDS = [
  {
    to: '/lesson-planning',
    icon: LessonPlanIcon,
    title: 'Planning Coach',
    description: 'Lessons, slides & assignments',
  },
  {
    to: '/communications',
    icon: MailIcon,
    title: 'Communication Coach',
    description: 'Write, prepare & review',
  },
]

// A static explainer of how coaching works here — deliberately not a
// personalized "you're on step 2" tracker, since no per-teacher progress
// through a cycle like this is tracked anywhere in the app.
const COACHING_PATH = [
  { label: 'Notice', description: 'See a pattern from a lesson or moment.' },
  { label: 'Practice', description: 'Try a strategy in a low-stakes rehearsal.' },
  { label: 'Try', description: 'Use it for real, in your classroom.' },
  { label: 'Reflect', description: 'See what changed, and what to try next.' },
]

// "Tuesday" reads better than a date for something a few days old.
function relativeDay(when: string): string {
  const date = new Date(when)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  if (date >= startOfToday) return 'today'
  // Calendar days, not 24-hour periods — last night is "yesterday".
  const days = Math.ceil((startOfToday.getTime() - date.getTime()) / DAY_MS)
  if (days <= 1) return 'yesterday'
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function checkInAge(createdAt: string): string {
  const day = relativeDay(createdAt)
  return day === 'today' ? 'from earlier today' : `from ${day}`
}

function Donut({ pct }: { pct: number }) {
  const size = 96
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-forest)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="fill-forest text-lg font-bold">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

export default function Home() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [name, setName] = useState<string | null>(null)
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [sessions, setSessions] = useState<AudioSession[]>([])
  // Unfiltered, newest-first — used only to drive the "Next" card's
  // priority logic (has any lesson been recorded, is the latest one
  // reflected on), separate from `sessions` above which is filtered/sorted
  // for the classroom-pulse chart.
  const [allSessions, setAllSessions] = useState<AudioSession[]>([])
  // Planning Coach is one tool in the nav and one flag here. Its first three
  // tabs write LessonPlan rows and Review an Assignment writes its own table,
  // so reading only the first of those told a teacher who had reviewed an
  // assignment that they had never opened the tool — the same undercount the
  // admin panel carried until the tools were counted the way the nav has them.
  const [hasPlanningActivity, setHasPlanningActivity] = useState(false)
  const [hasTalkItThrough, setHasTalkItThrough] = useState(false)
  const [hasConversationPlans, setHasConversationPlans] = useState(false)
  // Newest createdAt across attempts/debriefs/lesson plans/assignment
  // sessions/conversation plans — combined with allSessions' own newest
  // timestamp below to get the true overall last-activity time.
  const [latestOtherActivityAt, setLatestOtherActivityAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkIn, setCheckIn] = useState<CoachFollowUp | null>(null)
  const [mood, setMood] = useState<Mood | null>(null)
  const [tip, setTip] = useState(() => pickDailyTip(null))

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setName(profile.name)
        setExperienceLevel(profile.experienceLevel)
        setNeedsOnboarding(!profile.name && !profile.gradeLevels && !profile.subjects)
      })
      .catch(() => {})

    getDueFollowUps()
      .then((due) => setCheckIn(due[0] ?? null))
      .catch(() => {})

    getAudioSessions()
      .then((all) => {
        setAllSessions([...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
        const withVoice = all
          .filter((s) => (s.status === 'analyzed' || s.status === 'locked') && s.studentTalkPct != null)
          .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
        setSessions(withVoice)
      })
      .catch(() => {})

    Promise.all([
      getAttempts(),
      getDebriefs(),
      getLessonPlans(),
      getAssignmentCoachSessions(),
      getConversationPlans(),
    ])
      .then(([attempts, debriefs, lessonPlans, assignmentSessions, conversationPlans]) => {
        // Recorded lessons are deliberately not here: card 01, the pulse card
        // and Your growth all already point at them, and a fourth door to the
        // same page would crowd out the tools that only have this one.
        const combined: Activity[] = [
          ...attempts.map((a): Activity => ({ type: 'scenario', id: a.id, createdAt: a.createdAt, attempt: a })),
          ...debriefs.map((d): Activity => ({ type: 'ask', id: d.id, createdAt: d.createdAt, debrief: d })),
          ...lessonPlans.map((p): Activity => ({ type: 'lessonPlan', id: p.id, createdAt: p.createdAt, plan: p })),
          ...assignmentSessions.map((a): Activity => ({ type: 'assignment', id: a.id, createdAt: a.createdAt, session: a })),
          ...conversationPlans.map((p): Activity => ({ type: 'conversationPlan', id: p.id, createdAt: p.createdAt, plan: p })),
        ]
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setActivity(combined.slice(0, RECENT_WORK_LIMIT))

        setHasPlanningActivity(lessonPlans.length > 0 || assignmentSessions.length > 0)
        // source is what tells the two Debrief-backed tools apart; anything
        // that isn't a Talk It Through row belongs to the old ask flow.
        setHasTalkItThrough(debriefs.some((d) => d.source === 'talk_to_me'))
        setHasConversationPlans(conversationPlans.length > 0)

        // combined is every non-recording source, newest first, so its head is
        // already the answer this used to assemble from four separate lists.
        setLatestOtherActivityAt(combined[0] ? new Date(combined[0].createdAt).getTime() : null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Either way the card goes: "later" brings it back in a couple of days,
  // "dismiss" drops it for good. Failures just leave the card up to retry.
  function handleCheckInAction(action: 'snooze' | 'dismiss') {
    if (!checkIn) return
    const current = checkIn
    setCheckIn(null)
    updateFollowUp(current.id, action).catch(() => setCheckIn(current))
  }

  function handleMoodSelect(value: Mood) {
    setMood(value)
    setTip(pickDailyTip(value))
    const suggested = MOOD_SUGGESTED_CATEGORY[value]
    if (suggested) sessionStorage.setItem('classcoach.suggestedCategory', suggested)
    else sessionStorage.removeItem('classcoach.suggestedCategory')
  }

  const today = new Date()
  const dateLabel = today
    .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase()
  const hour = today.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  // Skip a leading honorific (e.g. "Ms. Rivera") so the greeting doesn't
  // address someone by a bare title, or double up on the period from
  // "Ms." plus the sentence's own trailing period.
  const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'mx'])
  const firstName = name
    ?.trim()
    .split(/\s+/)
    .map((token) => token.replace(/\.$/, ''))
    .find((token) => token && !HONORIFICS.has(token.toLowerCase()))

  const latest = sessions[sessions.length - 1]
  const first = sessions[0]
  const pulseChange =
    latest && first && sessions.length > 1 && latest.studentTalkPct != null && first.studentTalkPct != null
      ? latest.studentTalkPct - first.studentTalkPct
      : null
  const sparkline = sessions.slice(-5)
  const maxSpark = Math.max(1, ...sparkline.map((s) => s.studentTalkPct ?? 0))

  // Priority-ordered "Next" recommendation, cheapest/most-certain signal
  // first. Each rule only fires once everything above it doesn't apply, so
  // exactly one recommendation shows at a time. Deliberately does not try
  // to track "which step of Notice/Practice/Try/Reflect you're on" (see
  // COACHING_PATH above) — this only ever names one concrete next action.
  const completedSessions = allSessions.filter((s) => s.status === 'analyzed' || s.status === 'locked')
  const latestCompletedSession = completedSessions[0] ?? null
  const latestSessionUnreflected =
    latestCompletedSession != null &&
    (!latestCompletedSession.reflectConversation || latestCompletedSession.reflectConversation.length === 0)
  const hasAnyActivity = activity.length > 0 || allSessions.length > 0

  const experienced = isExperienced(experienceLevel)

  function computeNextStep(): NextStep {
    // An experienced teacher gets more from seeing their own classroom than
    // from a rehearsal scenario, so their first step is a recording.
    if (!hasAnyActivity && experienced) {
      return {
        icon: MicIcon,
        title: 'See what’s really happening in your room',
        description: 'Record a class and get an honest picture — talk time, questions, wait time, who was heard.',
        linkLabel: 'Record a lesson',
        to: '/audio-coaching',
      }
    }
    if (!hasAnyActivity) {
      return {
        icon: PlayIcon,
        title: 'Practice a scenario',
        description: 'Run a realistic classroom moment and get coaching on your response.',
        linkLabel: 'Practice now',
        to: '/coach-chat',
      }
    }
    if (!latestCompletedSession) {
      return {
        icon: MicIcon,
        title: 'Try recording a real lesson',
        description: 'See how it plays out for real — record a class and turn it into feedback.',
        linkLabel: 'Record a lesson',
        to: '/audio-coaching',
      }
    }
    if (latestSessionUnreflected) {
      return {
        icon: ChatBubbleIcon,
        title: 'Reflect on your last lesson',
        description: 'You recorded a class — talk through what stood out and what to try next.',
        linkLabel: 'Open Lesson Debrief',
        to: '/audio-coaching',
      }
    }
    // Nothing to set up and no format to pick, so it is the cheapest of the
    // "you haven't opened this yet" suggestions to act on — and the one the
    // nav moved up beside Home. It used to be missing from this list
    // entirely, which left the catch-all tool as the only one Home never
    // pointed a teacher at.
    if (!hasTalkItThrough) {
      return {
        icon: HeadsetIcon,
        title: 'Try Talk It Through',
        description: "A tool you haven't opened yet — think out loud about anything on your mind, and your coach listens.",
        linkLabel: 'Open Talk It Through',
        to: '/talk-to-me',
      }
    }
    // One step for Planning Coach, not one per tab. Review an Assignment is a
    // tab inside it rather than the separate tool this card used to name, and
    // Home names tools everywhere else.
    if (!hasPlanningActivity) {
      return {
        icon: LessonPlanIcon,
        title: 'Try Planning Coach',
        description:
          "A tool you haven't opened yet — build a lesson from a topic, strengthen one you wrote, or review slides and assignments.",
        linkLabel: 'Open Planning Coach',
        to: '/lesson-planning',
      }
    }
    if (!hasConversationPlans) {
      return {
        icon: MailIcon,
        title: 'Try Communication Coach',
        description: "A tool you haven't opened yet — prepare for a meeting or draft a message.",
        linkLabel: 'Open Communication Coach',
        to: '/communications',
      }
    }
    // Already touched every tool — a safe, encouraging fallback rather than
    // no recommendation at all.
    return {
      icon: PlayIcon,
      title: 'Keep the momentum going',
      description: 'Practice another scenario to stay sharp.',
      linkLabel: 'Practice now',
      to: '/coach-chat',
    }
  }

  const nextStep = computeNextStep()
  const lastActivityAt = Math.max(latestOtherActivityAt ?? 0, allSessions[0] ? new Date(allSessions[0].createdAt).getTime() : 0) || null
  const daysSinceActivity = lastActivityAt != null ? (today.getTime() - lastActivityAt) / DAY_MS : null
  const isWelcomeBack = hasAnyActivity && daysSinceActivity != null && daysSinceActivity >= WELCOME_BACK_THRESHOLD_DAYS

  return (
    <div className="flex flex-col gap-8">
      {/* While Coach's check-in is waiting, it is the one thing Home asks for —
          the "next step" suggestion steps aside until it's handled. */}
      <div
        className={`grid gap-6 rounded-3xl bg-forest p-6 text-cream sm:p-8 lg:items-center ${
          checkIn ? '' : 'lg:grid-cols-[1.3fr_1fr]'
        }`}
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{dateLabel}</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold text-cream sm:text-4xl">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
            <span className="text-gold">.</span>
          </h1>
          <p className="mt-1.5 text-cream/70">What would help you feel more prepared today?</p>
        </div>
        {!checkIn && (
          <div className="flex flex-col gap-4 rounded-2xl bg-cream/5 p-5 ring-1 ring-cream/10">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold text-forest">
                <nextStep.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
                  {isWelcomeBack ? 'Welcome back' : 'Your next step'}
                </p>
                <p className="mt-0.5 font-heading text-lg font-bold text-cream">{nextStep.title}</p>
                <p className="text-sm text-cream/70">{nextStep.description}</p>
              </div>
            </div>
            <Link
              to={nextStep.to}
              className="self-start rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90"
            >
              {nextStep.linkLabel} →
            </Link>
          </div>
        )}
      </div>

      {checkIn && (
        <div className="flex flex-col gap-4 rounded-3xl border-l-8 border-gold bg-gold-tint/60 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
              <HeadsetIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                Coach is checking in · {checkInAge(checkIn.createdAt)}
              </p>
              <p className="mt-1.5 font-heading text-lg font-bold text-forest">{checkIn.checkInQuestion}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:items-end">
            <Link
              to={`/talk-to-me?followUp=${checkIn.id}`}
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-terracotta/90"
            >
              Tell Coach how it went →
            </Link>
            <div className="flex gap-4 text-xs font-medium text-ink-soft">
              <button type="button" onClick={() => handleCheckInAction('snooze')} className="hover:text-forest">
                Remind me later
              </button>
              <button type="button" onClick={() => handleCheckInAction('dismiss')} className="hover:text-terracotta-600">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {needsOnboarding && (
        <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Get more relevant coaching</p>
          <p className="mt-1 text-sm text-ink">
            Add your grade level and subject to your profile so scenarios and advice fit your classroom.
          </p>
          <Link to="/profile" className="mt-3 inline-block text-sm font-semibold text-forest underline underline-offset-2">
            Complete your profile
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {ACTION_CARDS.map(({ to, icon: Icon, accent, tag, title, description, linkLabel }, i) => (
          <Link
            key={to}
            to={to}
            className={`group flex flex-col rounded-3xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-md ${accent.tint}`}
          >
            <div className="flex items-start justify-between">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.band} ${
                  accent === ACCENTS.gold ? 'text-forest' : 'text-cream'
                }`}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span aria-hidden="true" className="font-heading text-3xl font-extrabold text-forest/15">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <p className={`mt-5 text-[11px] font-bold uppercase tracking-[0.14em] ${accent.ink}`}>{tag}</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-forest">{title}</h2>
            <p className="mt-1.5 flex-1 text-sm text-ink-soft">{description}</p>
            <p className={`mt-4 text-sm font-semibold ${accent.ink}`}>
              {linkLabel} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </p>
          </Link>
        ))}
      </div>

      {/* The three cards above are what a teacher reaches for to get better;
          these two are what they make for a class. Smaller on purpose — all
          five tools have a door on Home now without the page losing which
          three it is pointing at first. */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Plan</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {PLAN_CARDS.map(({ to, icon: Icon, title, description }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-4 rounded-2xl border border-hairline bg-cream-card p-4 transition-all hover:-translate-y-0.5 hover:border-terracotta/40 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-base font-bold text-forest">{title}</p>
                <p className="text-xs text-ink-soft">{description}</p>
              </div>
              <span className="ml-auto shrink-0 text-sm font-semibold text-terracotta-600 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-hairline bg-cream-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Your coaching path</p>
              <h2 className="mt-1 font-heading text-lg font-bold text-forest">One clear step at a time</h2>
            </div>
          </div>
          <div className="mt-6 flex items-start justify-between">
            {COACHING_PATH.map((step, i) => (
              <div key={step.label} className="flex flex-1 items-start">
                <div className="flex flex-col items-center text-center">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl font-heading text-base font-bold ${
                      ACCENT_CYCLE[i % ACCENT_CYCLE.length].band
                    } ${ACCENT_CYCLE[i % ACCENT_CYCLE.length] === ACCENTS.gold ? 'text-forest' : 'text-cream'}`}
                  >
                    {i + 1}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-forest">{step.label}</p>
                  <p className="mt-0.5 hidden max-w-[7rem] text-xs text-ink-soft sm:block">{step.description}</p>
                </div>
                {i < COACHING_PATH.length - 1 && <div className="mt-5 h-0.5 flex-1 rounded-full bg-hairline" />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-mint-tint/50 p-6">
          {/* Not "This week": nothing here is filtered to one. The donut is the
              most recent analyzed lesson whenever it was recorded, so the
              label says which lesson rather than claiming a window the data
              never had. */}
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">
            {latest?.studentTalkPct == null ? 'Your lessons' : `Latest lesson · ${relativeDay(latest.sessionDate)}`}
          </p>
          <h2 className="mt-1 font-heading text-lg font-bold text-forest">Your classroom pulse</h2>
          {latest?.studentTalkPct == null ? (
            <p className="mt-6 text-sm text-ink-soft">
              Record and analyze a lesson to see your student-voice trend here.
            </p>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-4">
                <Donut pct={latest.studentTalkPct} />
                <div>
                  <p className="text-sm font-semibold text-forest">Student voice</p>
                  <p className="text-xs text-ink-soft">
                    {pulseChange == null
                      ? 'From your most recent lesson'
                      : `${pulseChange >= 0 ? 'Up' : 'Down'} ${Math.abs(Math.round(pulseChange))}% from your first lesson`}
                  </p>
                </div>
              </div>
              {sparkline.length > 1 && (
                <div className="mt-5 flex items-end gap-1.5" aria-hidden="true">
                  {sparkline.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex-1 rounded-t ${i === sparkline.length - 1 ? 'bg-forest' : 'bg-gold'}`}
                      style={{ height: `${Math.max(6, ((s.studentTalkPct ?? 0) / maxSpark) * 40)}px` }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-hairline bg-cream-card p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Your day</p>
        <h2 className="mt-1 font-heading text-lg font-bold text-forest">How are you today?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MOODS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleMoodSelect(value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mood === value
                  ? 'border-forest bg-forest text-cream'
                  : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mood && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <p className="text-sm text-ink">{MOOD_RESPONSES[mood].text}</p>
            {MOOD_RESPONSES[mood].talk && (
              <Link
                to="/talk-to-me"
                className="flex items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
              >
                <MicIcon className="h-3.5 w-3.5" />
                Talk it through
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Daily tip</p>
        <p className="mt-2 text-base text-ink">{tip}</p>
      </div>

      <div className="grid gap-3">
        <Link
          to="/audio-coaching#my-growth"
          className="group flex items-center gap-4 rounded-2xl bg-mint-tint/50 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
            <MicIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-base font-bold text-forest">Your growth</p>
            <p className="text-xs text-ink-soft">Pick one thing to sharpen and track it across your lessons.</p>
          </div>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Pick up where you left off</p>
        </div>
        <h2 className="mt-1 font-heading text-lg font-bold text-forest">Recent work</h2>
        {loading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : activity.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nothing yet — your conversations, rehearsals, plans and reviews will show up here.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {activity.map((item) => {
              const RowIcon = activityIcon(item)
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={activityLink(item)}
                  className="flex items-start gap-3 rounded-2xl border border-hairline bg-cream-card p-4 transition-colors hover:border-terracotta/40"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      item.type === 'scenario' ? 'bg-gold text-forest' : 'bg-forest text-gold'
                    }`}
                  >
                    <RowIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    {/* Which tool and when. Four unlabelled paragraphs from the
                        same busy week were indistinguishable from each other. */}
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                      {activityTool(item)} · {relativeDay(item.createdAt)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink">{activityText(item)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
