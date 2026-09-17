import { useState } from 'react'
import { PanelHeader } from '../components/PanelHeader'
import { Link } from 'react-router-dom'
import { MicIcon } from '../components/icons'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { UpgradeMessage } from '../components/UpgradeMessage'
import { ProgressRing, WorkingRing } from '../components/ProgressRing'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import {
  CHALLENGE_TYPES,
  CONVERSATION_DIFFICULTY_LEVELS,
  RECIPIENT_TYPES,
  type ChallengeType,
  type ConversationDifficulty,
  type RecipientType,
} from '../lib/communicationOptions'
import { GRADE_BANDS, type GradeBand } from '../lib/gradeBands'
import { takePracticePrefill } from '../lib/communicationsPrefill'
import { generateConversationScenario, submitConversationPrep, type ConversationPrep } from '../lib/api'

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
    <div className="rounded-2xl bg-gold-tint/40 p-5">
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

  const [useCustom, setUseCustom] = useState(Boolean(prefill?.situationText))
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

  const activeSituation = useCustom ? customSituation : situationText
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

  function handlePracticeAgain() {
    setPrep(null)
    setSituationText(null)
    setCustomSituation('')
    setResponseText('')
    setError(null)
  }

  const report = prep?.coachingReport

  return (
    <div className="flex flex-col gap-6">
      <Link to="/communications" className="w-fit text-sm font-medium text-ink-soft hover:text-ink">
        ← Communication Coach
      </Link>

      <div className="overflow-hidden rounded-3xl border border-hairline bg-cream-card p-6">
        <PanelHeader as="h1" eyebrow="Wivoza · Communication Coach" title="Practice a Conversation" className="mb-6">
          Role-play with a parent, student, colleague, or administrator.
        </PanelHeader>
        {!prep ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Who are you practicing with?</span>
              <div className="flex flex-wrap gap-2">
                {RECIPIENT_TYPES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setPersonType(r.value)}
                    disabled={generating || submitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      personType === r.value
                        ? 'border-forest bg-forest text-cream'
                        : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Challenge</span>
              <div className="flex flex-wrap gap-2">
                {CHALLENGE_TYPES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChallenge(c.value)}
                    disabled={generating || submitting}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      challenge === c.value
                        ? 'border-forest bg-forest text-cream'
                        : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {personType === 'student' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Grade band</span>
                <div className="flex flex-wrap gap-1.5">
                  {GRADE_BANDS.map((band) => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => setGradeBand(band)}
                      disabled={generating || submitting}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        gradeBand === band
                          ? 'border-forest bg-forest text-cream'
                          : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                      }`}
                    >
                      {band}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Difficulty</span>
              <div className="flex flex-wrap gap-2">
                {CONVERSATION_DIFFICULTY_LEVELS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    disabled={generating || submitting}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      difficulty === d.value
                        ? 'border-forest bg-forest text-cream'
                        : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {!activeSituation ? (
              <div className="p-2 text-center">
                <p className="text-sm text-ink-soft">No scenario loaded yet.</p>
                <WorkingRing active={generating} estimatedMs={8000} label="Building a scenario" hint="Usually under ten seconds." className="mt-4 text-forest" />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft"
                  >
                    {generating ? 'Generating...' : 'Generate a Scenario'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustom(true)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Or enter your own situation
                  </button>
                </div>
                {useCustom && (
                  <label className="mt-4 flex flex-col gap-1.5 text-left">
                    <span className="text-sm font-medium text-ink">Describe the situation</span>
                    <textarea
                      value={customSituation}
                      onChange={(e) => setCustomSituation(e.target.value)}
                      rows={3}
                      className="rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none"
                    />
                  </label>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-3xl bg-forest p-6 text-cream">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Situation</p>
                  <p className="mt-3 text-base leading-relaxed text-cream">{activeSituation}</p>
                </div>
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
                      setUseCustom(false)
                      setResponseText('')
                    }}
                    disabled={generating}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Try a different scenario
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
            )}
          </div>
        ) : report ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Situation</p>
              <p className="mt-1 text-sm text-ink">{prep.situationText}</p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Your response</p>
              <p className="mt-1 text-sm text-ink">{prep.responseText}</p>
            </div>

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

            <div className="rounded-2xl bg-peach-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">What you did well</p>
              <p className="mt-1.5 text-sm text-ink">{report.didWell}</p>
            </div>
            <div className="rounded-2xl bg-mint-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">Priority for improvement</p>
              <p className="mt-1.5 text-sm text-ink">{report.priority}</p>
            </div>
            <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">A stronger phrase</p>
              <p className="mt-1.5 text-sm text-ink">{report.strongerPhrase}</p>
            </div>
            {report.modelResponse && (
              <div className="rounded-2xl bg-mint-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest">A model response</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{report.modelResponse}</p>
              </div>
            )}
            <div className="rounded-2xl bg-peach-tint/30 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Suggested next step</p>
              <p className="mt-1.5 text-sm text-ink">{report.nextStep}</p>
            </div>

            <button
              type="button"
              onClick={handlePracticeAgain}
              className="self-end rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90"
            >
              Practice Again
            </button>
            <Link
              to={`/communications/practice/${prep.id}/export`}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-terracotta-600"
            >
              Export / Print
            </Link>
          </div>
        ) : null}
        {error && (
          <p className="mt-4 text-center text-sm text-terracotta-600">
            <UpgradeMessage text={error} />
          </p>
        )}
      </div>
    </div>
  )
}
