import { useState } from 'react'
import { Link } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import ShareButton from '../components/ShareButton'
import { StarIcon } from '../components/icons'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { REVIEW_MODES, type ReviewMode } from '../lib/communicationOptions'
import { takeReviewPrefill } from '../lib/communicationsPrefill'
import {
  sendConversationPrepChat,
  setConversationPrepSaved,
  shareConversationPrep,
  submitConversationPrep,
  type ConversationPrep,
} from '../lib/api'

const QUICK_ACTIONS: { label: string; instruction: string }[] = [
  { label: 'Make warmer', instruction: 'Make the revised response warmer in tone.' },
  { label: 'Make firmer', instruction: 'Make the revised response firmer and more direct, without sounding rude.' },
  { label: 'Shorten', instruction: 'Shorten the revised response while keeping the key points.' },
]

export default function ReviewCommunication() {
  const [prefill] = useState(() => takeReviewPrefill())
  const [situationText, setSituationText] = useState(prefill?.situationText ?? '')
  const [responseText, setResponseText] = useState(prefill?.responseText ?? '')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('both')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prep, setPrep] = useState<ConversationPrep | null>(null)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const canSubmit = situationText.trim().length > 0 && responseText.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPrep({
        situationText: situationText.trim(),
        responseText: responseText.trim(),
        source: 'review',
        reviewMode,
      })
      setPrep(result)
      setChatDraft('')
      setChatError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not review this. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function sendChatMessage(text: string) {
    if (!prep || chatSending) return
    setChatSending(true)
    setChatError(null)
    try {
      const updated = await sendConversationPrepChat(prep.id, text)
      setPrep(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
    } finally {
      setChatSending(false)
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!trimmed) return
    setChatDraft('')
    await sendChatMessage(trimmed)
  }

  async function handleToggleSaved() {
    if (!prep) return
    const nextSaved = !prep.saved
    setPrep((p) => (p ? { ...p, saved: nextSaved } : p))
    try {
      await setConversationPrepSaved(prep.id, nextSaved)
    } catch {
      setPrep((p) => (p ? { ...p, saved: !nextSaved } : p))
    }
  }

  function handleStartOver() {
    setPrep(null)
    setSituationText('')
    setResponseText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/communications" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Messages
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6">
        {!prep ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Message or communication you received</span>
              <textarea
                value={situationText}
                onChange={(e) => setSituationText(e.target.value)}
                disabled={submitting}
                rows={4}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Your planned response</span>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                disabled={submitting}
                rows={4}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Review option</span>
              <div className="flex flex-wrap gap-2">
                {REVIEW_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setReviewMode(m.value)}
                    disabled={submitting}
                    title={m.description}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      reviewMode === m.value
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <SafetyAdvisoryBanner text={`${situationText}\n${responseText}`} />
            <PrivacyReminder />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Reviewing...' : 'Review My Communication'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Message received</p>
              <p className="mt-1 text-sm text-ink">{prep.situationText}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Your planned response</p>
              <p className="mt-1 text-sm text-ink">{prep.responseText}</p>
            </div>

            {prep.feedback && (
              <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{prep.feedback}</p>
              </div>
            )}

            {prep.modelResponse && (
              <div className="rounded-xl border border-border bg-brand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Revised response</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{prep.modelResponse}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => sendChatMessage(action.instruction)}
                  disabled={chatSending}
                  className="rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>

            <CoachingChat
              messages={prep.conversation.slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              placeholder="Ask a follow-up, e.g. 'why does this sound defensive?'..."
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleToggleSaved}
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    prep.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                  }`}
                >
                  <StarIcon className="h-4 w-4" filled={prep.saved} />
                  {prep.saved ? 'Saved' : 'Save for later'}
                </button>
                <ShareButton type="conversation-prep" onShare={() => shareConversationPrep(prep.id)} />
              </div>
              <button
                type="button"
                onClick={handleStartOver}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Start Over
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>
    </div>
  )
}
