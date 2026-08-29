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
  'rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60'

function pillClass(active: boolean) {
  return `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
  }`
}

const primaryButtonClass =
  'rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50'

export default function Onboarding({ onDone }: { onDone: () => Promise<unknown> }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('about-you')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jobTitle, setJobTitle] = useState<JobTitle | null>(null)
  const [schoolName, setSchoolName] = useState('')
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
      await updateProfile({ schoolName, gradeLevels, subjects })
      goTo('mic-check')
    } catch {
      setError('Could not save. Please try again.')
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

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-brand-500' : 'bg-border'}`} />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          {step === 'about-you' && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-xl font-semibold text-ink">Tell us about yourself</h1>
                <p className="mt-1 text-sm text-ink-soft">A quick intro before we get started.</p>
              </div>
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
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Your role</p>
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
              {error && <p className="text-sm text-warm-500">{error}</p>}
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
              <div>
                <h1 className="text-xl font-semibold text-ink">Your classroom</h1>
                <p className="mt-1 text-sm text-ink-soft">This helps us get a sense of what matters to you.</p>
              </div>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="What school do you work at? (optional)"
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
              {error && <p className="text-sm text-warm-500">{error}</p>}
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
              <div>
                <h1 className="text-xl font-semibold text-ink">Test your microphone</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  Wivoza records your lesson audio. Let's make sure we can hear you.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-canvas p-5">
                <p className="mb-3 text-sm font-semibold text-ink">Do you see the bar move when you speak?</p>
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
              <div>
                <h1 className="text-xl font-semibold text-ink">See it in action</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  Read the line below out loud, and watch Wivoza pick out a real coaching moment.
                </p>
              </div>
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
              <div>
                <h1 className="text-xl font-semibold text-ink">Tell us about your classroom</h1>
                <p className="mt-1 text-sm text-ink-soft">This helps us get a sense of what matters to you as a teacher.</p>
              </div>
              <div className="rounded-xl border border-border bg-canvas p-4">
                <p className="font-semibold text-ink">
                  I'd like my students to{' '}
                  <input
                    value={teachingGoal}
                    onChange={(e) => setTeachingGoal(e.target.value)}
                    placeholder="___"
                    className="w-56 border-b border-border bg-transparent px-1 focus:border-brand-400 focus:outline-none"
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
              {error && <p className="text-sm text-warm-500">{error}</p>}
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
              <div>
                <h1 className="text-xl font-semibold text-ink">Pick a focus to start</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  You can always change this later from your growth trends.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {FOCUS_METRIC_GROUPS.map((group) => (
                  <div key={group.category}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
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
              {error && <p className="text-sm text-warm-500">{error}</p>}
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
            <div className="flex flex-col gap-4 text-center">
              <h1 className="text-xl font-semibold text-ink">You're all set.</h1>
              <p className="text-sm text-ink-soft">
                Your first recording is a click away whenever you're ready.
              </p>
              {error && <p className="text-sm text-warm-500">{error}</p>}
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
