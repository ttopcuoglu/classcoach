import { useEffect, useRef, useState } from 'react'
import { askExpert, getQAHistory, setQAStarred, type QAExchange } from '../lib/api'
import { StarIcon } from '../components/icons'

const STARTER_QUESTIONS = [
  'How do I handle a student who constantly interrupts?',
  "What's a good way to set expectations on day one?",
  'A student refuses to put their phone away — what now?',
  'How do I de-escalate two students arguing in class?',
]

export default function AskExpert() {
  const [tab, setTab] = useState<'chat' | 'playbook'>('chat')
  const [chatHistory, setChatHistory] = useState<QAExchange[]>([])
  const [playbook, setPlaybook] = useState<QAExchange[]>([])
  const [playbookLoading, setPlaybookLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getQAHistory(true)
      .then(setPlaybook)
      .catch(() => {})
      .finally(() => setPlaybookLoading(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [chatHistory, asking])

  async function submitQuestion(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return
    setAsking(true)
    setError(null)
    setQuestion('')
    try {
      const exchange = await askExpert(trimmed)
      setChatHistory((prev) => [...prev, exchange])
    } catch {
      setError('Something went wrong reaching your coach. Please try again.')
      setQuestion(trimmed)
    } finally {
      setAsking(false)
    }
  }

  async function toggleStar(exchange: QAExchange) {
    const nextStarred = !exchange.starred
    setChatHistory((prev) => prev.map((e) => (e.id === exchange.id ? { ...e, starred: nextStarred } : e)))
    setPlaybook((prev) =>
      nextStarred
        ? prev.some((e) => e.id === exchange.id)
          ? prev
          : [{ ...exchange, starred: true }, ...prev]
        : prev.filter((e) => e.id !== exchange.id),
    )
    try {
      await setQAStarred(exchange.id, nextStarred)
    } catch {
      setChatHistory((prev) => prev.map((e) => (e.id === exchange.id ? { ...e, starred: !nextStarred } : e)))
      setPlaybook((prev) =>
        nextStarred
          ? prev.filter((e) => e.id !== exchange.id)
          : prev.some((e) => e.id === exchange.id)
            ? prev
            : [{ ...exchange, starred: true }, ...prev],
      )
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'chat' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setTab('playbook')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'playbook' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Playbook{playbook.length > 0 ? ` (${playbook.length})` : ''}
        </button>
      </div>

      {tab === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-surface">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {chatHistory.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-sm text-ink-soft">Not sure where to start? Try one of these:</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                  {STARTER_QUESTIONS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => submitQuestion(starter)}
                      className="rounded-full border border-border bg-canvas px-4 py-2 text-sm text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {chatHistory.map((exchange) => (
                  <div key={exchange.id} className="flex flex-col gap-2">
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-sm text-white">
                      {exchange.question}
                    </div>
                    <div className="group relative max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 pr-10 text-sm whitespace-pre-wrap text-ink">
                      {exchange.answer}
                      <button
                        type="button"
                        onClick={() => toggleStar(exchange)}
                        aria-label={exchange.starred ? 'Remove from playbook' : 'Save to playbook'}
                        className={`absolute right-2.5 top-2.5 rounded-full p-1 transition-colors ${
                          exchange.starred ? 'text-warm-500' : 'text-ink-soft/40 hover:text-warm-500'
                        }`}
                      >
                        <StarIcon className="h-4 w-4" filled={exchange.starred} />
                      </button>
                    </div>
                  </div>
                ))}
                {asking && (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-canvas px-4 py-2.5 text-sm text-ink-soft">
                    Thinking...
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="border-t border-border px-4 py-2 text-sm text-warm-500">{error}</p>
          )}

          <form
            className="border-t border-border p-4"
            onSubmit={(e) => {
              e.preventDefault()
              submitQuestion(question)
            }}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a classroom management question..."
                disabled={asking}
                className="flex-1 rounded-lg border border-border bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
          {playbookLoading ? (
            <p className="p-8 text-center text-sm text-ink-soft">Loading...</p>
          ) : playbook.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">
              Star an answer from Chat to save it here for later.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {playbook.map((exchange) => (
                <div key={exchange.id} className="group relative rounded-xl border border-border bg-canvas p-4 pr-10">
                  <p className="text-sm font-semibold text-ink">{exchange.question}</p>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{exchange.answer}</p>
                  <button
                    type="button"
                    onClick={() => toggleStar(exchange)}
                    aria-label="Remove from playbook"
                    className="absolute right-2.5 top-2.5 rounded-full p-1 text-warm-500 transition-colors hover:text-warm-600"
                  >
                    <StarIcon className="h-4 w-4" filled />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
