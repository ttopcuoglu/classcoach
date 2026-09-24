import { useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { Link, useNavigate } from 'react-router-dom'
import AnswerSection from '../components/AnswerSection'
import CoachingChat from '../components/CoachingChat'
import PastList from '../components/PastList'
import { usePastItems } from '../hooks/usePastItems'
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
  getConversationPlans,
  sendConversationPlanChat,
  setConversationPlanSaved,
  submitConversationPlan,
  type ConversationPlan,
  type ConversationPlanContent,
} from '../lib/api'

// The plan's sections in the order a meeting runs, each with what it's for.
const PLAN_SECTIONS: { key: keyof ConversationPlanContent; title: string; subtitle: string }[] = [
  { key: 'agenda', title: 'Suggested meeting agenda', subtitle: 'The order to take things in' },
  { key: 'opening', title: 'Suggested opening', subtitle: 'How to start on common ground' },
  { key: 'mainConcern', title: 'Key talking points', subtitle: 'What you need to get across' },
  { key: 'facts', title: 'Important facts to present', subtitle: 'What to have in front of you, stated plainly' },
  { key: 'questions', title: 'Questions to ask', subtitle: 'To understand their side before deciding anything' },
  { key: 'reactions', title: 'Possible reactions', subtitle: 'What they might say or feel' },
  { key: 'recommendedResponses', title: 'How to respond', subtitle: 'Calm answers to those reactions' },
  { key: 'phrasesToAvoid', title: 'Language to avoid', subtitle: 'Words that tend to raise the temperature' },
  { key: 'boundaries', title: 'Boundaries to maintain', subtitle: 'What stays off the table, kindly and firmly' },
  { key: 'closing', title: 'Suggested closing', subtitle: 'How to end on a clear, shared next step' },
  { key: 'modelResponse', title: 'A model response', subtitle: 'One way the hardest moment could sound' },
  { key: 'nextSteps', title: 'Next steps', subtitle: 'What happens after the meeting' },
  { key: 'adminInvolvement', title: 'When to involve an administrator', subtitle: "Signs it's time to bring someone in" },
]

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

  const past = usePastItems(getConversationPlans, plan)

  // Reopens an earlier meeting plan in full, follow-up conversation included.
  function handleOpenPast(id: string) {
    const earlier = past.items.find((p) => p.id === id)
    if (!earlier) return
    setPlan(earlier)
    setError(null)
    setChatDraft('')
    setChatError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
      <Link to="/communications" className="w-fit text-sm font-medium text-ink-soft hover:text-ink">
        ← Communication Coach
      </Link>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6 print:border-0 print:p-0">
        <PanelHeader as="h1" eyebrow="Wivoza · Communication Coach" title="Prepare for a Meeting" className="mb-6 print:hidden">
          Build an agenda, talking points, and a plan for an upcoming meeting.
        </PanelHeader>
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
                        ? 'border-forest bg-forest text-cream'
                        : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
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
                        ? 'border-forest bg-forest text-cream'
                        : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
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
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60"
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
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
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
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60"
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
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60"
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
                className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60"
              />
              <div className="flex items-center gap-3">
                <label className="cursor-pointer text-sm font-medium text-ink-soft hover:text-terracotta-600">
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Reading file...
                    </span>
                  ) : (
                    'Upload a file'
                  )}
                  <input
                    type="file"
                    accept=".docx,.pdf,.xlsx,.xls,.txt,.jpg,.jpeg,.png"
                    className="hidden"
                    disabled={submitting || uploading}
                    onChange={(e) => {
                      const selected = e.target.files?.[0]
                      if (selected) void handleUpload(selected)
                      e.target.value = ''
                    }}
                  />
                </label>
                {uploadError && <p className="text-sm text-terracotta-600">{uploadError}</p>}
              </div>
            </label>

            <SafetyAdvisoryBanner text={`${situationText}\n${concerns}\n${background}`} />
            <PrivacyReminder />

            {submitting && (
              <div className="flex justify-center py-1 text-forest">
                <ProgressRing progress={workProgress} label="Building your meeting plan" hint="Twelve sections — usually about twenty seconds." />
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="self-end rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
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
                        className="rounded-full border border-hairline bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-soft print:border-ink/20"
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
                  plan.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={plan.saved} />
                {plan.saved ? 'Saved' : 'Save for later'}
              </button>
            </div>

            <div className="grid gap-3">
              {PLAN_SECTIONS.map((section) => ({ ...section, body: plan.planContent?.[section.key] }))
                .filter((section): section is typeof section & { body: string } => !!section.body)
                .map((section, i) => (
                  <AnswerSection key={section.key} n={i + 1} title={section.title} subtitle={section.subtitle}>
                    {section.body}
                  </AnswerSection>
                ))}
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
                <Link
                  to={`/communications/meeting/${plan.id}/export`}
                  className="text-sm font-medium text-ink-soft hover:text-ink"
                >
                  Export / Print
                </Link>
              </div>
              <button
                type="button"
                onClick={handleNewPlan}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                New Plan
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600 print:hidden">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      <div className="print:hidden">
        <PastList
          title="Your meeting plans"
          items={past.items.map((p) => ({
            id: p.id,
            createdAt: p.createdAt,
            label: meetingTypeLabel(p.meetingType) || null,
            text: p.title || p.situationText,
            saved: p.saved,
          }))}
          activeId={plan?.id ?? null}
          loading={past.loading}
          emptyText="Meetings you prepare for will show up here."
          onOpen={handleOpenPast}
        />
      </div>
    </div>
  )
}
