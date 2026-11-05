import { useEffect, useRef, useState } from 'react'
import AnswerSection from '../components/AnswerSection'
import CoachingChat from '../components/CoachingChat'
import PastList from '../components/PastList'
import { SpeakInBox, speakingBoxClass } from '../components/SpeakInBox'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { WorkingRing } from '../components/ProgressRing'
import { LockIcon, StarIcon } from '../components/icons'
import {
  createLeaderAttempt,
  getLeaderAttempts,
  getLeaderHint,
  getLeaderScenarios,
  sendLeaderChat,
  setLeaderAttemptSaved,
  type LeaderAttempt,
  type LeaderAudience,
  type LeaderScenario,
  type LeaderScenarios,
} from '../lib/api'

// Leader's Corner: rehearse a hard conversation at your own level — a
// scenario written for it, or something you're facing — and get coaching on
// the words you'd use. The server sends only this leader's level's scenarios
// and only their own attempts; this page never sees anyone else's.
//
// Deliberately the Practice shape and nothing more (phase 1): no role-play,
// no live conversation. Saying it out loud comes later, through Discuss with
// Wivoza Coach on a result, never as a standalone Talk It Through.

type Mode = 'scenario' | 'own'

const chip = (on: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? 'bg-forest text-cream' : 'bg-cream text-ink-soft hover:text-ink'}`

export default function LeadersCorner() {
  const [data, setData] = useState<LeaderScenarios | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('scenario')
  const [audience, setAudience] = useState<LeaderAudience | null>(null)
  const [scenario, setScenario] = useState<LeaderScenario | null>(null)
  const [situation, setSituation] = useState('')
  const [response, setResponse] = useState('')
  const [attempt, setAttempt] = useState<LeaderAttempt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<LeaderAttempt[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  // "Get a hint" and "Stuck?" on a picked scenario: both closed until asked.
  // Every hint asked for is kept so the newest shows and the next one is told
  // what not to repeat.
  const [hints, setHints] = useState<string[]>([])
  const [hintLoading, setHintLoading] = useState(false)
  const [hintError, setHintError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  // One microphone, pointed at whichever box asked for it — the same as
  // Practice. Speaking adds to what is already typed; starting in one box
  // stops the other.
  const [speechTarget, setSpeechTarget] = useState<'situation' | 'response'>('response')
  const speechTargetRef = useRef<'situation' | 'response'>('response')
  const { supported: speechSupported, listening, start: startSpeech, stop: stopSpeech } = useSpeechToText((text) => {
    const add = (prev: string) => (prev ? `${prev} ${text}` : text)
    if (speechTargetRef.current === 'situation') setSituation(add)
    else setResponse(add)
  })
  function speakInto(target: 'situation' | 'response') {
    if (listening && speechTargetRef.current === target) {
      stopSpeech()
      return
    }
    const pointAt = () => {
      speechTargetRef.current = target
      setSpeechTarget(target)
      startSpeech()
    }
    if (listening) {
      // Stop the other box first, so its last words still land in it.
      stopSpeech()
      window.setTimeout(pointAt, 350)
    } else {
      pointAt()
    }
  }
  const boxClass = (target: 'situation' | 'response') =>
    `w-full rounded-2xl border bg-cream px-4 pb-12 pt-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60 ${
      listening && speechTarget === target ? speakingBoxClass : 'border-hairline'
    }`
  const speakButton = (target: 'situation' | 'response') =>
    speechSupported && (
      <SpeakInBox listening={listening && speechTarget === target} onClick={() => speakInto(target)} disabled={submitting} />
    )

  useEffect(() => {
    getLeaderScenarios()
      .then(setData)
      .catch((err: Error) => setLoadError(err.message || "Could not load Leader's Corner."))
    getLeaderAttempts()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  function clearHelpers() {
    setHints([])
    setHintError(null)
    setShowGuide(false)
  }

  async function handleHint() {
    if (!scenario || hintLoading) return
    setHintLoading(true)
    setHintError(null)
    try {
      const { hint } = await getLeaderHint(scenario.id, hints)
      setHints((prev) => [...prev, hint])
    } catch (err) {
      setHintError((err as Error).message || 'Could not get a hint. Please try again.')
    } finally {
      setHintLoading(false)
    }
  }

  function startOver(next: Mode = mode) {
    if (listening) stopSpeech()
    clearHelpers()
    setMode(next)
    setScenario(null)
    setAttempt(null)
    setSituation('')
    setResponse('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  async function handleSubmit() {
    if (listening) stopSpeech()
    setSubmitting(true)
    setError(null)
    try {
      const created = await createLeaderAttempt(
        scenario ? { scenarioId: scenario.id, responseText: response } : { situationText: situation, responseText: response },
      )
      setAttempt(created)
      setHistory((prev) => [created, ...prev])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendChat() {
    if (!attempt || !chatDraft.trim()) return
    setChatSending(true)
    setChatError(null)
    try {
      const updated = await sendLeaderChat(attempt.id, chatDraft)
      setAttempt(updated)
      setChatDraft('')
    } catch (err) {
      setChatError((err as Error).message)
    } finally {
      setChatSending(false)
    }
  }

  async function handleToggleSaved() {
    if (!attempt) return
    const updated = await setLeaderAttemptSaved(attempt.id, !attempt.saved).catch(() => null)
    if (!updated) return
    setAttempt(updated)
    setHistory((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  function openPast(id: string) {
    const past = history.find((a) => a.id === id)
    if (!past) return
    setAttempt(past)
    setMode(past.source === 'own' ? 'own' : 'scenario')
    setScenario(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Leader&rsquo;s Corner<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">{loadError}</p>
      </div>
    )
  }

  const audiences = data ? data.audiences.filter((a) => data.scenarios.some((s) => s.audience === a.value)) : []
  const shown = data ? data.scenarios.filter((s) => !audience || s.audience === audience) : []
  const audienceLabel = (value: string | null) => data?.audiences.find((a) => a.value === value)?.label ?? null
  const scenarioTitle = (a: LeaderAttempt) =>
    a.source === 'own' ? 'Your situation' : (data?.scenarios.find((s) => s.id === a.curatedId)?.title ?? audienceLabel(a.audience) ?? 'Scenario')
  const walkedThrough = attempt?.source === 'own' && !attempt.responseText.trim()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · For school leaders</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Leader&rsquo;s Corner<span className="text-gold">.</span>
        </h1>
        <p className="max-w-2xl text-ink-soft">
          Rehearse the hard conversations — with families, staff, students and your community — and get coaching on your
          words before the real one.
        </p>
        {data && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span className="rounded-full bg-gold-tint px-2 py-0.5 font-semibold text-forest">
              {data.level.label} · {data.level.titles}
            </span>
            <span className="inline-flex items-center gap-1">
              <LockIcon className="h-3.5 w-3.5" />
              Private to you. Nothing here appears on any school dashboard.
            </span>
          </p>
        )}
      </div>

      <div className="rounded-3xl border border-hairline bg-cream-card p-5 md:p-6">
        {!attempt ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { label: 'Pick a scenario', value: 'scenario' },
                  { label: 'Something I’m facing', value: 'own' },
                ] as const
              ).map(({ label, value }) => (
                <button key={value} type="button" onClick={() => startOver(value)} aria-pressed={mode === value} className={chip(mode === value)}>
                  {label}
                </button>
              ))}
            </div>

            {mode === 'scenario' && !scenario && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Who&rsquo;s the conversation with?</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {[{ value: null, label: 'Anyone' }, ...audiences].map((a) => (
                      <button key={a.label} type="button" onClick={() => setAudience(a.value)} aria-pressed={audience === a.value} className={chip(audience === a.value)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                {!data ? (
                  <p className="text-sm text-ink-soft">Loading...</p>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {shown.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setScenario(s)
                            clearHelpers()
                            setResponse('')
                            setError(null)
                          }}
                          className="flex h-full w-full flex-col gap-1.5 rounded-2xl border border-hairline bg-cream p-4 text-left transition-colors hover:border-forest"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-terracotta-600">{audienceLabel(s.audience)}</span>
                          <span className="text-sm font-semibold text-forest">{s.title}</span>
                          <span className="line-clamp-3 text-xs leading-relaxed text-ink-soft">{s.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {mode === 'scenario' && scenario && (
              <div className="flex flex-col gap-4">
                <div className="rounded-3xl bg-forest p-6 text-cream">
                  <span className="rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">
                    {[audienceLabel(scenario.audience), scenario.title].filter(Boolean).join(' · ')}
                  </span>
                  <p className="mt-4 text-base leading-relaxed text-cream">{scenario.text}</p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="font-heading text-xl font-bold text-forest">How would you handle this?</span>
                  <div className="relative">
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      disabled={submitting}
                      rows={5}
                      placeholder="What do you say first — and where do you take the conversation from there?"
                      className={boxClass('response')}
                    />
                    {speakButton('response')}
                  </div>
                </label>
                {/* A nudge, never the words: the rehearsal is the leader
                    composing it. Both helpers stay closed until asked. */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <button
                      type="button"
                      onClick={handleHint}
                      disabled={submitting || hintLoading}
                      className="w-fit text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta disabled:opacity-60"
                    >
                      {hintLoading ? 'Thinking...' : hints.length ? 'Another hint' : 'Get a hint'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGuide((v) => !v)}
                      aria-expanded={showGuide}
                      className="w-fit text-sm font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
                    >
                      {showGuide ? 'Hide' : 'Stuck? What you can do here'}
                    </button>
                  </div>
                  {hints.length > 0 && (
                    <p aria-live="polite" className="rounded-2xl bg-gold-tint/50 px-4 py-3 text-sm italic text-ink">
                      {hints[hints.length - 1]}
                    </p>
                  )}
                  {hintError && <p className="text-xs text-terracotta-600">{hintError}</p>}
                  {showGuide && (
                    <ul className="flex flex-col gap-2 rounded-2xl border border-hairline bg-cream px-4 py-3 text-sm text-ink">
                      {[
                        speechSupported && {
                          name: 'Speak',
                          does: 'Say your answer instead of typing it — the way you would in the room.',
                        },
                        {
                          name: 'Get a hint',
                          does: 'A nudge toward what a strong response would pay attention to. Tap again for another.',
                        },
                        { name: 'Pick a different one', does: 'Go back to the list and choose another scenario.' },
                        {
                          name: 'Get Feedback',
                          does: 'Your coach reads your answer and shows what worked, what to strengthen, and one model response. A rough first try is fine.',
                        },
                        {
                          name: 'Something I’m facing',
                          does: 'Switch at the top to rehearse a real conversation of your own. Leave your answer empty and your coach walks you through it.',
                        },
                      ]
                        .filter((item): item is { name: string; does: string } => !!item)
                        .map((item) => (
                          <li key={item.name}>
                            <span className="font-semibold text-forest">{item.name}</span>
                            <span className="text-ink-soft"> — {item.does}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <WorkingRing active={submitting} estimatedMs={9000} label="Reading your response" hint="Usually under ten seconds." className="text-forest" />
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setScenario(null)} disabled={submitting} className="text-sm font-medium text-ink-soft hover:text-ink">
                    Pick a different one
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !response.trim()}
                    className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                  >
                    {submitting ? 'Getting feedback...' : 'Get Feedback'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'own' && (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-heading text-xl font-bold text-forest">What&rsquo;s the conversation?</span>
                  <span className="text-xs text-ink-soft">
                    Who it&rsquo;s with and what&rsquo;s happening. Describe people by role — &ldquo;a parent,&rdquo; &ldquo;a
                    veteran teacher&rdquo; — never by name.
                  </span>
                  <div className="relative">
                    <textarea
                      value={situation}
                      onChange={(e) => setSituation(e.target.value)}
                      disabled={submitting}
                      rows={4}
                      maxLength={3000}
                      placeholder="A parent asked to meet about…"
                      className={boxClass('situation')}
                    />
                    {speakButton('situation')}
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">
                    What you plan to say <span className="font-normal text-ink-soft">(optional)</span>
                  </span>
                  <div className="relative">
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      disabled={submitting}
                      rows={4}
                      placeholder="Leave this empty and your coach will walk you through it."
                      className={boxClass('response')}
                    />
                    {speakButton('response')}
                  </div>
                </label>
                <WorkingRing active={submitting} estimatedMs={9000} label="Reading your situation" hint="Usually under ten seconds." className="text-forest" />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || situation.trim().length < 15}
                    className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                  >
                    {submitting ? 'Working...' : response.trim() ? 'Get Feedback' : 'Walk me through it'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-forest p-6 text-cream">
              <span className="rounded-full bg-cream/10 px-3 py-1 text-xs font-semibold text-cream">{scenarioTitle(attempt)}</span>
              <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-cream">{attempt.scenarioText}</p>
            </div>
            {[
              walkedThrough ? null : { title: 'Your response', subtitle: 'What you said you would do.', body: attempt.responseText },
              attempt.feedback && {
                title: 'Coaching',
                subtitle: walkedThrough ? 'How to approach it.' : 'What worked, and what to strengthen.',
                body: attempt.feedback,
              },
              attempt.modelResponse && {
                title: walkedThrough ? 'What you could say' : 'A model response',
                subtitle: walkedThrough ? 'One way to put it — try your own below.' : 'One way to handle it, to compare with yours.',
                body: attempt.modelResponse,
              },
            ]
              .filter((part): part is { title: string; subtitle: string; body: string } => !!part)
              .map((part, i) => (
                <AnswerSection key={part.title} n={i + 1} title={part.title} subtitle={part.subtitle}>
                  {part.body}
                </AnswerSection>
              ))}

            <CoachingChat
              messages={(attempt.conversation ?? []).slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              speakable
              placeholder={walkedThrough ? 'Try saying it in your own words...' : 'Try another version, or ask a follow-up...'}
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleToggleSaved}
                className={`flex items-center gap-1.5 text-sm font-medium ${attempt.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'}`}
              >
                <StarIcon className="h-4 w-4" filled={attempt.saved} />
                {attempt.saved ? 'Saved' : 'Save for later'}
              </button>
              <button
                type="button"
                onClick={() => startOver()}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                Practice another
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-terracotta-600">{error}</p>}
      </div>

      <p className="text-xs text-ink-soft">
        For legal, special-education, HR or safety matters, your coach helps with how the conversation goes. The decision
        itself stays with your district&rsquo;s counsel, HR and policy.
      </p>

      <PastList
        title="Your practice"
        items={history.map((a) => ({ id: a.id, createdAt: a.createdAt, label: scenarioTitle(a), text: a.scenarioText, saved: a.saved }))}
        activeId={attempt?.id ?? null}
        loading={historyLoading}
        emptyText="Nothing yet. Every conversation you rehearse is kept here, with its coaching — for you only."
        onOpen={openPast}
      />
    </div>
  )
}
