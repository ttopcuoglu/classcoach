import { useEffect, useState } from 'react'
import CoachingChat from '../components/CoachingChat'
import { ShareIcon, StarIcon } from '../components/icons'
import {
  generateConversationScenario,
  getConversationPreps,
  sendConversationPrepChat,
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
import { GRADE_BANDS, type GradeBand } from '../lib/gradeBands'

export default function DifficultConversations() {
  const [tab, setTab] = useState<'practice' | 'real'>('practice')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('practice')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'practice' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Practice a Scenario
        </button>
        <button
          type="button"
          onClick={() => setTab('real')}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'real' ? 'bg-brand-50 text-brand-600' : 'text-ink-soft hover:text-ink'
          }`}
        >
          Prepare a Real Conversation
        </button>
      </div>

      {tab === 'practice' ? <PracticePanel /> : <RealPanel />}
    </div>
  )
}

function CategoryPills({
  category,
  onChange,
  disabled,
}: {
  category: ConversationPrepCategory
  onChange: (value: ConversationPrepCategory) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CONVERSATION_PREP_CATEGORIES.map(({ label, value }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          disabled={disabled}
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
  )
}

function GradeBandPills({
  gradeBand,
  onChange,
  disabled,
}: {
  gradeBand: GradeBand
  onChange: (value: GradeBand) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Grade band</span>
      <div className="flex flex-wrap gap-1.5">
        {GRADE_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => onChange(band)}
            disabled={disabled}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              gradeBand === band
                ? 'border-brand-500 bg-brand-50 text-brand-600'
                : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
            }`}
          >
            {band}
          </button>
        ))}
      </div>
    </div>
  )
}

function ResultCard({
  prep,
  onToggleSaved,
  onReset,
  resetLabel,
  chatSending,
  chatError,
  chatDraft,
  onChatDraftChange,
  onSendChat,
}: {
  prep: ConversationPrep
  onToggleSaved: (target: ConversationPrep) => void
  onReset: () => void
  resetLabel: string
  chatSending: boolean
  chatError: string | null
  chatDraft: string
  onChatDraftChange: (v: string) => void
  onSendChat: () => void
}) {
  return (
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

      <CoachingChat
        messages={prep.conversation.slice(2)}
        sending={chatSending}
        error={chatError}
        draft={chatDraft}
        onDraftChange={onChatDraftChange}
        onSend={onSendChat}
        placeholder="Ask a follow-up about this feedback..."
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onToggleSaved(prep)}
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
          onClick={onReset}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {resetLabel}
        </button>
      </div>
    </div>
  )
}

function useConversationPrepHistory(source: 'real' | 'practice') {
  const [allPreps, setAllPreps] = useState<ConversationPrep[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    getConversationPreps()
      .then((preps) => setAllPreps(preps.filter((p) => p.source === source)))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [source])

  return { allPreps, setAllPreps, historyLoading }
}

