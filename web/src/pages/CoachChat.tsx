import { useSearchParams } from 'react-router-dom'
import AskExpert from './AskExpert'
import TryItOut from './TryItOut'

export default function CoachChat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'ask' ? 'ask' : 'practice'

  function setTab(next: 'practice' | 'ask') {
    setSearchParams(next === 'practice' ? {} : { tab: next })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Coach Chat</h1>
        <p className="text-ink-soft">Practice a scenario, or ask a straight question and get a clear answer.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('practice')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'practice' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Practice
        </button>
        <button
          type="button"
          onClick={() => setTab('ask')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'ask' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Ask
        </button>
      </div>

      {tab === 'practice' ? <TryItOut /> : <AskExpert />}
    </div>
  )
}
