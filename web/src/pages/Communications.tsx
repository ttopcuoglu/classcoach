import { useSearchParams } from 'react-router-dom'
import DifficultConversations from './DifficultConversations'
import ParentMessages from './ParentMessages'

export default function Communications() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'difficult' ? 'difficult' : 'parent'

  function setTab(next: 'parent' | 'difficult') {
    setSearchParams(next === 'parent' ? {} : { tab: next })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Communications</h1>
        <p className="text-ink-soft">Draft a message home, or prepare for a hard conversation before you have it.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('parent')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'parent' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Parent Messages
        </button>
        <button
          type="button"
          onClick={() => setTab('difficult')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'difficult' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Difficult Conversations
        </button>
      </div>

      {tab === 'parent' ? <ParentMessages /> : <DifficultConversations />}
    </div>
  )
}
