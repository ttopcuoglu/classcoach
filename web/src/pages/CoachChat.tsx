import { useSearchParams } from 'react-router-dom'
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
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Ask & Practice</h1>
        <p className="text-ink-soft">Ask a question or describe what happened, or practice a scenario.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('ask')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'ask' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => setTab('practice')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'practice' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Practice
        </button>
      </div>

      {tab === 'practice' ? <TryItOut /> : <Ask />}
    </div>
  )
}
