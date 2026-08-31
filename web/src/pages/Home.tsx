import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrainIcon, ChatBubbleIcon, ChecklistIcon, HeadsetIcon, MicIcon, PlayIcon, StarIcon } from '../components/icons'
import {
  getAttempts,
  getAudioSessions,
  getDebriefs,
  getProfile,
  type AudioSession,
  type Debrief,
  type ScenarioAttempt,
} from '../lib/api'
import { pickDailyTip, type Mood } from '../lib/dailyTips'

type Activity =
  | { type: 'scenario'; id: string; createdAt: string; attempt: ScenarioAttempt }
  | { type: 'ask'; id: string; createdAt: string; debrief: Debrief }

const MOODS: { label: string; value: Mood }[] = [
  { label: 'Good', value: 'good' },
  { label: 'Okay', value: 'okay' },
  { label: 'Stressed', value: 'stressed' },
  { label: 'Overwhelmed', value: 'overwhelmed' },
]

const MOOD_SUGGESTED_CATEGORY: Partial<Record<Mood, string>> = {
  stressed: 'disruption',
  overwhelmed: 'transitions',
}

const ACTION_CARDS = [
  {
    to: '/talk-to-me',
    icon: HeadsetIcon,
    tint: 'bg-mint-tint text-forest',
    tag: 'Live coach',
    title: 'Talk It Through',
    description: 'Think out loud. Your coach listens, asks, and helps you find a next step.',
    linkLabel: 'Start voice coaching',
    linkClass: 'text-forest',
  },
  {
    to: '/audio-coaching',
    icon: MicIcon,
    tint: 'bg-peach-tint text-terracotta',
    tag: 'Lesson reflection',
    title: 'Lesson Debrief',
    description: 'Record a class and turn classroom talk into focused, judgment-free feedback.',
    linkLabel: 'Record a lesson',
    linkClass: 'text-terracotta',
  },
  {
    to: '/coach-chat',
    icon: ChatBubbleIcon,
    tint: 'bg-gold-tint text-terracotta-600',
    tag: 'Safe practice',
    title: 'Ask & Practice',
    description: 'Ask a straight question, or rehearse a difficult classroom moment before it happens.',
    linkLabel: 'Ask or rehearse',
    linkClass: 'text-terracotta-600',
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
  const [activity, setActivity] = useState<Activity[]>([])
  const [sessions, setSessions] = useState<AudioSession[]>([])
  const [loading, setLoading] = useState(true)
  const [mood, setMood] = useState<Mood | null>(null)
  const [tip, setTip] = useState(() => pickDailyTip(null))

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setName(profile.name)
        setNeedsOnboarding(!profile.name && !profile.gradeLevels && !profile.subjects)
      })
      .catch(() => {})

    getAudioSessions()
      .then((all) => {
        const withVoice = all
          .filter((s) => (s.status === 'analyzed' || s.status === 'locked') && s.studentTalkPct != null)
          .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
        setSessions(withVoice)
      })
      .catch(() => {})

    Promise.all([getAttempts(), getDebriefs()])
      .then(([attempts, debriefs]) => {
        const combined: Activity[] = [
          ...attempts.map((a): Activity => ({ type: 'scenario', id: a.id, createdAt: a.createdAt, attempt: a })),
          ...debriefs.map((d): Activity => ({ type: 'ask', id: d.id, createdAt: d.createdAt, debrief: d })),
        ]
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setActivity(combined.slice(0, 4))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
  const firstName = name?.split(' ')[0]

  const latest = sessions[sessions.length - 1]
  const first = sessions[0]
  const pulseChange =
    latest && first && sessions.length > 1 && latest.studentTalkPct != null && first.studentTalkPct != null
      ? latest.studentTalkPct - first.studentTalkPct
      : null
  const sparkline = sessions.slice(-5)
  const maxSpark = Math.max(1, ...sparkline.map((s) => s.studentTalkPct ?? 0))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">{dateLabel}</p>
          <h1 className="mt-1 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
            {greeting}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          <p className="mt-1 text-ink-soft">What would help you feel more prepared today?</p>
        </div>
      </div>

      {needsOnboarding && (
        <div className="rounded-2xl border border-hairline bg-mint-tint/60 p-5">
          <p className="text-sm font-semibold text-forest">Get more relevant coaching</p>
          <p className="mt-1 text-sm text-ink">
            Add your grade level and subject to your profile so scenarios and advice fit your classroom.
          </p>
          <Link to="/profile" className="mt-3 inline-block text-sm font-semibold text-forest underline underline-offset-2">
            Complete your profile
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {ACTION_CARDS.map(({ to, icon: Icon, tint, tag, title, description, linkLabel, linkClass }) => (
          <Link
            key={to}
            to={to}
            className="group relative overflow-hidden rounded-2xl border border-hairline bg-cream-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full ${tint} opacity-60`} aria-hidden="true" />
            <span className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
              <Icon className="h-5 w-5" />
            </span>
            <p className="relative mt-4 text-xs font-semibold uppercase tracking-wide text-terracotta">{tag}</p>
            <h2 className="relative mt-1.5 font-heading text-lg font-bold text-forest">{title}</h2>
            <p className="relative mt-1.5 text-sm text-ink-soft">{description}</p>
            <p className={`relative mt-4 text-sm font-semibold ${linkClass}`}>{linkLabel} ↗</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Your coaching path</p>
              <h2 className="mt-1 font-heading text-lg font-bold text-forest">One clear step at a time</h2>
            </div>
          </div>
          <div className="mt-6 flex items-start justify-between">
            {COACHING_PATH.map((step, i) => (
              <div key={step.label} className="flex flex-1 items-start">
                <div className="flex flex-col items-center text-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-hairline text-sm font-bold text-ink-soft">
                    {i + 1}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-forest">{step.label}</p>
                  <p className="mt-0.5 max-w-[7rem] text-xs text-ink-soft">{step.description}</p>
                </div>
                {i < COACHING_PATH.length - 1 && <div className="mt-4.5 h-px flex-1 bg-hairline" />}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-cream p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-cream">
                <PlayIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Next</p>
                <p className="text-sm font-semibold text-forest">Practice a scenario</p>
                <p className="text-xs text-ink-soft">Run a realistic classroom moment and get coaching on your response.</p>
              </div>
            </div>
            <Link
              to="/coach-chat"
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream transition-opacity hover:opacity-90"
            >
              Practice now
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline bg-cream-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">This week</p>
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
                      className={`flex-1 rounded-t ${i === sparkline.length - 1 ? 'bg-forest' : 'bg-mint-tint'}`}
                      style={{ height: `${Math.max(6, ((s.studentTalkPct ?? 0) / maxSpark) * 40)}px` }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-cream-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">How are you feeling today?</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {MOODS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleMoodSelect(value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mood === value
                  ? 'border-terracotta bg-peach-tint text-terracotta-600'
                  : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-gold-tint/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">Daily tip</p>
        <p className="mt-2 text-sm text-ink">{tip}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/cheat-sheet"
          className="flex items-center gap-3 rounded-xl border border-hairline bg-cream-card p-4 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-terracotta-600">
            <StarIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-forest">Your Cheat Sheet</p>
            <p className="text-xs text-ink-soft">Go-to phrases, auto-built from your saved content.</p>
          </div>
        </Link>
        <Link
          to="/first-30-days"
          className="flex items-center gap-3 rounded-xl border border-hairline bg-cream-card p-4 transition-shadow hover:shadow-sm"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lavender-tint text-[#6B5FA0]">
            <ChecklistIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-forest">First 30 Days</p>
            <p className="text-xs text-ink-soft">New teacher? Start your guided track.</p>
          </div>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Pick up where you left off</p>
        </div>
        <h2 className="mt-1 font-heading text-lg font-bold text-forest">Recent work</h2>
        {loading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : activity.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-soft">
            Nothing yet — completed scenarios and saved answers will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {activity.map((item) => (
              <Link
                key={item.id}
                to={item.type === 'scenario' ? '/coach-chat' : '/coach-chat?tab=ask'}
                className="flex items-start gap-3 rounded-xl border border-hairline bg-cream-card p-3.5 transition-shadow hover:shadow-sm"
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    item.type === 'scenario' ? 'bg-gold-tint text-terracotta-600' : 'bg-mint-tint text-forest'
                  }`}
                >
                  {item.type === 'scenario' ? <BrainIcon className="h-3.5 w-3.5" /> : <ChatBubbleIcon className="h-3.5 w-3.5" />}
                </span>
                <p className="line-clamp-2 text-sm text-ink">
                  {item.type === 'scenario' ? item.attempt.scenario.text : item.debrief.incidentText}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
