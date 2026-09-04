import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import ReflectionTimeline from '../components/ReflectionTimeline'
import ShareButton from '../components/ShareButton'
import { MicIcon, StarIcon } from '../components/icons'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { categoryLabel } from '../lib/categories'
import { takeAskPrefill } from '../lib/communicationsPrefill'
import {
  getDebriefs,
  markDebriefTried,
  saveDebriefReflection,
  sendDebriefChat,
  setDebriefSaved,
  shareDebrief,
  submitDebrief,
  type Debrief,
} from '../lib/api'

const STARTER_QUESTIONS = [
  'How do I handle a student who constantly interrupts?',
  "What's a good way to set expectations on day one?",
  'A student refuses to put their phone away — what now?',
  'How do I de-escalate two students arguing in class?',
]

const STARTING_POINTS: { label: string; placeholder: string }[] = [
  { label: 'Find the words', placeholder: 'Describe the moment — what would you like to say next time?' },
  { label: 'Reflect on a moment', placeholder: 'What happened, and how do you feel about how it went?' },
  { label: 'Build a routine', placeholder: 'What routine or expectation are you trying to set up?' },
]

export default function Ask() {
  const navigate = useNavigate()
  const [incidentText, setIncidentText] = useState('')
  const [placeholder, setPlaceholder] = useState('Describe what happened, or ask a question...')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [allDebriefs, setAllDebriefs] = useState<Debrief[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const { supported: speechSupported, listening, toggleListening } = useSpeechToText((text) =>
    setIncidentText((prev) => (prev ? `${prev} ${text}` : text)),
  )

  useEffect(() => {
    getDebriefs({ source: 'ask_tab' })
      .then(setAllDebriefs)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    const prefill = takeAskPrefill()
    if (prefill?.incidentText) setIncidentText(prefill.incidentText)
  }, [])

  const savedDebriefs = allDebriefs.filter((d) => d.saved)

  async function handleSubmit(override?: string) {
    const text = (override ?? incidentText).trim()
    if (!text || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitDebrief(text)
      setDebrief(result)
      setAllDebriefs((prev) => [result, ...prev])
    } catch {
      setError('Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleAskAnother() {
    setDebrief(null)
    setIncidentText('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!debrief || !trimmed || chatSending) return
    setChatSending(true)
    setChatError(null)
    setChatDraft('')
    try {
      const updated = await sendDebriefChat(debrief.id, trimmed)
      setDebrief(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
      setChatDraft(trimmed)
    } finally {
      setChatSending(false)
    }
  }

  async function handleToggleSaved(target: Debrief) {
    const nextSaved = !target.saved
    setAllDebriefs((prev) => prev.map((d) => (d.id === target.id ? { ...d, saved: nextSaved } : d)))
    if (debrief?.id === target.id) setDebrief((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setDebriefSaved(target.id, nextSaved)
    } catch {
      setAllDebriefs((prev) => prev.map((d) => (d.id === target.id ? { ...d, saved: !nextSaved } : d)))
      if (debrief?.id === target.id) setDebrief((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  async function handleMarkTried(id: string) {
    try {
      const updated = await markDebriefTried(id)
      setAllDebriefs((prev) => prev.map((d) => (d.id === id ? updated : d)))
    } catch {
      // reflection timeline is a nice-to-have; a failed update just leaves the button as-is
    }
  }

  async function handleSaveReflection(id: string, note: string) {
    try {
      const updated = await saveDebriefReflection(id, note)
      setAllDebriefs((prev) => prev.map((d) => (d.id === id ? updated : d)))
    } catch {
      // same as above — non-critical, silently ignored
    }
  }

  function handlePracticeThis() {
    if (debrief?.category) sessionStorage.setItem('classcoach.suggestedCategory', debrief.category)
    navigate('/coach-chat?tab=practice')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {!debrief ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              Describe something that happened, or ask a classroom management question — you'll get
              practical coaching either way.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {STARTING_POINTS.map((point) => (
                <button
                  key={point.label}
                  type="button"
                  onClick={() => setPlaceholder(point.placeholder)}
                  disabled={submitting}
                  className="rounded-full border border-border bg-canvas px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
                >
                  {point.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">What's going on?</span>
              <textarea
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder={placeholder}
                className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
              />
            </label>
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={submitting}
                className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  listening
                    ? 'border-warm-500 bg-warm-100 text-warm-500'
                    : 'border-border text-ink-soft hover:border-brand-400 hover:text-brand-600'
                }`}
              >
                <MicIcon className="h-3.5 w-3.5" />
                {listening ? 'Listening... tap to stop' : 'Speak instead'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={submitting || !incidentText.trim()}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? 'Getting coaching...' : 'Get coaching'}
            </button>

            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap">
              {STARTER_QUESTIONS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => handleSubmit(starter)}
                  disabled={submitting}
                  className="rounded-full border border-border bg-canvas px-4 py-2 text-left text-sm text-ink transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-60"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              {debrief.category && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                  {categoryLabel(debrief.category)}
                </span>
              )}
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                What happened
              </p>
              <p className="mt-1 text-sm text-ink">{debrief.incidentText}</p>
            </div>

            {debrief.feedback && (
              <div className="rounded-xl border border-border bg-warm-100/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">
                  What may be happening
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.feedback}</p>
              </div>
            )}

            {debrief.wordsToTry && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Words to try
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.wordsToTry}</p>
              </div>
            )}

            {debrief.followUp && (
              <div className="rounded-xl border border-border bg-brand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  One next step
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.followUp}</p>
              </div>
            )}

            <CoachingChat
              messages={debrief.conversation.slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              placeholder="Ask a follow-up about this feedback..."
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleToggleSaved(debrief)}
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  debrief.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={debrief.saved} />
                {debrief.saved ? 'Saved' : 'Save for later'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePracticeThis}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  Practice this
                </button>
                <button
                  type="button"
                  onClick={handleAskAnother}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Ask Something Else
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Saved</h2>
        {historyLoading ? (
          <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
        ) : savedDebriefs.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
            Answers you save will show up here.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {savedDebriefs.map((d) => (
              <SavedDebriefCard key={d.id} debrief={d} onMarkTried={handleMarkTried} onSaveReflection={handleSaveReflection} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SavedDebriefCard({
  debrief,
  onMarkTried,
  onSaveReflection,
}: {
  debrief: Debrief
  onMarkTried: (id: string) => void
  onSaveReflection: (id: string, note: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          {debrief.category && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">
              {categoryLabel(debrief.category)}
            </span>
          )}
          <p className="mt-1.5 text-sm text-ink">{debrief.incidentText}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {debrief.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Coaching</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{debrief.feedback}</p>
            </div>
          )}
          {debrief.wordsToTry && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Words to try</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{debrief.wordsToTry}</p>
            </div>
          )}
          {debrief.followUp && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">One next step</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-ink">{debrief.followUp}</p>
            </div>
          )}
          <ShareButton type="debrief" onShare={() => shareDebrief(debrief.id)} />
          <ReflectionTimeline
            triedAt={debrief.triedAt}
            reflectionNote={debrief.reflectionNote}
            onMarkTried={() => onMarkTried(debrief.id)}
            onSaveReflection={(note) => onSaveReflection(debrief.id, note)}
          />
        </div>
      )}
    </div>
  )
}
