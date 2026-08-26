import { useEffect, useState } from 'react'
import { ShareIcon, StarIcon } from '../components/icons'
import {
  getConversationPreps,
  setConversationPrepSaved,
  shareConversationPrep,
  submitConversationPrep,
  type ConversationPrep,
  type ConversationPrepCategory,
} from '../lib/api'
import {
  CONVERSATION_PREP_CATEGORIES,
  CONVERSATION_PREP_COPY,
  conversationPrepCategoryLabel,
} from '../lib/conversationPrepCategories'

export default function DifficultConversations() {
  const [category, setCategory] = useState<ConversationPrepCategory>('hostile_response')
  const [situationText, setSituationText] = useState('')
  const [responseText, setResponseText] = useState('')
  const [prep, setPrep] = useState<ConversationPrep | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allPreps, setAllPreps] = useState<ConversationPrep[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getConversationPreps()
      .then(setAllPreps)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  const savedPreps = allPreps.filter((p) => p.saved)
  const copy = CONVERSATION_PREP_COPY[category]

  async function handleSubmit() {
    if (!situationText.trim() || !responseText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPrep(category, situationText.trim(), responseText.trim())
      setPrep(result)
      setAllPreps((prevList) => [result, ...prevList])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleNew() {
    setPrep(null)
    setSituationText('')
    setResponseText('')
    setError(null)
  }

  async function handleToggleSaved(target: ConversationPrep) {
    const nextSaved = !target.saved
    const apply = (p: ConversationPrep) => (p.id === target.id ? { ...p, saved: nextSaved } : p)
    setAllPreps((prevList) => prevList.map(apply))
    if (prep?.id === target.id) setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: nextSaved } : prevPrep))
    try {
      await setConversationPrepSaved(target.id, nextSaved)
    } catch {
      setAllPreps((prevList) => prevList.map((p) => (p.id === target.id ? { ...p, saved: !nextSaved } : p)))
      if (prep?.id === target.id) {
        setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: !nextSaved } : prevPrep))
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink md:text-3xl">Difficult Conversations</h1>
        <p className="text-ink-soft">
          Prepare for a real, upcoming conversation — describe the situation, draft your response, and get
          coached before you actually have it.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        {!prep ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {CONVERSATION_PREP_CATEGORIES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  disabled={submitting}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    category === value
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{copy.situationLabel}</span>
              <textarea
                value={situationText}
                onChange={(e) => setSituationText(e.target.value)}
                disabled={submitting}
                rows={4}
                placeholder={copy.situationPlaceholder}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{copy.responseLabel}</span>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder={copy.responsePlaceholder}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !situationText.trim() || !responseText.trim()}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Getting feedback...' : 'Get Feedback'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                {conversationPrepCategoryLabel(prep.category)}
              </span>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Situation</p>
              <p className="mt-1 text-sm text-ink">{prep.situationText}</p>
            </div>

            <div className="rounded-xl border border-border bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your planned response</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{prep.responseText}</p>
            </div>

            {prep.feedback && (
              <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{prep.feedback}</p>
              </div>
            )}

            {prep.modelResponse && (
              <div className="rounded-xl border border-border bg-brand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  A model response to compare against
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{prep.modelResponse}</p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleToggleSaved(prep)}
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    prep.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                  }`}
                >
                  <StarIcon className="h-4 w-4" filled={prep.saved} />
                  {prep.saved ? 'Saved' : 'Save for later'}
                </button>
                <ShareButton onShare={() => shareConversationPrep(prep.id)} />
              </div>
              <button
                type="button"
                onClick={handleNew}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                New Conversation
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Saved conversations</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : savedPreps.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Conversations you save will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {savedPreps.map((p) => (
              <SavedPrepCard key={p.id} prep={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShareButton({ onShare }: { onShare: () => Promise<{ shareToken: string }> }) {
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (url) {
      await navigator.clipboard.writeText(url).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    }
    setBusy(true)
    try {
      const { shareToken } = await onShare()
      setUrl(`${window.location.origin}/shared/conversation-prep/${shareToken}`)
    } catch {
      // silently ignore — share is a nice-to-have, not a critical path
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-600 disabled:opacity-60"
    >
      <ShareIcon className="h-4 w-4" />
      {copied ? 'Link copied' : url ? 'Copy link' : busy ? 'Sharing...' : 'Share'}
    </button>
  )
}

function SavedPrepCard({ prep }: { prep: ConversationPrep }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
            {conversationPrepCategoryLabel(prep.category)}
          </span>
          <p className="mt-1.5 text-sm text-ink">{prep.situationText}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your planned response</p>
            <p className="mt-1 text-sm text-ink">{prep.responseText}</p>
          </div>
          {prep.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{prep.feedback}</p>
            </div>
          )}
          {prep.modelResponse && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Model response</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{prep.modelResponse}</p>
            </div>
          )}
          <ShareButton onShare={() => shareConversationPrep(prep.id)} />
        </div>
      )}
    </div>
  )
}
