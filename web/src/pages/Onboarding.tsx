import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DemoRecorder from '../components/DemoRecorder'
import MicLevelMeter from '../components/MicLevelMeter'
import { updateProfile, type FocusMetric, type JobTitle } from '../lib/api'
import { FOCUS_METRIC_GROUPS, FOCUS_METRIC_LABELS } from '../lib/focusMetrics'

type WizardStep = 'about-you' | 'classroom' | 'mic-check' | 'live-demo' | 'your-goal' | 'initial-focus' | 'done'

const STEPS: WizardStep[] = ['about-you', 'classroom', 'mic-check', 'live-demo', 'your-goal', 'initial-focus', 'done']

const JOB_TITLES: JobTitle[] = [
  'Teacher',
  'Instructional Coach',
  'Assistant Principal',
  'Principal',
  'District Leader',
  'Other',
]

const GOAL_SUGGESTIONS = [
  'speak up more in discussion',
  'take more risks with hard problems',
  'support each other, not just compete',
  'explain their thinking, not just their answer',
]

const inputClass =
  'rounded-xl border border-hairline bg-cream px-4 py-3 text-sm text-ink focus:border-terracotta focus:outline-none disabled:opacity-60'

function pillClass(active: boolean) {
  return `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active ? 'border-forest bg-forest text-cream' : 'border-hairline bg-cream text-ink-soft hover:border-terracotta/40 hover:text-terracotta-600'
  }`
}

const primaryButtonClass =
  'rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-terracotta/90 disabled:bg-hairline disabled:text-ink-soft'

// The numbered steps a teacher actually fills in — 'done' is the finish line,
// not a step, so it is left out of "Step N of 6".
const COUNTED_STEPS: WizardStep[] = STEPS.filter((s) => s !== 'done')

// Dark green header that opens every step, with the progress bar folded into
// it. Bleeds to the card's edges (the card is p-6 and overflow-hidden).
function StepHeader({ step, title, children }: { step: WizardStep; title: string; children?: React.ReactNode }) {
  const index = COUNTED_STEPS.indexOf(step)
  return (
    <div className="-mx-6 -mt-6 mb-2 bg-forest px-6 pb-6 pt-5 text-cream">
      <div className="flex gap-1.5" aria-hidden="true">
        {COUNTED_STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-gold' : 'bg-cream/15'}`} />
        ))}
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
        Step {index + 1} of {COUNTED_STEPS.length}
      </p>
      <h1 className="mt-1.5 font-heading text-2xl font-bold text-cream sm:text-3xl">
        {title}
        <span className="text-gold">.</span>
      </h1>
      {children && <p className="mt-1.5 text-sm text-cream/70">{children}</p>}
    </div>
  )
}

