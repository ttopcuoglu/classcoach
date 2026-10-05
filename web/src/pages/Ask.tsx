import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ProgressRing } from '../components/ProgressRing'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import AnswerSection from '../components/AnswerSection'
import CoachingChat from '../components/CoachingChat'
import PastList from '../components/PastList'
import ReflectionTimeline from '../components/ReflectionTimeline'
import ShareButton from '../components/ShareButton'
import { StarIcon } from '../components/icons'
import { categoryLabel } from '../lib/categories'
import { TEACHING_AND_LEARNING, findFocusArea, focusAreaForCategory, focusAreaLabel } from '../lib/focusAreas'
import TeachingContextFields, { type TeachingContext } from '../components/TeachingContextFields'
import { ASK_STARTERS, GENERAL_ASK_STARTERS, pickStarters } from '../lib/starters'
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

const STARTER_TINTS = ['bg-peach-tint/60', 'bg-gold-tint/60', 'bg-mint-tint/60', 'bg-peach-tint/30']


// `focusArea` comes from the Ask & Practice shell (CoachChat). It's optional:
// with no area picked the coach works out which of the six this is, so a
// teacher never has to classify their own problem before asking about it.
export default function Ask({
  focusArea,
  onPickArea,
  room,
  onRoomChange,
}: {
  focusArea?: string
  onPickArea?: (value: string | null) => void
  /// Owned by the shell so switching to Practice keeps the room a teacher set.
  room: TeachingContext
  onRoomChange: (next: TeachingContext) => void
}) {
  const navigate = useNavigate()
  const area = findFocusArea(focusArea)
  const [incidentText, setIncidentText] = useState('')
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const askProgress = useSimulatedProgress(submitting, 9000)
  const [error, setError] = useState<string | null>(null)

  const [allDebriefs, setAllDebriefs] = useState<Debrief[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)


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
      const result = await submitDebrief(text, {
        focusArea,
        gradeBand: room.gradeBand,
        // Subject, course and level are only asked for under Teaching and
        // Learning, so they're only sent from there.
        ...(focusArea === TEACHING_AND_LEARNING
          ? {
              subject: room.subject,
              course: room.course,
              topic: room.topic,
              courseLevel: room.courseLevel,
              classMakeup: room.classMakeup,
            }
          : {}),
      })
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
    // Carry the area over, so a grading question rehearses a grading scenario
    // rather than whatever Practice happened to be set to.
    const target = debrief?.focusArea ?? focusAreaForCategory(debrief?.category)?.value ?? focusArea
    navigate(`/talk-to-me?tab=practice${target ? `&area=${target}` : ''}`)
  }

  // Re-picked whenever the section or the room changes, which is the point: a
  // 2nd grade art teacher and an AP Calculus teacher should not be offered the
  // same four example questions.
  const starters = pickStarters(
    (focusArea && ASK_STARTERS[focusArea]) || GENERAL_ASK_STARTERS,
    room,
    focusArea,
    4,
  )
  return (
    <div className="flex flex-col gap-6">
      <div className={debrief ? 'rounded-2xl border border-hairline bg-cream-card p-6' : 'rounded-3xl bg-forest p-6 text-cream sm:p-8'}>
        {!debrief ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Ask your coach</p>
              <p className="mt-2 max-w-2xl text-sm text-cream/70">
                {area
                  ? `Describe something that happened, or ask a question about ${area.label.toLowerCase()} — you'll get practical coaching either way.`
                  : "Describe something that happened, or ask a question about any part of the job — you'll get practical coaching either way."}
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="font-heading text-2xl font-bold text-cream">What's going on?</span>
              <textarea
                value={incidentText}
                onChange={(e) => setIncidentText(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder="Describe what happened, or ask a question..."
                className="rounded-2xl border-0 bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-60"
              />
            </label>

            {/* Always visible: what room this is isn't optional context, it's
                what separates coaching about a 4th grade math lesson from
                coaching about an AP Calculus section. It used to sit behind a
                "Change" fold, which made it look like a detail. */}
            <TeachingContextFields
              focusArea={focusArea}
              value={room}
              onChange={onRoomChange}
              disabled={submitting}
            />

            <div className="flex flex-wrap items-center justify-end gap-3">
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
              <div className="flex flex-wrap items-center gap-2">
                {/* Which of the six this was coached as — the teacher's pick, or the
                    coach's read when they didn't pick. Worth showing: it's how a
                    teacher finds out the coach understood what kind of problem
                    this is, and it's a one-tap way into the matching Practice. */}
                {(debrief.focusArea ?? focusAreaForCategory(debrief.category)?.value) && (
                  <button
                    type="button"
                    onClick={() => {
                      const value = debrief.focusArea ?? focusAreaForCategory(debrief.category)?.value
                      if (value) onPickArea?.(value)
                    }}
                    className="rounded-full bg-forest px-2.5 py-1 text-xs font-semibold text-cream transition-colors hover:bg-forest/90"
                  >
                    {focusAreaLabel(debrief.focusArea ?? focusAreaForCategory(debrief.category)?.value)}
                  </button>
                )}
                {debrief.category && (
                  <span className="rounded-full bg-mint-tint/60 px-2.5 py-1 text-xs font-semibold text-forest">
                    {categoryLabel(debrief.category)}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                What happened
              </p>
              <p className="mt-1 text-sm text-ink">{debrief.incidentText}</p>
            </div>

            {[
              debrief.feedback && {
                title: 'What may be happening',
                subtitle: 'A read on the moment you described.',
                body: debrief.feedback,
              },
              debrief.wordsToTry && {
                title: 'Words to try',
                subtitle: 'Language you can use as it is, or adapt.',
                body: debrief.wordsToTry,
              },
              debrief.followUp && {
                title: 'One next step',
                subtitle: 'Something small to try in your next class.',
                body: debrief.followUp,
              },
            ]
              .filter((part): part is { title: string; subtitle: string; body: string } => !!part)
              .map((part, i) => (
                <AnswerSection key={part.title} n={i + 1} title={part.title} subtitle={part.subtitle}>
                  {part.body}
                </AnswerSection>
              ))}

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
            {starters.map(({ text: starter }, i) => (
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
          label:
            focusAreaLabel(d.focusArea ?? focusAreaForCategory(d.category)?.value) ??
            (d.category ? categoryLabel(d.category) : null),
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
