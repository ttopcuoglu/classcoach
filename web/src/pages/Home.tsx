import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChatBubbleIcon, ScenarioIcon } from '../components/icons'
import { getAttempts, getProfile, getQAHistory, type QAExchange, type ScenarioAttempt } from '../lib/api'

type Activity =
  | { type: 'scenario'; id: string; createdAt: string; attempt: ScenarioAttempt }
  | { type: 'qa'; id: string; createdAt: string; exchange: QAExchange }

export default function Home() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setNeedsOnboarding(!profile.name && !profile.gradeLevels && !profile.subjects)
      })
      .catch(() => {})

    Promise.all([getAttempts(), getQAHistory()])
      .then(([attempts, exchanges]) => {
        const combined: Activity[] = [
          ...attempts.map((a): Activity => ({ type: 'scenario', id: a.id, createdAt: a.createdAt, attempt: a })),
          ...exchanges.map((e): Activity => ({ type: 'qa', id: e.id, createdAt: e.createdAt, exchange: e })),
        ]
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setActivity(combined.slice(0, 4))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
          to="/try-it-out"
          className="group rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
        >
          <ScenarioIcon className="h-8 w-8 text-brand-500" />
          <h2 className="mt-4 text-lg font-semibold text-ink">Try It Out</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Practice a realistic classroom scenario and get coaching on your response.
          </p>
        </Link>

        <Link
          to="/ask-an-expert"
          className="group rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-md"
        >
          <ChatBubbleIcon className="h-8 w-8 text-brand-500" />
          <h2 className="mt-4 text-lg font-semibold text-ink">Ask an Expert</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Ask a classroom management question and get a clear, actionable answer.
          </p>
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-warm-100/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Daily tip</p>
        <p className="mt-2 text-sm text-ink">
          Consistency beats intensity. A calm, predictable response to small disruptions does more
          for classroom culture than an occasional dramatic one.
        </p>
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
                to={item.type === 'scenario' ? '/try-it-out' : '/ask-an-expert'}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 transition-shadow hover:shadow-sm"
              >
                {item.type === 'scenario' ? (
                  <ScenarioIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                ) : (
                  <ChatBubbleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                )}
                <p className="line-clamp-2 text-sm text-ink">
                  {item.type === 'scenario' ? item.attempt.scenario.text : item.exchange.question}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