export default function Onboarding({ onDone }: { onDone: () => Promise<unknown> }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('about-you')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jobTitle, setJobTitle] = useState<JobTitle | null>(null)
  const [schoolName, setSchoolName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [gradeLevels, setGradeLevels] = useState('')
  const [subjects, setSubjects] = useState('')
  const [teachingGoal, setTeachingGoal] = useState('')
  const [focusMetric, setFocusMetric] = useState<FocusMetric | null>(null)
  const [micSignalSeen, setMicSignalSeen] = useState(false)

  function goTo(next: WizardStep) {
    setError(null)
    setStep(next)
  }

  async function finish() {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ completeOnboarding: true })
      await onDone()
      navigate('/')
    } catch {
      setError('Could not save your progress. Please try again.')
      setSaving(false)
    }
  }

  async function handleAboutYouNext() {
    setSaving(true)
    setError(null)
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim()
      await updateProfile({ ...(name ? { name } : {}), jobTitle: jobTitle ?? undefined })
      goTo('classroom')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClassroomNext() {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ schoolName, gradeLevels, subjects, ...(joinCode.trim() ? { joinCode } : {}) })
      goTo('mic-check')
    } catch (err) {
      setError((err as Error).message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleGoalNext() {
    setSaving(true)
    setError(null)
    try {
      await updateProfile({ teachingGoal })
      goTo('initial-focus')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFocusNext() {
    setSaving(true)
    setError(null)
    try {
      if (focusMetric) await updateProfile({ focusMetric })
      goTo('done')
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-cream px-6 py-10">
      <div className="w-full max-w-lg">
        <img src="/logo/wivoza-lockup-light.png" alt="Wivoza" className="mx-auto mb-6 h-10 w-auto" />

        <div
          className={`overflow-hidden rounded-3xl p-6 shadow-sm ${
            step === 'done' ? 'bg-forest text-cream' : 'border border-hairline bg-cream-card'
          }`}
        >
          {step === 'about-you' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="about-you" title="Tell us about yourself">
                A quick intro before we get started.
              </StepHeader>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className={inputClass}
                />
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className={inputClass}
                />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Your role</p>
                <div className="flex flex-wrap gap-2">
                  {JOB_TITLES.map((title) => (
                    <button
                      key={title}
                      type="button"
                      onClick={() => setJobTitle(title)}
                      className={pillClass(jobTitle === title)}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={finish} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Skip for now
                </button>
                <button type="button" onClick={handleAboutYouNext} disabled={saving} className={primaryButtonClass}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'classroom' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="classroom" title="Your classroom">
                This helps us get a sense of what matters to you.
              </StepHeader>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="What school do you work at? (optional)"
                className={inputClass}
              />
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="School code, if your district gave you one (optional)"
                className={inputClass}
              />
              <input
                value={gradeLevels}
                onChange={(e) => setGradeLevels(e.target.value)}
                placeholder="Grade level(s), e.g. 7th, 8th"
                className={inputClass}
              />
              <input
                value={subjects}
                onChange={(e) => setSubjects(e.target.value)}
                placeholder="Subject(s), e.g. Math, Science"
                className={inputClass}
              />
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={finish} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Skip for now
                </button>
                <button type="button" onClick={handleClassroomNext} disabled={saving} className={primaryButtonClass}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'mic-check' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="mic-check" title="Test your microphone">
                Wivoza records your lesson audio. Let's make sure we can hear you.
              </StepHeader>
              <div className="rounded-2xl bg-mint-tint/50 p-5">
                <p className="mb-3 font-heading text-base font-bold text-forest">Do you see the bar move when you speak?</p>
                <MicLevelMeter onSignalDetected={() => setMicSignalSeen(true)} />
              </div>
              <p className="text-xs text-ink-soft">
                Having trouble? Check that your browser has microphone permission, and that the correct input device
                is selected in your system settings.
              </p>
              <div className="flex items-center justify-between">
                <button type="button" onClick={finish} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => goTo('live-demo')}
                  disabled={!micSignalSeen}
                  className={primaryButtonClass}
                >
                  Yes, it's working
                </button>
              </div>
            </div>
          )}

          {step === 'live-demo' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="live-demo" title="See it in action">
                Read the line below out loud, and watch Wivoza pick out a real coaching moment.
              </StepHeader>
              <DemoRecorder />
              <div className="flex justify-end">
                <button type="button" onClick={() => goTo('your-goal')} className={primaryButtonClass}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'your-goal' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="your-goal" title="Tell us about your classroom">
                This helps us get a sense of what matters to you as a teacher.
              </StepHeader>
              <div className="rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-5">
                <p className="font-heading text-lg font-bold text-forest">
                  I'd like my students to{' '}
                  <input
                    value={teachingGoal}
                    onChange={(e) => setTeachingGoal(e.target.value)}
                    placeholder="___"
                    className="w-56 border-b-2 border-terracotta/40 bg-transparent px-1 font-sans text-base font-medium text-ink focus:border-terracotta focus:outline-none"
                  />
                  .
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {GOAL_SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => setTeachingGoal(s)} className={pillClass(teachingGoal === s)}>
                    {s}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={finish} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Skip for now
                </button>
                <button type="button" onClick={handleGoalNext} disabled={saving} className={primaryButtonClass}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'initial-focus' && (
            <div className="flex flex-col gap-4">
              <StepHeader step="initial-focus" title="Pick a focus to start">
                You can always change this later from your growth trends.
              </StepHeader>
              <div className="flex flex-col gap-3">
                {FOCUS_METRIC_GROUPS.map((group) => (
                  <div key={group.category}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">
                      {group.category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.metrics.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFocusMetric(key)}
                          className={pillClass(focusMetric === key)}
                        >
                          {FOCUS_METRIC_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="text-sm text-terracotta-600">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={finish} className="text-sm font-medium text-ink-soft hover:text-ink">
                  Skip for now
                </button>
                <button type="button" onClick={handleFocusNext} disabled={saving} className={primaryButtonClass}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold font-heading text-2xl font-bold text-forest">
                ✓
              </span>
              <h1 className="font-heading text-3xl font-extrabold text-cream">
                You're all set<span className="text-gold">.</span>
              </h1>
              <p className="text-sm text-cream/70">
                Your first recording is a click away whenever you're ready.
              </p>
              {error && <p className="text-sm text-peach-tint">{error}</p>}
              <button type="button" onClick={finish} disabled={saving} className={`self-center ${primaryButtonClass}`}>
                {saving ? 'Please wait...' : 'Go to Wivoza'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
