import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ProgressRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import CoachingChat from '../components/CoachingChat'
import PastList from '../components/PastList'
import ReflectionTimeline from '../components/ReflectionTimeline'
import ShareButton from '../components/ShareButton'
import { MicIcon, StarIcon } from '../components/icons'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { categoryLabel } from '../lib/categories'
import { isExperienced } from '../lib/experience'
import { takeAskPrefill } from '../lib/communicationsPrefill'
import {
  getDebriefs,
  getProfile,
  markDebriefTried,
  saveDebriefReflection,
  sendDebriefChat,
  setDebriefSaved,
  shareDebrief,
  submitDebrief,
  type Debrief,
} from '../lib/api'

const NEW_TEACHER_STARTERS = [
  'How do I handle a student who constantly interrupts?',
  "What's a good way to set expectations on day one?",
  'A student refuses to put their phone away — what now?',
  'How do I de-escalate two students arguing in class?',
]

// For teachers with six or more years in: refinement, not survival.
const EXPERIENCED_STARTERS = [
  'My discussions are fine — how do I get students building on each other, not just answering me?',
  'How do I push my strongest students without leaving others behind?',
  'My routines work, but they’ve gone stale. How do I refresh them mid-year?',
  'How can I tell whether my questions are really making students think?',
]

// Each starting point carries one of the report's accent colours, so the
// three read as distinct choices on the dark card rather than a row of
// identical pills.
const STARTING_POINTS: { label: string; placeholder: string; dot: string; selected: string }[] = [
  {
    label: 'Find the words',
    placeholder: 'Describe the moment — what would you like to say next time?',
    dot: 'bg-terracotta',
    selected: 'border-terracotta bg-terracotta text-cream',
  },
  {
    label: 'Reflect on a moment',
    placeholder: 'What happened, and how do you feel about how it went?',
    dot: 'bg-gold',
    selected: 'border-gold bg-gold text-forest',
  },
  {
    label: 'Build a routine',
    placeholder: 'What routine or expectation are you trying to set up?',
    dot: 'bg-mint-tint',
    selected: 'border-mint-tint bg-mint-tint text-forest',
  },
]

const STARTER_TINTS = ['bg-peach-tint/60', 'bg-gold-tint/60', 'bg-mint-tint/60', 'bg-peach-tint/30']

