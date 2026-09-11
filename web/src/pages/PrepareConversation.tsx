import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import { StarIcon } from '../components/icons'
import { Spinner } from '../components/Spinner'
import { UpgradeMessage } from '../components/UpgradeMessage'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { ProgressRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import {
  MEETING_FORMATS,
  MEETING_TYPES,
  meetingFormatLabel,
  meetingTypeLabel,
  meetingTypeToRecipientType,
  type MeetingFormat,
  type MeetingType,
} from '../lib/communicationOptions'
import { setPracticePrefill, setWritePrefill, takePreparePrefill } from '../lib/communicationsPrefill'
import {
  extractAssignmentText,
  sendConversationPlanChat,
  setConversationPlanSaved,
  submitConversationPlan,
  type ConversationPlan,
} from '../lib/api'

const PLAN_SECTIONS_BEFORE_MODEL: { key: keyof NonNullable<ConversationPlan['planContent']>; label: string }[] = [
  { key: 'agenda', label: 'Suggested meeting agenda' },
  { key: 'opening', label: 'Suggested opening' },
  { key: 'mainConcern', label: 'Key talking points' },
  { key: 'facts', label: 'Important facts to present' },
  { key: 'questions', label: 'Questions to ask' },
  { key: 'reactions', label: 'Possible reactions' },
  { key: 'recommendedResponses', label: 'How to respond' },
  { key: 'phrasesToAvoid', label: 'Language to avoid' },
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
  const [meetingType, setMeetingType] = useState<MeetingType | undefined>(
    (prefill?.meetingType as MeetingType | undefined) ?? undefined,
  )
  const [meetingFormat, setMeetingFormat] = useState<MeetingFormat | undefined>(
    (prefill?.meetingFormat as MeetingFormat | undefined) ?? undefined,
  )
  const [situationText, setSituationText] = useState(prefill?.situationText ?? '')
  const [attendees, setAttendees] = useState('')
  const [desiredOutcome, setDesiredOutcome] = useState(prefill?.desiredOutcome ?? '')
  const [concerns, setConcerns] = useState(prefill?.concerns ?? '')
  const [background, setBackground] = useState(prefill?.background ?? '')

  const [submitting, setSubmitting] = useState(false)
  const workProgress = useSimulatedProgress(submitting, 16000)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<ConversationPlan | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const canSubmit = situationText.trim().length > 0 && !submitting

  // What the plan was actually built from — shown back on the finished plan so
  // it states its own assumptions rather than leaving you to remember them.
  const typePill = plan ? meetingTypeLabel(plan.meetingType) : null
  const formatPill = plan ? meetingFormatLabel(plan.meetingFormat) : null

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const { text } = await extractAssignmentText(file)
      setBackground((prev) => (prev ? `${prev}\n\n${text}` : text))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not read that file. Please try pasting the text instead.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPlan({
        situationText: situationText.trim(),
        meetingType,
        meetingFormat,
        attendees: attendees.trim() || undefined,
        desiredOutcome: desiredOutcome.trim() || undefined,
        concerns: concerns.trim() || undefined,
        background: background.trim() || undefined,
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
      recipientType: meetingTypeToRecipientType(plan.meetingType as MeetingType | undefined),
    })
    navigate('/communications?tool=write')
  }

  function handlePracticeThisMeeting() {
    if (!plan) return
    setPracticePrefill({
      personType: meetingTypeToRecipientType(plan.meetingType as MeetingType | undefined),
      situationText: plan.situationText,
    })
    navigate('/communications?tool=practice')
  }

  function handleNewPlan() {
    setPlan(null)
    setSituationText('')
    setAttendees('')
    setDesiredOutcome('')
    setConcerns('')
    setBackground('')
    setError(null)
    setUploadError(null)
    setChatDraft('')
    setChatError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/communications" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Communication Coach
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6 print:border-0 print:p-0">
        {!plan ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What kind of meeting are you preparing for?</span>
              <div className="flex flex-wrap gap-2">
                {MEETING_TYPES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMeetingType(m.value)}
                    disabled={submitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      meetingType === m.value
                        ? 'border-brand-500 bg-brand-50 text-brand-600'
                        : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">
                How will it happen? <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {MEETING_FORMATS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    // Unlike the meeting-type chips above, tapping the selected
                    // one clears it — this field is optional, so a mistaken tap
                    // shouldn't permanently commit the plan to phone guidance.
                    onClick={() => setMeetingFormat((current) => (current === f.value ? undefined : f.value))}
                    disabled={submitting}
                    aria-pressed={meetingFormat === f.value}
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

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What is the meeting about?</span>
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
                Who will attend? <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <input
                type="text"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                disabled={submitting}
                placeholder="e.g. Mom, Dad, the school counselor"
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">
                What outcome do you hope for? <span className="font-normal text-ink-soft">(optional)</span>
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
                Is there anything sensitive or difficult? <span className="font-normal text-ink-soft">(optional)</span>
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
                Paste or upload an agenda, email, report, or notes <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                disabled={submitting}
                rows={2}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
              <div className="flex items-center gap-3">
                <label className="cursor-pointer text-sm font-medium text-ink-soft hover:text-brand-600">
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Reading file...
                    </span>
                  ) : (
                    'Upload a file'
                  )}
                  <input
                    type="file"
                    accept=".docx,.pdf,.txt,.jpg,.jpeg,.png"
                    className="hidden"
                    disabled={submitting || uploading}
                    onChange={(e) => {
                      const selected = e.target.files?.[0]
                      if (selected) void handleUpload(selected)
                      e.target.value = ''
                    }}
                  />
                </label>
                {uploadError && <p className="text-sm text-warm-500">{uploadError}</p>}
              </div>
            </label>

            <SafetyAdvisoryBanner text={`${situationText}\n${concerns}\n${background}`} />
            <PrivacyReminder />

            {submitting && (
              <div className="flex justify-center py-1 text-brand-600">
                <ProgressRing progress={workProgress} label="Building your meeting plan" hint="Twelve sections — usually about twenty seconds." />
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Preparing...
                </span>
              ) : (
                'Prepare Me'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* The row itself prints so the pills survive onto paper — they're
                what tells you which meeting a printed plan is for. The
                situation text and the Save control stay screen-only. */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                {(typePill || formatPill) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[typePill, formatPill].filter(Boolean).map((pill) => (
                      <span
                        key={pill}
                        className="rounded-full border border-border bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink-soft print:border-ink/20"
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-sm text-ink-soft print:hidden">{plan.situationText}</p>
              </div>
              <button
                type="button"
                onClick={handleToggleSaved}
                className={`flex shrink-0 items-center gap-1.5 text-sm font-medium print:hidden ${
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
                  onClick={handlePracticeThisMeeting}
                  className="text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Practice This Meeting
                </button>
                <button
                  type="button"
                  onClick={handleConvertToMessage}
                  className="text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Create a Follow-Up Message
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
        {error && (
          <p className="mt-4 text-center text-sm text-warm-500 print:hidden">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>
    </div>
  )
}