function PracticePanel() {
  const [category, setCategory] = useState<ConversationPrepCategory>('hostile_response')
  const [gradeBand, setGradeBand] = useState<GradeBand>('6-8')
  const [situationText, setSituationText] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [prep, setPrep] = useState<ConversationPrep | null>(null)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const { allPreps, setAllPreps, historyLoading } = useConversationPrepHistory('practice')
  const savedPreps = allPreps.filter((p) => p.saved)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setSituationText(null)
    setResponseText('')
    try {
      const { situationText: generated } = await generateConversationScenario(category, gradeBand)
      setSituationText(generated)
    } catch {
      setError('Could not generate a scenario. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit() {
    if (!situationText || !responseText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPrep(category, situationText, responseText.trim(), 'practice', gradeBand)
      setPrep(result)
      setAllPreps((prev) => [result, ...prev])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setPrep(null)
    setSituationText(null)
    setResponseText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  async function handleToggleSaved(target: ConversationPrep) {
    const nextSaved = !target.saved
    setAllPreps((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: nextSaved } : p)))
    if (prep?.id === target.id) setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: nextSaved } : prevPrep))
    try {
      await setConversationPrepSaved(target.id, nextSaved)
    } catch {
      setAllPreps((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: !nextSaved } : p)))
      if (prep?.id === target.id) {
        setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: !nextSaved } : prevPrep))
      }
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!prep || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendConversationPrepChat(prep.id, trimmed)
      setPrep(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!prep ? (
          <div className="flex flex-col gap-4">
            <CategoryPills category={category} onChange={setCategory} disabled={generating || submitting} />
            <GradeBandPills gradeBand={gradeBand} onChange={setGradeBand} disabled={generating || submitting} />

            {!situationText ? (
              <div className="p-2 text-center">
                <p className="text-sm text-ink-soft">No scenario loaded yet.</p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                >
                  {generating ? 'Generating...' : 'Generate a Scenario'}
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Situation</p>
                  <p className="mt-1.5 text-sm text-ink">{situationText}</p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">How would you respond?</span>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    disabled={submitting}
                    rows={5}
                    placeholder="Draft what you'd say or write..."
                    className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Try a different scenario
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !responseText.trim()}
                    className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                  >
                    {submitting ? 'Getting feedback...' : 'Get Feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <ResultCard
            prep={prep}
            onToggleSaved={handleToggleSaved}
            onReset={handleReset}
            resetLabel="New Scenario"
            chatSending={chatSending}
            chatError={chatError}
            chatDraft={chatDraft}
            onChatDraftChange={setChatDraft}
            onSendChat={handleSendChat}
          />
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <SavedPrepList title="Saved scenarios" loading={historyLoading} preps={savedPreps} />
    </div>
  )
}

function RealPanel() {
  const [category, setCategory] = useState<ConversationPrepCategory>('hostile_response')
  const [gradeBand, setGradeBand] = useState<GradeBand>('6-8')
  const [situationText, setSituationText] = useState('')
  const [responseText, setResponseText] = useState('')
  const [prep, setPrep] = useState<ConversationPrep | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const { allPreps, setAllPreps, historyLoading } = useConversationPrepHistory('real')
  const savedPreps = allPreps.filter((p) => p.saved)
  const copy = CONVERSATION_PREP_COPY[category]

  async function handleSubmit() {
    if (!situationText.trim() || !responseText.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPrep(category, situationText.trim(), responseText.trim(), 'real', gradeBand)
      setPrep(result)
      setAllPreps((prev) => [result, ...prev])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setPrep(null)
    setSituationText('')
    setResponseText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  async function handleToggleSaved(target: ConversationPrep) {
    const nextSaved = !target.saved
    setAllPreps((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: nextSaved } : p)))
    if (prep?.id === target.id) setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: nextSaved } : prevPrep))
    try {
      await setConversationPrepSaved(target.id, nextSaved)
    } catch {
      setAllPreps((prev) => prev.map((p) => (p.id === target.id ? { ...p, saved: !nextSaved } : p)))
      if (prep?.id === target.id) {
        setPrep((prevPrep) => (prevPrep ? { ...prevPrep, saved: !nextSaved } : prevPrep))
      }
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!prep || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendConversationPrepChat(prep.id, trimmed)
      setPrep(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!prep ? (
          <div className="flex flex-col gap-4">
            <CategoryPills category={category} onChange={setCategory} disabled={submitting} />
            <GradeBandPills gradeBand={gradeBand} onChange={setGradeBand} disabled={submitting} />

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
          <ResultCard
            prep={prep}
            onToggleSaved={handleToggleSaved}
            onReset={handleReset}
            resetLabel="New Conversation"
            chatSending={chatSending}
            chatError={chatError}
            chatDraft={chatDraft}
            onChatDraftChange={setChatDraft}
            onSendChat={handleSendChat}
          />
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <SavedPrepList title="Saved conversations" loading={historyLoading} preps={savedPreps} />
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

function SavedPrepList({ title, loading, preps }: { title: string; loading: boolean; preps: ConversationPrep[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      {loading ? (
        <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
      ) : preps.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Conversations you save will show up here.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {preps.map((p) => (
            <SavedPrepCard key={p.id} prep={p} />
          ))}
        </div>
      )}
    </div>
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
