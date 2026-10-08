import { useState } from 'react'
import { Link } from 'react-router-dom'
import AnswerSection, { NumberedCard } from '../components/AnswerSection'
import { MicIcon, StarIcon } from '../components/icons'
import PastList from '../components/PastList'
import { usePastItems } from '../hooks/usePastItems'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import {
  CHALLENGE_TYPES,
  challengeLabel,
  CONVERSATION_DIFFICULTY_LEVELS,
  RECIPIENT_TYPES,
  type ChallengeType,
  type ConversationDifficulty,
  type RecipientType,
} from '../lib/communicationOptions'
import { GRADE_BANDS, type GradeBand } from '../lib/gradeBands'
import { takePracticePrefill } from '../lib/communicationsPrefill'
import {
  generateConversationScenario,
  getConversationPreps,
  setConversationPrepSaved,
  submitConversationPrep,
  type ConversationPrep,
} from '../lib/api'

const RATING_STYLES: Record<string, string> = {
  strong: 'bg-mint-tint/60 text-forest',
  developing: 'bg-peach-tint text-terracotta-600',
  'needs work': 'bg-peach-tint text-terracotta-600',
}

function RatingPill({ rating }: { rating: string }) {
  const style = RATING_STYLES[rating.toLowerCase()] ?? 'bg-cream text-ink-soft'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{rating || '—'}</span>
}

function ReportDimension({ label, rating, feedback }: { label: string; rating: string; feedback: string }) {
  return (
    <div className="rounded-xl bg-cream-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">{label}</p>
        <RatingPill rating={rating} />
      </div>
      <p className="mt-1.5 text-sm text-ink">{feedback}</p>
    </div>
  )
}

