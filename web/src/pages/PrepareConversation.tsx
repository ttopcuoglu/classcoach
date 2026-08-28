import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import { StarIcon } from '../components/icons'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { MEETING_FORMATS, RECIPIENT_TYPES, type MeetingFormat, type RecipientType } from '../lib/communicationOptions'
import { setWritePrefill, takePreparePrefill } from '../lib/communicationsPrefill'
import {
  sendConversationPlanChat,
  setConversationPlanSaved,
  submitConversationPlan,
  type ConversationPlan,
} from '../lib/api'

const PLAN_SECTIONS_BEFORE_MODEL: { key: keyof NonNullable<ConversationPlan['planContent']>; label: string }[] = [
  { key: 'opening', label: 'Suggested opening' },
  { key: 'mainConcern', label: 'Main concern' },
  { key: 'facts', label: 'Important facts to present' },
  { key: 'questions', label: 'Questions to ask' },
  { key: 'reactions', label: 'Possible reactions' },
  { key: 'recommendedResponses', label: 'Recommended responses' },
  { key: 'phrasesToAvoid', label: 'Phrases to avoid' },
  { key: 'boundaries', label: 'Boundaries to maintain' },
  { key: 'closing', label: 'Suggested closing' },
]

const PLAN_SECTIONS_AFTER_MODEL: { key: keyof NonNullable<ConversationPlan['planContent']>; label: string }[] = [
  { key: 'nextSteps', label: 'Next steps' },
  { key: 'adminInvolvement', label: 'When to involve an administrator' },
]

function PlanSectionCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-canvas p-4 print:border-ink/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  )
}

export default function PrepareConversation() {
  const navigate = useNavigate()
  const [prefill] = useState(() => takePreparePrefill())
  const [recipientType, setRecipientType] = useState<RecipientType | undefined>(
    (prefill?.recipientType as RecipientType | undefined) ?? undefined,
  )
  const [situationText, setSituationText] = useState(prefill?.situationText ?? '')
  const [desiredOutcome, setDesiredOutcome] = useState(prefill?.desiredOutcome ?? '')
  const [concerns, setConcerns] = useState(prefill?.concerns ?? '')
  const [background, setBackground] = useState(prefill?.background ?? '')
  const [meetingFormat, setMeetingFormat] = useState<MeetingFormat | undefined>(
    (prefill?.meetingFormat as MeetingFormat | undefined) ?? undefined,
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<ConversationPlan | null>(null)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const canSubmit = situationText.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPlan({
        situationText: situationText.trim(),
        recipientType,
        desiredOutcome: desiredOutcome.trim() || undefined,
        concerns: concerns.trim() || undefined,
        background: background.trim() || undefined,
        meetingFormat,
      })
      setPlan(result)
      setChatDraft('')
      setChatError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build a plan. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!plan || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendConversationPlanChat(plan.id, trimmed)
      setPlan(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  async function handleToggleSaved() {
    if (!plan) return
    const nextSaved = !plan.saved
    setPlan((p) => (p ? { ...p, saved: nextSaved } : p))
    try {
      await setConversationPlanSaved(plan.id, nextSaved)
    } catch {
      setPlan((p) => (p ? { ...p, saved: !nextSaved } : p))
    }
  }

  function handleConvertToMessage() {
    if (!plan) return
    setWritePrefill({
      startingAction: 'new',
      incidentSummary: plan.situationText,
      recipientType: plan.recipientType ?? undefined,
    })
    navigate('/communications?tool=write')
  }

  function handleNewPlan() {
    setPlan(null)
    setSituationText('')
    setDesiredOutcome('')
    setConcerns('')
    setBackground('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/communications" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Communications
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6 print:border-0 print:p-0">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Who are you speaking with?</span>
              <div className="flex flex-wrap gap-2">
                {RECIPIENT_TYPES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRecipientType(r.value)}
                    disabled={submitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      recipientType === r.value
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What happened?</span>
              <textarea
                value={situationText}
                onChange={(e) => setSituationText(e.target.value)}
                disabled={submitting}
                rows={3}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">
                What outcome do you want? <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <textarea
                value={desiredOutcome}
                onChange={(e) => setDesiredOutcome(e.target.value)}
                disabled={submitting}
                rows={2}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">
                What concerns do you have about the conversation? <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <textarea
                value={concerns}
                onChange={(e) => setConcerns(e.target.value)}
                disabled={submitting}
                rows={2}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">
                Relevant background or evidence <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                disabled={submitting}
                rows={2}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Meeting format</span>
              <div className="flex flex-wrap gap-2">
                {MEETING_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setMeetingFormat(f.value)}
                    disabled={submitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      meetingFormat === f.value
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </label>

            <SafetyAdvisoryBanner text={`${situationText}\n${concerns}\n${background}`} />
            <PrivacyReminder />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Building plan...' : 'Build Conversation Plan'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between print:hidden">
              <p className="text-sm text-ink-soft">{plan.situationText}</p>
              <button
                type="button"
                onClick={handleToggleSaved}
                className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${
                  plan.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={plan.saved} />
                {plan.saved ? 'Saved' : 'Save for later'}
              </button>
            </div>

            <div className="grid gap-3">
              {plan.planContent &&
                PLAN_SECTIONS_BEFORE_MODEL.map(({ key, label }) => {
                  const value = plan.planContent?.[key]
                  if (!value) return null
                  return <PlanSectionCard key={key} label={label} value={value} />
                })}

              {plan.planContent?.modelResponse && (
                <div className="rounded-xl border border-border bg-brand-50 p-4 print:border-ink/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">A model response</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{plan.planContent.modelResponse}</p>
                </div>
              )}

              {plan.planContent &&
                PLAN_SECTIONS_AFTER_MODEL.map(({ key, label }) => {
                  const value = plan.planContent?.[key]
                  if (!value) return null
                  return <PlanSectionCard key={key} label={label} value={value} />
                })}
            </div>

            <div className="print:hidden">
              <CoachingChat
                messages={plan.conversation.slice(2)}
                sending={chatSending}
                error={chatError}
                draft={chatDraft}
                onDraftChange={setChatDraft}
                onSend={handleSendChat}
                placeholder="Ask a follow-up, e.g. 'what if they deny it?' or 'give me a stronger opening'..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleConvertToMessage}
                  className="text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Convert to a message
                </button>
                <button type="button" onClick={() => window.print()} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Print
                </button>
              </div>
              <button
                type="button"
                onClick={handleNewPlan}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                New Plan
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500 print:hidden">{error}</p>}
      </div>
    </div>
  )
}
