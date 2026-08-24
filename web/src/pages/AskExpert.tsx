import { useEffect, useRef, useState } from 'react'
import {
  askExpert,
  draftParentMessage,
  getParentMessages,
  getQAHistory,
  setParentMessageSaved,
  setQAStarred,
  type ParentMessage,
  type ParentMessageTone,
  type QAExchange,
} from '../lib/api'
import { StarIcon } from '../components/icons'

const STARTER_QUESTIONS = [
  'How do I handle a student who constantly interrupts?',
  "What's a good way to set expectations on day one?",
  'A student refuses to put their phone away — what now?',
  'How do I de-escalate two students arguing in class?',
]

const TONES: { label: string; value: ParentMessageTone }[] = [
  { label: 'Warm & supportive', value: 'warm' },
  { label: 'Firm & direct', value: 'firm' },
  { label: 'Informational', value: 'informational' },
  { label: 'Requesting a meeting', value: 'requesting_meeting' },
]

export default function AskExpert() {
  const [tab, setTab] = useState<'chat' | 'parent' | 'playbook'>('chat')
  const [history, setHistory] = useState<QAExchange[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getQAHistory()
      .then((exchanges) => setHistory([...exchanges].reverse()))
      .catch(() => setError('Could not load your Q&A history.'))
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [history, asking])

  async function submitQuestion(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return
    setAsking(true)
    setError(null)
    setQuestion('')
    try {
      const exchange = await askExpert(trimmed)
      setHistory((prev) => [...prev, exchange])
    } catch {
      setError('Something went wrong reaching your coach. Please try again.')
      setQuestion(trimmed)
    } finally {
      setAsking(false)
    }
  }

  async function toggleStar(exchange: QAExchange) {
    const nextStarred = !exchange.starred
    setHistory((prev) => prev.map((e) => (e.id === exchange.id ? { ...e, starred: nextStarred } : e)))
    try {
      await setQAStarred(exchange.id, nextStarred)
    } catch {
      setHistory((prev) => prev.map((e) => (e.id === exchange.id ? { ...e, starred: !nextStarred } : e)))
    }
  }

  const playbook = history.filter((e) => e.starred)

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Ask an Expert</h1>
        <p className="text-ink-soft">Ask a classroom management question, get a clear answer.</p>
      </div>

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
          onClick={() => setTab('parent')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'parent' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Parent Message
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
            {historyLoading ? (
              <p className="p-4 text-center text-sm text-ink-soft">Loading your history...</p>
            ) : history.length === 0 ? (
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
                {history.map((exchange) => (
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
      ) : tab === 'parent' ? (
        <ParentMessagePanel />
      ) : (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
          {playbook.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-soft">
              Star an answer from Chat to save it here for later.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {playbook.map((exchange) => (
                <div key={exchange.id} className="rounded-xl border border-border bg-canvas p-4">
                  <p className="text-sm font-semibold text-ink">{exchange.question}</p>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-soft">{exchange.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ParentMessagePanel() {
  const [incidentSummary, setIncidentSummary] = useState('')
  const [tone, setTone] = useState<ParentMessageTone>('warm')
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<ParentMessage | null>(null)
  const [copied, setCopied] = useState(false)

  const [history, setHistory] = useState<ParentMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getParentMessages()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  async function handleDraft() {
    if (!incidentSummary.trim() || drafting) return
    setDrafting(true)
    setError(null)
    try {
      const message = await draftParentMessage(incidentSummary.trim(), tone)
      setCurrent(message)
      setHistory((prev) => [message, ...prev])
    } catch {
      setError('Could not draft a message. Please try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function handleCopy() {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.draftText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard access unavailable/denied — the draft text is still visible to select manually
    }
  }

  async function handleToggleSaved(target: ParentMessage) {
    const nextSaved = !target.saved
    setHistory((prev) => prev.map((m) => (m.id === target.id ? { ...m, saved: nextSaved } : m)))
    if (current?.id === target.id) setCurrent((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setParentMessageSaved(target.id, nextSaved)
    } catch {
      setHistory((prev) => prev.map((m) => (m.id === target.id ? { ...m, saved: !nextSaved } : m)))
      if (current?.id === target.id) setCurrent((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-ink-soft">
          Describe the incident and pick a tone — get a ready-to-send draft.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TONES.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTone(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                tone === value
                  ? 'border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={incidentSummary}
          onChange={(e) => setIncidentSummary(e.target.value)}
          disabled={drafting}
          rows={4}
          placeholder="What happened, briefly?"
          className="mt-3 w-full rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleDraft}
          disabled={drafting || !incidentSummary.trim()}
          className="mt-3 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {drafting ? 'Drafting...' : 'Draft Message'}
        </button>
        {error && <p className="mt-3 text-sm text-warm-500">{error}</p>}

        {current && (
          <div className="mt-4 rounded-xl border border-border bg-canvas p-4">
            <p className="text-sm whitespace-pre-wrap text-ink">{current.draftText}</p>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleToggleSaved(current)}
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  current.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={current.saved} />
                {current.saved ? 'Saved' : 'Save for later'}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Past drafts</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : history.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Drafts you create will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {history.map((message) => (
              <PastMessageCard key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PastMessageCard({ message }: { message: ParentMessage }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <p className="text-sm text-ink">{message.incidentSummary}</p>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-ink">
          {message.draftText}
        </p>
      )}
    </div>
  )
}
