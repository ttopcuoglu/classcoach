import { useEffect, useState } from 'react'
import {
  draftParentMessage,
  getParentMessages,
  setParentMessageSaved,
  type ParentMessage,
  type ParentMessageTone,
} from '../lib/api'
import { StarIcon } from '../components/icons'

const TONES: { label: string; value: ParentMessageTone }[] = [
  { label: 'Warm & supportive', value: 'warm' },
  { label: 'Firm & direct', value: 'firm' },
  { label: 'Informational', value: 'informational' },
  { label: 'Requesting a meeting', value: 'requesting_meeting' },
]

export default function ParentMessages() {
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Parent Messages</h1>
        <p className="text-ink-soft">Describe an incident and pick a tone — get a ready-to-send draft.</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap gap-2">
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