export default function Ask() {
  const navigate = useNavigate()
  const [incidentText, setIncidentText] = useState('')
  const [placeholder, setPlaceholder] = useState('Describe what happened, or ask a question...')
  const [startingPoint, setStartingPoint] = useState<string | null>(null)
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const askProgress = useSimulatedProgress(submitting, 9000)
  const [error, setError] = useState<string | null>(null)

  const [allDebriefs, setAllDebriefs] = useState<Debrief[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  // Null until the profile loads, so an experienced teacher never sees the
  // new-teacher starters flash up first.
  const [starters, setStarters] = useState<string[] | null>(null)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const { supported: speechSupported, listening, toggleListening } = useSpeechToText((text) =>
    setIncidentText((prev) => (prev ? `${prev} ${text}` : text)),
  )

  useEffect(() => {
    getProfile()
      .then((profile) => setStarters(isExperienced(profile.experienceLevel) ? EXPERIENCED_STARTERS : NEW_TEACHER_STARTERS))
      .catch(() => setStarters(NEW_TEACHER_STARTERS))
  }, [])

  // Opened from Home's Recent work: show that conversation — its coaching
  // and follow-up chat — rather than an empty form.
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('open')

  useEffect(() => {
    getDebriefs({ source: 'ask_tab' })
      .then((all) => {
        setAllDebriefs(all)
        const opened = openId ? all.find((d) => d.id === openId) : undefined
        if (opened) setDebrief(opened)
        if (openId) {
          const next = new URLSearchParams(searchParams)
          next.delete('open')
          setSearchParams(next, { replace: true })
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const prefill = takeAskPrefill()
    if (prefill?.incidentText) setIncidentText(prefill.incidentText)
  }, [])

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
      setAllDebriefs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
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
      setDebrief((prev) => (prev?.id === id ? updated : prev))
    } catch {
      // reflection timeline is a nice-to-have; a failed update just leaves the button as-is
    }
  }

  async function handleSaveReflection(id: string, note: string) {
    try {
      const updated = await saveDebriefReflection(id, note)
      setAllDebriefs((prev) => prev.map((d) => (d.id === id ? updated : d)))
      setDebrief((prev) => (prev?.id === id ? updated : prev))
    } catch {
      // same as above — non-critical, silently ignored
    }
  }

  // A past question opens exactly like a fresh answer: the coaching, any
  // follow-ups, and the chat to keep going.
  function handleOpenPast(id: string) {
    const past = allDebriefs.find((d) => d.id === id)
    if (!past) return
    setDebrief(past)
    setError(null)
    setChatDraft('')
    setChatError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handlePracticeThis() {
    if (debrief?.category) sessionStorage.setItem('classcoach.suggestedCategory', debrief.category)
    navigate('/coach-chat?tab=practice')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={debrief ? 'rounded-2xl border border-hairline bg-cream-card p-6' : 'rounded-3xl bg-forest p-6 text-cream sm:p-8'}>
        {!debrief ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Ask your coach</p>
              <p className="mt-2 max-w-2xl text-sm text-cream/70">
                Describe something that happened, or ask a classroom management question — you'll get
                practical coaching either way.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {STARTING_POINTS.map((point) => {
                const selected = startingPoint === point.label
                return (
                  <button
                    key={point.label}
                    type="button"
                    onClick={() => {
                      setStartingPoint(point.label)
                      setPlaceholder(point.placeholder)
                    }}
                    disabled={submitting}
                    aria-pressed={selected}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                      selected ? point.selected : 'border-cream/20 bg-cream/5 text-cream hover:bg-cream/10'
                    }`}
                  >
                    {!selected && <span className={`h-2 w-2 rounded-full ${point.dot}`} />}
                    {point.label}
                  </button>
                )
              })}
            </div>

            <label className="flex flex-col gap-2">
              <span className="font-heading text-2xl font-bold text-cream">What's going on?</span>
              <textarea
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder={placeholder}
                className="rounded-2xl border-0 bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-60"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {speechSupported ? (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={submitting}
                  className={`flex w-fit items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    listening
                      ? 'border-terracotta bg-terracotta text-cream'
                      : 'border-cream/25 text-cream/80 hover:border-cream/60 hover:text-cream'
                  }`}
                >
                  <MicIcon className="h-3.5 w-3.5" />
                  {listening ? 'Listening... tap to stop' : 'Speak instead'}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={submitting || !incidentText.trim()}
                className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90 disabled:bg-cream/10 disabled:text-cream/40 disabled:shadow-none"
              >
                {submitting ? 'Getting coaching...' : 'Get coaching'}
              </button>
            </div>

            {submitting && (
              <div className="flex justify-center py-2 text-gold">
                <ProgressRing progress={askProgress} label="Reading what you wrote" hint="Usually about ten seconds." />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              {debrief.category && (
                <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
                  {categoryLabel(debrief.category)}
                </span>
              )}
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                What happened
              </p>
              <p className="mt-1 text-sm text-ink">{debrief.incidentText}</p>
            </div>

            {debrief.feedback && (
              <div className="rounded-2xl bg-peach-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                  What may be happening
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.feedback}</p>
              </div>
            )}

            {debrief.wordsToTry && (
              <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                  Words to try
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink">{debrief.wordsToTry}</p>
              </div>
            )}

            {debrief.followUp && (
              <div className="rounded-2xl bg-mint-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">
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

            <ReflectionTimeline
              triedAt={debrief.triedAt}
              reflectionNote={debrief.reflectionNote}
              onMarkTried={() => handleMarkTried(debrief.id)}
              onSaveReflection={(note) => handleSaveReflection(debrief.id, note)}
            />
            <ShareButton type="debrief" onShare={() => shareDebrief(debrief.id)} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleToggleSaved(debrief)}
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  debrief.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
                }`}
              >
                <StarIcon className="h-4 w-4" filled={debrief.saved} />
                {debrief.saved ? 'Saved' : 'Save for later'}
              </button>
              <Link
                to={`/ask-practice/ask/${debrief.id}/export`}
                className="text-sm font-medium text-ink-soft transition-colors hover:text-terracotta-600"
              >
                Export / Print
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePracticeThis}
                  className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-terracotta/40 hover:text-terracotta-600"
                >
                  Practice this
                </button>
                <button
                  type="button"
                  onClick={handleAskAnother}
                  className="rounded-lg bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta/90"
                >
                  Ask Something Else
                </button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <p className={`mt-4 text-center text-sm ${debrief ? 'text-terracotta-600' : 'text-peach-tint'}`}>{error}</p>
        )}
      </div>

      {!debrief && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Or start with one of these</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(starters ?? []).map((starter, i) => (
              <button
                key={starter}
                type="button"
                onClick={() => handleSubmit(starter)}
                disabled={submitting}
                className={`group flex items-center justify-between gap-3 rounded-2xl p-4 text-left text-sm font-medium text-forest transition-shadow hover:shadow-md disabled:opacity-60 ${STARTER_TINTS[i % STARTER_TINTS.length]}`}
              >
                {starter}
                <span aria-hidden="true" className="text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <PastList
        title="Your questions"
        items={allDebriefs.map((d) => ({
          id: d.id,
          createdAt: d.createdAt,
          label: d.category ? categoryLabel(d.category) : null,
          text: d.incidentText,
          saved: d.saved,
        }))}
        activeId={debrief?.id ?? null}
        loading={historyLoading}
        emptyText="Nothing yet. Your questions and their answers will be kept here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}
