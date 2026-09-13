import { Link, useSearchParams } from 'react-router-dom'
import Ask from './Ask'
import TryItOut from './TryItOut'

export default function CoachChat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'practice' ? 'practice' : 'ask'

  function setTab(next: 'practice' | 'ask') {
    setSearchParams(next === 'ask' ? {} : { tab: next })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Coaching</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Ask & Practice<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">Ask a question or describe what happened, or practice a scenario.</p>
        <Link
          to="/guide/ask-practice"
          className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('ask')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'ask' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => setTab('practice')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'practice' ? 'bg-forest text-cream' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Practice
        </button>
      </div>

      {tab === 'practice' ? <TryItOut /> : <Ask />}
    </div>
  )
}
