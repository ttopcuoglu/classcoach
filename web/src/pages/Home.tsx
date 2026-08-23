import { Link } from 'react-router-dom'
import { ChatBubbleIcon, ScenarioIcon } from '../components/icons'

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Welcome back</h1>
        <p className="mt-1 text-ink-soft">
          Here's a quick way back into your practice and your questions.
        </p>
      </div>

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
        <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Nothing yet — completed scenarios and saved answers will show up here.
        </div>
      </div>
    </div>
  )
}
