import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChatBubbleIcon, ChecklistIcon, ScenarioIcon, StarIcon } from '../components/icons'
import { getAttempts, getDebriefs, getProfile, type Debrief, type ScenarioAttempt } from '../lib/api'
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

export default function Home() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [mood, setMood] = useState<Mood | null>(null)
  const [tip, setTip] = useState(() => pickDailyTip(null))

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setNeedsOnboarding(!profile.name && !profile.gradeLevels && !profile.subjects)
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Welcome back</h1>
        <p className="mt-1 text-ink-soft">
          Here's a quick way back into your practice and your questions.
        </p>
      </div>

      {needsOnboarding && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <p className="text-sm font-semibold text-brand-600">Get more relevant coaching</p>
          <p className="mt-1 text-sm text-ink">
            Add your grade level and subject to your profile so scenarios and advice fit your classroom.
          </p>
          <Link
            to="/profile"
            className="mt-3 inline-block text-sm font-semibold text-brand-600 underline underline-offset-2"
          >
            Complete your profile
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/coach-chat"
          className="group rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
        >
          <ScenarioIcon className="h-8 w-8 text-brand-500" />
          <h2 className="mt-4 text-lg font-semibold text-ink">Practice a Scenario</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Practice a realistic classroom scenario and get coaching on your response.
          </p>
        </Link>

        <Link
          to="/coach-chat?tab=ask"
          className="group rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
        >
          <ChatBubbleIcon className="h-8 w-8 text-brand-500" />
          <h2 className="mt-4 text-lg font-semibold text-ink">Ask an Expert</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Ask a classroom management question and get a clear, actionable answer.
          </p>
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">How are you feeling today?</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {MOODS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleMoodSelect(value)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mood === value
                  ? 'border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-warm-100/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Daily tip</p>
        <p className="mt-2 text-sm text-ink">{tip}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/cheat-sheet"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm"
        >
          <StarIcon className="h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <p className="text-sm font-semibold text-ink">Your Cheat Sheet</p>
            <p className="text-xs text-ink-soft">Go-to phrases, auto-built from your saved content.</p>
          </div>
        </Link>
        <Link
          to="/first-30-days"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm"
        >
          <ChecklistIcon className="h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <p className="text-sm font-semibold text-ink">First 30 Days</p>
            <p className="text-xs text-ink-soft">New teacher? Start your guided track.</p>
          </div>
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Recent activity
        </h2>
        {loading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : activity.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Nothing yet — completed scenarios and saved answers will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {activity.map((item) => (
              <Link
                key={item.id}
                to={item.type === 'scenario' ? '/coach-chat' : '/coach-chat?tab=ask'}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 transition-shadow hover:shadow-sm"
              >
                {item.type === 'scenario' ? (
                  <ScenarioIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                ) : (
                  <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                )}
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