export default function PracticeConversation() {
  const [prefill] = useState(() => takePracticePrefill())
  // Nothing pre-selected: the section is just "Conversation" now, so who you're
  // facing is the first real question. Only a handoff that already knows — Recent
  // work, "Practice This Meeting" — arrives with it filled.
  const [personType, setPersonType] = useState<RecipientType | undefined>(
    (prefill?.personType as RecipientType | undefined) ?? undefined,
  )
  const [challenge, setChallenge] = useState<ChallengeType | undefined>(
    (prefill?.challenge as ChallengeType | undefined) ?? undefined,
  )
  const [gradeBand, setGradeBand] = useState<GradeBand>((prefill?.gradeBand as GradeBand | undefined) ?? '6-8')
  const [difficulty, setDifficulty] = useState<ConversationDifficulty | undefined>(
    (prefill?.difficulty as ConversationDifficulty | undefined) ?? undefined,
  )

  // Which way in. A teacher who already has the conversation in front of them is
  // not an edge case, so it is the first question rather than a button under the
  // generate flow. A prefill — "Practice This Meeting" — is always a real one.
  const [start, setStart] = useState<'real' | 'generated'>(prefill?.situationText ? 'real' : 'generated')
  const [situationText, setSituationText] = useState<string | null>(null)
  const [customSituation, setCustomSituation] = useState(prefill?.situationText ?? '')
  const [responseText, setResponseText] = useState('')
  const [prep, setPrep] = useState<ConversationPrep | null>(null)
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const workProgress = useSimulatedProgress(submitting, 12000)
  const [error, setError] = useState<string | null>(null)

  const { supported: speechSupported, listening, toggleListening } = useSpeechToText((text) =>
    setResponseText((prev) => (prev ? `${prev} ${text}` : text)),
  )

  const activeSituation = start === 'real' ? customSituation : situationText
  const canGenerate = !!challenge && !generating
  const canSubmit = !!activeSituation?.trim() && responseText.trim().length > 0 && !submitting

  async function handleGenerate() {
    if (!challenge || generating) return
    setGenerating(true)
    setError(null)
    setSituationText(null)
    setResponseText('')
    try {
      const { situationText: generated } = await generateConversationScenario({
        category: challenge,
        gradeBand,
        personType,
        difficulty,
      })
      setSituationText(generated)
    } catch {
      setError('Could not generate a scenario. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit || !activeSituation) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitConversationPrep({
        situationText: activeSituation.trim(),
        responseText: responseText.trim(),
        source: 'practice',
        category: challenge,
        gradeBand: personType === 'student' ? gradeBand : undefined,
        personType,
        difficulty,
      })
      setPrep(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get coaching feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const past = usePastItems(() => getConversationPreps({ source: 'practice' }), prep)

  // Reopens an earlier practice with its full coaching report.
  function handleOpenPast(id: string) {
    const attempt = past.items.find((p) => p.id === id)
    if (!attempt) return
    setPrep(attempt)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  function handlePracticeAgain() {
    setPrep(null)
    setSituationText(null)
    setCustomSituation('')
    setResponseText('')
    setError(null)
  }

  const report = prep?.coachingReport
  // The scenario engine's shape, because this is the same page: a forest panel
  // while you set it up, a cream card once there is something to read. Chips
  // follow it, since they stay on screen either side of that switch.
  const setup = !prep && !activeSituation
  const label = 'text-[11px] font-bold uppercase tracking-[0.14em] text-gold'
  const chip = (selected: boolean) =>
    setup
      ? `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          selected ? 'bg-gold text-forest' : 'bg-cream/10 text-cream/80 hover:bg-cream/20 hover:text-cream'
        }`
      : `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          selected
            ? 'border-forest bg-forest text-cream'
            : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
        }`

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          setup
            ? 'rounded-3xl bg-forest p-6 text-cream sm:p-8'
            : 'overflow-hidden rounded-2xl border border-hairline bg-cream-card p-6'
        }
      >
        {setup && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Practice a conversation</p>
            <p className="mt-2 font-heading text-2xl font-bold text-cream">Ready when you are.</p>
            <p className="mt-1 text-sm text-cream/70">
              Bring the conversation you are dreading, or let Wivoza write you one to practice cold.
            </p>
          </>
        )}
        {!prep ? (
          <div className={setup ? 'mt-5 flex flex-col gap-4' : 'flex flex-col gap-4'}>
            {/* The first question, because it changes what the rest of the screen
                is for. It used to be a button below the generate flow, after three
                rows of chips asking a teacher to classify a hypothetical they did
                not want. */}
            {setup && (
              <div className="flex flex-col gap-3.5 rounded-2xl bg-cream/10 p-4">
                <div>
                  <p className={label}>Where do you want to start?</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {([
                      ['real', 'Something real'],
                      ['generated', 'Build me one'],
                    ] as const).map(([value, text]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStart(value)}
                        disabled={generating || submitting}
                        aria-pressed={start === value}
                        className={chip(start === value)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-cream/60">
                    {start === 'real'
                      ? 'Describe the conversation you are actually facing, then rehearse your side of it.'
                      : 'Say who you are up against and Wivoza writes the scenario for you.'}
                  </p>
                </div>
              </div>
            )}

            {/* Outside every situation branch on purpose: when this lived inside
                one, the first keystroke made activeSituation truthy and unmounted
                the box being typed in. */}
            {start === 'real' && (
              <div
                className={
                  setup ? 'flex flex-col gap-3.5 rounded-2xl bg-cream/10 p-4' : 'flex flex-col gap-3.5'
                }
              >
                <label className="flex flex-col gap-1.5">
                  <span className={setup ? label : 'text-sm font-medium text-ink'}>What is going on</span>
                  <textarea
                    value={customSituation}
                    onChange={(e) => setCustomSituation(e.target.value)}
                    disabled={submitting}
                    rows={4}
                    placeholder="A colleague keeps overriding me in front of students, and we have a planning period together on Thursday..."
                    className={
                      setup
                        ? 'rounded-xl border border-cream/20 bg-cream/10 px-4 py-3 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none disabled:opacity-60'
                        : 'rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60'
                    }
                  />
                </label>
              </div>
            )}

            {/* One box, the same tinted box the scenario engine groups its choices
                in — every choice on screen, one format, nothing folded away. */}
            <div
              className={
                setup ? 'flex flex-col gap-3.5 rounded-2xl bg-cream/10 p-4' : 'flex flex-col gap-3.5'
              }
            >
              <div>
                <p className={setup ? label : 'text-sm font-medium text-ink'}>
                  {start === 'real' ? 'Who you’re facing' : 'Who you’re practicing with'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {RECIPIENT_TYPES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setPersonType(r.value)}
                      disabled={generating || submitting}
                      aria-pressed={personType === r.value}
                      className={chip(personType === r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className={setup ? label : 'text-sm font-medium text-ink'}>Challenge</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {CHALLENGE_TYPES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setChallenge(c.value)}
                      disabled={generating || submitting}
                      aria-pressed={challenge === c.value}
                      className={chip(challenge === c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className={setup ? label : 'text-sm font-medium text-ink'}>Difficulty</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {CONVERSATION_DIFFICULTY_LEVELS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDifficulty(d.value)}
                      disabled={generating || submitting}
                      aria-pressed={difficulty === d.value}
                      className={chip(difficulty === d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Its own box, like the room next door: who is in front of you is the
                scenario, what grade they are is the setting. */}
            {personType === 'student' && (
              <div
                className={
                  setup ? 'flex flex-col gap-3.5 rounded-2xl bg-cream/10 p-4' : 'flex flex-col gap-3.5'
                }
              >
                <div>
                  <p className={setup ? label : 'text-sm font-medium text-ink'}>Grade band</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {GRADE_BANDS.map((band) => (
                      <button
                        key={band}
                        type="button"
                        onClick={() => setGradeBand(band)}
                        disabled={generating || submitting}
                        aria-pressed={gradeBand === band}
                        className={chip(gradeBand === band)}
                      >
                        {band}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Only the generated path has anything to press: a real situation is
                already written above, so it goes straight to responding. */}
            {start === 'generated' && !situationText ? (
              <div>
                <WorkingRing
                  active={generating}
                  estimatedMs={8000}
                  label="Building a conversation"
                  hint="Usually under ten seconds."
                  className="mb-4 text-gold"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-cream shadow-lg transition-colors hover:bg-terracotta/90 disabled:opacity-60"
                >
                  {generating ? 'Generating...' : 'New Conversation'}
                </button>
                {!challenge && (
                  <p className="mt-2 text-xs text-cream/60">Pick a challenge above and Wivoza writes one for you.</p>
                )}
              </div>
            ) : null}

            {activeSituation?.trim() ? (
              <>
                {/* A generated situation is read back; one the teacher wrote is
                    still editable in its own box above, so repeating it here would
                    be the same words twice. */}
                {start === 'generated' && (
                  <div className="rounded-3xl bg-forest p-6 text-cream">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Situation</p>
                    <p className="mt-3 text-base leading-relaxed text-cream">{activeSituation}</p>
                  </div>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">How would you respond?</span>
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    disabled={submitting}
                    rows={5}
                    placeholder="Draft what you'd say or write..."
                    className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-terracotta focus:outline-none disabled:opacity-60"
                  />
                </label>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={submitting}
                    className={`flex w-fit items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                      listening
                        ? 'border-terracotta bg-peach-tint text-terracotta-600'
                        : 'border-mint-tint bg-mint-tint/60 text-forest hover:border-terracotta/40 hover:bg-mint-tint'
                    }`}
                  >
                    <MicIcon className="h-5 w-5" />
                    {listening ? 'Listening... tap to stop' : 'Speak your response'}
                  </button>
                )}
                <SafetyAdvisoryBanner text={responseText} />
                <PrivacyReminder />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSituationText(null)
                      setCustomSituation('')
                      setResponseText('')
                    }}
                    disabled={generating}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {start === 'real' ? 'Start over' : 'Try a different scenario'}
                  </button>
                  {submitting && (
                    <div className="flex justify-center py-1 text-forest">
                      <ProgressRing progress={workProgress} label="Reading your response" hint="Usually about fifteen seconds." />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                  >
                    {submitting ? 'Getting feedback...' : 'Get Coaching Report'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : report ? (
          <div className="flex flex-col gap-4">
            <NumberedCard n={1} title="What you practiced" subtitle="The situation, and what you said">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Situation</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{prep.situationText}</p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your response</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{prep.responseText}</p>
            </NumberedCard>

            <NumberedCard n={2} title="How it went" subtitle="Six parts of a hard conversation, with a note on each">
            <div className="grid gap-3 sm:grid-cols-2">
              <ReportDimension label="Clarity" rating={report.clarity.rating} feedback={report.clarity.feedback} />
              <ReportDimension label="Empathy" rating={report.empathy.rating} feedback={report.empathy.feedback} />
              <ReportDimension label="Use of evidence" rating={report.evidence.rating} feedback={report.evidence.feedback} />
              <ReportDimension
                label="Professional boundaries"
                rating={report.boundaries.rating}
                feedback={report.boundaries.feedback}
              />
              <ReportDimension
                label="Collaboration"
                rating={report.collaboration.rating}
                feedback={report.collaboration.feedback}
              />
              <ReportDimension
                label="Resolution and next steps"
                rating={report.resolution.rating}
                feedback={report.resolution.feedback}
              />
            </div>
            </NumberedCard>

            {[
              { title: 'What you did well', subtitle: 'Keep doing this in the real conversation', body: report.didWell },
              { title: 'Priority for improvement', subtitle: 'The one change that would help most', body: report.priority },
              { title: 'A stronger phrase', subtitle: 'Words to borrow for the moment that matters', body: report.strongerPhrase },
              { title: 'A model response', subtitle: 'One way the whole response could sound', body: report.modelResponse },
              { title: 'Suggested next step', subtitle: 'What to practice or do next', body: report.nextStep },
            ]
              .filter((part): part is { title: string; subtitle: string; body: string } => !!part.body)
              .map((part, i) => (
                <AnswerSection key={part.title} n={i + 3} title={part.title} subtitle={part.subtitle}>
                  {part.body}
                </AnswerSection>
              ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleToggleSaved}
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    prep.saved ? 'text-terracotta-600' : 'text-ink-soft hover:text-terracotta-600'
                  }`}
                >
                  <StarIcon className="h-4 w-4" filled={prep.saved} />
                  {prep.saved ? 'Saved' : 'Save for later'}
                </button>
                <Link
                  to={`/communications/practice/${prep.id}/export`}
                  className="text-sm font-medium text-ink-soft transition-colors hover:text-terracotta-600"
                >
                  Export / Print
                </Link>
              </div>
              <button
                type="button"
                onClick={handlePracticeAgain}
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
              >
                Practice Again
              </button>
            </div>
          </div>
        ) : null}
        {error && (
          <p className={`mt-4 text-center text-sm ${setup ? 'text-peach-tint' : 'text-terracotta-600'}`}>
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>

      <PastList
        title="Your practice conversations"
        items={past.items.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          label: challengeLabel(p.category) || null,
          text: p.title || p.situationText,
          saved: p.saved,
        }))}
        activeId={prep?.id ?? null}
        loading={past.loading}
        emptyText="Conversations you practice will show up here."
        onOpen={handleOpenPast}
      />
    </div>
  )
}
